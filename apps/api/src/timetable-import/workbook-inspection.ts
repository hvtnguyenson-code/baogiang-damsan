import { TimetableImportHeaderCandidate, TimetableImportPreviewIssue, TimetableImportSemanticField, TimetableImportWorksheetInspection } from '@baogiang/contracts';
import { MAX_HEADER_CANDIDATES_PER_SHEET, MAX_HEADER_SCAN_ROWS } from './workbook-limits';
import { ParsedWorkbook, ParsedWorkbookCell, ParsedWorkbookSheet } from './workbook-parser.types';
import { normalizeLookupKey } from './normalization';
import { semanticFields, sortPreviewIssues } from './workbook-canonicalization';

export interface HeaderMapping { semanticField: TimetableImportSemanticField; sourceHeaderKey: string }
export interface LocatedHeader { columns: Record<TimetableImportSemanticField, number>; candidate: TimetableImportHeaderCandidate }

const nonBlank = (cell: ParsedWorkbookCell): boolean => cell.kind !== 'BLANK';

export function locateHeader(sheet: ParsedWorkbookSheet, rowNumber: number, mappings: HeaderMapping[]): LocatedHeader | undefined {
  const row = sheet.rows.find((item) => item.number === rowNumber);
  if (!row) return undefined;
  const columns = {} as Record<TimetableImportSemanticField, number>;
  const matched: TimetableImportSemanticField[] = [];
  let duplicate = false;
  for (const mapping of mappings) {
    const matches = row.cells.flatMap((cell, index) => !cell.textOverLimit && cell.text !== undefined && normalizeLookupKey(cell.text) === mapping.sourceHeaderKey ? [index + 1] : []);
    if (matches.length > 1) duplicate = true;
    if (matches.length === 1) { columns[mapping.semanticField] = matches[0]!; matched.push(mapping.semanticField); }
  }
  const complete = !duplicate && matched.length === semanticFields.length;
  return { columns, candidate: { rowNumber, matchedSemanticFields: matched, complete } };
}

export function inspectParsedWorkbook(workbook: ParsedWorkbook, mappings: HeaderMapping[], sheetHint: string | null): { sheets: TimetableImportWorksheetInspection[]; issues: TimetableImportPreviewIssue[] } {
  const issues: TimetableImportPreviewIssue[] = [];
  const sheets = workbook.sheets.map((sheet): TimetableImportWorksheetInspection => {
    const scannedCandidates: TimetableImportHeaderCandidate[] = [];
    const completeHeaders: LocatedHeader[] = [];
    for (let row = 1; row <= Math.min(sheet.rowCount, MAX_HEADER_SCAN_ROWS); row += 1) {
      const located = locateHeader(sheet, row, mappings);
      if (located?.candidate.complete) completeHeaders.push(located);
      if (located && located.candidate.matchedSemanticFields.length > 0) scannedCandidates.push(located.candidate);
    }
    const candidates = [
      ...scannedCandidates.filter((candidate) => candidate.complete),
      ...scannedCandidates.filter((candidate) => !candidate.complete),
    ].slice(0, MAX_HEADER_CANDIDATES_PER_SHEET).sort((a, b) => a.rowNumber - b.rowNumber);
    const hasContent = sheet.rows.some((row) => row.cells.some(nonBlank));
    if (sheet.state !== 'VISIBLE' && completeHeaders.length > 0) {
      const mappedData = completeHeaders.some((located) => sheet.rows.some((row) => row.number > located.candidate.rowNumber && semanticFields.some((field) => nonBlank(row.cells[located.columns[field] - 1]!))));
      if (mappedData) issues.push({ code: 'HIDDEN_MAPPED_DATA', severity: 'ERROR', category: 'SHEET', message: 'Hidden worksheet contains mapped timetable data.' });
    }
    return { name: sheet.name, state: sheet.state, nonBlank: hasContent, selectable: sheet.state === 'VISIBLE' && hasContent, rowCount: sheet.rowCount, columnCount: sheet.columnCount, matchesProfileSheetHint: sheetHint !== null && normalizeLookupKey(sheet.name) === normalizeLookupKey(sheetHint), headerCandidates: candidates };
  });
  return { sheets, issues: sortPreviewIssues(issues) };
}
