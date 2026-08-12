export type ParsedCellKind = 'BLANK' | 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'ERROR' | 'UNSUPPORTED';
export interface ParsedWorkbookCell {
  kind: ParsedCellKind;
  text?: string;
  textOverLimit: boolean;
  formula: boolean;
  hyperlink: boolean;
  merged: boolean;
}
export interface ParsedWorkbookRow { number: number; hidden: boolean; cells: ParsedWorkbookCell[] }
export interface ParsedWorkbookSheet {
  name: string;
  state: 'VISIBLE' | 'HIDDEN' | 'VERY_HIDDEN';
  rowCount: number;
  columnCount: number;
  rows: ParsedWorkbookRow[];
  hiddenColumns: number[];
}
export interface ParsedWorkbook { sheets: ParsedWorkbookSheet[] }
export interface WorkbookWorkerResponse { ok: boolean; workbook?: ParsedWorkbook; code?: string }

export class WorkbookParseError extends Error {
  constructor(readonly code: string) { super(code); }
}
