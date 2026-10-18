import { Test, TestingModule } from '@nestjs/testing';
import { ResponsibilityTemplatesController } from '../../src/capabilities/responsibility-templates.controller';
import { AccessBaselineService } from '../../src/capabilities/access-baseline.service';
import {
  AcademicYearOptionListResponse,
  ProgrammeMasterOptionListResponse,
} from '@baogiang/contracts';
import { ListAcademicYearOptionsDto, ListProgrammeMasterOptionsDto } from '../../src/capabilities/dto';
import { Reflector } from '@nestjs/core';
import { REQUIRE_CAPABILITIES_METADATA } from '../../src/authorization/authorization.types';
import { SessionAuthGuard } from '../../src/auth/session-auth.guard';
import { CapabilityGuard } from '../../src/authorization/capability.guard';
import { CsrfOriginGuard } from '../../src/auth/csrf-origin.guard';

describe('ResponsibilityTemplatesController Unit Tests', () => {
  let controller: ResponsibilityTemplatesController;
  let service: jest.Mocked<AccessBaselineService>;

  const mockAcademicYearsResult: AcademicYearOptionListResponse = {
    items: [
      { id: 'year-1', code: '2026_2027', name: 'Năm học 2026-2027' },
      { id: 'year-2', code: '2025_2026', name: 'Năm học 2025-2026' },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  };

  const mockProgrammeMastersResult: ProgrammeMasterOptionListResponse = {
    items: [
      { id: 'master-1', academicYearId: 'year-1', kind: 'GDDP', gradeLevel: 10 },
      { id: 'master-2', academicYearId: 'year-1', kind: 'GDDP', gradeLevel: 11 },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  };

  beforeEach(async () => {
    const mockService = {
      listAcademicYearOptions: jest.fn().mockResolvedValue(mockAcademicYearsResult),
      listProgrammeMasterOptions: jest.fn().mockResolvedValue(mockProgrammeMastersResult),
      previewTemplate: jest.fn(),
      applyTemplate: jest.fn(),
      previewReconciliation: jest.fn(),
      applyReconciliation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResponsibilityTemplatesController],
      providers: [
        { provide: AccessBaselineService, useValue: mockService },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CapabilityGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CsrfOriginGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ResponsibilityTemplatesController>(ResponsibilityTemplatesController);
    service = module.get(AccessBaselineService) as jest.Mocked<AccessBaselineService>;
  });

  it('1. has class-level RequireCapability guard for CAPABILITY_GRANT / SCHOOL_WIDE', () => {
    const reflector = new Reflector();
    const requirements = reflector.get(REQUIRE_CAPABILITIES_METADATA, ResponsibilityTemplatesController);
    expect(requirements).toBeDefined();
    expect(requirements).toHaveLength(1);
    expect(requirements[0].capabilityKey).toBe('CAPABILITY_GRANT');
    expect(requirements[0].scope).toBe('SCHOOL_WIDE');
  });

  it('2. listAcademicYearOptions delegates to service.listAcademicYearOptions', async () => {
    const query: ListAcademicYearOptionsDto = { page: 1, pageSize: 20 };
    const result = await controller.listAcademicYearOptions(query);

    expect(result).toEqual(mockAcademicYearsResult);
    expect(service.listAcademicYearOptions).toHaveBeenCalledTimes(1);
    expect(service.listAcademicYearOptions).toHaveBeenCalledWith(query);
  });

  it('3. listProgrammeMasterOptions delegates to service.listProgrammeMasterOptions', async () => {
    const query: ListProgrammeMasterOptionsDto = {
      academicYearId: 'year-1',
      kind: 'GDDP',
      page: 1,
      pageSize: 20,
    };
    const result = await controller.listProgrammeMasterOptions(query);

    expect(result).toEqual(mockProgrammeMastersResult);
    expect(service.listProgrammeMasterOptions).toHaveBeenCalledTimes(1);
    expect(service.listProgrammeMasterOptions).toHaveBeenCalledWith(query);
  });
});
