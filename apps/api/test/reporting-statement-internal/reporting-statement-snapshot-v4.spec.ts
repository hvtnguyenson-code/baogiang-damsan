import {
  assertFrozenReportingStatementIntegrity,
  freezeReportingStatementSnapshot,
  REPORTING_STATEMENT_SERIALIZER_V1,
  REPORTING_STATEMENT_SNAPSHOT_V2,
  REPORTING_STATEMENT_SNAPSHOT_V3,
  REPORTING_STATEMENT_SNAPSHOT_V4,
} from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';

describe('Reporting Statement Snapshot V4 (Section 43)', () => {
  const asOf = new Date('2026-09-20T10:00:00.000Z');
  const submitterUserId = '22222222-2222-4222-8222-222222222222';

  const baseProjection = {
    profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
    scope: {
      academicYearId: 'year-1',
      targetUserId: submitterUserId,
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      asOfInstant: asOf,
    },
    responsibilityState: 'RESPONSIBILITY_PRESENT' as const,
    status: 'PASS' as const,
    counts: {
      distributedElapsedCount: 1,
      completedCount: 1,
      openDebtCount: 0,
      lateCount: 0,
      unconfirmedGapCount: 0,
    },
    responsibilityManifest: [
      {
        teachingAssignmentId: 'ta-1',
        schoolClassId: 'class-1',
        subjectId: 'subject-1',
        validFrom: '2026-09-01',
        validUntil: null,
      },
    ],
    sections: [],
    findings: [],
    evaluatedAt: '2026-09-20T10:00:00.000Z',
  };

  const specialWorkloadSnapshot = {
    projectionProfile: 'SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1',
    status: 'PASS' as const,
    totalCredit: 2,
    contributionCount: 1,
    contributions: [
      {
        executionId: 'exec-sp-1',
        specialActivityId: 'act-1',
        specialActivityStaffingId: 'staff-1',
        specialActivityTimeSlotId: 'slot-1',
        programmeMasterId: 'master-1',
        programmePlanVersionId: 'plan-1',
        programmeTopicItemId: 'topic-1',
        plannedProgrammeOccurrenceId: 'occ-1',
        plannedOccurrenceSlotId: 'occs-1',
        programmeKind: 'GDDP',
        occurrenceMode: 'CLASS',
        executionCivilDate: '2026-09-05',
        actualTeacherUserId: submitterUserId,
        coefficient: 2,
        credit: 2,
        policyVersionId: 'pol-ver-1',
        policyValidatorVersion: 'v1',
        attestations: [
          {
            attestationId: 'att-1',
            attestedByUserId: 'principal-1',
            authorityType: 'PRINCIPAL',
            capabilityKey: 'SPECIAL_PROGRAMME_ATTESTATION',
            scope: 'SCHOOL_WIDE',
            resourceId: null,
            attestedAt: '2026-09-06T00:00:00.000Z',
          },
        ],
      },
    ],
    pendingConfirmation: [],
    evaluatedAt: '2026-09-20T10:00:00.000Z',
  };

  const officialWorkloadSnapshot = {
    projectionProfile: 'OFFICIAL_TEACHER_WORKLOAD_PROJECTION_V1',
    status: 'PASS' as const,
    curricularCredit: 1,
    specialProgrammeCredit: 2,
    earnedCredit: 3,
    requiredCredit: 3,
    varianceCredit: 0,
    curricularContributions: [
      {
        executionId: 'exec-cur-1',
        kind: 'NORMAL',
        executionCivilDate: '2026-09-07' as const,
        actualTeacherUserId: submitterUserId,
        credit: 1,
        schoolClassId: 'class-1',
        subjectId: 'subject-1',
        originalTimetableEntryId: 'tt-1',
        sourceCivilDate: '2026-09-07' as const,
      },
    ],
    specialProgrammeWorkload: specialWorkloadSnapshot,
    adjustmentSegments: [
      {
        fromCivilDate: '2026-09-01' as const,
        toCivilDate: '2026-09-30' as const,
        isWorkloadEligible: true,
        calendarVersionId: 'cal-ver-1',
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        denominatorK: 6,
        hasInterruption: false,
        interruptionIds: [],
        policyVersionId: 'policy-ver-workload-1',
        policyValidatorVersion: 'v1',
        policyEffectiveFrom: '2026-09-01',
        policyEffectiveUntil: null,
        baseWeeklyNorm: 18,
        adjustedWeeklyNorm: 14,
        dailyRequiredCredit: 2.3333,
        appliedRules: [
          {
            ruleId: 'r_gvcn',
            calculation: 'TRU_TIET' as const,
            value: 4,
            priority: 10,
            sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
            matchingHomeroomAssignmentIds: ['hr-1'],
            matchingSchoolClassIds: ['class-1'],
          },
        ],
      },
    ],
    evaluatedAt: '2026-09-20T10:00:00.000Z',
  };

  it('freezes V4 snapshot deterministically with stable semantic hash', () => {
    const frozen1 = freezeReportingStatementSnapshot({
      statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      submitterUserId,
      submitterDisplayNameSnapshot: 'Nguyen Van A',
      submitterStaffCodeSnapshot: 'GV001',
      asOfInstant: asOf,
      projection: baseProjection as never,
      operationalStartPolicyVersionId: 'op-start-1',
      operationalStartDate: '2026-09-01',
      specialProgrammeWorkload: specialWorkloadSnapshot,
      officialWorkload: officialWorkloadSnapshot,
    });

    const frozen2 = freezeReportingStatementSnapshot({
      statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      submitterUserId,
      submitterDisplayNameSnapshot: 'Nguyen Van A',
      submitterStaffCodeSnapshot: 'GV001',
      asOfInstant: asOf,
      projection: baseProjection as never,
      operationalStartPolicyVersionId: 'op-start-1',
      operationalStartDate: '2026-09-01',
      specialProgrammeWorkload: specialWorkloadSnapshot,
      officialWorkload: officialWorkloadSnapshot,
    });

    expect(frozen1.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V4);
    expect(frozen1.snapshot.serializerVersion).toBe(REPORTING_STATEMENT_SERIALIZER_V1);
    expect(frozen1.semanticHash).toBe(frozen2.semanticHash);
    expect(frozen1.canonicalSnapshotJson).toBe(frozen2.canonicalSnapshotJson);

    // Verify integrity
    expect(() => assertFrozenReportingStatementIntegrity(frozen1)).not.toThrow();
  });

  it('changing official workload provenance changes the canonical hash', () => {
    const original = freezeReportingStatementSnapshot({
      statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      submitterUserId,
      asOfInstant: asOf,
      projection: baseProjection as never,
      operationalStartPolicyVersionId: 'op-start-1',
      operationalStartDate: '2026-09-01',
      specialProgrammeWorkload: specialWorkloadSnapshot,
      officialWorkload: officialWorkloadSnapshot,
    });

    // Thay đổi policyVersionId trong segment provenance
    const modifiedOfficialWorkload = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          policyVersionId: 'different-policy-version',
        },
      ],
    };

    const modified = freezeReportingStatementSnapshot({
      statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      submitterUserId,
      asOfInstant: asOf,
      projection: baseProjection as never,
      operationalStartPolicyVersionId: 'op-start-1',
      operationalStartDate: '2026-09-01',
      specialProgrammeWorkload: specialWorkloadSnapshot,
      officialWorkload: modifiedOfficialWorkload,
    });

    expect(original.semanticHash).not.toBe(modified.semanticHash);
  });

  it('preserves backwards compatibility: V1, V2, V3 frozen snapshots remain valid and verifiable', () => {
    // V2 Snapshot
    const v2 = freezeReportingStatementSnapshot({
      statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      submitterUserId,
      asOfInstant: asOf,
      projection: baseProjection as never,
      operationalStartPolicyVersionId: 'op-start-1',
      operationalStartDate: '2026-09-01',
    });
    expect(v2.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V2);
    expect(() => assertFrozenReportingStatementIntegrity(v2)).not.toThrow();

    // V3 Snapshot
    const v3 = freezeReportingStatementSnapshot({
      statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      submitterUserId,
      asOfInstant: asOf,
      projection: baseProjection as never,
      operationalStartPolicyVersionId: 'op-start-1',
      operationalStartDate: '2026-09-01',
      specialProgrammeWorkload: specialWorkloadSnapshot,
    });
    expect(v3.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V3);
    expect(() => assertFrozenReportingStatementIntegrity(v3)).not.toThrow();
  });

  it('fails integrity check if canonical JSON is tampered', () => {
    const frozen = freezeReportingStatementSnapshot({
      statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      submitterUserId,
      asOfInstant: asOf,
      projection: baseProjection as never,
      operationalStartPolicyVersionId: 'op-start-1',
      operationalStartDate: '2026-09-01',
      specialProgrammeWorkload: specialWorkloadSnapshot,
      officialWorkload: officialWorkloadSnapshot,
    });

    const tampered = {
      ...frozen,
      canonicalSnapshotJson: frozen.canonicalSnapshotJson.replace('"earnedCredit":3', '"earnedCredit":99'),
    };

    expect(() => assertFrozenReportingStatementIntegrity(tampered)).toThrow();
  });
});
