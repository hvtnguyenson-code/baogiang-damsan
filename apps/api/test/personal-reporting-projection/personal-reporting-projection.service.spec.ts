import { Prisma } from "@prisma/client";
import { PersonalReportingProjectionService } from "../../src/personal-reporting-projection/personal-reporting-projection.service";
import {
  ReportingDetail,
  ReportingProjection,
  ReportingRootProjection,
} from "../../src/reporting-projection/reporting-projection.types";

const AS_OF = new Date("2026-08-31T10:00:00.000Z");
const NOW = new Date("2026-08-31T11:00:00.000Z");
const input = {
  academicYearId: "year",
  targetUserId: "teacher",
  fromCivilDate: "2026-08-01" as never,
  toCivilDate: "2026-08-31" as never,
  asOfInstant: AS_OF,
};

type Assignment = {
  id: string;
  academicYearId: string;
  schoolClassId: string;
  subjectId: string;
  teacherUserId: string;
  validFrom: Date;
  validUntil: Date | null;
};

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: "assignment",
    academicYearId: "year",
    schoolClassId: "class-a",
    subjectId: "subject-a",
    teacherUserId: "teacher",
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validUntil: new Date("2026-08-31T00:00:00.000Z"),
    ...overrides,
  };
}

function makeDetail(overrides: Partial<ReportingDetail> = {}): ReportingDetail {
  return {
    academicYearId: "year",
    schoolClassId: "class-a",
    subjectId: "subject-a",
    classification: "COMPLETED",
    sourceNormalOccurrenceKey: "occurrence-1",
    originalTimetableVersionId: "tv",
    originalTimetableEntryId: "entry",
    sourceCivilDate: "2026-08-10" as never,
    sourceAcademicCalendarVersionId: "calendar",
    sourceTimeSlotDefinitionId: "slot",
    sourceSlotStart: "07:00:00",
    sourceSlotEnd: "07:45:00",
    originalTeachingAssignmentId: "assignment",
    responsibleTeacherUserId: "teacher",
    ppctClassAssociationId: "association",
    ppctPlanId: "plan",
    ppctVersionId: "version",
    ppctItemId: "item",
    ppctItemRevisionId: "revision",
    operationalLessonDispositionId: null,
    operationalDispositionType: null,
    fulfillmentExecutionId: "execution",
    fulfillmentKind: "NORMAL",
    makeupTeachingScheduleId: null,
    executionCivilDate: "2026-08-10" as never,
    executionAcademicCalendarVersionId: "calendar",
    executionTimeSlotDefinitionId: "slot",
    actualTeacherUserId: "teacher",
    ...overrides,
  };
}

function makePassRoot(
  schoolClassId = "class-a",
  subjectId = "subject-a",
  details: ReportingDetail[] = [makeDetail()],
): ReportingRootProjection {
  return {
    scope: { schoolClassId, subjectId },
    status: "PASS",
    counts: null,
    details,
    findings: [],
  };
}

function makeBlockedRoot(
  code: "SOURCE_TIME_SLOT_PROVENANCE_MISSING" = "SOURCE_TIME_SLOT_PROVENANCE_MISSING",
  schoolClassId = "class-a",
  subjectId = "subject-a",
): ReportingRootProjection {
  return {
    scope: { schoolClassId, subjectId },
    status: "BLOCKED",
    counts: null,
    details: [],
    findings: [
      {
        severity: "BLOCKER",
        code,
        reason: "blocked",
        entityIds: ["source"],
        occurrenceKey: null,
      },
    ],
  };
}

function makeProjection(roots: ReportingRootProjection[]): ReportingProjection {
  return {
    profile: "TEACHING_REPORTING_PROJECTION_V1",
    scope: { ...input, roots: roots.map((r) => r.scope) },
    status: roots.some((r) => r.status === "BLOCKED") ? "BLOCKED" : "PASS",
    counts: null,
    roots,
    evaluatedAt: NOW.toISOString(),
  };
}

function makeHarness(
  assignments: Assignment[] = [makeAssignment()],
  roots?: ReportingRootProjection[],
) {
  const academicYearFindUnique = jest.fn().mockResolvedValue({ id: "year" });
  const userFindUnique = jest.fn().mockResolvedValue({ id: "teacher" });
  const calendarFindFirst = jest.fn().mockResolvedValue({
    startDate: new Date("2026-08-01T00:00:00.000Z"),
    endDate: new Date("2026-08-31T00:00:00.000Z"),
  });
  const assignmentFindMany = jest.fn().mockResolvedValue(assignments);
  const tx = {
    academicYear: { findUnique: academicYearFindUnique },
    user: { findUnique: userFindUnique },
    academicCalendarVersion: { findFirst: calendarFindFirst },
    teachingAssignment: { findMany: assignmentFindMany },
  };
  const transaction = jest.fn(
    async (callback: (client: typeof tx) => unknown) => callback(tx),
  );
  const prisma = { $transaction: transaction };
  const resolve = jest.fn();
  const defaultRoots = roots ?? [makePassRoot()];
  const resolveInTransaction = jest
    .fn()
    .mockResolvedValue(makeProjection(defaultRoots));
  const reporting = { resolve, resolveInTransaction };
  const clock = { now: jest.fn().mockReturnValue(NOW) };
  const service = new PersonalReportingProjectionService(
    prisma as never,
    reporting as never,
    clock,
  );
  return {
    service,
    tx,
    prisma,
    reporting,
    clock,
    academicYearFindUnique,
    userFindUnique,
    calendarFindFirst,
    assignmentFindMany,
    resolveInTransaction,
  };
}

describe("PersonalReportingProjectionService R1-R28", () => {
  it("R1/R12/R13/R14/R15/R17/R18/R28 composes target details and reconciles classifications", async () => {
    const details = [
      makeDetail({
        sourceNormalOccurrenceKey: "1",
        fulfillmentKind: "NORMAL",
        actualTeacherUserId: "other",
      }),
      makeDetail({
        sourceNormalOccurrenceKey: "2",
        operationalDispositionType: "SAME_SUBJECT_SUBSTITUTION",
        actualTeacherUserId: "other",
      }),
      makeDetail({
        sourceNormalOccurrenceKey: "3",
        fulfillmentKind: "MAKEUP",
        actualTeacherUserId: "other",
        executionCivilDate: "2026-09-05" as never,
      }),
      makeDetail({
        sourceNormalOccurrenceKey: "4",
        classification: "PROVEN_OPEN_DEBT",
      }),
      makeDetail({
        sourceNormalOccurrenceKey: "5",
        classification: "UNCONFIRMED_COMPLETION_GAP",
      }),
    ];
    const h = makeHarness(undefined, [
      makePassRoot("class-a", "subject-a", details),
    ]);
    const result = await h.service.resolve(input);
    expect(result.status).toBe("PASS");
    expect(result.counts).toEqual({
      distributedElapsedCount: 5,
      completedCount: 3,
      openDebtCount: 1,
      lateCount: 1,
      unconfirmedGapCount: 1,
    });
    expect(result.sections[0].details).toHaveLength(5);
  });

  it("R2 keeps target from inclusive validFrom, filters prior other owner, and blocks target before interval", async () => {
    const assignment = makeAssignment({
      validFrom: new Date("2026-08-15T00:00:00.000Z"),
    });
    const priorOther = makeDetail({
      sourceNormalOccurrenceKey: "prior",
      sourceCivilDate: "2026-08-10" as never,
      responsibleTeacherUserId: "other",
      originalTeachingAssignmentId: "other-assignment",
    });
    const target = makeDetail({
      sourceNormalOccurrenceKey: "target",
      sourceCivilDate: "2026-08-15" as never,
    });
    const good = makeHarness(
      [assignment],
      [makePassRoot("class-a", "subject-a", [priorOther, target])],
    );
    expect(
      (await good.service.resolve(input)).sections[0].details.map(
        (d) => d.sourceNormalOccurrenceKey,
      ),
    ).toEqual(["target"]);
    const bad = makeHarness(
      [assignment],
      [
        makePassRoot("class-a", "subject-a", [
          makeDetail({ sourceCivilDate: "2026-08-14" as never }),
        ]),
      ],
    );
    expect(
      (await bad.service.resolve(input)).sections[0].findings[0].code,
    ).toBe("RESPONSIBLE_TEACHER_PROVENANCE_MISMATCH");
  });

  it("R3 keeps target through inclusive validUntil, filters later other owner, and blocks target after interval", async () => {
    const assignment = makeAssignment({
      validUntil: new Date("2026-08-15T00:00:00.000Z"),
    });
    const target = makeDetail({ sourceCivilDate: "2026-08-15" as never });
    const laterOther = makeDetail({
      sourceNormalOccurrenceKey: "later",
      sourceCivilDate: "2026-08-20" as never,
      responsibleTeacherUserId: "other",
      originalTeachingAssignmentId: "other-assignment",
    });
    const good = makeHarness(
      [assignment],
      [makePassRoot("class-a", "subject-a", [target, laterOther])],
    );
    expect(
      (await good.service.resolve(input)).sections[0].details,
    ).toHaveLength(1);
    const bad = makeHarness(
      [assignment],
      [
        makePassRoot("class-a", "subject-a", [
          makeDetail({ sourceCivilDate: "2026-08-16" as never }),
        ]),
      ],
    );
    expect((await bad.service.resolve(input)).status).toBe("BLOCKED");
  });

  it("R4/R22 retains sorted disjoint intervals under one root with unique occurrences", async () => {
    const assignments = [
      makeAssignment({
        id: "b",
        validFrom: new Date("2026-08-20"),
        validUntil: null,
      }),
      makeAssignment({
        id: "a",
        validFrom: new Date("2026-08-01"),
        validUntil: new Date("2026-08-10"),
      }),
    ];
    const details = [
      makeDetail({
        originalTeachingAssignmentId: "b",
        sourceCivilDate: "2026-08-20" as never,
        sourceNormalOccurrenceKey: "b",
      }),
      makeDetail({
        originalTeachingAssignmentId: "a",
        sourceCivilDate: "2026-08-01" as never,
        sourceNormalOccurrenceKey: "a",
      }),
    ];
    const h = makeHarness(assignments, [
      makePassRoot("class-a", "subject-a", details),
    ]);
    const result = await h.service.resolve(input);
    expect(h.resolveInTransaction.mock.calls[0][1].roots).toHaveLength(1);
    expect(
      result.responsibilityManifest.map((x) => x.teachingAssignmentId),
    ).toEqual(["a", "b"]);
    expect(
      result.sections[0].details.map((x) => x.sourceNormalOccurrenceKey),
    ).toEqual(["a", "b"]);
  });

  it("R5/R9/R19 filters canonical details owned by another teacher without current rebind", async () => {
    const other = makeDetail({
      responsibleTeacherUserId: "other",
      originalTeachingAssignmentId: "other-assignment",
    });
    const h = makeHarness(undefined, [
      makePassRoot("class-a", "subject-a", [other]),
    ]);
    const result = await h.service.resolve(input);
    expect(result.responsibilityState).toBe("RESPONSIBILITY_PRESENT");
    expect(result.sections[0]).toMatchObject({
      status: "PASS",
      details: [],
      counts: { distributedElapsedCount: 0 },
    });
    expect(h.assignmentFindMany).toHaveBeenCalledTimes(1);
  });

  it("R6/R7/R27 deterministically orders shuffled manifest, roots, sections, and details", async () => {
    const assignments = [
      makeAssignment({
        id: "z",
        schoolClassId: "class-b",
        subjectId: "subject-a",
      }),
      makeAssignment({
        id: "y",
        schoolClassId: "class-a",
        subjectId: "subject-b",
      }),
      makeAssignment({
        id: "x",
        schoolClassId: "class-a",
        subjectId: "subject-a",
      }),
    ];
    const roots = [
      makePassRoot("class-b", "subject-a", [
        makeDetail({
          schoolClassId: "class-b",
          sourceNormalOccurrenceKey: "z",
          sourceCivilDate: "2026-08-20" as never,
          originalTeachingAssignmentId: "z",
        }),
      ]),
      makePassRoot("class-a", "subject-b", [
        makeDetail({
          subjectId: "subject-b",
          sourceNormalOccurrenceKey: "y",
          originalTeachingAssignmentId: "y",
        }),
      ]),
      makePassRoot("class-a", "subject-a", [
        makeDetail({
          sourceNormalOccurrenceKey: "b",
          sourceCivilDate: "2026-08-11" as never,
          originalTeachingAssignmentId: "x",
        }),
        makeDetail({
          sourceNormalOccurrenceKey: "a",
          sourceCivilDate: "2026-08-10" as never,
          originalTeachingAssignmentId: "x",
        }),
      ]),
    ];
    const result = await makeHarness(assignments, roots).service.resolve(input);
    expect(
      result.sections.map((x) => x.schoolClassId + ":" + x.subjectId),
    ).toEqual(["class-a:subject-a", "class-a:subject-b", "class-b:subject-a"]);
    expect(
      result.sections[0].details.map((x) => x.sourceNormalOccurrenceKey),
    ).toEqual(["a", "b"]);
  });

  it("R8 returns RESPONSIBILITY_PRESENT PASS zero section for empty canonical root", async () => {
    const result = await makeHarness(undefined, [
      makePassRoot("class-a", "subject-a", []),
    ]).service.resolve(input);
    expect(result).toMatchObject({
      responsibilityState: "RESPONSIBILITY_PRESENT",
      status: "PASS",
      counts: { distributedElapsedCount: 0 },
      sections: [
        { status: "PASS", details: [], counts: { distributedElapsedCount: 0 } },
      ],
    });
  });

  it("R10/R20 preserves authoritative upstream blocker and nulls combined counts", async () => {
    const result = await makeHarness(undefined, [
      makeBlockedRoot(),
    ]).service.resolve(input);
    expect(result).toMatchObject({
      status: "BLOCKED",
      counts: null,
      sections: [
        {
          status: "BLOCKED",
          counts: null,
          details: [],
          findings: [{ code: "SOURCE_TIME_SLOT_PROVENANCE_MISSING" }],
        },
      ],
    });
  });

  it("R11 sends exactly discovered roots once and never calls reporting.resolve", async () => {
    const h = makeHarness();
    await h.service.resolve(input);
    expect(h.resolveInTransaction).toHaveBeenCalledTimes(1);
    expect(h.resolveInTransaction.mock.calls[0][1].roots).toEqual([
      { schoolClassId: "class-a", subjectId: "subject-a" },
    ]);
    expect(h.reporting.resolve).not.toHaveBeenCalled();
  });

  it("R16 does not manufacture source-outside detail absent from canonical Reporting output", async () => {
    const result = await makeHarness(undefined, [
      makePassRoot("class-a", "subject-a", []),
    ]).service.resolve(input);
    expect(result.sections[0].details).toEqual([]);
  });

  it("R21 returns authoritative ZERO_RESPONSIBILITY only after validation", async () => {
    const h = makeHarness([]);
    const result = await h.service.resolve(input);
    expect(result).toMatchObject({
      status: "PASS",
      responsibilityState: "ZERO_RESPONSIBILITY",
      counts: {
        distributedElapsedCount: 0,
        completedCount: 0,
        openDebtCount: 0,
        lateCount: 0,
        unconfirmedGapCount: 0,
      },
      responsibilityManifest: [],
      sections: [],
      findings: [],
    });
    expect(h.resolveInTransaction).not.toHaveBeenCalled();
    expect(h.academicYearFindUnique).toHaveBeenCalled();
    expect(h.userFindUnique).toHaveBeenCalled();
    expect(h.calendarFindFirst).toHaveBeenCalled();
  });

  it.each([
    ["A", makeDetail({ originalTeachingAssignmentId: "other-assignment" })],
    ["B", makeDetail({ responsibleTeacherUserId: "other" })],
    ["C", makeDetail({ sourceCivilDate: "2026-09-01" as never })],
  ])(
    "R23%s blocks two-way/date-effective retained provenance mismatch",
    async (_case, detail) => {
      const result = await makeHarness(undefined, [
        makePassRoot("class-a", "subject-a", [detail]),
      ]).service.resolve(input);
      expect(result.sections[0].findings[0].code).toBe(
        "RESPONSIBLE_TEACHER_PROVENANCE_MISMATCH",
      );
    },
  );

  it("R24 retains trusted PASS section while whole result is BLOCKED", async () => {
    const assignments = [
      makeAssignment({ id: "a", schoolClassId: "class-a" }),
      makeAssignment({ id: "b", schoolClassId: "class-b" }),
    ];
    const roots = [
      makePassRoot("class-a", "subject-a", [
        makeDetail({ originalTeachingAssignmentId: "a" }),
      ]),
      makeBlockedRoot(
        "SOURCE_TIME_SLOT_PROVENANCE_MISSING",
        "class-b",
        "subject-a",
      ),
    ];
    const result = await makeHarness(assignments, roots).service.resolve(input);
    expect(result.status).toBe("BLOCKED");
    expect(result.counts).toBeNull();
    expect(result.sections[0]).toMatchObject({
      status: "PASS",
      counts: { completedCount: 1 },
    });
  });

  it("R25 resolve uses exactly one RepeatableRead transaction, same tx, and unchanged asOf", async () => {
    const h = makeHarness();
    await h.service.resolve(input);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
    expect(h.resolveInTransaction).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ asOfInstant: AS_OF }),
    );
  });

  it("R26 resolveInTransaction does not open a nested transaction", async () => {
    const h = makeHarness();
    await h.service.resolveInTransaction(h.tx as never, input);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("R28 reports duplicate occurrence before aggregate classification failure", async () => {
    const duplicate = makeDetail({ classification: "COMPLETED" });
    const h = makeHarness(undefined, [
      makePassRoot("class-a", "subject-a", [duplicate, { ...duplicate }]),
    ]);
    const result = await h.service.resolve(input);
    expect(result.sections[0].findings[0].code).toBe(
      "DUPLICATE_PERSONAL_OCCURRENCE",
    );
  });

  it("R28 fails closed for unknown runtime classification", async () => {
    const unknown = makeDetail({ classification: "UNKNOWN" as never });
    const result = await makeHarness(undefined, [
      makePassRoot("class-a", "subject-a", [unknown]),
    ]).service.resolve(input);
    expect(result.sections[0].findings[0].code).toBe(
      "PERSONAL_AGGREGATE_RECONCILIATION_FAILED",
    );
  });
});

describe("PersonalReportingProjectionService V1-V20 validation", () => {
  it("V1 rejects inverted range", async () => {
    await expect(
      makeHarness([]).service.resolve({
        ...input,
        fromCivilDate: "2026-09-01" as never,
      }),
    ).rejects.toThrow("fromCivilDate");
  });
  it("V2 rejects invalid asOf", async () => {
    await expect(
      makeHarness([]).service.resolve({
        ...input,
        asOfInstant: new Date("invalid"),
      }),
    ).rejects.toThrow("asOfInstant");
  });
  it("V3 rejects future asOf", async () => {
    await expect(
      makeHarness([]).service.resolve({
        ...input,
        asOfInstant: new Date("2026-09-01"),
      }),
    ).rejects.toThrow("future");
  });
  it("V4 rejects missing academicYear", async () => {
    const h = makeHarness([]);
    h.academicYearFindUnique.mockResolvedValue(null);
    await expect(h.service.resolve(input)).rejects.toThrow("academicYearId");
  });
  it("V5 rejects missing target user", async () => {
    const h = makeHarness([]);
    h.userFindUnique.mockResolvedValue(null);
    await expect(h.service.resolve(input)).rejects.toThrow("targetUserId");
  });
  it("V6 rejects missing active calendar", async () => {
    const h = makeHarness([]);
    h.calendarFindFirst.mockResolvedValue(null);
    await expect(h.service.resolve(input)).rejects.toThrow(
      "active AcademicYear",
    );
  });
  it.each([
    [
      "V7 before calendar",
      { startDate: new Date("2026-08-02"), endDate: new Date("2026-08-31") },
    ],
    [
      "V8 after calendar",
      { startDate: new Date("2026-08-01"), endDate: new Date("2026-08-30") },
    ],
  ])("%s rejects out-of-calendar range", async (_name, calendar) => {
    const h = makeHarness([]);
    h.calendarFindFirst.mockResolvedValue(calendar);
    await expect(h.service.resolve(input)).rejects.toThrow("wholly within");
  });
  it("V9 requires user existence only, without status/role fields", async () => {
    const h = makeHarness([]);
    await expect(h.service.resolve(input)).resolves.toMatchObject({
      status: "PASS",
    });
    expect(h.userFindUnique).toHaveBeenCalledWith({
      where: { id: "teacher" },
      select: { id: true },
    });
  });

  it.each([
    ["V10 wrong year", makeAssignment({ academicYearId: "wrong" })],
    ["V11 wrong teacher", makeAssignment({ teacherUserId: "wrong" })],
    ["V12 empty assignment id", makeAssignment({ id: "" })],
    ["V12 empty class id", makeAssignment({ schoolClassId: "" })],
    ["V12 empty subject id", makeAssignment({ subjectId: "" })],
    [
      "V13 invalid validFrom",
      makeAssignment({ validFrom: new Date("invalid") }),
    ],
    [
      "V13 invalid validUntil",
      makeAssignment({ validUntil: new Date("invalid") }),
    ],
    [
      "V14 inverted assignment",
      makeAssignment({
        validFrom: new Date("2026-08-20"),
        validUntil: new Date("2026-08-10"),
      }),
    ],
    [
      "V15 outside request",
      makeAssignment({
        validFrom: new Date("2026-07-01"),
        validUntil: new Date("2026-07-31"),
      }),
    ],
  ])(
    "%s fails closed before canonical reporting",
    async (_name, assignment) => {
      const h = makeHarness([assignment]);
      const result = await h.service.resolve(input);
      expect(result.findings[0].code).toBe(
        "RESPONSIBILITY_SCOPE_PROVENANCE_INVALID",
      );
      expect(h.resolveInTransaction).not.toHaveBeenCalled();
    },
  );

  it("V16 rejects duplicate TeachingAssignment IDs", async () => {
    const h = makeHarness([makeAssignment(), makeAssignment()]);
    expect((await h.service.resolve(input)).findings[0].code).toBe(
      "RESPONSIBILITY_SCOPE_PROVENANCE_INVALID",
    );
  });

  it.each([
    ["V17 missing root", []],
    [
      "V18 extra root",
      [makePassRoot(), makePassRoot("class-extra", "subject-a", [])],
    ],
    ["V19 duplicate root", [makePassRoot(), makePassRoot()]],
  ])("%s fails closed after the one canonical call", async (_name, roots) => {
    const h = makeHarness(undefined, roots);
    const result = await h.service.resolve(input);
    expect(result.findings[0].code).toBe(
      "RESPONSIBILITY_SCOPE_PROVENANCE_INVALID",
    );
    expect(h.resolveInTransaction).toHaveBeenCalledTimes(1);
  });

  it("V20 zero scope never bypasses base validation", async () => {
    const h = makeHarness([]);
    h.academicYearFindUnique.mockResolvedValue(null);
    await expect(h.service.resolve(input)).rejects.toThrow("academicYearId");
    expect(h.resolveInTransaction).not.toHaveBeenCalled();
  });
});
