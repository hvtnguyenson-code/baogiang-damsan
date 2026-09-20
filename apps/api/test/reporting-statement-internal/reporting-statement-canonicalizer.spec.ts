import {
  assertFrozenReportingStatementIntegrity,
  canonicalizeJson,
  freezeReportingStatementSnapshot,
  freezeReportingStatementSnapshotV1,
  REPORTING_STATEMENT_SERIALIZER_V1,
  REPORTING_STATEMENT_SNAPSHOT_V1,
  REPORTING_STATEMENT_SNAPSHOT_V2,
  REPORTING_STATEMENT_SNAPSHOT_V3,
  sha256CanonicalJson,
} from "../../src/reporting-statement-internal/reporting-statement-canonicalizer";

const asOf = new Date("2026-08-24T01:02:03.004Z");

function projection(overrides: Record<string, unknown> = {}) {
  return {
    profile: "PERSONAL_TEACHING_REPORTING_PROJECTION_V1",
    scope: {
      academicYearId: "year",
      targetUserId: "teacher",
      fromCivilDate: "2026-08-01",
      toCivilDate: "2026-08-31",
      asOfInstant: asOf,
    },
    responsibilityState: "RESPONSIBILITY_PRESENT",
    status: "PASS",
    counts: {
      distributedElapsedCount: 1,
      completedCount: 1,
      openDebtCount: 0,
      lateCount: 0,
      unconfirmedGapCount: 0,
    },
    responsibilityManifest: [
      {
        teachingAssignmentId: "ta-b",
        schoolClassId: "class-b",
        subjectId: "subject-b",
        validFrom: "2026-08-01",
        validUntil: null,
      },
      {
        teachingAssignmentId: "ta-a",
        schoolClassId: "class-a",
        subjectId: "subject-a",
        validFrom: "2026-08-01",
        validUntil: null,
      },
    ],
    sections: [],
    findings: [],
    evaluatedAt: "volatile",
    ...overrides,
  };
}

function freezeV2(
  overrides: Record<string, unknown> = {},
  input: Record<string, unknown> = {},
) {
  return freezeReportingStatementSnapshot({
    statementProfile: "PERSONAL_V1",
    submitterUserId: "teacher",
    asOfInstant: asOf,
    projection: projection(overrides) as never,
    operationalStartPolicyVersionId: "policy-version-1",
    operationalStartDate: "2026-08-15",
    ...input,
  } as never);
}

function freezeV1(
  overrides: Record<string, unknown> = {},
  input: Record<string, unknown> = {},
) {
  return freezeReportingStatementSnapshotV1({
    statementProfile: "PERSONAL_V1",
    submitterUserId: "teacher",
    asOfInstant: asOf,
    projection: projection(overrides) as never,
    ...input,
  } as never);
}

describe("Reporting Statement canonicalization", () => {
  it("recursively sorts keys, emits compact JSON, retains null, and rejects invalid values", () => {
    expect(canonicalizeJson({ z: null, a: { b: 1, a: 2 } })).toBe('{"a":{"a":2,"b":1},"z":null}');
    expect(() => canonicalizeJson({ x: { y: undefined } } as never)).toThrow("Undefined");
    expect(() => canonicalizeJson([undefined] as never)).toThrow("Undefined");
    expect(() => canonicalizeJson({ x: Infinity } as never)).toThrow("Non-finite");
  });

  it("uses exact UTF-8 SHA-256 vectors without BOM", () => {
    expect(sha256CanonicalJson("{}")).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
    expect(sha256CanonicalJson('{"text":"Đam San"}')).toBe(
      "dd13b7a41b162d601ad461e39bbef0b358e3552a7601d1e452abc2e0abba23a4",
    );
  });

  // A. explicit V1 fixture vẫn canonicalize/verify PASS
  it("explicit V1 fixture still canonicalizes and verifies integrity PASS", () => {
    const v1 = freezeV1();
    expect(v1.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V1);
    expect(v1.snapshot.serializerVersion).toBe(REPORTING_STATEMENT_SERIALIZER_V1);
    expect(v1.canonicalSnapshotJson).toContain(`"snapshotProfile":"${REPORTING_STATEMENT_SNAPSHOT_V1}"`);
    expect((v1.snapshot as unknown as Record<string, unknown>).operationalStartPolicyVersionId).toBeUndefined();
    expect((v1.snapshot as unknown as Record<string, unknown>).operationalStartDate).toBeUndefined();
    expect(() => assertFrozenReportingStatementIntegrity(v1)).not.toThrow();
  });

  // B, C, D, E. production V2 freeze
  it("freezes production V2 with exact snapshotProfile, serializerVersion, and provenance fields", () => {
    const v2 = freezeV2();
    expect(v2.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V2);
    expect(v2.snapshot.serializerVersion).toBe(REPORTING_STATEMENT_SERIALIZER_V1);
    expect(v2.snapshot.operationalStartPolicyVersionId).toBe("policy-version-1");
    expect(v2.snapshot.operationalStartDate).toBe("2026-08-15");
    expect(v2.canonicalSnapshotJson).toContain(`"snapshotProfile":"${REPORTING_STATEMENT_SNAPSHOT_V2}"`);
    expect(v2.canonicalSnapshotJson).toContain(`"operationalStartPolicyVersionId":"policy-version-1"`);
    expect(v2.canonicalSnapshotJson).toContain(`"operationalStartDate":"2026-08-15"`);
    expect(() => assertFrozenReportingStatementIntegrity(v2)).not.toThrow();
  });

  // F. deterministic canonical JSON: same semantic input => same JSON/hash
  it("produces deterministic canonical JSON and semanticHash for same semantic V2 input", () => {
    const first = freezeV2();
    const second = freezeV2();
    expect(first.canonicalSnapshotJson).toBe(second.canonicalSnapshotJson);
    expect(first.semanticHash).toBe(second.semanticHash);
    expect(first.frozenSubjectIds).toEqual(["subject-a", "subject-b"]);
  });

  // G. changed policyVersionId => changed hash
  it("changes semantic text and hash when operationalStartPolicyVersionId changes", () => {
    const base = freezeV2();
    const changed = freezeV2({}, { operationalStartPolicyVersionId: "policy-version-2" });
    expect(changed.canonicalSnapshotJson).not.toBe(base.canonicalSnapshotJson);
    expect(changed.semanticHash).not.toBe(base.semanticHash);
  });

  // H. changed operationalStartDate => changed hash
  it("changes semantic text and hash when operationalStartDate changes", () => {
    const base = freezeV2();
    const changed = freezeV2({}, { operationalStartDate: "2026-08-16" });
    expect(changed.canonicalSnapshotJson).not.toBe(base.canonicalSnapshotJson);
    expect(changed.semanticHash).not.toBe(base.semanticHash);
  });

  // I. missing/empty policyVersionId => reject
  it("rejects missing or whitespace-only operationalStartPolicyVersionId", () => {
    expect(() => freezeV2({}, { operationalStartPolicyVersionId: "" })).toThrow(
      "operationalStartPolicyVersionId must be a non-empty string",
    );
    expect(() => freezeV2({}, { operationalStartPolicyVersionId: "   " })).toThrow(
      "operationalStartPolicyVersionId must be a non-empty string",
    );
    expect(() => freezeV2({}, { operationalStartPolicyVersionId: undefined })).toThrow(
      "operationalStartPolicyVersionId must be a non-empty string",
    );
  });

  // J. invalid operationalStartDate => reject
  it("rejects invalid operationalStartDate (timestamp, offset, nonexistent civil date)", () => {
    expect(() => freezeV2({}, { operationalStartDate: "2026-08-15T00:00:00.000Z" })).toThrow(
      "operationalStartDate must be a valid civil date",
    );
    expect(() => freezeV2({}, { operationalStartDate: "2026-02-30" })).toThrow(
      "operationalStartDate must be a valid civil date",
    );
    expect(() => freezeV2({}, { operationalStartDate: "invalid" })).toThrow(
      "operationalStartDate must be a valid civil date",
    );
    expect(() => freezeV2({}, { operationalStartDate: undefined })).toThrow(
      "operationalStartDate must be a valid civil date",
    );
  });

  // K. unknown snapshot profile => integrity fail closed
  it("fails closed on unknown snapshot profile or tampered serializerVersion", () => {
    const v2 = freezeV2();
    const tamperedProfile = {
      ...v2,
      snapshot: { ...v2.snapshot, snapshotProfile: "UNKNOWN_PROFILE_V3" },
      canonicalSnapshotJson: canonicalizeJson({
        ...v2.snapshot,
        snapshotProfile: "UNKNOWN_PROFILE_V3",
      } as never),
      semanticHash: sha256CanonicalJson(
        canonicalizeJson({ ...v2.snapshot, snapshotProfile: "UNKNOWN_PROFILE_V3" } as never),
      ),
    };
    expect(() => assertFrozenReportingStatementIntegrity(tamperedProfile as never)).toThrow(
      "unknown snapshot profile",
    );

    const tamperedSerializer = {
      ...v2,
      snapshot: { ...v2.snapshot, serializerVersion: "REPORTING_STATEMENT_SERIALIZER_V2" },
      canonicalSnapshotJson: canonicalizeJson({
        ...v2.snapshot,
        serializerVersion: "REPORTING_STATEMENT_SERIALIZER_V2",
      } as never),
      semanticHash: sha256CanonicalJson(
        canonicalizeJson({
          ...v2.snapshot,
          serializerVersion: "REPORTING_STATEMENT_SERIALIZER_V2",
        } as never),
      ),
    };
    expect(() => assertFrozenReportingStatementIntegrity(tamperedSerializer as never)).toThrow(
      "version integrity failed",
    );
  });

  // V2 malformed provenance integrity tampering
  it("fails closed on V2 integrity tampering with missing or malformed provenance", () => {
    const v2 = freezeV2();
    const tamperedVersion = {
      ...v2,
      snapshot: { ...v2.snapshot, operationalStartPolicyVersionId: "" },
      canonicalSnapshotJson: canonicalizeJson({
        ...v2.snapshot,
        operationalStartPolicyVersionId: "",
      } as never),
      semanticHash: sha256CanonicalJson(
        canonicalizeJson({ ...v2.snapshot, operationalStartPolicyVersionId: "" } as never),
      ),
    };
    expect(() => assertFrozenReportingStatementIntegrity(tamperedVersion as never)).toThrow(
      "policy version integrity",
    );

    const tamperedDate = {
      ...v2,
      snapshot: { ...v2.snapshot, operationalStartDate: "not-a-date" },
      canonicalSnapshotJson: canonicalizeJson({
        ...v2.snapshot,
        operationalStartDate: "not-a-date",
      } as never),
      semanticHash: sha256CanonicalJson(
        canonicalizeJson({ ...v2.snapshot, operationalStartDate: "not-a-date" } as never),
      ),
    };
    expect(() => assertFrozenReportingStatementIntegrity(tamperedDate as never)).toThrow(
      "operational start date integrity",
    );
  });

  // L. V1 does not require V2 fields
  it("V1 does not require operationalStartPolicyVersionId or operationalStartDate", () => {
    const v1 = freezeV1();
    expect(() => assertFrozenReportingStatementIntegrity(v1)).not.toThrow();
  });

  it("changes semantic text and hash for a different pinned asOf", () => {
    const later = new Date("2026-08-24T01:02:03.005Z");
    const p = projection({ scope: { ...projection().scope, asOfInstant: later } });
    const changed = freezeV2({}, { asOfInstant: later, projection: p as never });
    expect(changed.semanticHash).not.toBe(freezeV2().semanticHash);
  });

  it("accepts only owner-consistent responsibility-present PASS with nonempty subjects", () => {
    expect(() => freezeV2({ status: "BLOCKED", counts: null })).toThrow("PASS");
    expect(() =>
      freezeV2({ responsibilityState: "ZERO_RESPONSIBILITY", responsibilityManifest: [] }),
    ).toThrow("zero-responsibility");
    expect(() => freezeV2({ responsibilityManifest: [] })).toThrow("at least one");
    expect(() => freezeV2({}, { submitterUserId: "other" })).toThrow("owner");
    expect(() =>
      freezeV2({
        scope: { ...projection().scope, asOfInstant: new Date("2026-08-24T01:02:03.005Z") },
      }),
    ).toThrow("asOfInstant");
  });

  it("rejects unsafe frozen-bundle tampering", () => {
    const good = freezeV2();
    expect(() =>
      assertFrozenReportingStatementIntegrity({ ...good, semanticHash: "0".repeat(64) } as never),
    ).toThrow("hash integrity");
    expect(() =>
      assertFrozenReportingStatementIntegrity({ ...good, frozenSubjectIds: [] } as never),
    ).toThrow("subject integrity");
  });

  it("preserves responsible ownership, actual-teacher evidence, and debt classification across the Statement freeze", () => {
    const detail = {
      schoolClassId: "class-a",
      subjectId: "subject-a",
      classification: "PROVEN_OPEN_DEBT",
      sourceCivilDate: "2026-08-10",
      sourceSlotStart: "07:00:00",
      sourceSlotEnd: "07:45:00",
      sourceNormalOccurrenceKey: "occurrence-1",
      responsibleTeacherUserId: "teacher",
      actualTeacherUserId: "substitute",
      operationalDispositionType: "SAME_SUBJECT_SUBSTITUTION",
    };
    const result = freezeV2({
      counts: {
        distributedElapsedCount: 1,
        completedCount: 0,
        openDebtCount: 1,
        lateCount: 1,
        unconfirmedGapCount: 0,
      },
      sections: [
        {
          schoolClassId: "class-a",
          subjectId: "subject-a",
          responsibilityIntervals: [],
          status: "PASS",
          counts: {
            distributedElapsedCount: 1,
            completedCount: 0,
            openDebtCount: 1,
            lateCount: 1,
            unconfirmedGapCount: 0,
          },
          details: [detail],
          findings: [],
        },
      ],
    });
    expect(result.snapshot).toMatchObject({
      submitterUserId: "teacher",
      counts: { completedCount: 0, openDebtCount: 1 },
      sections: [
        {
          details: [
            {
              classification: "PROVEN_OPEN_DEBT",
              responsibleTeacherUserId: "teacher",
              actualTeacherUserId: "substitute",
              operationalDispositionType: "SAME_SUBJECT_SUBSTITUTION",
            },
          ],
        },
      ],
    });
  });

  it("keeps generated and persistence metadata out of the explicit snapshot", () => {
    const result = freezeV2({ id: "generated", createdAt: "volatile" });
    expect(result.canonicalSnapshotJson).not.toContain("generated");
    expect(result.canonicalSnapshotJson).not.toContain("createdAt");
    expect(result.snapshot.fromCivilDate).toBe("2026-08-01");
  });

  it("normalizes non-empty canonical domain arrays without mutating callers", () => {
    const details = [
      {
        sourceCivilDate: "2026-08-02",
        sourceSlotStart: "08:00",
        sourceSlotEnd: "09:00",
        sourceNormalOccurrenceKey: "b",
      },
      {
        sourceCivilDate: "2026-08-01",
        sourceSlotStart: "09:00",
        sourceSlotEnd: "10:00",
        sourceNormalOccurrenceKey: "a",
      },
    ];
    const sections = [
      {
        schoolClassId: "z",
        subjectId: "b",
        responsibilityIntervals: [
          {
            teachingAssignmentId: "z",
            schoolClassId: "z",
            subjectId: "b",
            validFrom: "2026-08-02",
            validUntil: null,
          },
        ],
        status: "PASS",
        counts: null,
        details,
        findings: [{ code: "Z", occurrenceKey: null, reason: "z", entityIds: ["b", "a"] }],
      },
      {
        schoolClassId: "a",
        subjectId: "a",
        responsibilityIntervals: [],
        status: "PASS",
        counts: null,
        details: [],
        findings: [],
      },
    ];
    const source = projection({
      sections,
      responsibilityManifest: [
        ...projection().responsibilityManifest,
        {
          teachingAssignmentId: "ta-c",
          schoolClassId: "class-a",
          subjectId: "subject-a",
          validFrom: "2026-08-02",
          validUntil: null,
        },
      ],
    });
    const result = freezeReportingStatementSnapshot({
      statementProfile: "PERSONAL_V1",
      submitterUserId: "teacher",
      asOfInstant: asOf,
      projection: source as never,
      operationalStartPolicyVersionId: "policy-version-1",
      operationalStartDate: "2026-08-15",
    });
    expect(result.snapshot.sections.map((x) => x.schoolClassId)).toEqual(["a", "z"]);
    expect((result.snapshot.sections[1].details as never[])[0]).toMatchObject({
      sourceCivilDate: "2026-08-01",
    });
    expect((result.snapshot.sections[1].findings as never[])[0]).toMatchObject({
      entityIds: ["a", "b"],
    });
    expect(sections[0].schoolClassId).toBe("z");
    expect(details[0].sourceCivilDate).toBe("2026-08-02");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.snapshot.sections)).toBe(true);
  });

  // V3 tests
  it("freezes production V3 with exact snapshotProfile, serializerVersion, and specialProgrammeWorkload", () => {
    const workload = {
      projectionProfile: "SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1",
      status: "PASS" as const,
      totalCredit: 1.5,
      contributionCount: 1,
      contributions: [
        {
          executionId: "exec-1",
          specialActivityId: "act-1",
          specialActivityStaffingId: "staff-1",
          specialActivityTimeSlotId: "slot-1",
          programmeMasterId: "prog-1",
          programmePlanVersionId: "plan-v1",
          programmeTopicItemId: "topic-1",
          plannedProgrammeOccurrenceId: "occ-1",
          plannedOccurrenceSlotId: "pos-1",
          programmeKind: "GDDP" as const,
          occurrenceMode: "CLASS" as const,
          executionCivilDate: "2026-08-10",
          actualTeacherUserId: "teacher",
          coefficient: 1.5,
          credit: 1.5,
          policyVersionId: "sp-policy-v1",
          policyValidatorVersion: "v1",
          attestations: [
            {
              attestationId: "att-1",
              attestedByUserId: "principal",
              authorityType: "CAPABILITY" as const,
              capabilityKey: "SPECIAL_ACTIVITY_EXECUTION_ATTEST",
              scope: "SCHOOL_WIDE" as const,
              resourceId: null,
              attestedAt: "2026-08-11T00:00:00.000Z",
            },
          ],
        },
      ],
      pendingConfirmation: [],
      findings: [],
      evaluatedAt: asOf.toISOString(),
    };
    const v3 = freezeReportingStatementSnapshot({
      statementProfile: "PERSONAL_V1",
      submitterUserId: "teacher",
      asOfInstant: asOf,
      projection: projection() as never,
      operationalStartPolicyVersionId: "policy-version-1",
      operationalStartDate: "2026-08-15",
      specialProgrammeWorkload: workload as never,
    });
    expect(v3.snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V3);
    expect(v3.snapshot.serializerVersion).toBe(REPORTING_STATEMENT_SERIALIZER_V1);
    expect(v3.snapshot.operationalStartPolicyVersionId).toBe("policy-version-1");
    expect(v3.snapshot.operationalStartDate).toBe("2026-08-15");
    expect(v3.snapshot.specialProgrammeWorkload).toBeDefined();
    expect(v3.snapshot.specialProgrammeWorkload?.totalCredit).toBe(1.5);
    expect(v3.snapshot.specialProgrammeWorkload?.contributions).toHaveLength(1);
    expect(v3.canonicalSnapshotJson).toContain(`"snapshotProfile":"${REPORTING_STATEMENT_SNAPSHOT_V3}"`);
    expect(v3.canonicalSnapshotJson).toContain(`"specialProgrammeWorkload"`);
    expect(() => assertFrozenReportingStatementIntegrity(v3)).not.toThrow();
  });

  it("produces deterministic canonical JSON and semanticHash for same semantic V3 input", () => {
    const workload = {
      projectionProfile: "SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1",
      status: "PASS" as const,
      totalCredit: 0,
      contributionCount: 0,
      contributions: [],
      pendingConfirmation: [],
      findings: [],
      evaluatedAt: asOf.toISOString(),
    };
    const first = freezeReportingStatementSnapshot({
      statementProfile: "PERSONAL_V1",
      submitterUserId: "teacher",
      asOfInstant: asOf,
      projection: projection() as never,
      operationalStartPolicyVersionId: "policy-version-1",
      operationalStartDate: "2026-08-15",
      specialProgrammeWorkload: workload as never,
    });
    const second = freezeReportingStatementSnapshot({
      statementProfile: "PERSONAL_V1",
      submitterUserId: "teacher",
      asOfInstant: asOf,
      projection: projection() as never,
      operationalStartPolicyVersionId: "policy-version-1",
      operationalStartDate: "2026-08-15",
      specialProgrammeWorkload: workload as never,
    });
    expect(first.canonicalSnapshotJson).toBe(second.canonicalSnapshotJson);
    expect(first.semanticHash).toBe(second.semanticHash);
    expect(() => assertFrozenReportingStatementIntegrity(first)).not.toThrow();
  });

  it("changes semantic text and hash when workload contribution changes in V3", () => {
    const workloadA = {
      projectionProfile: "SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1",
      status: "PASS" as const,
      totalCredit: 1.0,
      contributionCount: 1,
      contributions: [
        {
          executionId: "exec-1",
          specialActivityId: "act-1",
          specialActivityStaffingId: "staff-1",
          specialActivityTimeSlotId: "slot-1",
          programmeMasterId: "prog-1",
          programmePlanVersionId: "plan-v1",
          programmeTopicItemId: "topic-1",
          plannedProgrammeOccurrenceId: "occ-1",
          plannedOccurrenceSlotId: "pos-1",
          programmeKind: "GDDP" as const,
          occurrenceMode: "CLASS" as const,
          executionCivilDate: "2026-08-10",
          actualTeacherUserId: "teacher",
          coefficient: 1.0,
          credit: 1.0,
          policyVersionId: "sp-policy-v1",
          policyValidatorVersion: "v1",
           attestations: [
             {
               attestationId: "att-1",
               attestedByUserId: "principal",
               authorityType: "CAPABILITY",
               capabilityKey: "SPECIAL_ACTIVITY_EXECUTION_ATTEST",
               scope: "SCHOOL_WIDE",
               resourceId: null,
               attestedAt: "2026-08-11T00:00:00.000Z",
             },
           ],
        },
      ],
      pendingConfirmation: [],
      findings: [],
      evaluatedAt: asOf.toISOString(),
    };
    const workloadB = {
      ...workloadA,
      totalCredit: 2.0,
      contributions: [{ ...workloadA.contributions[0], coefficient: 2.0, credit: 2.0 }],
    };
    const base = freezeReportingStatementSnapshot({
      statementProfile: "PERSONAL_V1",
      submitterUserId: "teacher",
      asOfInstant: asOf,
      projection: projection() as never,
      operationalStartPolicyVersionId: "policy-version-1",
      operationalStartDate: "2026-08-15",
      specialProgrammeWorkload: workloadA as never,
    });
    const changed = freezeReportingStatementSnapshot({
      statementProfile: "PERSONAL_V1",
      submitterUserId: "teacher",
      asOfInstant: asOf,
      projection: projection() as never,
      operationalStartPolicyVersionId: "policy-version-1",
      operationalStartDate: "2026-08-15",
      specialProgrammeWorkload: workloadB as never,
    });
    expect(changed.canonicalSnapshotJson).not.toBe(base.canonicalSnapshotJson);
    expect(changed.semanticHash).not.toBe(base.semanticHash);
  });

  it("fails closed on V3 integrity tampering with missing or malformed specialProgrammeWorkload", () => {
    const workload = {
      projectionProfile: "SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1",
      status: "PASS" as const,
      totalCredit: 0,
      contributionCount: 0,
      contributions: [],
      pendingConfirmation: [],
      findings: [],
      evaluatedAt: asOf.toISOString(),
    };
    const v3 = freezeReportingStatementSnapshot({
      statementProfile: "PERSONAL_V1",
      submitterUserId: "teacher",
      asOfInstant: asOf,
      projection: projection() as never,
      operationalStartPolicyVersionId: "policy-version-1",
      operationalStartDate: "2026-08-15",
      specialProgrammeWorkload: workload as never,
    });
    const tampered = {
      ...v3,
      snapshot: { ...v3.snapshot, specialProgrammeWorkload: null },
      canonicalSnapshotJson: canonicalizeJson({
        ...v3.snapshot,
        specialProgrammeWorkload: null,
      } as never),
      semanticHash: sha256CanonicalJson(
        canonicalizeJson({ ...v3.snapshot, specialProgrammeWorkload: null } as never),
      ),
    };
    expect(() => assertFrozenReportingStatementIntegrity(tampered as never)).toThrow(
      "special programme workload integrity",
    );
  });

  it("rejects null, mismatched, or non-reconciling V3 totals before freezing", () => {
    const baseWorkload = {
      projectionProfile: "SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1",
      status: "PASS" as const,
      totalCredit: 0,
      contributionCount: 0,
      contributions: [],
      pendingConfirmation: [],
      evaluatedAt: asOf.toISOString(),
    };
    const freeze = (workload: unknown) =>
      freezeReportingStatementSnapshot({
        statementProfile: "PERSONAL_V1",
        submitterUserId: "teacher",
        asOfInstant: asOf,
        projection: projection() as never,
        operationalStartPolicyVersionId: "policy-version-1",
        operationalStartDate: "2026-08-15",
        specialProgrammeWorkload: workload as never,
      });

    expect(() => freeze({ ...baseWorkload, totalCredit: null })).toThrow();
    expect(() => freeze({ ...baseWorkload, totalCredit: 1 })).toThrow();
    expect(() => freeze({ ...baseWorkload, contributionCount: 1 })).toThrow();
  });
});
