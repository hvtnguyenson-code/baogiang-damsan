import { BadRequestException } from '@nestjs/common';
import { ProgrammeKind } from '@prisma/client';
import { TimetableSpecialProgrammeMarkerService } from '../../src/timetables/timetable-special-programme-marker.service';

describe('TimetableSpecialProgrammeMarkerService', () => {
  let service: TimetableSpecialProgrammeMarkerService;
  let prismaMock: { timetableSpecialProgrammeMarker: { findMany: jest.Mock } };

  beforeEach(() => {
    prismaMock = {
      timetableSpecialProgrammeMarker: {
        findMany: jest.fn(),
      },
    };
    service = new TimetableSpecialProgrammeMarkerService(prismaMock as never);
  });

  it('throws BadRequestException if timetableVersionId is missing or empty', async () => {
    await expect(service.findRetainedMarkers({ timetableVersionId: '' })).rejects.toThrow(BadRequestException);
    await expect(service.findRetainedMarkers({} as unknown as { timetableVersionId: string })).rejects.toThrow(BadRequestException);
  });

  it('queries markers with exact timetableVersionId and returns deterministic order', async () => {
    const mockMarkers = [
      {
        id: 'marker-1',
        timetableVersionId: 'version-1',
        academicYearId: 'year-1',
        schoolClassId: 'class-1',
        timeSlotDefinitionId: 'slot-1',
        kind: ProgrammeKind.GDDP,
        createdAt: new Date('2026-09-21T08:00:00Z'),
      },
      {
        id: 'marker-2',
        timetableVersionId: 'version-1',
        academicYearId: 'year-1',
        schoolClassId: 'class-2',
        timeSlotDefinitionId: 'slot-2',
        kind: ProgrammeKind.HDTN_HN,
        createdAt: new Date('2026-09-21T08:00:00Z'),
      },
    ];
    prismaMock.timetableSpecialProgrammeMarker.findMany.mockResolvedValue(mockMarkers);

    const result = await service.findRetainedMarkers({ timetableVersionId: 'version-1' });

    expect(prismaMock.timetableSpecialProgrammeMarker.findMany).toHaveBeenCalledWith({
      where: {
        timetableVersionId: 'version-1',
      },
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
    expect(result).toEqual(mockMarkers);
  });

  it('applies kind and schoolClassId filters when provided', async () => {
    prismaMock.timetableSpecialProgrammeMarker.findMany.mockResolvedValue([]);

    await service.findRetainedMarkers({
      timetableVersionId: 'version-1',
      kind: ProgrammeKind.HDTN_HN,
      schoolClassId: 'class-10A1',
    });

    expect(prismaMock.timetableSpecialProgrammeMarker.findMany).toHaveBeenCalledWith({
      where: {
        timetableVersionId: 'version-1',
        kind: ProgrammeKind.HDTN_HN,
        schoolClassId: 'class-10A1',
      },
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
  });
});
