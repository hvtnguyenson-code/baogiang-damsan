import {
  assertFrozenReportingStatementIntegrity,
  canonicalizeJson,
  freezeReportingStatementSnapshot,
  freezeReportingStatementSnapshotV1,
  REPORTING_STATEMENT_SERIALIZER_V1,
  REPORTING_STATEMENT_SNAPSHOT_V1,
  REPORTING_STATEMENT_SNAPSHOT_V2,
  REPORTING_STATEMENT_SNAPSHOT_V3,
  REPORTING_STATEMENT_SNAPSHOT_V4,
  sha256CanonicalJson,
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
    requiredCredit: 60,
    varianceCredit: -57,
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
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
        denominatorK: 7,
        hasInterruption: false,
        interruptionIds: [],
        policyVersionId: 'policy-ver-workload-1',
        policyValidatorVersion: 'v1',
        policyEffectiveFrom: '2026-09-01',
        policyEffectiveUntil: null,
        baseWeeklyNorm: 21,
        adjustedWeeklyNorm: 14,
        dailyRequiredCredit: 2,
        appliedRules: [
          {
            ruleId: 'r_gvcn',
            calculation: 'TRU_TIET' as const,
            value: 7,
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

  it('rejects when eligible segment improperly spans a non-teaching weekday', () => {
    const nonTeachingSpan = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          // Mon-Sat only (Sunday is non-teaching, but segment covers full month including 2026-09-06)
          teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
          denominatorK: 6,
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
        officialWorkload: nonTeachingSpan as never,
      }),
    ).toThrow('eligible segment spans non-teaching weekday SUNDAY on 2026-09-06');
  });

  it('rejects when segment has contradictory interruption eligibility', () => {
    const contradictory = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          isWorkloadEligible: true,
          hasInterruption: true,
          interruptionIds: ['interruption-1'],
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
        officialWorkload: contradictory as never,
      }),
    ).toThrow('eligible segment must not claim hasInterruption');
  });

  it('rejects when teachingWeekdays contains duplicate weekdays', () => {
    const duplicateWeekdays = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          teachingWeekdays: ['MONDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
          denominatorK: 7,
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
        officialWorkload: duplicateWeekdays as never,
      }),
    ).toThrow('segment teachingWeekdays contains duplicate weekdays');
  });

  // BLOCKER A: Do not blindly trust isWorkloadEligible = false
  it('rejects attack converting eligible teaching-day segment to ineligible without interruption provenance (BLOCKER A)', () => {
    // 1. Create a valid frozen V4 statement
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

    // 2. Attacker modifies snapshot: converts eligible teaching segment to ineligible,
    // zeros required workload fields, reconciles requiredCredit and varianceCredit,
    // recomputes canonical JSON and semanticHash.
    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0] = {
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      isWorkloadEligible: false,
      calendarVersionId: 'cal-ver-1',
      teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      denominatorK: 7,
      hasInterruption: false,
      interruptionIds: [],
      policyVersionId: null,
      policyValidatorVersion: null,
      policyEffectiveFrom: null,
      policyEffectiveUntil: null,
      baseWeeklyNorm: null,
      adjustedWeeklyNorm: null,
      dailyRequiredCredit: 0,
      appliedRules: [],
    };
    // Reconcile arithmetic: requiredCredit becomes 0, varianceCredit = earnedCredit (3) - 0 = 3
    tamperedSnapshot.officialWorkload.requiredCredit = 0;
    tamperedSnapshot.officialWorkload.varianceCredit = 3;

    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('ineligible uninterrupted segment contains teaching weekday');
  });

  // BLOCKER B #1: duplicate ruleId
  it('rejects applied rule with duplicate ruleId (BLOCKER B #1)', () => {
    const duplicateRuleId = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_gvcn',
              calculation: 'TRU_TIET' as const,
              value: 3,
              priority: 10,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: ['hr-1'],
              matchingSchoolClassIds: ['class-1'],
            },
            {
              ruleId: 'r_gvcn', // DUPLICATE
              calculation: 'TRU_TIET' as const,
              value: 4,
              priority: 20,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: ['hr-2'],
              matchingSchoolClassIds: ['class-2'],
            },
          ],
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
        officialWorkload: duplicateRuleId as never,
      }),
    ).toThrow('segment rule duplicate ruleId: r_gvcn');
  });

  // BLOCKER B #2: duplicate priority
  it('rejects applied rule with duplicate priority (BLOCKER B #2)', () => {
    const duplicatePriority = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_gvcn_1',
              calculation: 'TRU_TIET' as const,
              value: 3,
              priority: 10,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: ['hr-1'],
              matchingSchoolClassIds: ['class-1'],
            },
            {
              ruleId: 'r_gvcn_2',
              calculation: 'TRU_TIET' as const,
              value: 4,
              priority: 10, // DUPLICATE PRIORITY
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: ['hr-2'],
              matchingSchoolClassIds: ['class-2'],
            },
          ],
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
        officialWorkload: duplicatePriority as never,
      }),
    ).toThrow('segment rule duplicate priority: 10');
  });

  // BLOCKER B #3: calculation outside canonical enum
  it('rejects applied rule with calculation outside canonical enum (BLOCKER B #3)', () => {
    const badCalc = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_gvcn',
              calculation: 'CONG_TIET' as never,
              value: 7,
              priority: 10,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: ['hr-1'],
              matchingSchoolClassIds: ['class-1'],
            },
          ],
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
        officialWorkload: badCalc as never,
      }),
    ).toThrow('segment rule calculation unknown: CONG_TIET');
  });

  // BLOCKER B #4: TRU_PHAN_TRAM > 100
  it('rejects applied rule with TRU_PHAN_TRAM exceeding 100 (BLOCKER B #4)', () => {
    const excessivePercent = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_gvcn',
              calculation: 'TRU_PHAN_TRAM' as const,
              value: 120, // > 100
              priority: 10,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: ['hr-1'],
              matchingSchoolClassIds: ['class-1'],
            },
          ],
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
        officialWorkload: excessivePercent as never,
      }),
    ).toThrow('segment rule TRU_PHAN_TRAM value must not exceed 100');
  });

  // BLOCKER B #5: unknown sourceKind
  it('rejects applied rule with unknown sourceKind (BLOCKER B #5)', () => {
    const unknownSource = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_general',
              calculation: 'TRU_TIET' as const,
              value: 7,
              priority: 10,
              sourceKind: 'GENERAL' as never,
            },
          ],
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
        officialWorkload: unknownSource as never,
      }),
    ).toThrow('segment rule sourceKind unknown: GENERAL');
  });

  // BLOCKER B #6: fake HOMEROOM rule without matchingHomeroomAssignmentIds
  it('rejects fake HOMEROOM rule without matchingHomeroomAssignmentIds (BLOCKER B #6)', () => {
    const missingHrIds = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_gvcn',
              calculation: 'TRU_TIET' as const,
              value: 7,
              priority: 10,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingSchoolClassIds: ['class-1'],
              // matchingHomeroomAssignmentIds is missing
            },
          ],
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
        officialWorkload: missingHrIds as never,
      }),
    ).toThrow('segment rule matchingHomeroomAssignmentIds integrity failed: must be a non-empty array');
  });

  // BLOCKER B #7: fake ADDITIONAL_DUTY rule without qualifyingAssignmentIds
  it('rejects fake ADDITIONAL_DUTY rule without qualifyingAssignmentIds (BLOCKER B #7)', () => {
    const missingDutyAssignments = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_duty',
              calculation: 'TRU_TIET' as const,
              value: 7,
              priority: 10,
              sourceKind: 'ADDITIONAL_DUTY' as const,
              dutyDefinitionId: '33333333-3333-4333-8333-333333333333',
              dutyDefinitionCodeSnapshot: 'DUTY_01',
              dutyDefinitionNameSnapshot: 'Nhiem vu 1',
              // qualifyingAssignmentIds is missing
            },
          ],
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
        officialWorkload: missingDutyAssignments as never,
      }),
    ).toThrow('segment rule qualifyingAssignmentIds integrity failed: must be a non-empty array');
  });

  // BLOCKER B #8: fake rule that reduces adjustedWeeklyNorm/requiredCredit while arithmetic remains internally consistent
  it('rejects a fake rule that reduces adjustedWeeklyNorm/requiredCredit while arithmetic remains internally consistent (BLOCKER B #8)', () => {
    // Attacker adds a forged ADDITIONAL_DUTY rule that subtracts 7 periods (from 14 down to 7),
    // and recalculates all arithmetic consistently:
    // baseWeeklyNorm = 21, rule 1 (HOMEROOM, TRU_TIET 7) -> 14, rule 2 (fake DUTY, TRU_TIET 7) -> 7
    // adjustedWeeklyNorm = 7
    // dailyRequiredCredit = 7 / 7 = 1
    // requiredCredit = 30 * 1 = 30
    // varianceCredit = 3 - 30 = -27
    const consistentForged = {
      ...officialWorkloadSnapshot,
      requiredCredit: 30,
      varianceCredit: -27,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          adjustedWeeklyNorm: 7,
          dailyRequiredCredit: 1,
          appliedRules: [
            {
              ruleId: 'r_gvcn',
              calculation: 'TRU_TIET' as const,
              value: 7,
              priority: 10,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: ['hr-1'],
              matchingSchoolClassIds: ['class-1'],
            },
            {
              ruleId: 'r_forged_duty',
              calculation: 'TRU_TIET' as const,
              value: 7,
              priority: 20,
              sourceKind: 'ADDITIONAL_DUTY' as const,
              dutyDefinitionId: '99999999-9999-4999-8999-999999999999',
              dutyDefinitionCodeSnapshot: 'FORGED',
              dutyDefinitionNameSnapshot: 'Forged Duty',
              qualifyingAssignmentIds: [], // FORGED: no actual qualifying assignments
            },
          ],
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
        officialWorkload: consistentForged as never,
      }),
    ).toThrow('segment rule qualifyingAssignmentIds integrity failed: must be a non-empty array');
  });

  // MAJOR C: Array shape validation before dereferencing
  it('rejects malformed array structures before dereferencing (MAJOR C)', () => {
    // 1. appliedRules is null
    const nullAppliedRules = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: null as never,
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
        officialWorkload: nullAppliedRules as never,
      }),
    ).toThrow('segment appliedRules integrity failed: must be an array');

    // 2. appliedRules is an object
    const objectAppliedRules = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: { not: 'array' } as never,
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
        officialWorkload: objectAppliedRules as never,
      }),
    ).toThrow('segment appliedRules integrity failed: must be an array');

    // 3. matchingHomeroomAssignmentIds is not an array
    const notArrayHrIds = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_gvcn',
              calculation: 'TRU_TIET' as const,
              value: 7,
              priority: 10,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: 'not-array' as never,
              matchingSchoolClassIds: ['class-1'],
            },
          ],
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
        officialWorkload: notArrayHrIds as never,
      }),
    ).toThrow('segment rule matchingHomeroomAssignmentIds integrity failed: must be a non-empty array');
  });

  // D. Provenance completeness check
  it('rejects eligible segment with missing policyValidatorVersion (D. Provenance completeness)', () => {
    const missingValidatorVer = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          policyValidatorVersion: '' as never,
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
        officialWorkload: missingValidatorVer as never,
      }),
    ).toThrow('segment policyValidatorVersion integrity failed');
  });

  // Cross-substitute provenance fields check
  it('rejects cross-substitute provenance fields between source kinds', () => {
    // ADDITIONAL_DUTY with homeroom fields
    const dutyWithHrFields = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_duty',
              calculation: 'TRU_TIET' as const,
              value: 7,
              priority: 10,
              sourceKind: 'ADDITIONAL_DUTY' as const,
              dutyDefinitionId: '33333333-3333-4333-8333-333333333333',
              dutyDefinitionCodeSnapshot: 'DUTY_01',
              dutyDefinitionNameSnapshot: 'Nhiem vu 1',
              qualifyingAssignmentIds: ['qa-1'],
              matchingHomeroomAssignmentIds: ['hr-1'] as never,
            },
          ],
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
        officialWorkload: dutyWithHrFields as never,
      }),
    ).toThrow('segment rule ADDITIONAL_DUTY must not have matchingHomeroomAssignmentIds');

    // HOMEROOM_RESPONSIBILITY with dutyDefinitionId
    const hrWithDutyFields = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_gvcn',
              calculation: 'TRU_TIET' as const,
              value: 7,
              priority: 10,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: ['hr-1'],
              matchingSchoolClassIds: ['class-1'],
              dutyDefinitionId: '33333333-3333-4333-8333-333333333333' as never,
            },
          ],
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
        officialWorkload: hrWithDutyFields as never,
      }),
    ).toThrow('segment rule HOMEROOM_RESPONSIBILITY must not have dutyDefinitionId');
  });

  // CORRECTION 005 A.1: Decimal precision parity
  it('rejects baseWeeklyNorm with >4 decimal places even if arithmetic is internally self-consistent (CORRECTION 005 A.1)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].baseWeeklyNorm = 21.12345;
    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('segment baseWeeklyNorm integrity failed: must be a non-negative finite number with at most 4 decimal places');
  });

  it('rejects applied rule value with >4 decimal places even if arithmetic is internally self-consistent (CORRECTION 005 A.1)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].appliedRules[0].value = 7.12345;
    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('segment rule value integrity failed: must be a non-negative finite number with at most 4 decimal places');
  });

  it('rejects rule value or baseWeeklyNorm with exponential notation (CORRECTION 005 A.1)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].appliedRules[0].value = 1e-5;
    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('segment rule value integrity failed');
  });

  // CORRECTION 005 A.2: ruleId canonical form
  it('rejects applied rule with untrimmed ruleId (leading/trailing whitespace) (CORRECTION 005 A.2)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].appliedRules[0].ruleId = ' r_gvcn ';
    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('segment rule ruleId integrity failed: must be a non-empty trimmed string of at most 100 characters');
  });

  it('rejects applied rule with ruleId exceeding 100 characters (CORRECTION 005 A.2)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].appliedRules[0].ruleId = 'r'.repeat(101);
    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('segment rule ruleId integrity failed: must be a non-empty trimmed string of at most 100 characters');
  });

  // CORRECTION 005 A.3: dutyDefinitionId UUID parity
  it('rejects ADDITIONAL_DUTY applied rule with non-UUID dutyDefinitionId (CORRECTION 005 A.3)', () => {
    const dutyRuleOfficialWorkload = {
      ...officialWorkloadSnapshot,
      adjustmentSegments: [
        {
          ...officialWorkloadSnapshot.adjustmentSegments[0],
          appliedRules: [
            {
              ruleId: 'r_duty',
              calculation: 'TRU_TIET' as const,
              value: 3,
              priority: 10,
              sourceKind: 'ADDITIONAL_DUTY' as const,
              dutyDefinitionId: 'not-a-uuid',
              dutyDefinitionCodeSnapshot: 'DUTY_01',
              dutyDefinitionNameSnapshot: 'Duty Name',
              qualifyingAssignmentIds: ['qa-1'],
            },
          ],
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
        officialWorkload: dutyRuleOfficialWorkload as never,
      }),
    ).toThrow('segment rule dutyDefinitionId integrity failed: must be a valid UUID');
  });

  // CORRECTION 005 B: Policy effectivity provenance
  it('rejects eligible segment with invalid policyEffectiveFrom date string (CORRECTION 005 B.1)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].policyEffectiveFrom = 'not-a-date';
    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('eligible segment policyEffectiveFrom integrity failed: must be a valid civil date');
  });

  it('rejects eligible segment whose policyEffectiveFrom starts after segment fromCivilDate (CORRECTION 005 B.2)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].policyEffectiveFrom = '2026-09-02';
    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('eligible segment policy window starts after segment start');
  });

  it('rejects eligible segment whose policyEffectiveUntil ends before segment toCivilDate (CORRECTION 005 B.3)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].policyEffectiveUntil = '2026-09-29';
    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('eligible segment policy window ends before segment end');
  });

  it('rejects eligible segment where policyEffectiveUntil < policyEffectiveFrom (CORRECTION 005 B.4)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].policyEffectiveFrom = '2026-09-01';
    tamperedSnapshot.officialWorkload.adjustmentSegments[0].policyEffectiveUntil = '2026-08-31';
    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('eligible segment policyEffectiveUntil must be on or after policyEffectiveFrom');
  });

  it('rejects ineligible segment carrying non-null policy effectivity provenance (CORRECTION 005 B.5)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0] = {
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      isWorkloadEligible: false,
      calendarVersionId: 'cal-ver-1',
      teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      denominatorK: 7,
      hasInterruption: true,
      interruptionIds: ['interruption-valid-1'],
      policyVersionId: null,
      policyValidatorVersion: null,
      policyEffectiveFrom: '2026-09-01',
      policyEffectiveUntil: null,
      baseWeeklyNorm: null,
      adjustedWeeklyNorm: null,
      dailyRequiredCredit: 0,
      appliedRules: [],
    };
    tamperedSnapshot.officialWorkload.requiredCredit = 0;
    tamperedSnapshot.officialWorkload.varianceCredit = 3;

    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('ineligible segment must have null policyEffectiveFrom and policyEffectiveUntil');
  });

  // CORRECTION 005 C: Interruption provenance structural integrity
  it('rejects interrupted segment with duplicate interruptionIds (CORRECTION 005 C)', () => {
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

    const tamperedSnapshot = JSON.parse(frozen.canonicalSnapshotJson);
    tamperedSnapshot.officialWorkload.adjustmentSegments[0] = {
      fromCivilDate: '2026-09-01',
      toCivilDate: '2026-09-30',
      isWorkloadEligible: false,
      calendarVersionId: 'cal-ver-1',
      teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      denominatorK: 7,
      hasInterruption: true,
      interruptionIds: ['dup-interruption', 'dup-interruption'],
      policyVersionId: null,
      policyValidatorVersion: null,
      policyEffectiveFrom: null,
      policyEffectiveUntil: null,
      baseWeeklyNorm: null,
      adjustedWeeklyNorm: null,
      dailyRequiredCredit: 0,
      appliedRules: [],
    };
    tamperedSnapshot.officialWorkload.requiredCredit = 0;
    tamperedSnapshot.officialWorkload.varianceCredit = 3;

    const tamperedCanonicalJson = canonicalizeJson(tamperedSnapshot as never);
    const tamperedSemanticHash = sha256CanonicalJson(tamperedCanonicalJson);

    expect(() =>
      assertFrozenReportingStatementIntegrity({
        ...frozen,
        snapshot: tamperedSnapshot,
        canonicalSnapshotJson: tamperedCanonicalJson,
        semanticHash: tamperedSemanticHash,
      }),
    ).toThrow('interrupted segment contains duplicate interruptionId: dup-interruption');
  });
});
