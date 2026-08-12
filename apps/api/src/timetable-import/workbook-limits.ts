export const MAX_XLSX_BYTES = 8 * 1024 * 1024;
export const MAX_WORKSHEETS = 32;
export const MAX_SHEET_ROWS = 5_000;
export const MAX_SHEET_COLUMNS = 64;
export const MAX_TOTAL_DIMENSION_CELLS = 250_000;
export const MAX_HEADER_SCAN_ROWS = 50;
export const MAX_HEADER_CANDIDATES_PER_SHEET = 10;
export const MAX_MERGED_RANGES = 256;
export const MAX_MAPPED_CELL_TEXT_LENGTH = 200;
// Profile headers are capped at 150 characters and mapped values at 200.
// The worker transfers at most this normalized prefix plus an explicit over-limit signal.
export const MAX_PARSER_CELL_TEXT_LENGTH = MAX_MAPPED_CELL_TEXT_LENGTH;
export const MAX_PERIOD_ORDINAL = 99;
export const WORKBOOK_PARSE_TIMEOUT_MS = 8_000;
export const WORKER_RESOURCE_LIMITS = { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 } as const;
export const MAX_XLSX_EXPANDED_BYTES = 64 * 1024 * 1024;
