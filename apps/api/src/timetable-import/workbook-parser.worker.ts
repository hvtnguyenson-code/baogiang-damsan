import { isMainThread, parentPort } from 'worker_threads';
import ExcelJS from 'exceljs';
import { MAX_MERGED_RANGES, MAX_PARSER_CELL_TEXT_LENGTH, MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, MAX_TOTAL_DIMENSION_CELLS, MAX_WORKSHEETS, MAX_XLSX_EXPANDED_BYTES } from './workbook-limits';
import { ParsedWorkbook, ParsedWorkbookCell, ParsedWorkbookSheet, WorkbookParseError, WorkbookWorkerResponse } from './workbook-parser.types';

interface ZipEntry { fileName: string; uncompressedSize: number; compressedSize: number }
interface ZipFile {
  readEntry(): void;
  close(): void;
  on(event: 'entry', listener: (entry: ZipEntry) => void): void;
  on(event: 'end' | 'error', listener: (error?: Error) => void): void;
}
interface YauzlApi { fromBuffer(buffer: Buffer, options: Record<string, unknown>, callback: (error: Error | null, zip?: ZipFile) => void): void }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yauzl = require('yauzl') as YauzlApi;

async function preflight(buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, autoClose: true }, (error, zip) => {
      if (error || !zip) return reject(new WorkbookParseError('INVALID_XLSX'));
      let total = 0;
      let contentTypes = false;
      let workbook = false;
      let rejected = false;
      zip.on('error', () => reject(new WorkbookParseError('INVALID_XLSX')));
      zip.on('entry', (entry) => {
        if (rejected) return;
        const name = entry.fileName.replaceAll('\\', '/').toLowerCase();
        total += entry.uncompressedSize;
        if (total > MAX_XLSX_EXPANDED_BYTES || entry.uncompressedSize > MAX_XLSX_EXPANDED_BYTES) {
          rejected = true; zip.close(); return reject(new WorkbookParseError('WORKBOOK_COMPLEXITY_LIMIT'));
        }
        if (name === '[content_types].xml') contentTypes = true;
        if (name === 'xl/workbook.xml') workbook = true;
        if (name.endsWith('vbaproject.bin')) { rejected = true; zip.close(); return reject(new WorkbookParseError('MACRO_WORKBOOK_UNSUPPORTED')); }
        if (name.startsWith('xl/externallinks/')) { rejected = true; zip.close(); return reject(new WorkbookParseError('EXTERNAL_LINKS_UNSUPPORTED')); }
        zip.readEntry();
      });
      zip.on('end', () => {
        if (!rejected) contentTypes && workbook ? resolve() : reject(new WorkbookParseError('INVALID_XLSX'));
      });
      zip.readEntry();
    });
  });
}

function boundedNormalizedText(parts: Iterable<string>): { text: string; textOverLimit: boolean } {
  let text = '';
  let pendingWhitespace = false;
  let textOverLimit = false;
  outer: for (const part of parts) {
    for (const character of part) {
      if (/\s/u.test(character)) {
        if (text.length > 0) pendingWhitespace = true;
        continue;
      }
      const next = `${text}${pendingWhitespace ? ' ' : ''}${character}`.normalize('NFKC');
      if (next.length > MAX_PARSER_CELL_TEXT_LENGTH) { textOverLimit = true; break outer; }
      text = next;
      pendingWhitespace = false;
    }
  }
  return { text, textOverLimit };
}

function cellValue(cell: ExcelJS.Cell): ParsedWorkbookCell {
  const base = { formula: Boolean(cell.formula), hyperlink: Boolean(cell.hyperlink), merged: cell.isMerged };
  if (cell.value === null || cell.value === undefined || cell.value === '') return { kind: 'BLANK', textOverLimit: false, ...base };
  if (cell.formula) return { kind: 'UNSUPPORTED', textOverLimit: false, ...base };
  if (cell.hyperlink) return { kind: 'UNSUPPORTED', textOverLimit: false, ...base };
  if (typeof cell.value === 'string') return { kind: 'TEXT', ...boundedNormalizedText([cell.value]), ...base };
  if (typeof cell.value === 'number') return Number.isFinite(cell.value) ? { kind: 'NUMBER', text: String(cell.value), textOverLimit: false, ...base } : { kind: 'UNSUPPORTED', textOverLimit: false, ...base };
  if (typeof cell.value === 'boolean') return { kind: 'BOOLEAN', text: String(cell.value), textOverLimit: false, ...base };
  if (cell.value instanceof Date) return { kind: 'DATE', textOverLimit: false, ...base };
  if (typeof cell.value === 'object' && 'error' in cell.value) return { kind: 'ERROR', textOverLimit: false, ...base };
  if (typeof cell.value === 'object' && 'richText' in cell.value) {
    return { kind: 'TEXT', ...boundedNormalizedText(cell.value.richText.map((part) => part.text)), ...base };
  }
  return { kind: 'UNSUPPORTED', textOverLimit: false, ...base };
}

export async function parseWorkbookBuffer(input: Uint8Array): Promise<ParsedWorkbook> {
  const buffer = Buffer.from(input);
  await preflight(buffer);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as never); } catch { throw new WorkbookParseError('INVALID_XLSX'); }
  if (workbook.worksheets.length > MAX_WORKSHEETS) throw new WorkbookParseError('WORKBOOK_COMPLEXITY_LIMIT');
  let dimensions = 0;
  const sheets = workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > MAX_SHEET_ROWS || sheet.columnCount > MAX_SHEET_COLUMNS) throw new WorkbookParseError('WORKBOOK_COMPLEXITY_LIMIT');
    dimensions += sheet.rowCount * sheet.columnCount;
    if (dimensions > MAX_TOTAL_DIMENSION_CELLS) throw new WorkbookParseError('WORKBOOK_COMPLEXITY_LIMIT');
    const mergedRanges = new Set<string>();
    const rows = [];
    for (let number = 1; number <= sheet.rowCount; number += 1) {
      const row = sheet.getRow(number);
      const cells: ParsedWorkbookCell[] = [];
      for (let column = 1; column <= sheet.columnCount; column += 1) {
        const cell = row.getCell(column);
        if (cell.isMerged) mergedRanges.add(cell.master.address);
        cells.push(cellValue(cell));
      }
      if (mergedRanges.size > MAX_MERGED_RANGES) throw new WorkbookParseError('WORKBOOK_COMPLEXITY_LIMIT');
      rows.push({ number, hidden: row.hidden, cells });
    }
    const hiddenColumns: number[] = [];
    for (let column = 1; column <= sheet.columnCount; column += 1) if (sheet.getColumn(column).hidden) hiddenColumns.push(column);
    const state: ParsedWorkbookSheet['state'] = sheet.state === 'veryHidden' ? 'VERY_HIDDEN' : sheet.state === 'hidden' ? 'HIDDEN' : 'VISIBLE';
    return { name: sheet.name, state, rowCount: sheet.rowCount, columnCount: sheet.columnCount, rows, hiddenColumns };
  });
  return { sheets };
}

if (!isMainThread) {
  parentPort?.once('message', async (input: Uint8Array) => {
    try { parentPort?.postMessage({ ok: true, workbook: await parseWorkbookBuffer(input) } satisfies WorkbookWorkerResponse); }
    catch (error) { parentPort?.postMessage({ ok: false, code: error instanceof WorkbookParseError ? error.code : 'INVALID_XLSX' } satisfies WorkbookWorkerResponse); }
  });
}
