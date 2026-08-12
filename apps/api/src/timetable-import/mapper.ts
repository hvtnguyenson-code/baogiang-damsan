import { Prisma } from '@prisma/client';
import {
  TimetableImportAliasRecord,
  TimetableImportProfileDetail,
  TimetableImportProfileRecord,
  TimetableImportProfileRevisionRecord,
  TimetableImportSemanticField,
} from '@baogiang/contracts';

export const semanticFieldOrder: readonly TimetableImportSemanticField[] = [
  'WEEKDAY',
  'SESSION',
  'PERIOD_ORDINAL',
  'SCHOOL_CLASS',
  'SUBJECT',
  'TEACHER',
];

export const profileInclude = {
  revisions: { include: { columnMappings: true } },
} satisfies Prisma.TimetableImportProfileInclude;

export type ProfileWithRevisions = Prisma.TimetableImportProfileGetPayload<{ include: typeof profileInclude }>;
export type RevisionWithMappings = ProfileWithRevisions['revisions'][number];

export function toRevisionRecord(row: RevisionWithMappings): TimetableImportProfileRevisionRecord {
  const order = new Map(semanticFieldOrder.map((field, index) => [field, index]));
  return {
    id: row.id,
    profileId: row.profileId,
    revision: row.revision,
    isActive: row.isActive,
    sheetNameHint: row.sheetNameHint,
    headerRowHint: row.headerRowHint,
    teacherIdentifierMode: row.teacherIdentifierMode,
    createdByUserId: row.createdByUserId,
    retiredByUserId: row.retiredByUserId,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    columnMappings: [...row.columnMappings]
      .sort((a, b) => (order.get(a.semanticField) ?? 99) - (order.get(b.semanticField) ?? 99))
      .map(({ semanticField, sourceHeader }) => ({ semanticField, sourceHeader })),
  };
}

export function toProfileRecord(row: ProfileWithRevisions): TimetableImportProfileRecord {
  const active = row.revisions.find((revision) => revision.isActive) ?? null;
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    name: row.name,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    activeRevision: active ? toRevisionRecord(active) : null,
  };
}

export function toProfileDetail(row: ProfileWithRevisions): TimetableImportProfileDetail {
  return {
    ...toProfileRecord(row),
    revisions: [...row.revisions]
      .sort((a, b) => b.revision - a.revision)
      .map(toRevisionRecord),
  };
}

export function toAliasRecord(row: Prisma.TimetableImportEntityAliasGetPayload<object>): TimetableImportAliasRecord {
  return {
    id: row.id,
    profileId: row.profileId,
    entityType: row.entityType,
    academicYearId: row.academicYearId,
    sourceValue: row.sourceValue,
    teacherUserId: row.teacherUserId,
    schoolClassId: row.schoolClassId,
    subjectId: row.subjectId,
    isActive: row.isActive,
    createdByUserId: row.createdByUserId,
    retiredByUserId: row.retiredByUserId,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
