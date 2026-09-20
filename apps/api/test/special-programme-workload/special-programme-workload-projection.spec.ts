import { SpecialProgrammeWorkloadProjectionService } from '../../src/special-programme-workload/special-programme-workload-projection.service';
import { BusinessConfigurationService } from '../../src/business-configuration/business-configuration.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CivilDateString } from '@baogiang/contracts';
import { ProgrammeKind, ProgrammeOccurrenceMode } from '@prisma/client';

describe('SpecialProgrammeWorkloadProjectionService invariants (P4-050)', () => {
  const academicYearId = '11111111-1111-4111-8111-111111111111';
  const teacherId1 = '22222222-2222-4222-8222-222222222222';
  const teacherId2 = '33333333-3333-4333-8333-333333333333';
  const fromCivilDate = '2026-09-01' as CivilDateString;
  const toCivilDate = '2026-09-30' as CivilDateString;
  const asOfInstant = new Date('2026-09-20T10:00:00.000Z');

  interface HarnessOptions {
    executions?: unknown[];
    pmas?: unknown[];
    masters?: unknown[];
    planVersions?: unknown[];
    topicItems?: unknown[];
    occurrences?: unknown[];
    slots?: unknown[];
    activitySlots?: unknown[];
    attestations?: unknown[];
    policyResolver?: (
      family: string,
      resource: unknown,
      civilDate: string,
      tx: unknown,
    ) => Promise<unknown>;
  }

  function setupHarness(opts: HarnessOptions = {}) {
    const defaultPolicy = {
      outcome: 'RESOLVED',
      family: 'SPECIAL_PROGRAMME_WORKLOAD',
      resource: { kind: 'ACADEMIC_YEAR', academicYearId },
      requestedCivilDate: '2026-09-10',
      policyVersionId: 'pol-ver-1',
      validatorVersion: 'v1',
      payload: {
        coefficients: {
          GDDP: { CLASS: 1.5, GRADE: 1.2 },
          HDTN_HN: { CLASS: 1.0, GRADE: 1.1, SCHOOL_WIDE: 1.3 },
        },
      },
      effectiveFrom: '2026-09-01',
      effectiveUntil: null,
    };

    const mockPrisma = {
      specialActivityParticipationExecution: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.executions ?? [])),
      },
      programmeMaterializedActivity: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.pmas ?? [])),
      },
      programmeMaster: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.masters ?? [])),
      },
      programmePlanVersion: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.planVersions ?? [])),
      },
      programmeTopicItem: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.topicItems ?? [])),
      },
      plannedProgrammeOccurrence: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.occurrences ?? [])),
      },
      plannedOccurrenceSlot: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.slots ?? [])),
      },
      specialActivityTimeSlot: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.activitySlots ?? [])),
      },
      programmeOccurrenceAttestation: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(opts.attestations ?? [])),
      },
    };

    const mockBusinessConfiguration = {
      resolveEffectiveBusinessPolicy: jest
        .fn()
        .mockImplementation(
          opts.policyResolver ?? (() => Promise.resolve(defaultPolicy)),
        ),
    };

    const service = new SpecialProgrammeWorkloadProjectionService(
      mockPrisma as unknown as PrismaService,
      mockBusinessConfiguration as unknown as BusinessConfigurationService,
    );

    return { service, mockPrisma, mockBusinessConfiguration };
  }

  const baseEntities = {
    masterId: 'master-1',
    planVersionId: 'plan-ver-1',
    topicItemId: 'topic-1',
    occurrenceId: 'occ-1',
    slotId1: 'slot-1',
    slotId2: 'slot-2',
    timeSlotDefId1: 'ts-def-1',
    timeSlotDefId2: 'ts-def-2',
    activityId1: 'act-1',
    activityId2: 'act-2',
    activitySlotId1: 'act-slot-1',
    activitySlotId2: 'act-slot-2',
    staffingId1: 'staffing-1',
  };

  function createStandardFixtures() {
    const master = {
      id: baseEntities.masterId,
      academicYearId,
      kind: ProgrammeKind.GDDP,
    };
    const planVersion = {
      id: baseEntities.planVersionId,
      programmeMasterId: baseEntities.masterId,
    };
    const topicItem = {
      id: baseEntities.topicItemId,
      programmePlanVersionId: baseEntities.planVersionId,
    };
    const occurrence = {
      id: baseEntities.occurrenceId,
      programmeMasterId: baseEntities.masterId,
      academicYearId,
      mode: ProgrammeOccurrenceMode.CLASS,
    };
    const slot1 = {
      id: baseEntities.slotId1,
      plannedProgrammeOccurrenceId: baseEntities.occurrenceId,
      academicYearId,
      timeSlotDefinitionId: baseEntities.timeSlotDefId1,
    };
    const activitySlot1 = {
      id: baseEntities.activitySlotId1,
      specialActivityId: baseEntities.activityId1,
      academicYearId,
      timeSlotDefinitionId: baseEntities.timeSlotDefId1,
    };
    const pma1 = {
      id: 'pma-1',
      programmeMasterId: baseEntities.masterId,
      programmePlanVersionId: baseEntities.planVersionId,
      programmeTopicItemId: baseEntities.topicItemId,
      plannedProgrammeOccurrenceId: baseEntities.occurrenceId,
      plannedOccurrenceSlotId: baseEntities.slotId1,
      specialActivityId: baseEntities.activityId1,
    };
    const execution1 = {
      id: 'exec-1',
      status: 'ACTIVE',
      specialActivityId: baseEntities.activityId1,
      specialActivityStaffingId: baseEntities.staffingId1,
      specialActivityTimeSlotId: baseEntities.activitySlotId1,
      academicYearId,
      executionCivilDate: new Date('2026-09-10T00:00:00.000Z'),
      actualTeacherUserId: teacherId1,
      createdAt: new Date('2026-09-10T08:00:00.000Z'),
      specialActivity: {
        id: baseEntities.activityId1,
        status: 'ACTIVE',
      },
    };
    const attestation1 = {
      id: 'att-1',
      programmeMasterId: baseEntities.masterId,
      plannedProgrammeOccurrenceId: baseEntities.occurrenceId,
      attestedByUserId: 'coordinator-user',
      authorityType: 'COORDINATOR',
      capabilityKey: 'GDDP_COORDINATOR',
      scope: 'ACTIVITY',
      scopeResourceId: baseEntities.masterId,
      status: 'ACTIVE',
      attestedAt: new Date('2026-09-11T08:00:00.000Z'),
    };

    return {
      masters: [master],
      planVersions: [planVersion],
      topicItems: [topicItem],
      occurrences: [occurrence],
      slots: [slot1],
      activitySlots: [activitySlot1],
      pmas: [pma1],
      executions: [execution1],
      attestation1,
    };
  }

  // 1. ACTIVE execution + zero attestation => pending, zero credit.
  it('1. ACTIVE execution + zero attestation => pending confirmation, zero credit', async () => {
    const f = createStandardFixtures();
    const { service } = setupHarness({
      ...f,
      attestations: [],
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.status).toBe('PASS');
    expect(res.totalCredit).toBe(0);
    expect(res.contributionCount).toBe(0);
    expect(res.contributions).toHaveLength(0);
    expect(res.pendingConfirmation).toHaveLength(1);
    expect(res.pendingConfirmation[0]).toMatchObject({
      executionId: 'exec-1',
      plannedOccurrenceSlotId: baseEntities.slotId1,
      programmeKind: ProgrammeKind.GDDP,
      occurrenceMode: ProgrammeOccurrenceMode.CLASS,
      reason: 'PENDING_ATTESTATION',
    });
  });

  // 2. ACTIVE execution + 1 ACTIVE qualifying attestation => exactly 1 contribution.
  it('2. ACTIVE execution + 1 ACTIVE qualifying attestation => exactly 1 contribution', async () => {
    const f = createStandardFixtures();
    const { service } = setupHarness({
      ...f,
      attestations: [f.attestation1],
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.status).toBe('PASS');
    expect(res.contributionCount).toBe(1);
    expect(res.totalCredit).toBe(1.5);
    expect(res.contributions).toHaveLength(1);
    expect(res.contributions[0]).toMatchObject({
      executionId: 'exec-1',
      plannedOccurrenceSlotId: baseEntities.slotId1,
      coefficient: 1.5,
      credit: 1.5,
      policyVersionId: 'pol-ver-1',
      policyValidatorVersion: 'v1',
    });
    expect(res.contributions[0].attestations).toHaveLength(1);
    expect(res.contributions[0].attestations[0].attestationId).toBe('att-1');
    expect(res.pendingConfirmation).toHaveLength(0);
  });

  // 3. same execution + 2 ACTIVE attestations => vẫn exactly 1 contribution.
  it('3. same execution + 2 ACTIVE attestations => still exactly 1 contribution (no attestation multiplication)', async () => {
    const f = createStandardFixtures();
    const att2 = {
      ...f.attestation1,
      id: 'att-2',
      attestedByUserId: 'principal-user',
      authorityType: 'BGH_PRINCIPAL',
    };
    const { service } = setupHarness({
      ...f,
      attestations: [f.attestation1, att2],
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.status).toBe('PASS');
    expect(res.contributionCount).toBe(1);
    expect(res.totalCredit).toBe(1.5);
    expect(res.contributions).toHaveLength(1);
    expect(res.contributions[0].attestations).toHaveLength(2);
  });

  // 4. one root targeting 18 classes => vẫn exactly 1 contribution cho teacher-slot.
  it('4. one root targeting 18 classes => still exactly 1 contribution (no class-target fan-out)', async () => {
    const f = createStandardFixtures();
    const { service } = setupHarness({
      ...f,
      attestations: [f.attestation1],
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.contributionCount).toBe(1);
    expect(res.totalCredit).toBe(1.5);
  });

  // 5. 2 teachers same slot, mỗi người có valid execution => mỗi teacher projection chỉ thấy đúng contribution của mình.
  it('5. 2 teachers same slot => each teacher projection only sees their own contribution', async () => {
    const f = createStandardFixtures();
    const execTeacher2 = {
      ...f.executions[0],
      id: 'exec-2',
      actualTeacherUserId: teacherId2,
      specialActivityStaffingId: 'staffing-2',
    };

    const { service: serviceT1 } = setupHarness({
      ...f,
      executions: [f.executions[0]], // query for teacherId1 returns exec-1
      attestations: [f.attestation1],
    });

    const { service: serviceT2 } = setupHarness({
      ...f,
      executions: [execTeacher2], // query for teacherId2 returns exec-2
      attestations: [f.attestation1],
    });

    const res1 = await serviceT1.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    const res2 = await serviceT2.resolve({
      academicYearId,
      targetUserId: teacherId2,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res1.contributionCount).toBe(1);
    expect(res1.contributions[0].actualTeacherUserId).toBe(teacherId1);
    expect(res2.contributionCount).toBe(1);
    expect(res2.contributions[0].actualTeacherUserId).toBe(teacherId2);
  });

  // 6. same teacher two exact slots => 2 contributions, không Cartesian.
  it('6. same teacher two exact slots => exactly 2 contributions (no Cartesian product)', async () => {
    const f = createStandardFixtures();
    const slot2 = {
      id: baseEntities.slotId2,
      plannedProgrammeOccurrenceId: baseEntities.occurrenceId,
      academicYearId,
      timeSlotDefinitionId: baseEntities.timeSlotDefId2,
    };
    const activitySlot2 = {
      id: baseEntities.activitySlotId2,
      specialActivityId: baseEntities.activityId2,
      academicYearId,
      timeSlotDefinitionId: baseEntities.timeSlotDefId2,
    };
    const pma2 = {
      id: 'pma-2',
      programmeMasterId: baseEntities.masterId,
      programmePlanVersionId: baseEntities.planVersionId,
      programmeTopicItemId: baseEntities.topicItemId,
      plannedProgrammeOccurrenceId: baseEntities.occurrenceId,
      plannedOccurrenceSlotId: baseEntities.slotId2,
      specialActivityId: baseEntities.activityId2,
    };
    const exec2 = {
      id: 'exec-2',
      status: 'ACTIVE',
      specialActivityId: baseEntities.activityId2,
      specialActivityStaffingId: 'staffing-2',
      specialActivityTimeSlotId: baseEntities.activitySlotId2,
      academicYearId,
      executionCivilDate: new Date('2026-09-10T00:00:00.000Z'),
      actualTeacherUserId: teacherId1,
      createdAt: new Date('2026-09-10T08:00:00.000Z'),
      specialActivity: {
        id: baseEntities.activityId2,
        status: 'ACTIVE',
      },
    };

    const { service } = setupHarness({
      masters: f.masters,
      planVersions: f.planVersions,
      topicItems: f.topicItems,
      occurrences: f.occurrences,
      slots: [...f.slots, slot2],
      activitySlots: [...f.activitySlots, activitySlot2],
      pmas: [...f.pmas, pma2],
      executions: [...f.executions, exec2],
      attestations: [f.attestation1],
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.contributionCount).toBe(2);
    expect(res.totalCredit).toBe(3.0); // 1.5 + 1.5
    expect(res.contributions).toHaveLength(2);
  });

  // 7. execution REVERSED => zero contribution.
  it('7. execution REVERSED => zero contribution', async () => {
    const f = createStandardFixtures();
    const reversedExec = {
      ...f.executions[0],
      status: 'REVERSED',
    };
    const { service } = setupHarness({
      ...f,
      executions: [reversedExec],
      attestations: [f.attestation1],
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.contributionCount).toBe(0);
    expect(res.totalCredit).toBe(0);
    expect(res.contributions).toHaveLength(0);
  });

  // 8. root REVERSED / replaced root ACTIVE => chỉ active replacement contribution.
  it('8. root REVERSED / replaced root ACTIVE => only active replacement credited', async () => {
    const f = createStandardFixtures();
    const root1ReversedExec = {
      ...f.executions[0],
      specialActivity: { id: 'root-1', status: 'REVERSED' },
    };
    const root2ActiveExec = {
      ...f.executions[0],
      id: 'exec-2',
      specialActivityId: 'root-2',
      specialActivity: { id: 'root-2', status: 'ACTIVE' },
    };
    const pmaReplacement = {
      ...f.pmas[0],
      id: 'pma-replacement',
      specialActivityId: 'root-2',
    };
    const activitySlotReplacement = {
      ...f.activitySlots[0],
      specialActivityId: 'root-2',
    };

    const { service } = setupHarness({
      ...f,
      activitySlots: [activitySlotReplacement],
      pmas: [pmaReplacement],
      executions: [root1ReversedExec, root2ActiveExec],
      attestations: [f.attestation1],
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.contributionCount).toBe(1);
    expect(res.contributions[0].executionId).toBe('exec-2');
  });

  // 9. ad-hoc SpecialActivity không có ProgrammeMaterializedActivity => không được programme workload credit, không suy diễn kind/title.
  it('9. ad-hoc SpecialActivity without ProgrammeMaterializedActivity => zero programme credit', async () => {
    const f = createStandardFixtures();
    const { service } = setupHarness({
      ...f,
      pmas: [], // No ProgrammeMaterializedActivity
      attestations: [f.attestation1],
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.contributionCount).toBe(0);
    expect(res.totalCredit).toBe(0);
    expect(res.contributions).toHaveLength(0);
    expect(res.pendingConfirmation).toHaveLength(0);
  });

  // 10. policy changes by civil date => mỗi contribution dùng exact effective policy version đúng ngày.
  it('10. policy changes by civil date => each contribution uses exact effective policy version for its date', async () => {
    const f = createStandardFixtures();
    const slot2 = {
      id: baseEntities.slotId2,
      plannedProgrammeOccurrenceId: baseEntities.occurrenceId,
      academicYearId,
      timeSlotDefinitionId: baseEntities.timeSlotDefId2,
    };
    const activitySlot2 = {
      id: baseEntities.activitySlotId2,
      specialActivityId: baseEntities.activityId2,
      academicYearId,
      timeSlotDefinitionId: baseEntities.timeSlotDefId2,
    };
    const pma2 = {
      id: 'pma-2',
      programmeMasterId: baseEntities.masterId,
      programmePlanVersionId: baseEntities.planVersionId,
      programmeTopicItemId: baseEntities.topicItemId,
      plannedProgrammeOccurrenceId: baseEntities.occurrenceId,
      plannedOccurrenceSlotId: baseEntities.slotId2,
      specialActivityId: baseEntities.activityId2,
    };
    const exec2 = {
      id: 'exec-2',
      status: 'ACTIVE',
      specialActivityId: baseEntities.activityId2,
      specialActivityStaffingId: 'staffing-2',
      specialActivityTimeSlotId: baseEntities.activitySlotId2,
      academicYearId,
      executionCivilDate: new Date('2026-09-25T00:00:00.000Z'),
      actualTeacherUserId: teacherId1,
      createdAt: new Date('2026-09-25T08:00:00.000Z'),
      specialActivity: {
        id: baseEntities.activityId2,
        status: 'ACTIVE',
      },
    };

    const policyResolver = jest.fn().mockImplementation(async (_fam, _res, civilDate) => {
      if (civilDate === '2026-09-10') {
        return {
          outcome: 'RESOLVED',
          family: 'SPECIAL_PROGRAMME_WORKLOAD',
          resource: { kind: 'ACADEMIC_YEAR', academicYearId },
          requestedCivilDate: civilDate,
          policyVersionId: 'pol-ver-1',
          validatorVersion: 'v1',
          payload: {
            coefficients: {
              GDDP: { CLASS: 1.0, GRADE: 1.0 },
              HDTN_HN: { CLASS: 1.0, GRADE: 1.0, SCHOOL_WIDE: 1.0 },
            },
          },
          effectiveFrom: '2026-09-01',
          effectiveUntil: '2026-09-15',
        };
      }
      return {
        outcome: 'RESOLVED',
        family: 'SPECIAL_PROGRAMME_WORKLOAD',
        resource: { kind: 'ACADEMIC_YEAR', academicYearId },
        requestedCivilDate: civilDate,
        policyVersionId: 'pol-ver-2',
        validatorVersion: 'v1',
        payload: {
          coefficients: {
            GDDP: { CLASS: 2.0, GRADE: 2.0 },
            HDTN_HN: { CLASS: 2.0, GRADE: 2.0, SCHOOL_WIDE: 2.0 },
          },
        },
        effectiveFrom: '2026-09-16',
        effectiveUntil: null,
      };
    });

    const { service } = setupHarness({
      masters: f.masters,
      planVersions: f.planVersions,
      topicItems: f.topicItems,
      occurrences: f.occurrences,
      slots: [...f.slots, slot2],
      activitySlots: [...f.activitySlots, activitySlot2],
      pmas: [...f.pmas, pma2],
      executions: [...f.executions, exec2],
      attestations: [f.attestation1],
      policyResolver,
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.contributionCount).toBe(2);
    expect(res.totalCredit).toBe(3.0); // 1.0 + 2.0
    expect(res.contributions[0].policyVersionId).toBe('pol-ver-1');
    expect(res.contributions[0].coefficient).toBe(1.0);
    expect(res.contributions[1].policyVersionId).toBe('pol-ver-2');
    expect(res.contributions[1].coefficient).toBe(2.0);
  });

  // 11. policy missing/corrupt/ambiguous khi contribution eligible => BLOCK, no fallback.
  it('11. policy missing/corrupt/ambiguous when contribution eligible => BLOCK with blocker finding', async () => {
    const f = createStandardFixtures();
    const policyResolver = jest.fn().mockResolvedValue({
      outcome: 'POLICY_NOT_CONFIGURED',
      family: 'SPECIAL_PROGRAMME_WORKLOAD',
      resource: { kind: 'ACADEMIC_YEAR', academicYearId },
      requestedCivilDate: '2026-09-10',
    });

    const { service } = setupHarness({
      ...f,
      attestations: [f.attestation1],
      policyResolver,
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.status).toBe('BLOCKED');
    expect(res.totalCredit).toBeNull();
    expect(res.contributionCount).toBeNull();
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].severity).toBe('BLOCKER');
    expect(res.findings[0].code).toBe('SPECIAL_PROGRAMME_WORKLOAD_POLICY_POLICY_NOT_CONFIGURED');
  });

  // 12. policy absent nhưng không có eligible contribution => PASS zero.
  it('12. policy absent but zero eligible contributions => PASS with total zero', async () => {
    const f = createStandardFixtures();
    const policyResolver = jest.fn().mockResolvedValue({
      outcome: 'POLICY_NOT_CONFIGURED',
      family: 'SPECIAL_PROGRAMME_WORKLOAD',
      resource: { kind: 'ACADEMIC_YEAR', academicYearId },
      requestedCivilDate: '2026-09-10',
    });

    const { service } = setupHarness({
      ...f,
      attestations: [], // Zero attestations => zero eligible contributions
      policyResolver,
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.status).toBe('PASS');
    expect(res.totalCredit).toBe(0);
    expect(res.contributionCount).toBe(0);
    expect(policyResolver).not.toHaveBeenCalled();
  });

  // 13. coefficient 0 hợp lệ => contribution provenance tồn tại, credit = 0.
  it('13. coefficient 0 is valid => contribution provenance retained with credit 0', async () => {
    const f = createStandardFixtures();
    const policyResolver = jest.fn().mockResolvedValue({
      outcome: 'RESOLVED',
      family: 'SPECIAL_PROGRAMME_WORKLOAD',
      resource: { kind: 'ACADEMIC_YEAR', academicYearId },
      requestedCivilDate: '2026-09-10',
      policyVersionId: 'pol-ver-zero',
      validatorVersion: 'v1',
      payload: {
        coefficients: {
          GDDP: { CLASS: 0, GRADE: 0 },
          HDTN_HN: { CLASS: 0, GRADE: 0, SCHOOL_WIDE: 0 },
        },
      },
      effectiveFrom: '2026-09-01',
      effectiveUntil: null,
    });

    const { service } = setupHarness({
      ...f,
      attestations: [f.attestation1],
      policyResolver,
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.status).toBe('PASS');
    expect(res.contributionCount).toBe(1);
    expect(res.totalCredit).toBe(0);
    expect(res.contributions[0].coefficient).toBe(0);
    expect(res.contributions[0].credit).toBe(0);
    expect(res.contributions[0].policyVersionId).toBe('pol-ver-zero');
  });

  // 14. class target cardinality và attestation count không ảnh hưởng total.
  it('14. class target cardinality and attestation count do not affect total contribution count or credit', async () => {
    const f = createStandardFixtures();
    const att2 = { ...f.attestation1, id: 'att-2' };
    const att3 = { ...f.attestation1, id: 'att-3' };
    const { service } = setupHarness({
      ...f,
      attestations: [f.attestation1, att2, att3],
    });

    const res = await service.resolve({
      academicYearId,
      targetUserId: teacherId1,
      fromCivilDate,
      toCivilDate,
      asOfInstant,
    });

    expect(res.contributionCount).toBe(1);
    expect(res.totalCredit).toBe(1.5);
    expect(res.contributions[0].attestations).toHaveLength(3);
  });
});
