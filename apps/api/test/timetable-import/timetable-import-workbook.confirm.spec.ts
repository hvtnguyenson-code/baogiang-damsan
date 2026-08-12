import { computeConfirmRequestFingerprint, computeWorkbookSha256 } from '../../src/timetable-import/import-identity';
import { TimetableImportWorkbookService, UploadedWorkbookFile } from '../../src/timetable-import/timetable-import-workbook.service';

const now = new Date('2026-08-12T00:00:00.000Z');
const checksum = 'a1b8d2c734a4ace72ae4e3842afba10d26485c692c8492d92cf37c93bb835c48';
const dto = {
  profileRevisionId: '10000000-0000-4000-8000-000000000001',
  academicYearId: '10000000-0000-4000-8000-000000000002',
  calendarVersionId: '10000000-0000-4000-8000-000000000003',
  effectiveAcademicWeekId: '10000000-0000-4000-8000-000000000004',
  sheetName: 'TKB',
  headerRowNumber: 1,
  requestIdempotencyKey: 'request-1',
};
const upload: UploadedWorkbookFile = {
  originalname: 'renamed.xlsx',
  mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 8,
  buffer: Buffer.from('workbook'),
};
const version = (overrides: Record<string, unknown> = {}) => ({
  id: 'version-1', academicYearId: dto.academicYearId, versionNumber: 1, status: 'DRAFT',
  calendarVersionId: dto.calendarVersionId, effectiveAcademicWeekId: dto.effectiveAcademicWeekId,
  effectiveFrom: new Date('2026-09-07Z'), effectiveUntil: null, contentChecksum: checksum, note: null,
  createdByUserId: 'actor', validatedByUserId: null, validatedAt: null, approvedByUserId: null,
  approvedAt: null, activatedByUserId: null, activatedAt: null, supersededAt: null,
  createdAt: now, updatedAt: now, _count: { entries: 1 }, ...overrides,
});
const receipt = (overrides: Record<string, unknown> = {}) => ({
  id: 'receipt-1', timetableVersionId: 'version-1', profileRevisionId: dto.profileRevisionId,
  checksumAlgorithm: 'SHA-256', serializationVersion: 'semantic-v1',
  requestIdempotencyKey: dto.requestIdempotencyKey, requestFingerprint: 'fingerprint',
  sourceFileName: 'original.xlsx', sheetName: dto.sheetName, headerRowNumber: 1,
  sourceRowCount: 1, normalizedEntryCount: 1, createdByUserId: 'actor', committedAt: now,
  ...overrides,
});
const canonical = {
  profileId: 'profile-1', profileRevisionId: dto.profileRevisionId,
  source: { sourceFileName: 'renamed.xlsx', sheetName: 'TKB', headerRowNumber: 1, sourceRowCount: 1 },
  target: { ...dto, effectiveFrom: '2026-09-07', calendarEndDate: '2027-05-31' },
  rows: [{
    sourceRowNumber: 2, weekday: 'MONDAY', timeSlotDefinitionId: 'slot-1', schoolClassId: 'class-1',
    schoolClassCode: '10A', subjectId: 'subject-1', subjectCode: 'TOAN', teachingAssignmentId: 'assignment-1',
    teacherUserId: 'teacher-1', teacherDisplayName: 'Teacher', teacherStaffCode: 'GV01', normalizedSourceValues: {},
  }],
  issues: [], blockingIssueCount: 0, warningCount: 0, canConfirm: true,
  baseline: { date: '2026-09-07', timetableVersion: null }, diff: null,
};

function fingerprint(): string {
  return computeConfirmRequestFingerprint({
    workbookSha256: computeWorkbookSha256(upload.buffer),
    profileRevisionId: dto.profileRevisionId,
    academicYearId: dto.academicYearId,
    calendarVersionId: dto.calendarVersionId,
    effectiveAcademicWeekId: dto.effectiveAcademicWeekId,
    sheetName: dto.sheetName,
    headerRowNumber: dto.headerRowNumber,
    semanticChecksum: checksum,
  });
}

function harness(options: { rootBinding?: unknown; tx?: Record<string, unknown>; canonicalResult?: unknown } = {}) {
  const parser = { parse: jest.fn().mockResolvedValue({ sheets: [] }) };
  const canonicalization = { preview: jest.fn().mockResolvedValue(options.canonicalResult ?? canonical) };
  const audit = { write: jest.fn() };
  const tx = options.tx ?? {};
  const prisma = {
    timetableImportRequestKey: { findUnique: jest.fn().mockResolvedValue(options.rootBinding ?? null) },
    $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
  };
  return {
    service: new TimetableImportWorkbookService(prisma as never, parser as never, canonicalization as never, audit as never),
    parser, canonicalization, audit, prisma,
  };
}

describe('TimetableImportWorkbookService confirmation', () => {
  it('creates one atomic imported DRAFT, receipt, original key binding and commit audit', async () => {
    const createdReceipt = receipt({ requestFingerprint: fingerprint() });
    const tx = {
      timetableImportRequestKey: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      timetableVersion: {
        findFirst: jest.fn().mockResolvedValue(null), aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 4 } }),
        create: jest.fn().mockResolvedValue(version({ versionNumber: 5 })),
        findUniqueOrThrow: jest.fn().mockResolvedValue(version({ versionNumber: 5 })),
      },
      timetableEntry: { createMany: jest.fn() },
      timetableImportReceipt: { create: jest.fn().mockResolvedValue(createdReceipt) },
    };
    const { service, audit } = harness({ tx });
    const result = await service.confirm(upload, dto, 'actor', { requestId: 'req-1' });
    expect(result).toMatchObject({ outcome: 'CREATED', receipt: { id: 'receipt-1' }, version: { versionNumber: 5, entryCount: 1 } });
    expect(tx.timetableVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: 'DRAFT', versionNumber: 5, contentChecksum: checksum,
    }) });
    expect(tx.timetableEntry.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ teacherUserId: 'teacher-1' })] });
    expect(tx.timetableImportReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      requestIdempotencyKey: 'request-1', requestFingerprint: fingerprint(), normalizedEntryCount: 1,
    }) });
    expect(tx.timetableImportRequestKey.create).toHaveBeenCalledWith({ data: expect.objectContaining({ receiptId: 'receipt-1', requestKey: 'request-1' }) });
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'TIMETABLE_IMPORT_COMMITTED' }), tx);
  });

  it('uses a read-only exact bound-key fast replay and returns current lifecycle state', async () => {
    const binding = {
      requestFingerprint: fingerprint(),
      receipt: { ...receipt({ requestFingerprint: fingerprint() }), timetableVersion: version({ status: 'VALIDATED' }) },
    };
    const { service, parser, prisma } = harness({ rootBinding: binding });
    const result = await service.confirm(upload, dto, 'actor', {});
    expect(result).toMatchObject({ outcome: 'IDEMPOTENT_REPLAY', receipt: { id: 'receipt-1' }, version: { status: 'VALIDATED' } });
    expect(parser.parse).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of a bound key with a different fingerprint without parsing or mutation', async () => {
    const binding = {
      requestFingerprint: 'b'.repeat(64),
      receipt: { ...receipt(), timetableVersion: version() },
    };
    const { service, parser, prisma } = harness({ rootBinding: binding });
    await expect(service.confirm(upload, dto, 'actor', {})).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'TIMETABLE_IMPORT_IDEMPOTENCY_KEY_REUSED' }),
    });
    expect(parser.parse).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('binds a different key to the original receipt on semantic replay without rewriting provenance', async () => {
    const originalReceipt = receipt({ requestIdempotencyKey: 'original-key', requestFingerprint: 'original-fingerprint' });
    const duplicate = { ...version(), importReceipt: originalReceipt };
    const tx = {
      timetableImportRequestKey: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      timetableVersion: { findFirst: jest.fn().mockResolvedValue(duplicate) },
    };
    const { service, audit } = harness({ tx });
    const result = await service.confirm(upload, { ...dto, requestIdempotencyKey: 'second-key' }, 'actor', {});
    expect(result).toMatchObject({
      outcome: 'IDEMPOTENT_REPLAY',
      receipt: { requestIdempotencyKey: 'original-key', requestFingerprint: 'original-fingerprint' },
    });
    expect(tx.timetableImportRequestKey.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      receiptId: 'receipt-1', requestKey: 'second-key',
    }) });
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'TIMETABLE_IMPORT_REPLAY_BOUND' }), tx);
  });

  it('returns a stable blocking conflict before any import write', async () => {
    const tx = {
      timetableImportRequestKey: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      timetableVersion: { findFirst: jest.fn(), create: jest.fn() },
      timetableImportReceipt: { create: jest.fn() },
    };
    const blocked = { ...canonical, blockingIssueCount: 1, canConfirm: false, issues: [{ code: 'TEACHER_NOT_FOUND' }] };
    const { service } = harness({ tx, canonicalResult: blocked });
    await expect(service.confirm(upload, dto, 'actor', {})).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'TIMETABLE_IMPORT_CONFIRM_BLOCKED', blockingIssueCount: 1 }),
    });
    expect(tx.timetableVersion.create).not.toHaveBeenCalled();
    expect(tx.timetableImportReceipt.create).not.toHaveBeenCalled();
    expect(tx.timetableImportRequestKey.create).not.toHaveBeenCalled();
  });
});
