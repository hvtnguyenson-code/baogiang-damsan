import { BadRequestException, ConflictException } from '@nestjs/common';
import { TimetableImportAliasEntityType, TimetableImportSemanticField } from '@prisma/client';
import { TimetableImportService } from '../../src/timetable-import/timetable-import.service';

const mappings: Array<{ semanticField: TimetableImportSemanticField; sourceHeader: string }> = [
  ['WEEKDAY', 'Thứ'],
  ['SESSION', 'Buổi'],
  ['PERIOD_ORDINAL', 'Tiết'],
  ['SCHOOL_CLASS', 'Lớp'],
  ['SUBJECT', 'Môn học'],
  ['TEACHER', 'Giáo viên'],
].map(([semanticField, sourceHeader]) => ({ semanticField: semanticField as TimetableImportSemanticField, sourceHeader }));

const profileDto = (overrides: Record<string, unknown> = {}) => ({
  sourceKey: ' SIS.DAMSAN ',
  name: '  Cấu hình   chính ',
  teacherIdentifierMode: 'GENERIC_EXACT',
  sheetNameHint: '  Thời khóa   biểu ',
  headerRowHint: 2,
  columnMappings: mappings,
  ...overrides,
});

function serviceWith(prisma: Record<string, unknown>) {
  const audit = { write: jest.fn().mockResolvedValue(undefined) };
  return { service: new TimetableImportService(prisma as never, audit as never), audit };
}

describe('TimetableImportService', () => {
  it('creates revision 1 with exactly six normalized mappings and same-transaction audit', async () => {
    const createdAt = new Date('2026-08-12T00:00:00.000Z');
    type CreateData = {
      sourceKey: string;
      name: string;
      revisions: { create: Record<string, unknown> & { columnMappings: { create: Array<Record<string, unknown>> } } };
    };
    const create = jest.fn(async ({ data }: { data: CreateData }) => ({
      id: 'profile-1', sourceKey: data.sourceKey, name: data.name, createdByUserId: 'actor', createdAt, updatedAt: createdAt,
      revisions: [{
        id: 'revision-1', profileId: 'profile-1', revision: 1, isActive: true,
        ...data.revisions.create, retiredByUserId: null, retiredAt: null, createdAt,
        columnMappings: data.revisions.create.columnMappings.create.map((mapping: Record<string, unknown>, index: number) => ({ id: `mapping-${index}`, profileRevisionId: 'revision-1', createdAt, ...mapping })),
      }],
    }));
    const tx = { timetableImportProfile: { create } };
    const { service, audit } = serviceWith({ $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) });
    const result = await service.createProfile(profileDto() as never, 'actor', { requestId: 'request-1' });
    const data = create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ sourceKey: 'sis.damsan', name: 'Cấu hình chính' });
    expect(data.revisions.create.columnMappings.create).toHaveLength(6);
    expect(data.revisions.create.columnMappings.create[0]).toMatchObject({ sourceHeader: 'Thứ', sourceHeaderKey: 'thứ' });
    expect(result.activeRevision?.columnMappings).toHaveLength(6);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'TIMETABLE_IMPORT_PROFILE_CREATED', requestId: 'request-1' }), tx);
  });

  it('rejects missing, duplicate mappings and invalid source keys before mutation', async () => {
    const transaction = jest.fn();
    const { service } = serviceWith({ $transaction: transaction });
    await expect(service.createProfile(profileDto({ columnMappings: mappings.slice(0, 5) }) as never, 'actor', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createProfile(profileDto({ columnMappings: [...mappings.slice(0, 5), mappings[0]] }) as never, 'actor', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createProfile(profileDto({ sourceKey: 'nguồn dữ liệu' }) as never, 'actor', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a stale revision chain head and an already inactive profile', async () => {
    const profile = { id: 'profile-1', sourceKey: 'sis', revisions: [{ id: 'active', revision: 1, isActive: true }] };
    const tx = { timetableImportProfile: { findUnique: jest.fn().mockResolvedValue(profile) } };
    const { service } = serviceWith({ $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) });
    await expect(service.reviseProfile('profile-1', { ...profileDto(), expectedActiveRevisionId: crypto.randomUUID() } as never, 'actor', {})).rejects.toBeInstanceOf(ConflictException);
    tx.timetableImportProfile.findUnique.mockResolvedValue({ ...profile, revisions: [] });
    await expect(service.retireActiveProfile('profile-1', crypto.randomUUID(), 'actor', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    [TimetableImportAliasEntityType.TEACHER, { subjectId: crypto.randomUUID() }],
    [TimetableImportAliasEntityType.SCHOOL_CLASS, { schoolClassId: crypto.randomUUID() }],
    [TimetableImportAliasEntityType.SUBJECT, { subjectId: crypto.randomUUID(), teacherUserId: crypto.randomUUID() }],
  ])('rejects malformed %s target shapes before Prisma write', async (entityType, target) => {
    const transaction = jest.fn();
    const { service } = serviceWith({ $transaction: transaction });
    await expect(service.createAlias('profile', { entityType, sourceValue: 'Giá trị', ...target } as never, 'actor', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects inactive and non-teaching teacher targets', async () => {
    const teacherUserId = crypto.randomUUID();
    const tx = {
      timetableImportProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: teacherUserId, status: 'ACTIVE', profile: { isTeachingStaff: false } }) },
    };
    const { service } = serviceWith({ $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) });
    await expect(service.createAlias('profile', { entityType: 'TEACHER', sourceValue: 'GV01', teacherUserId } as never, 'actor', {})).rejects.toBeInstanceOf(ConflictException);
    tx.user.findUnique.mockResolvedValue({ id: teacherUserId, status: 'DISABLED', profile: { isTeachingStaff: true } });
    await expect(service.createAlias('profile', { entityType: 'TEACHER', sourceValue: 'GV01', teacherUserId } as never, 'actor', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects inactive subjects and wrong-year classes', async () => {
    const subjectId = crypto.randomUUID();
    const academicYearId = crypto.randomUUID();
    const schoolClassId = crypto.randomUUID();
    const tx = {
      timetableImportProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile' }) },
      subject: { findUnique: jest.fn().mockResolvedValue({ id: subjectId, status: 'INACTIVE' }) },
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: academicYearId }) },
      schoolClass: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const { service } = serviceWith({ $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)) });
    await expect(service.createAlias('profile', { entityType: 'SUBJECT', sourceValue: 'Toán', subjectId } as never, 'actor', {})).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createAlias('profile', { entityType: 'SCHOOL_CLASS', sourceValue: '10A', academicYearId, schoolClassId } as never, 'actor', {})).rejects.toThrow('đúng năm học');
  });

  it('accepts each exact well-formed alias shape at the service boundary', async () => {
    const cases = [
      { entityType: TimetableImportAliasEntityType.TEACHER, sourceValue: 'GV', teacherUserId: crypto.randomUUID() },
      { entityType: TimetableImportAliasEntityType.SCHOOL_CLASS, sourceValue: '10A', academicYearId: crypto.randomUUID(), schoolClassId: crypto.randomUUID() },
      { entityType: TimetableImportAliasEntityType.SUBJECT, sourceValue: 'Toán', subjectId: crypto.randomUUID() },
    ];
    for (const item of cases) {
      const marker = new Error('shape passed');
      const { service } = serviceWith({ $transaction: jest.fn().mockRejectedValue(marker) });
      await expect(service.createAlias('profile', item as never, 'actor', {})).rejects.toBe(marker);
    }
  });

  it('uses the canonical semantic field set', () => {
    expect(Object.values(TimetableImportSemanticField)).toEqual([
      'WEEKDAY', 'SESSION', 'PERIOD_ORDINAL', 'SCHOOL_CLASS', 'SUBJECT', 'TEACHER',
    ]);
  });
});
