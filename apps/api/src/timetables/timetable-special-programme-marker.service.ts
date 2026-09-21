import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ProgrammeKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface FindRetainedMarkersFilter {
  timetableVersionId: string;
  kind?: ProgrammeKind;
  schoolClassId?: string;
}

export interface RetainedSpecialProgrammeMarkerRecord {
  id: string;
  timetableVersionId: string;
  academicYearId: string;
  schoolClassId: string;
  timeSlotDefinitionId: string;
  kind: ProgrammeKind;
  createdAt: Date;
}

@Injectable()
export class TimetableSpecialProgrammeMarkerService {
  constructor(private readonly prisma: PrismaService) {}

  async findRetainedMarkers(
    filter: FindRetainedMarkersFilter,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<RetainedSpecialProgrammeMarkerRecord[]> {
    if (!filter || !filter.timetableVersionId || typeof filter.timetableVersionId !== 'string' || filter.timetableVersionId.trim() === '') {
      throw new BadRequestException('timetableVersionId is required to read retained special programme markers');
    }

    const where: Prisma.TimetableSpecialProgrammeMarkerWhereInput = {
      timetableVersionId: filter.timetableVersionId,
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.schoolClassId ? { schoolClassId: filter.schoolClassId } : {}),
    };

    return db.timetableSpecialProgrammeMarker.findMany({
      where,
      orderBy: [
        { schoolClassId: 'asc' },
        { timeSlotDefinitionId: 'asc' },
        { kind: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        timetableVersionId: true,
        academicYearId: true,
        schoolClassId: true,
        timeSlotDefinitionId: true,
        kind: true,
        createdAt: true,
      },
    });
  }
}
