import {
  assertFrozenReportingStatementIntegrity,
  freezeReportingStatementSnapshot,
  freezeReportingStatementSnapshotV1,
  REPORTING_STATEMENT_SERIALIZER_V1,
  REPORTING_STATEMENT_SNAPSHOT_V1,
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
    requiredCredit: 70,
    varianceCredit: -67,
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

  it('preserves backwards compatibility: V1, V2, V3, V4 frozen snapshots remain valid and verifiable', () => {
    // V1 Snapshot
    const v1 = freezeReportingStatementSnapshotV1({
      statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      submitterUserId,
      asOfInstant: asOf,
      projection: baseProjection as never,
    });
    expect(v1.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V1);
    expect(() => assertFrozenReportingStatementIntegrity(v1)).not.toThrow();

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

    // V4 Snapshot
    const v4 = freezeReportingStatementSnapshot({
      statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      submitterUserId,
      asOfInstant: asOf,
      projection: baseProjection as never,
      operationalStartPolicyVersionId: 'op-start-1',
      operationalStartDate: '2026-09-01',
      specialProgrammeWorkload: specialWorkloadSnapshot,
      officialWorkload: officialWorkloadSnapshot,
    });
    expect(v4.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V4);
    expect(() => assertFrozenReportingStatementIntegrity(v4)).not.toThrow();
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

  it('rejects when nested special programme is corrupted', () => {
    const corruptedNested = {
      ...officialWorkloadSnapshot,
      specialProgrammeWorkload: {
        ...specialWorkloadSnapshot,
        status: 'BLOCKED' as const,
      },
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: corruptedNested as never,
      }),
    ).toThrow();
  });

  it('rejects when specialProgrammeCredit != nested.totalCredit', () => {
    const mismatchedCredit = {
      ...officialWorkloadSnapshot,
      specialProgrammeCredit: 99,
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: mismatchedCredit as never,
      }),
    ).toThrow();
  });

  it('rejects when top-level special snapshot != nested special snapshot (drift)', () => {
    const driftedNested = {
      ...officialWorkloadSnapshot,
      specialProgrammeWorkload: {
        ...specialWorkloadSnapshot,
        contributions: [],
        totalCredit: 0,
        contributionCount: 0,
      },
      specialProgrammeCredit: 0,
      earnedCredit: 1,
      varianceCredit: -2,
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: driftedNested as never,
      }),
    ).toThrow();
  });

  it('rejects when earnedCredit arithmetic is incorrect', () => {
    const badEarned = {
      ...officialWorkloadSnapshot,
      earnedCredit: 999, // curricularCredit (1) + specialCredit (2) = 3 != 999
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: badEarned as never,
      }),
    ).toThrow();
  });

  it('rejects when varianceCredit arithmetic is incorrect', () => {
    const badVariance = {
      ...officialWorkloadSnapshot,
      varianceCredit: 999, // earned (3) - required (3) = 0 != 999
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: badVariance as never,
      }),
    ).toThrow();
  });

  it('rejects duplicate curricular execution id', () => {
    const duplicateCurricular = {
      ...officialWorkloadSnapshot,
      curricularCredit: 2,
      earnedCredit: 4,
      varianceCredit: 1,
      curricularContributions: [
        officialWorkloadSnapshot.curricularContributions[0],
        officialWorkloadSnapshot.curricularContributions[0], // duplicate
      ],
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: duplicateCurricular as never,
      }),
    ).toThrow();
  });

  it('rejects segment provenance mismatch when adjustedWeeklyNorm does not match rules', () => {
    const badSegmentNorm = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          adjustedWeeklyNorm: 10, // Base is 18, rule TRU_TIET 4 => should be 14, not 10
        },
      ],
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: badSegmentNorm as never,
      }),
    ).toThrow();
  });

  it('rejects when requiredCredit is changed even if variance is adjusted consistently', () => {
    const tamperedRequired = {
      ...officialWorkloadSnapshot,
      requiredCredit: 80, // Provenance calculation is 70
      varianceCredit: -77, // 3 - 80 = -77 (arithmetically consistent with 80, but provenance fails)
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: tamperedRequired as never,
      }),
    ).toThrow('requiredCredit exact provenance reconciliation failed');
  });

  it('rejects when eligible segment is removed', () => {
    const emptySegments = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [],
      requiredCredit: 0,
      varianceCredit: 3,
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: emptySegments as never,
      }),
    ).toThrow('segment coverage integrity failed: segment list is empty');
  });

  it('rejects when there is a segment date gap', () => {
    const gapSegments = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          toCivilDate: '2026-09-10',
        },
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          fromCivilDate: '2026-09-12', // Gap at 2026-09-11
          toCivilDate: '2026-09-30',
        },
      ],
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: gapSegments as never,
      }),
    ).toThrow('segment coverage integrity failed: segment gap detected');
  });

  it('rejects when segments overlap', () => {
    const overlapSegments = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          toCivilDate: '2026-09-15',
        },
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          fromCivilDate: '2026-09-15', // Overlap at 2026-09-15
          toCivilDate: '2026-09-30',
        },
      ],
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: overlapSegments as never,
      }),
    ).toThrow('segment coverage integrity failed: segment overlap detected');
  });

  it('rejects when segment range is outside statement range', () => {
    const outsideRangeSegments = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          fromCivilDate: '2026-08-31', // Statement begins at 2026-09-01
          toCivilDate: '2026-09-30',
        },
      ],
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: outsideRangeSegments as never,
      }),
    ).toThrow('first segment does not match statement fromCivilDate');
  });

  it('rejects when dailyRequiredCredit does not match adjustedWeeklyNorm / denominatorK', () => {
    const badDaily = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          dailyRequiredCredit: 9.9999, // Should be 2.3333
        },
      ],
    };

    expect(() =>
      freezeReportingStatementSnapshot({
        statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
        submitterUserId,
        asOfInstant: asOf,
        projection: baseProjection as never,
        operationalStartPolicyVersionId: 'op-start-1',
        operationalStartDate: '2026-09-01',
        specialProgrammeWorkload: specialWorkloadSnapshot,
        officialWorkload: badDaily as never,
      }),
    ).toThrow('segment dailyRequiredCredit provenance mismatch');
  });
});
