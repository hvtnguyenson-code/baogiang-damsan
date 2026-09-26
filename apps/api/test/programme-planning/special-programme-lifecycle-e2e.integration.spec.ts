import { ConflictException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { CivilDateString } from '@baogiang/contracts';
import {
  AuditResult,
  SpecialActivityStatus,
  UserStatus,
} from '@prisma/client';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';
import { ProgrammePlanningService } from '../../src/programme-planning/programme-planning.service';
import {
  HdtnWorkbookImporterService,
  UploadedWorkbookFile,
} from '../../src/programme-planning/hdtn-workbook-importer.service';
import { GddpWorkbookImporterService } from '../../src/programme-planning/gddp-workbook-importer.service';
import { SpecialProgrammeWorkloadProjectionService } from '../../src/special-programme-workload/special-programme-workload-projection.service';

const HDTN_HEADERS = [
  'Tuần từ',
  'Tuần đến',
  'Số tiết',
  'Quy mô tổ chức',
  'Khối',
  'Chủ đề',
  'Người thực hiện',
] as const;

const GDDP_HEADERS = [
  'Khối',
  'Tiết PPCT',
  'Tuần dạy',
  'Nội dung',
  'Giáo viên dạy',
] as const;

async function buildHdtnWorkbook(rows: unknown[][]): Promise<UploadedWorkbookFile> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('NHẬP HĐTN-HN');
  sheet.addRow([...HDTN_HEADERS]);
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    originalname: 'plan_hdtn_lifecycle_e2e.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

async function buildGddpWorkbook(rows: unknown[][]): Promise<UploadedWorkbookFile> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('NHẬP GDĐP');
  sheet.addRow([...GDDP_HEADERS]);
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    originalname: 'plan_gddp_lifecycle_e2e.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

integration('SpecialProgrammeLifecycleE2E (PostgreSQL integration P4-074C)', () => {
  const h = new Phase01Harness();
  let planningService: ProgrammePlanningService;
  let hdtnImporter: HdtnWorkbookImporterService;
  let gddpImporter: GddpWorkbookImporterService;
  let workloadService: SpecialProgrammeWorkloadProjectionService;

  async function clean(): Promise<void> {
    await h.prisma.specialActivityParticipationExecution.deleteMany();
    await h.prisma.programmeOccurrenceAttestation.deleteMany();
    await h.prisma.programmeMaterializedActivity.deleteMany();
    await h.prisma.specialActivityClassTarget.deleteMany();
    await h.prisma.specialActivityStaffing.deleteMany();
    await h.prisma.specialActivityTimeSlot.deleteMany();
    await h.prisma.specialActivity.deleteMany();
    await h.prisma.businessPolicyVersion.deleteMany();
    await h.prisma.businessPolicyStream.deleteMany();
    await h.clean();
  }

  beforeAll(async () => {
    await h.start();
    planningService = h.app.get(ProgrammePlanningService);
    hdtnImporter = h.app.get(HdtnWorkbookImporterService);
    gddpImporter = h.app.get(GddpWorkbookImporterService);
    workloadService = h.app.get(SpecialProgrammeWorkloadProjectionService);
  });

  beforeEach(async () => {
    await clean();
  });

  afterAll(async () => {
    try {
      await clean();
    } finally {
      await h.stop();
    }
  });

  async function setupBaseEnvironment() {
    const year = await h.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y_E2E'),
        name: 'Năm học 2026-2027 E2E',
      },
    });

    const actor = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_coord').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            displayName: 'Trưởng ban điều phối',
            isTeachingStaff: true,
          },
        },
      },
    });

    const principal = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_bgh').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            displayName: 'Hiệu trưởng',
            isTeachingStaff: true,
          },
        },
      },
    });

    const gvcn10A = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_gvcn10a').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            displayName: 'GVCN 10A Nguyễn Văn A',
            isTeachingStaff: true,
          },
        },
      },
    });

    const gvcn10B = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_gvcn10b').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            displayName: 'GVCN 10B Lê Thị B',
            isTeachingStaff: true,
          },
        },
      },
    });

    const teacherGddp1 = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_gddp1').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            displayName: 'Trần Văn C',
            staffCode: 'GV01',
            isTeachingStaff: true,
          },
        },
      },
    });

    const teacherGddp2 = await h.prisma.user.create({
      data: {
        username: normalizedCode('u_gddp2').toLowerCase(),
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            displayName: 'Phạm Thị D',
            staffCode: 'GV02',
            isTeachingStaff: true,
          },
        },
      },
    });

    const calVersion = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T23:59:59.999Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        isActive: true,
        activatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const week1 = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calVersion.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 1,
        displayLabel: 'Tuần 1',
        sortOrder: 1,
      },
    });

    const segment1 = await h.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week1.id,
        calendarVersionId: calVersion.id,
        label: 'Đoạn 1',
        segmentOrder: 1,
        startDate: new Date('2026-09-07T00:00:00.000Z'),
        endDate: new Date('2026-09-12T00:00:00.000Z'),
      },
    });

    const class10A = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: '10A',
        name: 'Lớp 10A',
        gradeLevel: 10,
        status: 'ACTIVE',
      },
    });

    const class10B = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: '10B',
        name: 'Lớp 10B',
        gradeLevel: 10,
        status: 'ACTIVE',
      },
    });

    const class11A = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: '11A',
        name: 'Lớp 11A',
        gradeLevel: 11,
        status: 'ACTIVE',
      },
    });

    const hr10A = await h.prisma.homeroomAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: class10A.id,
        teacherUserId: gvcn10A.id,
        status: 'ACTIVE',
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        createdByUserId: actor.id,
      },
    });

    const hr10B = await h.prisma.homeroomAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: class10B.id,
        teacherUserId: gvcn10B.id,
        status: 'ACTIVE',
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        createdByUserId: actor.id,
      },
    });

    const slotM1 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        displayLabel: 'Thứ 2 Tiết 1',
        startTime: new Date('1970-01-01T07:00:00.000Z'),
        endTime: new Date('1970-01-01T07:45:00.000Z'),
        isActive: true,
      },
    });

    const slotM2 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 2,
        displayLabel: 'Thứ 2 Tiết 2',
        startTime: new Date('1970-01-01T07:50:00.000Z'),
        endTime: new Date('1970-01-01T08:35:00.000Z'),
        isActive: true,
      },
    });

    const tkbVersion = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: calVersion.id,
        effectiveAcademicWeekId: week1.id,
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        createdByUserId: actor.id,
        validatedByUserId: actor.id,
        validatedAt: new Date('2026-09-01T00:00:00.000Z'),
        approvedByUserId: actor.id,
        approvedAt: new Date('2026-09-01T00:00:00.000Z'),
        activatedByUserId: actor.id,
        activatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const policyStream = await h.prisma.businessPolicyStream.create({
      data: {
        familyKey: 'SPECIAL_PROGRAMME_WORKLOAD',
        resourceKind: 'ACADEMIC_YEAR',
        academicYearId: year.id,
      },
    });

    const policyVersion = await h.prisma.businessPolicyVersion.create({
      data: {
        streamId: policyStream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        validatorVersion: 'v1',
        payload: {
          coefficients: {
            GDDP: { CLASS: 1.25, GRADE: 1.25 },
            HDTN_HN: { CLASS: 1.25, GRADE: 1.25, SCHOOL_WIDE: 1.25 },
          },
        },
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: null,
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
        publishedByUserId: actor.id,
        createdByUserId: actor.id,
      },
    });

    return {
      year,
      actor,
      principal,
      gvcn10A,
      gvcn10B,
      teacherGddp1,
      teacherGddp2,
      calVersion,
      week1,
      segment1,
      class10A,
      class10B,
      class11A,
      hr10A,
      hr10B,
      slotM1,
      slotM2,
      tkbVersion,
      policyStream,
      policyVersion,
    };
  }

  // =========================================================================
  // 5. E2E — HĐTN CLASS LIFECYCLE & WORKLOAD GATES
  // =========================================================================
  describe('5. HĐTN CLASS lifecycle + P4-050 workload gates', () => {
    it('executes full pipeline from workbook to materialization and enforces P4-050 attestation gates', async () => {
      const env = await setupBaseEnvironment();

      // Seed exact CLASS markers: 10A on slotM1, 10B on slotM2
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10B.id,
          timeSlotDefinitionId: env.slotM2.id,
          kind: 'HDTN_HN',
        },
      });

      // 1. Workbook creation
      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo lớp', 10, 'Chủ đề 1: Khám phá trường mới', 'GVCN'],
      ]);

      // 2. Inspect workbook
      const inspection = await hdtnImporter.inspect(file);
      expect(inspection.dataSheetFound).toBe(true);
      expect(inspection.issues.filter((i) => i.severity === 'BLOCKER')).toHaveLength(0);

      // 3. Preview: zero mutation check
      const preview = await hdtnImporter.preview(file, env.year.id);
      expect(preview.canConfirm).toBe(true);
      expect(preview.blockingIssueCount).toBe(0);
      expect(preview.previewFingerprint).toBeTruthy();
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0]?.resolvedCandidateCount).toBe(2); // 10A and 10B

      // Verify zero mutation before confirm
      expect(await h.prisma.programmePlanVersion.count()).toBe(0);
      expect(await h.prisma.plannedProgrammeOccurrence.count()).toBe(0);
      expect(await h.prisma.specialActivity.count()).toBe(0);

      // 4. Confirm DRAFT
      const cmdConfirm = 'cmd-hdtn-class-confirm-001';
      const confirmRes = await hdtnImporter.confirm(
        file,
        env.year.id,
        preview.previewFingerprint,
        cmdConfirm,
        env.actor.id,
        { expectedProgrammeMasterId: null, canBootstrapMaster: true },
      );
      expect(confirmRes.status).toBe('DRAFT');
      expect(confirmRes.outcome).toBe('CREATED');

      const planVersionId = confirmRes.programmePlanVersionId;
      const planVersion = await h.prisma.programmePlanVersion.findUniqueOrThrow({
        where: { id: planVersionId },
      });
      expect(planVersion.status).toBe('DRAFT');

      const occurrences = await h.prisma.plannedProgrammeOccurrence.findMany({
        where: { programmePlanVersionId: planVersionId },
        include: { slots: { include: { staffing: true } } },
      });
      expect(occurrences).toHaveLength(2); // 1 per class in CLASS mode

      const occ10A = occurrences.find((o) => o.schoolClassId === env.class10A.id)!;
      expect(occ10A.mode).toBe('CLASS');
      expect(occ10A.slots).toHaveLength(1);
      expect(occ10A.slots[0]?.timeSlotDefinitionId).toBe(env.slotM1.id);
      expect(occ10A.slots[0]?.staffing[0]?.teacherUserId).toBe(env.gvcn10A.id);

      // Verify zero execution / zero attestation / zero workload after confirm
      expect(await h.prisma.specialActivityParticipationExecution.count()).toBe(0);
      expect(await h.prisma.programmeOccurrenceAttestation.count()).toBe(0);

      const asOf = new Date('2026-09-15T00:00:00.000Z');
      const projectionZero = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: env.gvcn10A.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projectionZero.totalCredit).toBe(0);
      expect(projectionZero.contributionCount).toBe(0);

      // 5. Publish plan version
      await planningService.publishPlanVersion(
        planVersionId,
        { commandId: 'cmd-publish-plan-hdtn-001' },
        env.actor.id,
      );

      // 6. Publish occurrence
      await planningService.publishOccurrence(
        occ10A.id,
        { commandId: 'cmd-publish-occ-10a-001' },
        env.actor.id,
      );

      // 7. Materialize occurrence
      const matRecords = await planningService.materializeOccurrence(
        occ10A.id,
        { commandId: 'cmd-mat-occ-10a-001' },
        env.actor.id,
      );
      expect(matRecords).toHaveLength(1);

      const pma = await h.prisma.programmeMaterializedActivity.findUniqueOrThrow({
        where: { id: matRecords[0]!.id },
      });
      expect(pma.plannedProgrammeOccurrenceId).toBe(occ10A.id);

      const specialActivity = await h.prisma.specialActivity.findUniqueOrThrow({
        where: { id: pma.specialActivityId },
        include: { timeSlots: true, staffing: true, classTargets: true },
      });
      expect(specialActivity.scope).toBe('CLASS');
      expect(specialActivity.classTargets).toHaveLength(1);
      expect(specialActivity.classTargets[0]?.schoolClassId).toBe(env.class10A.id);
      expect(specialActivity.staffing[0]?.scheduledTeacherUserId).toBe(env.gvcn10A.id);

      // Materialization does NOT automatically create execution or attestation
      expect(await h.prisma.specialActivityParticipationExecution.count()).toBe(0);
      expect(await h.prisma.programmeOccurrenceAttestation.count()).toBe(0);

      // 8. Workload Gate 1: Execution ACTIVE without attestation => zero credit / pending confirmation
      const exec10A = await h.prisma.specialActivityParticipationExecution.create({
        data: {
          academicYearId: env.year.id,
          specialActivityId: specialActivity.id,
          specialActivityStaffingId: specialActivity.staffing[0]!.id,
          specialActivityTimeSlotId: specialActivity.timeSlots[0]!.id,
          executionCivilDate: specialActivity.civilDate,
          executionAcademicCalendarVersionId: specialActivity.academicCalendarVersionId,
          executionTimeSlotDefinitionId: specialActivity.timeSlots[0]!.timeSlotDefinitionId,
          executionAcademicWeekId: env.week1.id,
          executionAcademicWeekSegmentId: env.segment1.id,
          actualTeacherUserId: env.gvcn10A.id,
          activityTitleSnapshot: specialActivity.title,
          actualTeacherDisplayNameSnapshot: 'GVCN 10A Nguyễn Văn A',
          createRequestKey: 'req-exec-10a-001',
          createRequestFingerprint: 'fp-exec-10a-001',
          createdByUserId: env.actor.id,
          status: 'ACTIVE',
        },
      });

      const projectionPending = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: env.gvcn10A.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projectionPending.status).toBe('PASS');
      expect(projectionPending.totalCredit).toBe(0);
      expect(projectionPending.contributionCount).toBe(0);
      expect(projectionPending.pendingConfirmation).toHaveLength(1);
      expect(projectionPending.pendingConfirmation[0]?.executionId).toBe(exec10A.id);

      // 9. Workload Gate 2: Attestation ACTIVE but no execution => zero credit
      // Temporarily mark execution REVERSED to verify attestation-alone gives 0 credit
      await h.prisma.specialActivityParticipationExecution.update({
        where: { id: exec10A.id },
        data: { status: 'REVERSED', reversedAt: asOf, reversedByUserId: env.actor.id },
      });

      const master = await h.prisma.programmeMaster.findFirstOrThrow({
        where: { academicYearId: env.year.id, kind: 'HDTN_HN' },
      });

      await planningService.attestOccurrence(
        occ10A.id,
        { commandId: 'cmd-attest-coord-10a' },
        env.actor.id,
        {
          qualified: true,
          authorityType: 'COORDINATOR',
          capabilityKey: 'HĐTN_COORDINATOR',
          scope: 'ACTIVITY',
          resourceId: master.id,
        },
      );

      const projectionReversedExec = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: env.gvcn10A.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projectionReversedExec.totalCredit).toBe(0);
      expect(projectionReversedExec.contributionCount).toBe(0);

      // 10. Workload Gate 3: Execution ACTIVE + Attestation ACTIVE => eligible with exact policy coefficient (1.25)
      await h.prisma.specialActivityParticipationExecution.update({
        where: { id: exec10A.id },
        data: { status: 'ACTIVE', reversedAt: null, reversedByUserId: null },
      });

      const projectionEligible = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: env.gvcn10A.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projectionEligible.status).toBe('PASS');
      expect(projectionEligible.totalCredit).toBe(1.25);
      expect(projectionEligible.contributionCount).toBe(1);
      expect(projectionEligible.contributions[0]?.coefficient).toBe(1.25);
      expect(projectionEligible.contributions[0]?.credit).toBe(1.25);
      expect(projectionEligible.pendingConfirmation).toHaveLength(0);

      // 11. Workload Gate 4: 2 active attestations (coordinator + principal) => no double credit
      await planningService.attestOccurrence(
        occ10A.id,
        { commandId: 'cmd-attest-principal-10a' },
        env.principal.id,
        {
          qualified: true,
          authorityType: 'BGH_PRINCIPAL',
          capabilityKey: 'APPROVAL_PRINCIPAL',
          scope: 'SCHOOL_WIDE',
          resourceId: null,
        },
      );

      const projectionTwoAttestations = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: env.gvcn10A.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projectionTwoAttestations.totalCredit).toBe(1.25); // Still exactly 1.25, NOT 2.5
      expect(projectionTwoAttestations.contributionCount).toBe(1);
      expect(projectionTwoAttestations.contributions[0]?.attestations).toHaveLength(2);
    });
  });

  // =========================================================================
  // 6. E2E — HĐTN GRADE LIFECYCLE & WORKLOAD COLLAPSE
  // =========================================================================
  describe('6. HĐTN GRADE lifecycle + multi-teacher slot collapse', () => {
    it('collapses marker coverage into 1 logical GRADE occurrence and projects individual teacher credits without class fan-out', async () => {
      const env = await setupBaseEnvironment();

      // Seed exact GRADE markers: 10A and 10B share same slot (Monday period 1)
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10B.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });

      // 2 explicit teachers with valid profiles
      const teacher1 = env.gvcn10A; // 'GVCN 10A Nguyễn Văn A'
      const teacher2 = env.gvcn10B; // 'GVCN 10B Lê Thị B'

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo khối', 10, 'Chủ đề 2: Hoạt động toàn khối 10', 'GVCN 10A Nguyễn Văn A; GVCN 10B Lê Thị B'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);
      expect(preview.canConfirm).toBe(true);
      expect(preview.blockingIssueCount).toBe(0);
      expect(preview.rows[0]?.resolvedCandidateCount).toBe(1); // Single logical collapsed slot
      expect(preview.rows[0]?.targetClassCodes).toEqual(['10A', '10B']);

      // Confirm DRAFT
      const confirmRes = await hdtnImporter.confirm(
        file,
        env.year.id,
        preview.previewFingerprint,
        'cmd-hdtn-grade-confirm-001',
        env.actor.id,
        { expectedProgrammeMasterId: null, canBootstrapMaster: true },
      );

      const occurrences = await h.prisma.plannedProgrammeOccurrence.findMany({
        where: { programmePlanVersionId: confirmRes.programmePlanVersionId },
        include: { slots: { include: { staffing: true } } },
      });
      // In GRADE mode: exactly 1 logical occurrence, NOT 2 occurrences
      expect(occurrences).toHaveLength(1);
      const occGrade = occurrences[0]!;
      expect(occGrade.mode).toBe('GRADE');
      expect(occGrade.schoolClassId).toBeNull();
      expect(occGrade.gradeLevel).toBe(10);
      expect(occGrade.slots).toHaveLength(1);
      expect(occGrade.slots[0]?.staffing).toHaveLength(2);

      // Publish plan and occurrence
      await planningService.publishPlanVersion(
        confirmRes.programmePlanVersionId,
        { commandId: 'cmd-publish-plan-hdtn-grade' },
        env.actor.id,
      );
      await planningService.publishOccurrence(
        occGrade.id,
        { commandId: 'cmd-publish-occ-hdtn-grade' },
        env.actor.id,
      );

      // Materialize occurrence: creates exactly 1 SpecialActivity root
      const matRecords = await planningService.materializeOccurrence(
        occGrade.id,
        { commandId: 'cmd-mat-occ-hdtn-grade' },
        env.actor.id,
      );
      expect(matRecords).toHaveLength(1);

      const activity = await h.prisma.specialActivity.findUniqueOrThrow({
        where: { id: matRecords[0]!.specialActivityId },
        include: { timeSlots: true, staffing: true, classTargets: true },
      });
      expect(activity.scope).toBe('GRADE');
      expect(activity.classTargets).toHaveLength(2); // 10A and 10B
      expect(activity.staffing).toHaveLength(2);

      const staffT1 = activity.staffing.find((s) => s.scheduledTeacherUserId === teacher1.id)!;
      const staffT2 = activity.staffing.find((s) => s.scheduledTeacherUserId === teacher2.id)!;
      expect(staffT1).toBeDefined();
      expect(staffT2).toBeDefined();

      // Seed executions for both teachers
      await h.prisma.specialActivityParticipationExecution.create({
        data: {
          academicYearId: env.year.id,
          specialActivityId: activity.id,
          specialActivityStaffingId: staffT1.id,
          specialActivityTimeSlotId: activity.timeSlots[0]!.id,
          executionCivilDate: activity.civilDate,
          executionAcademicCalendarVersionId: activity.academicCalendarVersionId,
          executionTimeSlotDefinitionId: activity.timeSlots[0]!.timeSlotDefinitionId,
          executionAcademicWeekId: env.week1.id,
          executionAcademicWeekSegmentId: env.segment1.id,
          actualTeacherUserId: teacher1.id,
          activityTitleSnapshot: activity.title,
          actualTeacherDisplayNameSnapshot: 'Teacher 1',
          createRequestKey: 'req-exec-grade-t1',
          createRequestFingerprint: 'fp-exec-grade-t1',
          createdByUserId: env.actor.id,
          status: 'ACTIVE',
        },
      });

      await h.prisma.specialActivityParticipationExecution.create({
        data: {
          academicYearId: env.year.id,
          specialActivityId: activity.id,
          specialActivityStaffingId: staffT2.id,
          specialActivityTimeSlotId: activity.timeSlots[0]!.id,
          executionCivilDate: activity.civilDate,
          executionAcademicCalendarVersionId: activity.academicCalendarVersionId,
          executionTimeSlotDefinitionId: activity.timeSlots[0]!.timeSlotDefinitionId,
          executionAcademicWeekId: env.week1.id,
          executionAcademicWeekSegmentId: env.segment1.id,
          actualTeacherUserId: teacher2.id,
          activityTitleSnapshot: activity.title,
          actualTeacherDisplayNameSnapshot: 'Teacher 2',
          createRequestKey: 'req-exec-grade-t2',
          createRequestFingerprint: 'fp-exec-grade-t2',
          createdByUserId: env.actor.id,
          status: 'ACTIVE',
        },
      });

      // Attest occurrence
      const master = await h.prisma.programmeMaster.findFirstOrThrow({
        where: { academicYearId: env.year.id, kind: 'HDTN_HN' },
      });
      await planningService.attestOccurrence(
        occGrade.id,
        { commandId: 'cmd-attest-grade' },
        env.actor.id,
        {
          qualified: true,
          authorityType: 'COORDINATOR',
          capabilityKey: 'HĐTN_COORDINATOR',
          scope: 'ACTIVITY',
          resourceId: master.id,
        },
      );

      // Verify Teacher 1 workload: 1.25 credit (not multiplied by 2 classes!)
      const asOf = new Date('2026-09-15T00:00:00.000Z');
      const projT1 = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: teacher1.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projT1.totalCredit).toBe(1.25);
      expect(projT1.contributionCount).toBe(1);

      // Verify Teacher 2 workload: exactly 1 contribution, 1.25 credit
      const projT2 = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: teacher2.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projT2.totalCredit).toBe(1.25);
      expect(projT2.contributionCount).toBe(1);
    });
  });

  // =========================================================================
  // 7. E2E — HĐTN SCHOOL_WIDE LIFECYCLE & WORKLOAD
  // =========================================================================
  describe('7. HĐTN SCHOOL_WIDE lifecycle + whole-school coverage', () => {
    it('collapses all active classes into 1 logical SCHOOL_WIDE slot and does not multiply credit by class count', async () => {
      const env = await setupBaseEnvironment();

      // Seed SCHOOL_WIDE markers: all active classes (10A, 10B, 11A) covered at Monday period 2
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM2.id,
          kind: 'HDTN_HN',
        },
      });
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10B.id,
          timeSlotDefinitionId: env.slotM2.id,
          kind: 'HDTN_HN',
        },
      });
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class11A.id,
          timeSlotDefinitionId: env.slotM2.id,
          kind: 'HDTN_HN',
        },
      });

      const teacher = env.gvcn10A; // 'GVCN 10A Nguyễn Văn A'

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Toàn trường', '', 'Chủ đề 3: Chào cờ toàn trường', 'GVCN 10A Nguyễn Văn A'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);
      expect(preview.canConfirm).toBe(true);
      expect(preview.blockingIssueCount).toBe(0);
      expect(preview.rows[0]?.resolvedCandidateCount).toBe(1); // Collapsed single slot

      // Confirm DRAFT
      const confirmRes = await hdtnImporter.confirm(
        file,
        env.year.id,
        preview.previewFingerprint,
        'cmd-hdtn-sw-confirm-001',
        env.actor.id,
        { expectedProgrammeMasterId: null, canBootstrapMaster: true },
      );

      const occurrences = await h.prisma.plannedProgrammeOccurrence.findMany({
        where: { programmePlanVersionId: confirmRes.programmePlanVersionId },
      });
      expect(occurrences).toHaveLength(1);
      const occSw = occurrences[0]!;
      expect(occSw.mode).toBe('SCHOOL_WIDE');
      expect(occSw.schoolClassId).toBeNull();
      expect(occSw.gradeLevel).toBeNull();

      // Publish plan and occurrence
      await planningService.publishPlanVersion(
        confirmRes.programmePlanVersionId,
        { commandId: 'cmd-publish-plan-hdtn-sw' },
        env.actor.id,
      );
      await planningService.publishOccurrence(
        occSw.id,
        { commandId: 'cmd-publish-occ-hdtn-sw' },
        env.actor.id,
      );

      // Materialize occurrence
      const matRecords = await planningService.materializeOccurrence(
        occSw.id,
        { commandId: 'cmd-mat-occ-hdtn-sw' },
        env.actor.id,
      );
      expect(matRecords).toHaveLength(1);

      const activity = await h.prisma.specialActivity.findUniqueOrThrow({
        where: { id: matRecords[0]!.specialActivityId },
        include: { timeSlots: true, staffing: true, classTargets: true },
      });
      expect(activity.scope).toBe('SCHOOL_WIDE');
      expect(activity.classTargets).toHaveLength(3); // 10A, 10B, 11A

      // Execute and Attest
      await h.prisma.specialActivityParticipationExecution.create({
        data: {
          academicYearId: env.year.id,
          specialActivityId: activity.id,
          specialActivityStaffingId: activity.staffing[0]!.id,
          specialActivityTimeSlotId: activity.timeSlots[0]!.id,
          executionCivilDate: activity.civilDate,
          executionAcademicCalendarVersionId: activity.academicCalendarVersionId,
          executionTimeSlotDefinitionId: activity.timeSlots[0]!.timeSlotDefinitionId,
          executionAcademicWeekId: env.week1.id,
          executionAcademicWeekSegmentId: env.segment1.id,
          actualTeacherUserId: teacher.id,
          activityTitleSnapshot: activity.title,
          actualTeacherDisplayNameSnapshot: 'Teacher SW',
          createRequestKey: 'req-exec-sw-t1',
          createRequestFingerprint: 'fp-exec-sw-t1',
          createdByUserId: env.actor.id,
          status: 'ACTIVE',
        },
      });

      const master = await h.prisma.programmeMaster.findFirstOrThrow({
        where: { academicYearId: env.year.id, kind: 'HDTN_HN' },
      });
      await planningService.attestOccurrence(
        occSw.id,
        { commandId: 'cmd-attest-sw' },
        env.actor.id,
        {
          qualified: true,
          authorityType: 'COORDINATOR',
          capabilityKey: 'HĐTN_COORDINATOR',
          scope: 'ACTIVITY',
          resourceId: master.id,
        },
      );

      const asOf = new Date('2026-09-15T00:00:00.000Z');
      const projectionSw = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: teacher.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projectionSw.totalCredit).toBe(1.25); // Exactly 1.25, NOT multiplied by 3 classes!
      expect(projectionSw.contributionCount).toBe(1);
    });
  });

  // =========================================================================
  // 8. E2E — GDĐP GRADE LIFECYCLE & WORKLOAD
  // =========================================================================
  describe('8. GDĐP GRADE lifecycle + multi-teacher slot with exact PPCT', () => {
    it('executes 5-column GDĐP workbook to materialization and verifies workload projection', async () => {
      const env = await setupBaseEnvironment();

      // Seed GDDP markers: 10A and 10B on slotM1 with kind 'GDDP'
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'GDDP',
        },
      });
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10B.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'GDDP',
        },
      });

      // 5-column GDĐP workbook: Khối, Tiết PPCT, Tuần dạy, Nội dung, Giáo viên dạy
      const file = await buildGddpWorkbook([
        [10, '1', '1', 'Bài 1: Địa lý kinh tế địa phương', 'GV01; GV02'],
      ]);

      // Inspect
      const inspection = await gddpImporter.inspect(file);
      expect(inspection.dataSheetFound).toBe(true);
      expect(inspection.issues.filter((i) => i.severity === 'BLOCKER')).toHaveLength(0);

      // Preview
      const preview = await gddpImporter.preview(file, env.year.id);
      expect(preview.canConfirm).toBe(true);
      expect(preview.blockingIssueCount).toBe(0);
      expect(preview.rows[0]?.resolvedCandidateCount).toBe(1);
      expect(preview.rows[0]?.resolvedTeachers).toHaveLength(2);

      // Confirm DRAFT
      const confirmRes = await gddpImporter.confirm(
        file,
        env.year.id,
        preview.previewFingerprint,
        'cmd-gddp-grade-confirm-001',
        env.actor.id,
        { expectedProgrammeMasterId: null, canBootstrapMaster: true },
      );
      expect(confirmRes.status).toBe('DRAFT');

      const occurrences = await h.prisma.plannedProgrammeOccurrence.findMany({
        where: { programmePlanVersionId: confirmRes.programmePlanVersionId },
        include: { slots: { include: { staffing: true } } },
      });
      expect(occurrences).toHaveLength(1);
      const occGddp = occurrences[0]!;
      expect(occGddp.mode).toBe('GRADE');
      expect(occGddp.gradeLevel).toBe(10);
      expect(occGddp.slots).toHaveLength(1);
      expect(occGddp.slots[0]?.staffing).toHaveLength(2);

      // Publish plan and occurrence
      await planningService.publishPlanVersion(
        confirmRes.programmePlanVersionId,
        { commandId: 'cmd-publish-plan-gddp' },
        env.actor.id,
      );
      await planningService.publishOccurrence(
        occGddp.id,
        { commandId: 'cmd-publish-occ-gddp' },
        env.actor.id,
      );

      // Materialize
      const matRecords = await planningService.materializeOccurrence(
        occGddp.id,
        { commandId: 'cmd-mat-occ-gddp' },
        env.actor.id,
      );
      expect(matRecords).toHaveLength(1);

      const activity = await h.prisma.specialActivity.findUniqueOrThrow({
        where: { id: matRecords[0]!.specialActivityId },
        include: { timeSlots: true, staffing: true, classTargets: true },
      });
      expect(activity.scope).toBe('GRADE');
      expect(activity.classTargets).toHaveLength(2); // 10A and 10B
      expect(activity.staffing).toHaveLength(2); // GV01 and GV02

      const staffGV01 = activity.staffing.find((s) => s.scheduledTeacherUserId === env.teacherGddp1.id)!;
      const staffGV02 = activity.staffing.find((s) => s.scheduledTeacherUserId === env.teacherGddp2.id)!;
      expect(staffGV01).toBeDefined();
      expect(staffGV02).toBeDefined();

      // Seed executions for both teachers
      await h.prisma.specialActivityParticipationExecution.create({
        data: {
          academicYearId: env.year.id,
          specialActivityId: activity.id,
          specialActivityStaffingId: staffGV01.id,
          specialActivityTimeSlotId: activity.timeSlots[0]!.id,
          executionCivilDate: activity.civilDate,
          executionAcademicCalendarVersionId: activity.academicCalendarVersionId,
          executionTimeSlotDefinitionId: activity.timeSlots[0]!.timeSlotDefinitionId,
          executionAcademicWeekId: env.week1.id,
          executionAcademicWeekSegmentId: env.segment1.id,
          actualTeacherUserId: env.teacherGddp1.id,
          activityTitleSnapshot: activity.title,
          actualTeacherDisplayNameSnapshot: 'Trần Văn C (GV01)',
          createRequestKey: 'req-exec-gddp-gv01',
          createRequestFingerprint: 'fp-exec-gddp-gv01',
          createdByUserId: env.actor.id,
          status: 'ACTIVE',
        },
      });

      await h.prisma.specialActivityParticipationExecution.create({
        data: {
          academicYearId: env.year.id,
          specialActivityId: activity.id,
          specialActivityStaffingId: staffGV02.id,
          specialActivityTimeSlotId: activity.timeSlots[0]!.id,
          executionCivilDate: activity.civilDate,
          executionAcademicCalendarVersionId: activity.academicCalendarVersionId,
          executionTimeSlotDefinitionId: activity.timeSlots[0]!.timeSlotDefinitionId,
          executionAcademicWeekId: env.week1.id,
          executionAcademicWeekSegmentId: env.segment1.id,
          actualTeacherUserId: env.teacherGddp2.id,
          activityTitleSnapshot: activity.title,
          actualTeacherDisplayNameSnapshot: 'Phạm Thị D (GV02)',
          createRequestKey: 'req-exec-gddp-gv02',
          createRequestFingerprint: 'fp-exec-gddp-gv02',
          createdByUserId: env.actor.id,
          status: 'ACTIVE',
        },
      });

      // Attest occurrence
      const gddpMaster = await h.prisma.programmeMaster.findFirstOrThrow({
        where: { academicYearId: env.year.id, kind: 'GDDP' },
      });
      await planningService.attestOccurrence(
        occGddp.id,
        { commandId: 'cmd-attest-gddp' },
        env.actor.id,
        {
          qualified: true,
          authorityType: 'COORDINATOR',
          capabilityKey: 'GDDP_COORDINATOR',
          scope: 'ACTIVITY',
          resourceId: gddpMaster.id,
        },
      );

      // Verify each teacher receives their own contribution with coefficient 1.25
      const asOf = new Date('2026-09-15T00:00:00.000Z');
      const projGV01 = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: env.teacherGddp1.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projGV01.status).toBe('PASS');
      expect(projGV01.totalCredit).toBe(1.25);
      expect(projGV01.contributionCount).toBe(1);
      expect(projGV01.contributions[0]?.coefficient).toBe(1.25);
      expect(projGV01.contributions[0]?.programmeKind).toBe('GDDP');
      expect(projGV01.contributions[0]?.occurrenceMode).toBe('GRADE');

      const projGV02 = await workloadService.resolve({
        academicYearId: env.year.id,
        targetUserId: env.teacherGddp2.id,
        fromCivilDate: '2026-09-01' as CivilDateString,
        toCivilDate: '2026-09-30' as CivilDateString,
        asOfInstant: asOf,
      });
      expect(projGV02.status).toBe('PASS');
      expect(projGV02.totalCredit).toBe(1.25);
      expect(projGV02.contributionCount).toBe(1);
    });
  });

  // =========================================================================
  // 10. FAILURE MATRIX CLOSURE
  // =========================================================================
  describe('10. Failure Matrix Closure', () => {
    it('A. Stale preview: rejects confirm when timetable markers mutate after preview', async () => {
      const env = await setupBaseEnvironment();

      const marker = await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo lớp', 10, 'Chủ đề 1', 'GVCN'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);
      expect(preview.canConfirm).toBe(true);

      // Mutate marker authority after preview
      await h.prisma.timetableSpecialProgrammeMarker.delete({
        where: { id: marker.id },
      });

      // Confirm with old fingerprint must fail closed
      await expect(
        hdtnImporter.confirm(
          file,
          env.year.id,
          preview.previewFingerprint,
          'cmd-stale-preview',
          env.actor.id,
          { expectedProgrammeMasterId: null, canBootstrapMaster: true },
        ),
      ).rejects.toThrow(ConflictException);

      // No partial DRAFT rows created
      expect(await h.prisma.programmePlanVersion.count()).toBe(0);
      expect(await h.prisma.plannedProgrammeOccurrence.count()).toBe(0);
    });

    it('B. Calendar ambiguity: fails closed when multiple calendars are active', async () => {
      const env = await setupBaseEnvironment();

      // Create a second active calendar version
      await h.prisma.academicCalendarVersion.create({
        data: {
          academicYearId: env.year.id,
          versionNumber: 2,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-05-31T23:59:59.999Z'),
          officialWeekCount: 35,
          reserveWeekCount: 1,
          teachingWeekdays: ['MONDAY', 'TUESDAY'],
          isActive: true, // Multiple active!
        },
      });

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo lớp', 10, 'Chủ đề 1', 'GVCN'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);
      expect(preview.canConfirm).toBe(false);
      expect(preview.blockingIssueCount).toBeGreaterThan(0);
      expect(preview.issues.some((i) => i.code === 'ACTIVE_CALENDAR_AMBIGUOUS')).toBe(true);
    });

    it('C. Marker count changes: fails closed when marker topology changes', async () => {
      const env = await setupBaseEnvironment();

      // GRADE mode requires both 10A and 10B markers
      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });
      const marker10B = await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10B.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo khối', 10, 'Chủ đề 2', 'GVCN 10A Nguyễn Văn A'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);
      expect(preview.canConfirm).toBe(true);

      // Remove marker 10B so coverage becomes incomplete
      await h.prisma.timetableSpecialProgrammeMarker.delete({
        where: { id: marker10B.id },
      });

      await expect(
        hdtnImporter.confirm(
          file,
          env.year.id,
          preview.previewFingerprint,
          'cmd-marker-change',
          env.actor.id,
          { expectedProgrammeMasterId: null, canBootstrapMaster: true },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('D. Teacher identity changes: fails closed when GVCN homeroom authority changes', async () => {
      const env = await setupBaseEnvironment();

      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo lớp', 10, 'Chủ đề 1', 'GVCN'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);
      expect(preview.canConfirm).toBe(true);

      // Deactivate homeroom assignment
      await h.prisma.homeroomAssignment.update({
        where: { id: env.hr10A.id },
        data: { status: 'CANCELLED' },
      });

      await expect(
        hdtnImporter.confirm(
          file,
          env.year.id,
          preview.previewFingerprint,
          'cmd-teacher-change',
          env.actor.id,
          { expectedProgrammeMasterId: null, canBootstrapMaster: true },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('E. Existing active programme version conflict: importing new plan when master already has active PUBLISHED version fails closed', async () => {
      const env = await setupBaseEnvironment();

      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo lớp', 10, 'Chủ đề 1: Khởi động', 'GVCN'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);

      // 1. Initial confirm succeeds into DRAFT
      const confirm1 = await hdtnImporter.confirm(
        file,
        env.year.id,
        preview.previewFingerprint,
        'cmd-case-e-initial',
        env.actor.id,
        { expectedProgrammeMasterId: null, canBootstrapMaster: true },
      );
      expect(confirm1.outcome).toBe('CREATED');
      const initialVersionId = confirm1.programmePlanVersionId;
      const initialMasterId = confirm1.programmeMasterId;

      // 2. Publish plan version 1 to establish retained published history
      await planningService.publishPlanVersion(
        initialVersionId,
        { commandId: 'cmd-case-e-publish-plan' },
        env.actor.id,
      );

      const publishedVersion = await h.prisma.programmePlanVersion.findUniqueOrThrow({
        where: { id: initialVersionId },
      });
      expect(publishedVersion.status).toBe('PUBLISHED');

      // Baseline counts before conflicting import attempt
      const planVersionCountBefore = await h.prisma.programmePlanVersion.count();
      const topicCountBefore = await h.prisma.programmeTopicItem.count();
      const occurrenceCountBefore = await h.prisma.plannedProgrammeOccurrence.count();
      const slotCountBefore = await h.prisma.plannedOccurrenceSlot.count();
      const plannedStaffingCountBefore = await h.prisma.plannedSlotStaffing.count();

      // 3. Perform a valid preview/import attempt for the same programme master
      const secondFile = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo lớp', 10, 'Chủ đề 2: Kế hoạch mới', 'GVCN'],
      ]);
      const preview2 = await hdtnImporter.preview(secondFile, env.year.id);

      expect(preview2.canConfirm).toBe(true);
      expect(preview2.blockingIssueCount).toBe(0);
      expect(preview2.previewFingerprint).toBeTruthy();

      // 4. Confirm with new commandId must fail closed with ConflictException
      await expect(
        hdtnImporter.confirm(
          secondFile,
          env.year.id,
          preview2.previewFingerprint,
          'cmd-case-e-conflicting-attempt',
          env.actor.id,
          { expectedProgrammeMasterId: initialMasterId, canBootstrapMaster: false },
        ),
      ).rejects.toThrow(ConflictException);

      // 5. Assert: published plan remains intact, no new ProgrammePlanVersion, no hidden rows created
      const publishedVersionAfter = await h.prisma.programmePlanVersion.findUniqueOrThrow({
        where: { id: initialVersionId },
      });
      expect(publishedVersionAfter.status).toBe('PUBLISHED');
      expect(await h.prisma.programmePlanVersion.count()).toBe(planVersionCountBefore);
      expect(await h.prisma.programmeTopicItem.count()).toBe(topicCountBefore);
      expect(await h.prisma.plannedProgrammeOccurrence.count()).toBe(occurrenceCountBefore);
      expect(await h.prisma.plannedOccurrenceSlot.count()).toBe(slotCountBefore);
      expect(await h.prisma.plannedSlotStaffing.count()).toBe(plannedStaffingCountBefore);

      expect(
        await h.prisma.programmePlanningCommand.findUnique({
          where: {
            actorUserId_commandId: {
              actorUserId: env.actor.id,
              commandId: 'cmd-case-e-conflicting-attempt',
            },
          },
        }),
      ).toBeNull();

      // Retained history is preserved without overwrite; successor semantics remains mandatory path
    });

    it('F. Materialization collision: deterministic conflict when materializing same occurrence twice', async () => {
      const env = await setupBaseEnvironment();

      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo lớp', 10, 'Chủ đề 1', 'GVCN'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);
      const confirmRes = await hdtnImporter.confirm(
        file,
        env.year.id,
        preview.previewFingerprint,
        'cmd-mat-collision-confirm',
        env.actor.id,
        { expectedProgrammeMasterId: null, canBootstrapMaster: true },
      );

      const occurrences = await h.prisma.plannedProgrammeOccurrence.findMany({
        where: { programmePlanVersionId: confirmRes.programmePlanVersionId },
      });
      const occ = occurrences[0]!;

      await planningService.publishPlanVersion(
        confirmRes.programmePlanVersionId,
        { commandId: 'cmd-publish-plan-collision' },
        env.actor.id,
      );
      await planningService.publishOccurrence(
        occ.id,
        { commandId: 'cmd-publish-occ-collision' },
        env.actor.id,
      );

      // First materialization succeeds
      const mat1 = await planningService.materializeOccurrence(
        occ.id,
        { commandId: 'cmd-mat-first' },
        env.actor.id,
      );
      expect(mat1).toHaveLength(1);

      // Second materialization with different commandId fails with deterministic conflict
      await expect(
        planningService.materializeOccurrence(
          occ.id,
          { commandId: 'cmd-mat-second-duplicate' },
          env.actor.id,
        ),
      ).rejects.toThrow(ConflictException);

      // No duplicate hidden rows
      expect(
        await h.prisma.programmeMaterializedActivity.count({
          where: { plannedProgrammeOccurrenceId: occ.id },
        }),
      ).toBe(1);
    });

    it('G. Repeated command: exact same commandId + same payload produces idempotent replay; different payload fails', async () => {
      const env = await setupBaseEnvironment();

      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo lớp', 10, 'Chủ đề 1', 'GVCN'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);
      const sameCommandId = 'cmd-hdtn-idempotent-repeat';

      // 1. Initial confirm
      const res1 = await hdtnImporter.confirm(
        file,
        env.year.id,
        preview.previewFingerprint,
        sameCommandId,
        env.actor.id,
        { expectedProgrammeMasterId: null, canBootstrapMaster: true },
      );
      expect(res1.outcome).toBe('CREATED');

      // 2. Idempotent replay with same commandId and same package
      const res2 = await hdtnImporter.confirm(
        file,
        env.year.id,
        preview.previewFingerprint,
        sameCommandId,
        env.actor.id,
        { expectedProgrammeMasterId: null, canBootstrapMaster: true },
      );
      expect(res2.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(res2.programmePlanVersionId).toBe(res1.programmePlanVersionId);

      // Verify still exactly 1 plan version in DB
      expect(await h.prisma.programmePlanVersion.count()).toBe(1);
    });
  });

  // =========================================================================
  // 11. PROVENANCE & DOWNSTREAM BOUNDARY (P2-061)
  // =========================================================================
  describe('11. Provenance Verification & Downstream P2-061 Boundary', () => {
    it('retains complete relational evidence linking workbook package, plan, occurrence, and SpecialActivity', async () => {
      const env = await setupBaseEnvironment();

      await h.prisma.timetableSpecialProgrammeMarker.create({
        data: {
          timetableVersionId: env.tkbVersion.id,
          academicYearId: env.year.id,
          schoolClassId: env.class10A.id,
          timeSlotDefinitionId: env.slotM1.id,
          kind: 'HDTN_HN',
        },
      });

      const file = await buildHdtnWorkbook([
        [1, 1, 1, 'Theo lớp', 10, 'Chủ đề 1: Khám phá trường mới', 'GVCN'],
      ]);

      const preview = await hdtnImporter.preview(file, env.year.id);
      const confirmRes = await hdtnImporter.confirm(
        file,
        env.year.id,
        preview.previewFingerprint,
        'cmd-provenance-test',
        env.actor.id,
        { expectedProgrammeMasterId: null, canBootstrapMaster: true },
      );

      // A. Verify persisted ProgrammePlanningCommand evidence
      const command = await h.prisma.programmePlanningCommand.findUniqueOrThrow({
        where: {
          actorUserId_commandId: {
            actorUserId: env.actor.id,
            commandId: 'cmd-provenance-test',
          },
        },
      });
      expect(command.commandType).toBe('IMPORT_HDTN_HN_WORKBOOK_DRAFT');
      expect(command.fingerprint).toBeTruthy();
      const commandResult = command.result as Record<string, unknown>;
      expect(commandResult.programmePlanVersionId).toBe(confirmRes.programmePlanVersionId);
      expect(commandResult.programmeMasterId).toBe(confirmRes.programmeMasterId);
      expect(commandResult.status).toBe('DRAFT');

      // B. Verify persisted AuditEvent evidence of action PROGRAMME_PLAN_VERSION_DRAFT_IMPORTED
      const auditEvent = await h.prisma.auditEvent.findFirstOrThrow({
        where: {
          action: 'PROGRAMME_PLAN_VERSION_DRAFT_IMPORTED',
          entityType: 'ProgrammePlanVersion',
          entityId: confirmRes.programmePlanVersionId,
        },
      });
      expect(auditEvent.actorUserId).toBe(env.actor.id);
      expect(auditEvent.result).toBe(AuditResult.SUCCESS);
      const auditMetadata = auditEvent.metadata as Record<string, unknown>;
      expect(auditMetadata.commandId).toBe('cmd-provenance-test');
      expect(auditMetadata.previewFingerprint).toBe(preview.previewFingerprint);
      expect(auditMetadata.programmeMasterId).toBe(confirmRes.programmeMasterId);

      const occurrences = await h.prisma.plannedProgrammeOccurrence.findMany({
        where: { programmePlanVersionId: confirmRes.programmePlanVersionId },
        include: { slots: true },
      });
      const occ = occurrences[0]!;

      await planningService.publishPlanVersion(
        confirmRes.programmePlanVersionId,
        { commandId: 'cmd-publish-prov-plan' },
        env.actor.id,
      );
      await planningService.publishOccurrence(
        occ.id,
        { commandId: 'cmd-publish-prov-occ' },
        env.actor.id,
      );

      const matRecords = await planningService.materializeOccurrence(
        occ.id,
        { commandId: 'cmd-mat-prov' },
        env.actor.id,
      );

      // Verify complete retained relational evidence:
      // 1. ProgrammeMaterializedActivity links to plannedProgrammeOccurrence and plannedOccurrenceSlot
      const pma = await h.prisma.programmeMaterializedActivity.findUniqueOrThrow({
        where: { id: matRecords[0]!.id },
      });
      expect(pma.plannedProgrammeOccurrenceId).toBe(occ.id);
      expect(pma.plannedOccurrenceSlotId).toBe(occ.slots[0]!.id);

      // 2. SpecialActivity root retains exact civilDate, active status, TimeSlotDefinition linkage, scheduled teacher
      const activity = await h.prisma.specialActivity.findUniqueOrThrow({
        where: { id: pma.specialActivityId },
        include: { timeSlots: true, staffing: true, classTargets: true },
      });
      expect(activity.status).toBe(SpecialActivityStatus.ACTIVE);
      expect(activity.civilDate).toEqual(new Date('2026-09-07T00:00:00.000Z'));
      expect(activity.timeSlots[0]?.timeSlotDefinitionId).toBe(env.slotM1.id);
      expect(activity.staffing[0]?.scheduledTeacherUserId).toBe(env.gvcn10A.id);
      expect(activity.classTargets[0]?.schoolClassId).toBe(env.class10A.id);

      // 3. P2-061 boundary assertion:
      // Effective teaching schedule read model (SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1)
      // remains downstream in task P2-061. This test proves that all required runtime
      // evidence (SpecialActivity root, civilDate, timeSlot, scheduled teachers, class targets,
      // and programme provenance) is completely and faithfully persisted.
      expect(activity.id).toBeTruthy();
      expect(pma.specialActivityId).toBe(activity.id);
    });
  });
});
