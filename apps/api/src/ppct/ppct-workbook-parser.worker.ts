import { isMainThread, parentPort } from 'worker_threads';
import type { Readable } from 'stream';
import ExcelJS from 'exceljs';
import {
  MAX_MERGED_RANGES,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MAX_TOTAL_DIMENSION_CELLS,
  MAX_WORKSHEETS,
  MAX_XLSX_EXPANDED_BYTES,
} from '../timetable-import/workbook-limits';
import type {
  ParsedWorkbook,
  ParsedWorkbookCell,
  ParsedWorkbookSheet,
  WorkbookWorkerResponse,
} from '../timetable-import/workbook-parser.types';

const MAX_PPCT_CELL_TEXT_LENGTH = 500;
const MAX_ZIP_ENTRIES = 100;
const MAX_EXPANSION_RATIO = 20;
const MAX_RELATIONSHIP_BYTES = 1024 * 1024;

interface ZipEntry {
  fileName: string;
  uncompressedSize: number;
  compressedSize: number;
}
interface ZipFile {
  readEntry(): void;
  close(): void;
  openReadStream(entry: ZipEntry, callback: (error: Error | null, stream?: Readable) => void): void;
  on(event: 'entry', listener: (entry: ZipEntry) => void): void;
  on(event: 'end', listener: () => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
}
interface YauzlApi {
  fromBuffer(
    buffer: Buffer,
    options: Record<string, unknown>,
    callback: (error: Error | null, zip?: ZipFile) => void,
  ): void;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yauzl = require('yauzl') as YauzlApi;

class PpctWorkbookParseError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function rejectPath(name: string): boolean {
  const normalized = name.replaceAll('\\', '/');
  return (
    name.includes('\\')
    || normalized.startsWith('/')
    || /^[A-Za-z]:\//u.test(normalized)
    || normalized.split('/').some((part) => part === '..')
  );
}

function isEncryptedCompoundFile(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';
}

async function readRelationshipEntry(zip: ZipFile, entry: ZipEntry): Promise<string> {
  if (entry.uncompressedSize > MAX_RELATIONSHIP_BYTES) {
    throw new PpctWorkbookParseError('PPCT_IMPORT_COMPLEXITY_LIMIT');
  }
  return await new Promise<string>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(new PpctWorkbookParseError('PPCT_IMPORT_INVALID_FILE_TYPE'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer | string) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += value.length;
        if (size <= MAX_RELATIONSHIP_BYTES) chunks.push(value);
      });
      stream.on('error', () => reject(new PpctWorkbookParseError('PPCT_IMPORT_INVALID_FILE_TYPE')));
      stream.on('end', () => {
        if (size > MAX_RELATIONSHIP_BYTES) {
          reject(new PpctWorkbookParseError('PPCT_IMPORT_COMPLEXITY_LIMIT'));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
  });
}

async function preflight(buffer: Buffer): Promise<void> {
  if (isEncryptedCompoundFile(buffer)) {
    throw new PpctWorkbookParseError('PPCT_IMPORT_ENCRYPTED_UNSUPPORTED');
  }

  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true, autoClose: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new PpctWorkbookParseError('PPCT_IMPORT_INVALID_FILE_TYPE'));
          return;
        }

        let settled = false;
        let totalExpanded = 0;
        let entryCount = 0;
        let contentTypesFound = false;
        let workbookFound = false;

        const fail = (code: string): void => {
          if (settled) return;
          settled = true;
          try { zip.close(); } catch { /* noop */ }
          reject(new PpctWorkbookParseError(code));
        };

        const next = (): void => {
          if (!settled) zip.readEntry();
        };

        zip.on('error', () => fail('PPCT_IMPORT_INVALID_FILE_TYPE'));
        zip.on('entry', (entry) => {
          if (settled) return;
          entryCount += 1;
          if (entryCount > MAX_ZIP_ENTRIES) {
            fail('PPCT_IMPORT_COMPLEXITY_LIMIT');
            return;
          }

          if (rejectPath(entry.fileName)) {
            fail('PPCT_IMPORT_INVALID_FILE_TYPE');
            return;
          }

          const name = entry.fileName.replaceAll('\\', '/').toLowerCase();
          totalExpanded += entry.uncompressedSize;
          if (
            totalExpanded > MAX_XLSX_EXPANDED_BYTES
            || entry.uncompressedSize > MAX_XLSX_EXPANDED_BYTES
            || (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_EXPANSION_RATIO)
          ) {
            fail('PPCT_IMPORT_COMPLEXITY_LIMIT');
            return;
          }

          if (name === '[content_types].xml') contentTypesFound = true;
          if (name === 'xl/workbook.xml') workbookFound = true;

          if (name.endsWith('vbaproject.bin')) {
            fail('PPCT_IMPORT_MACRO_UNSUPPORTED');
            return;
          }
          if (
            name === 'encryptioninfo'
            || name === 'encryptedpackage'
          ) {
            fail('PPCT_IMPORT_ENCRYPTED_UNSUPPORTED');
            return;
          }
          if (
            name.startsWith('xl/externallinks/')
            || name.startsWith('xl/embeddings/')
            || name.startsWith('xl/oleobjects/')
            || name.startsWith('xl/activex/')
            || name === 'xl/connections.xml'
          ) {
            fail('PPCT_IMPORT_EXTERNAL_LINKS_UNSUPPORTED');
            return;
          }

          if (name.endsWith('.rels')) {
            void readRelationshipEntry(zip, entry)
              .then((xml) => {
                if (/\bTargetMode\s*=\s*["']External["']/iu.test(xml)) {
                  fail('PPCT_IMPORT_EXTERNAL_LINKS_UNSUPPORTED');
                  return;
                }
                next();
              })
              .catch((relationshipError: unknown) => {
                fail(
                  relationshipError instanceof PpctWorkbookParseError
                    ? relationshipError.code
                    : 'PPCT_IMPORT_INVALID_FILE_TYPE',
                );
              });
            return;
          }

          next();
        });

        zip.on('end', () => {
          if (settled) return;
          if (!contentTypesFound || !workbookFound) {
            fail('PPCT_IMPORT_INVALID_FILE_TYPE');
            return;
          }
          if (buffer.length === 0 || totalExpanded / buffer.length > MAX_EXPANSION_RATIO) {
            fail('PPCT_IMPORT_COMPLEXITY_LIMIT');
            return;
          }
          settled = true;
          resolve();
        });

        next();
      },
    );
  });
}

function boundedText(parts: Iterable<string>): { text: string; textOverLimit: boolean } {
  let text = '';
  let textOverLimit = false;
  outer: for (const part of parts) {
    for (const character of part) {
      const next = `${text}${character}`.normalize('NFKC');
      if (next.length > MAX_PPCT_CELL_TEXT_LENGTH) {
        textOverLimit = true;
        break outer;
      }
      text = next;
    }
  }
  return { text, textOverLimit };
}

function cellValue(cell: ExcelJS.Cell): ParsedWorkbookCell {
  const base = {
    formula: Boolean(cell.formula),
    hyperlink: Boolean(cell.hyperlink),
    merged: cell.isMerged,
  };
  if (cell.value === null || cell.value === undefined || cell.value === '') {
    return { kind: 'BLANK', textOverLimit: false, ...base };
  }
  if (cell.formula) return { kind: 'UNSUPPORTED', textOverLimit: false, ...base };
  if (cell.hyperlink) return { kind: 'UNSUPPORTED', textOverLimit: false, ...base };
  if (typeof cell.value === 'string') return { kind: 'TEXT', ...boundedText([cell.value]), ...base };
  if (typeof cell.value === 'number') {
    return Number.isFinite(cell.value)
      ? { kind: 'NUMBER', text: String(cell.value), textOverLimit: false, ...base }
      : { kind: 'UNSUPPORTED', textOverLimit: false, ...base };
  }
  if (typeof cell.value === 'boolean') {
    return { kind: 'BOOLEAN', text: String(cell.value), textOverLimit: false, ...base };
  }
  if (cell.value instanceof Date) return { kind: 'DATE', textOverLimit: false, ...base };
  if (typeof cell.value === 'object' && 'error' in cell.value) {
    return { kind: 'ERROR', textOverLimit: false, ...base };
  }
  if (typeof cell.value === 'object' && 'richText' in cell.value) {
    return {
      kind: 'TEXT',
      ...boundedText(cell.value.richText.map((part) => part.text)),
      ...base,
    };
  }
  return { kind: 'UNSUPPORTED', textOverLimit: false, ...base };
}

export async function parsePpctWorkbookBuffer(input: Uint8Array): Promise<ParsedWorkbook> {
  const buffer = Buffer.from(input);
  await preflight(buffer);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new PpctWorkbookParseError('PPCT_IMPORT_INVALID_FILE_TYPE');
  }

  if (workbook.worksheets.length > MAX_WORKSHEETS) {
    throw new PpctWorkbookParseError('PPCT_IMPORT_COMPLEXITY_LIMIT');
  }

  let dimensions = 0;
  let mergedRangeCount = 0;
  const sheets = workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > MAX_SHEET_ROWS || sheet.columnCount > MAX_SHEET_COLUMNS) {
      throw new PpctWorkbookParseError('PPCT_IMPORT_COMPLEXITY_LIMIT');
    }
    dimensions += sheet.rowCount * sheet.columnCount;
    if (dimensions > MAX_TOTAL_DIMENSION_CELLS) {
      throw new PpctWorkbookParseError('PPCT_IMPORT_COMPLEXITY_LIMIT');
    }

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
      rows.push({ number, hidden: row.hidden, cells });
    }
    mergedRangeCount += mergedRanges.size;
    if (mergedRangeCount > MAX_MERGED_RANGES) {
      throw new PpctWorkbookParseError('PPCT_IMPORT_COMPLEXITY_LIMIT');
    }

    const hiddenColumns: number[] = [];
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      if (sheet.getColumn(column).hidden) hiddenColumns.push(column);
    }
    const state: ParsedWorkbookSheet['state'] =
      sheet.state === 'veryHidden'
        ? 'VERY_HIDDEN'
        : sheet.state === 'hidden'
          ? 'HIDDEN'
          : 'VISIBLE';

    return {
      name: sheet.name,
      state,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      rows,
      hiddenColumns,
    };
  });

  return { sheets };
}

if (!isMainThread) {
  parentPort?.once('message', async (input: Uint8Array) => {
    try {
      const workbook = await parsePpctWorkbookBuffer(input);
      parentPort?.postMessage({ ok: true, workbook } satisfies WorkbookWorkerResponse);
    } catch (error) {
      parentPort?.postMessage({
        ok: false,
        code: error instanceof PpctWorkbookParseError
          ? error.code
          : 'PPCT_IMPORT_INVALID_FILE_TYPE',
      } satisfies WorkbookWorkerResponse);
    }
  });
}
