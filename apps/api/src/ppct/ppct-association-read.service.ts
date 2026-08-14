import { Injectable } from '@nestjs/common';
import { PpctVersionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PpctReadClient = PrismaService | Prisma.TransactionClient;

export interface PpctAssociationStream {
  academicYearId: string;
  schoolClassId: string;
  subjectId: string;
}

export interface ExactPpctAssociation {
  id: string;
  academicYearId: string;
  schoolClassId: string;
  subjectId: string;
  ppctPlanId: string;
  ppctVersionId: string;
  ppctVersionStatus: PpctVersionStatus;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}

export function exactPpctAssociationDateWhere(
  stream: PpctAssociationStream,
  date: Date,
): Prisma.PpctClassAssociationWhereInput {
  return {
    ...stream,
    effectiveFrom: { lte: date },
    OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }],
  };
}

export function isPpctAssociationEffectiveOn(
  association: ExactPpctAssociation,
  stream: PpctAssociationStream,
  date: Date,
): boolean {
  return association.academicYearId === stream.academicYearId
    && association.schoolClassId === stream.schoolClassId
    && association.subjectId === stream.subjectId
    && association.effectiveFrom <= date
    && (association.effectiveUntil === null || association.effectiveUntil >= date);
}

@Injectable()
export class PpctAssociationReadService {
  async findExactForDate(
    db: PpctReadClient,
    stream: PpctAssociationStream,
    date: Date,
  ): Promise<ExactPpctAssociation[]> {
    const rows = await db.ppctClassAssociation.findMany({
      where: {
        ...exactPpctAssociationDateWhere(stream, date),
      },
      select: {
        id: true,
        academicYearId: true,
        schoolClassId: true,
        subjectId: true,
        ppctPlanId: true,
        ppctVersionId: true,
        effectiveFrom: true,
        effectiveUntil: true,
        ppctVersion: { select: { status: true } },
      },
      orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      academicYearId: row.academicYearId,
      schoolClassId: row.schoolClassId,
      subjectId: row.subjectId,
      ppctPlanId: row.ppctPlanId,
      ppctVersionId: row.ppctVersionId,
      ppctVersionStatus: row.ppctVersion.status,
      effectiveFrom: row.effectiveFrom,
      effectiveUntil: row.effectiveUntil,
    }));
  }

  async findOverlappingRange(
    db: PpctReadClient,
    streams: PpctAssociationStream[],
    from: Date,
    to: Date,
  ): Promise<ExactPpctAssociation[]> {
    if (streams.length === 0) return [];
    const rows = await db.ppctClassAssociation.findMany({
      where: {
        OR: streams.map((stream) => ({ ...stream })),
        effectiveFrom: { lte: to },
        AND: [{ OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: from } }] }],
      },
      select: {
        id: true,
        academicYearId: true,
        schoolClassId: true,
        subjectId: true,
        ppctPlanId: true,
        ppctVersionId: true,
        effectiveFrom: true,
        effectiveUntil: true,
        ppctVersion: { select: { status: true } },
      },
      orderBy: [
        { academicYearId: 'asc' },
        { schoolClassId: 'asc' },
        { subjectId: 'asc' },
        { effectiveFrom: 'asc' },
        { id: 'asc' },
      ],
    });
    return rows.map((row) => ({
      id: row.id,
      academicYearId: row.academicYearId,
      schoolClassId: row.schoolClassId,
      subjectId: row.subjectId,
      ppctPlanId: row.ppctPlanId,
      ppctVersionId: row.ppctVersionId,
      ppctVersionStatus: row.ppctVersion.status,
      effectiveFrom: row.effectiveFrom,
      effectiveUntil: row.effectiveUntil,
    }));
  }
}
