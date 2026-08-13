import { Prisma } from '@prisma/client';
import {
  PpctClassAssociationRecord,
  PpctItemRevisionRecord,
  PpctLineageEdgeRecord,
  PpctPlanRecord,
  PpctVersionRecord,
} from '@baogiang/contracts';
import { formatCivilDate } from '../common/validation/civil-date';

export const ppctVersionInclude = { _count: { select: { itemRevisions: true } } } satisfies Prisma.PpctVersionInclude;
export type PpctVersionWithCount = Prisma.PpctVersionGetPayload<{ include: typeof ppctVersionInclude }>;

export const ppctAssociationInclude = { ppctVersion: true } satisfies Prisma.PpctClassAssociationInclude;
export type PpctAssociationWithVersion = Prisma.PpctClassAssociationGetPayload<{ include: typeof ppctAssociationInclude }>;

export function toPpctPlanRecord(row: { id: string; academicYearId: string; subjectId: string; gradeLevel: number; createdAt: Date; updatedAt: Date }): PpctPlanRecord {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    subjectId: row.subjectId,
    gradeLevel: row.gradeLevel as 10 | 11 | 12,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPpctVersionRecord(row: PpctVersionWithCount): PpctVersionRecord {
  return {
    id: row.id,
    ppctPlanId: row.ppctPlanId,
    versionNumber: row.versionNumber,
    status: row.status,
    createdByUserId: row.createdByUserId,
    publishedByUserId: row.publishedByUserId,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    supersededByUserId: row.supersededByUserId,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    itemCount: row._count.itemRevisions,
  };
}

export function toPpctItemRevisionRecord(row: { id: string; ppctVersionId: string; ppctPlanId: string; ppctItemId: string; sequence: number; title: string; lessonType: string; createdAt: Date }): PpctItemRevisionRecord {
  return {
    id: row.id,
    ppctVersionId: row.ppctVersionId,
    ppctPlanId: row.ppctPlanId,
    itemId: row.ppctItemId,
    sequence: row.sequence,
    title: row.title,
    lessonType: row.lessonType,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPpctLineageEdgeRecord(row: { id: string; ppctPlanId: string; predecessorVersionId: string; predecessorItemId: string; successorVersionId: string; successorItemId: string; createdAt: Date }): PpctLineageEdgeRecord {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export function toPpctAssociationRecord(row: PpctAssociationWithVersion): PpctClassAssociationRecord {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    schoolClassId: row.schoolClassId,
    subjectId: row.subjectId,
    gradeLevel: row.gradeLevel as 10 | 11 | 12,
    ppctPlanId: row.ppctPlanId,
    ppctVersionId: row.ppctVersionId,
    ppctVersionStatus: row.ppctVersion.status,
    effectiveFrom: formatCivilDate(row.effectiveFrom),
    effectiveUntil: row.effectiveUntil ? formatCivilDate(row.effectiveUntil) : null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
