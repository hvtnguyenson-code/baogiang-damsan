import { BadRequestException } from '@nestjs/common';
import { MAX_XLSX_BYTES } from '../../src/timetable-import/workbook-limits';
import { TimetableImportWorkbookService, UploadedWorkbookFile } from '../../src/timetable-import/timetable-import-workbook.service';

const mappings = ['WEEKDAY', 'SESSION', 'PERIOD_ORDINAL', 'SCHOOL_CLASS', 'SUBJECT', 'TEACHER'].map((semanticField) => ({
  semanticField, sourceHeaderKey: semanticField.toLowerCase(),
}));

function file(overrides: Partial<UploadedWorkbookFile> = {}): UploadedWorkbookFile {
  return { originalname: 'TEST.XLSX', mimetype: 'application/octet-stream', size: 1, buffer: Buffer.from('x'), ...overrides };
}

function service(parserResult: unknown = { sheets: [] }): TimetableImportWorkbookService {
  const prisma = { timetableImportProfileRevision: { findUnique: jest.fn().mockResolvedValue({
    id: 'revision', profileId: 'profile', isActive: true, sheetNameHint: null, profile: {}, columnMappings: mappings,
  }) } };
  const parser = { parse: jest.fn().mockResolvedValue(parserResult) };
  return new TimetableImportWorkbookService(prisma as never, parser as never);
}

describe('TimetableImportWorkbookService transport boundary', () => {
  it('accepts case-insensitive XLSX with octet-stream only after parser validation', async () => {
    await expect(service().inspect(file(), 'revision')).resolves.toMatchObject({ sourceFileName: 'TEST.XLSX', sheets: [] });
  });

  it.each(['workbook.xls', 'workbook.csv', 'workbook.xlsm', 'workbook.xlsb', 'workbook.ods', 'workbook.zip'])('rejects unsupported extension %s with 415', async (originalname) => {
    await expect(service().inspect(file({ originalname }), 'revision')).rejects.toMatchObject({ status: 415 });
  });

  it('returns stable 400/413 boundaries for missing and oversized files', async () => {
    await expect(service().inspect(undefined, 'revision')).rejects.toMatchObject({ status: 400 });
    await expect(service().inspect(file({ size: MAX_XLSX_BYTES + 1 }), 'revision')).rejects.toMatchObject({ status: 413 });
  });

  it('does not leak parser internals when content validation fails', async () => {
    const parserFailure = new BadRequestException({ error: 'TIMETABLE_IMPORT_INVALID_XLSX', message: 'Workbook is invalid or unsupported.' });
    const prisma = { timetableImportProfileRevision: { findUnique: jest.fn().mockResolvedValue({
      id: 'revision', profileId: 'profile', isActive: true, sheetNameHint: null, profile: {}, columnMappings: mappings,
    }) } };
    const parser = { parse: jest.fn().mockRejectedValue(parserFailure) };
    const result = new TimetableImportWorkbookService(prisma as never, parser as never).inspect(file({ buffer: Buffer.from('fake CSV') }), 'revision');
    await expect(result).rejects.toBe(parserFailure);
    expect(JSON.stringify(parserFailure.getResponse())).not.toContain('fake CSV');
  });
});
