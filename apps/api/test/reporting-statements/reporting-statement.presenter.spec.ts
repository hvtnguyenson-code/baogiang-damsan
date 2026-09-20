import { InternalServerErrorException } from '@nestjs/common';
import {
  freezeReportingStatementSnapshot,
  freezeReportingStatementSnapshotV1,
  canonicalizeJson,
  REPORTING_STATEMENT_SERIALIZER_V1,
  REPORTING_STATEMENT_SNAPSHOT_V1,
  REPORTING_STATEMENT_SNAPSHOT_V2,
  sha256CanonicalJson,
} from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';
import {
  FrozenRevisionRow,
  mapToPublicFinding,
  parseAndVerifyFrozenSnapshot,
  presentReportingStatementDetail,
  presentReportingStatementSummary,
  PUBLIC_PRESENTATION_INTEGRITY_ERROR,
} from '../../src/reporting-statements/reporting-statement.presenter';

const asOf = new Date('2026-08-25T10:20:30.400Z');

function createProjection(ownerId: string, subjectIds: string[]) {
  return {
    profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1' as const,
    scope: {
      academicYearId: 'year-1',
      targetUserId: ownerId,
      fromCivilDate: '2026-08-01' as const,
      toCivilDate: '2026-08-31' as const,
      asOfInstant: asOf,
    },
    responsibilityState: 'RESPONSIBILITY_PRESENT' as const,
    status: 'PASS' as const,
    counts: {
      distributedElapsedCount: 4,
      completedCount: 4,
      openDebtCount: 0,
      lateCount: 0,
      unconfirmedGapCount: 0,
    },
    responsibilityManifest: subjectIds.map((subjectId, index) => ({
      teachingAssignmentId: `assignment-${index}`,
      schoolClassId: `class-${index}`,
      subjectId,
      validFrom: '2026-08-01' as const,
      validUntil: null,
    })),
    sections: subjectIds.map((subjectId, index) => ({
      schoolClassId: `class-${index}`,
      subjectId,
      responsibilityIntervals: [
        {
          teachingAssignmentId: `assignment-${index}`,
          schoolClassId: `class-${index}`,
          subjectId,
          validFrom: '2026-08-01' as const,
          validUntil: null,
        },
      ],
      status: 'PASS' as const,
      counts: {
        distributedElapsedCount: 2,
        completedCount: 2,
        openDebtCount: 0,
        lateCount: 0,
        unconfirmedGapCount: 0,
      },
      details: [
        {
          academicYearId: 'year-1',
          schoolClassId: `class-${index}`,
          subjectId,
          classification: 'COMPLETED' as const,
          sourceNormalOccurrenceKey: `occ-${index}`,
          originalTimetableVersionId: 'tt-v1',
          originalTimetableEntryId: 'tt-e1',
          sourceCivilDate: '2026-08-10',
          sourceAcademicCalendarVersionId: 'cal-v1',
          sourceTimeSlotDefinitionId: 'slot-1',
          sourceSlotStart: '07:00:00',
          sourceSlotEnd: '07:45:00',
          originalTeachingAssignmentId: `assignment-${index}`,
          responsibleTeacherUserId: ownerId,
          ppctClassAssociationId: 'ppct-a1',
          ppctPlanId: 'ppct-p1',
          ppctVersionId: 'ppct-v1',
          ppctItemId: 'item-1',
          ppctItemRevisionId: 'rev-1',
          operationalLessonDispositionId: null,
          operationalDispositionType: null,
          fulfillmentExecutionId: `exec-${index}`,
          fulfillmentKind: 'NORMAL' as const,
          makeupTeachingScheduleId: null,
          executionCivilDate: '2026-08-10',
          executionAcademicCalendarVersionId: 'cal-v1',
          executionTimeSlotDefinitionId: 'slot-1',
          actualTeacherUserId: ownerId,
        },
      ],
      findings: [],
    })),
    findings: [],
    evaluatedAt: asOf.toISOString(),
  };
}

function createValidFrozenFixtureV2(ownerId = 'user-1', subjectIds = ['sub-a', 'sub-b']) {
  const frozen = freezeReportingStatementSnapshot({
    statementProfile: 'PERSONAL_REPORTING_STATEMENT_V1',
    submitterUserId: ownerId,
    submitterDisplayNameSnapshot: 'Nguyen Van A',
    submitterStaffCodeSnapshot: 'GV001',
    asOfInstant: asOf,
    projection: createProjection(ownerId, subjectIds) as never,
    operationalStartPolicyVersionId: 'policy-version-1',
    operationalStartDate: '2026-08-15',
  });

  const row: FrozenRevisionRow = {
    id: 'revision-uuid-1',
    seriesId: 'series-uuid-1',
    snapshotProfile: frozen.snapshot.snapshotProfile,
    serializerVersion: frozen.snapshot.serializerVersion,
    canonicalSnapshotJson: frozen.canonicalSnapshotJson,
    semanticHash: frozen.semanticHash,
    asOfInstant: asOf,
    submitterDisplayNameSnapshot: 'Nguyen Van A',
    submitterStaffCodeSnapshot: 'GV001',
    submittedAt: new Date('2026-08-25T10:25:00.000Z'),
    predecessorRevisionId: null,
    supersedesRevisionId: null,
    series: {
      statementProfile: 'PERSONAL_REPORTING_STATEMENT_V1',
      submitterUserId: ownerId,
      academicYearId: 'year-1',
      fromCivilDate: new Date('2026-08-01'),
      toCivilDate: new Date('2026-08-31'),
    },
    state: {
      lifecycleState: 'SUBMITTED' as const,
      lifecycleToken: 'token-uuid-1',
    },
    subjects: subjectIds.map((subjectId) => ({ subjectId })),
    historyEntries: [
      {
        id: 'hist-1',
        eventType: 'SUBMITTED',
        stateBefore: null,
        stateAfter: 'SUBMITTED',
        actorUserId: ownerId,
        actorDisplayNameSnapshot: 'Nguyen Van A',
        actorStaffCodeSnapshot: 'GV001',
        createdAt: new Date('2026-08-25T10:25:00.000Z'),
        causedByRevisionId: null,
      },
    ],
  };

  return { frozen, row };
}

function createValidFrozenFixtureV1(ownerId = 'user-1', subjectIds = ['sub-a', 'sub-b']) {
  const frozen = freezeReportingStatementSnapshotV1({
    statementProfile: 'PERSONAL_REPORTING_STATEMENT_V1',
    submitterUserId: ownerId,
    submitterDisplayNameSnapshot: 'Nguyen Van A',
    submitterStaffCodeSnapshot: 'GV001',
    asOfInstant: asOf,
    projection: createProjection(ownerId, subjectIds) as never,
  });

  const row: FrozenRevisionRow = {
    id: 'revision-uuid-v1',
    seriesId: 'series-uuid-1',
    snapshotProfile: frozen.snapshot.snapshotProfile,
    serializerVersion: frozen.snapshot.serializerVersion,
    canonicalSnapshotJson: frozen.canonicalSnapshotJson,
    semanticHash: frozen.semanticHash,
    asOfInstant: asOf,
    submitterDisplayNameSnapshot: 'Nguyen Van A',
    submitterStaffCodeSnapshot: 'GV001',
    submittedAt: new Date('2026-08-25T10:25:00.000Z'),
    predecessorRevisionId: null,
    supersedesRevisionId: null,
    series: {
      statementProfile: 'PERSONAL_REPORTING_STATEMENT_V1',
      submitterUserId: ownerId,
      academicYearId: 'year-1',
      fromCivilDate: new Date('2026-08-01'),
      toCivilDate: new Date('2026-08-31'),
    },
    state: {
      lifecycleState: 'SUBMITTED' as const,
      lifecycleToken: 'token-uuid-v1',
    },
    subjects: subjectIds.map((subjectId) => ({ subjectId })),
    historyEntries: [
      {
        id: 'hist-v1',
        eventType: 'SUBMITTED',
        stateBefore: null,
        stateAfter: 'SUBMITTED',
        actorUserId: ownerId,
        actorDisplayNameSnapshot: 'Nguyen Van A',
        actorStaffCodeSnapshot: 'GV001',
        createdAt: new Date('2026-08-25T10:25:00.000Z'),
        causedByRevisionId: null,
      },
    ],
  };

  return { frozen, row };
}

function createValidFrozenFixtureV3(ownerId = 'user-1', subjectIds = ['sub-a', 'sub-b']) {
  const workload = {
    projectionProfile: 'SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1',
    status: 'PASS' as const,
    totalCredit: 1.5,
    contributionCount: 1,
    contributions: [
      {
        executionId: 'exec-1',
        specialActivityId: 'act-1',
        specialActivityStaffingId: 'staff-1',
        specialActivityTimeSlotId: 'slot-1',
        programmeMasterId: 'prog-1',
        programmePlanVersionId: 'plan-v1',
        programmeTopicItemId: 'topic-1',
        plannedProgrammeOccurrenceId: 'occ-1',
        plannedOccurrenceSlotId: 'pos-1',
        programmeKind: 'GDDP' as const,
        occurrenceMode: 'CLASS' as const,
        executionCivilDate: '2026-08-10',
        actualTeacherUserId: ownerId,
        coefficient: 1.5,
        credit: 1.5,
        policyVersionId: 'sp-policy-v1',
        policyValidatorVersion: 'v1',
        attestations: [
          {
            attestationId: 'att-1',
            attestedByUserId: 'principal',
            authorityType: 'CAPABILITY' as const,
            capabilityKey: 'SPECIAL_ACTIVITY_EXECUTION_ATTEST',
            scope: 'SCHOOL_WIDE' as const,
            resourceId: null,
            attestedAt: '2026-08-11T00:00:00.000Z',
          },
        ],
      },
    ],
    pendingConfirmation: [],
    findings: [],
    evaluatedAt: asOf.toISOString(),
  };

  const frozen = freezeReportingStatementSnapshot({
    statementProfile: 'PERSONAL_REPORTING_STATEMENT_V1',
    submitterUserId: ownerId,
    submitterDisplayNameSnapshot: 'Nguyen Van A',
    submitterStaffCodeSnapshot: 'GV001',
    asOfInstant: asOf,
    projection: createProjection(ownerId, subjectIds) as never,
    operationalStartPolicyVersionId: 'policy-version-1',
    operationalStartDate: '2026-08-15',
    specialProgrammeWorkload: workload as never,
  });

  const row: FrozenRevisionRow = {
    id: 'revision-uuid-v3',
    seriesId: 'series-uuid-1',
    snapshotProfile: frozen.snapshot.snapshotProfile,
    serializerVersion: frozen.snapshot.serializerVersion,
    canonicalSnapshotJson: frozen.canonicalSnapshotJson,
    semanticHash: frozen.semanticHash,
    asOfInstant: asOf,
    submitterDisplayNameSnapshot: 'Nguyen Van A',
    submitterStaffCodeSnapshot: 'GV001',
    submittedAt: new Date('2026-08-25T10:25:00.000Z'),
    predecessorRevisionId: null,
    supersedesRevisionId: null,
    series: {
      statementProfile: 'PERSONAL_REPORTING_STATEMENT_V1',
      submitterUserId: ownerId,
      academicYearId: 'year-1',
      fromCivilDate: new Date('2026-08-01'),
      toCivilDate: new Date('2026-08-31'),
    },
    state: {
      lifecycleState: 'SUBMITTED' as const,
      lifecycleToken: 'token-uuid-1',
    },
    subjects: subjectIds.map((subjectId) => ({ subjectId })),
    historyEntries: [
      {
        id: 'hist-1',
        eventType: 'SUBMITTED',
        stateBefore: null,
        stateAfter: 'SUBMITTED',
        actorUserId: ownerId,
        actorDisplayNameSnapshot: 'Nguyen Van A',
        actorStaffCodeSnapshot: 'GV001',
        createdAt: new Date('2026-08-25T10:25:00.000Z'),
        causedByRevisionId: null,
      },
    ],
  };

  return { frozen, row };
}

describe('Reporting Statement Presenter & Integrity', () => {
  describe('mapToPublicFinding', () => {
    it.each([
      ['RECONCILIATION_REQUIRED', 'Cần đối soát lại dữ liệu phân bổ và tiến độ giảng dạy.'],
      ['ACTIVE_FULFILLMENT_AMBIGUOUS', 'Tồn tại nhiều ghi nhận thực hiện bài dạy chưa thể xác định duy nhất.'],
      ['OPERATIONAL_MEANING_UNCLASSIFIABLE', 'Không thể phân loại trạng thái bài dạy từ dữ liệu vận hành.'],
      ['UPSTREAM_ALLOCATION_BLOCKED', 'Tiến trình phân bổ PPCT từ hệ thống nguồn đang bị chặn.'],
      ['SOURCE_TIME_SLOT_PROVENANCE_MISSING', 'Thiếu thông tin nguồn tiết học hoặc khung giờ giảng dạy.'],
      ['RESPONSIBILITY_SCOPE_PROVENANCE_INVALID', 'Khoảng thời gian phân công phụ trách giảng dạy không hợp lệ.'],
      ['RESPONSIBLE_TEACHER_PROVENANCE_MISMATCH', 'Giáo viên phụ trách trong dữ liệu không trùng khớp với phân công.'],
      ['DUPLICATE_PERSONAL_OCCURRENCE', 'Phát hiện tiết dạy bị trùng lặp trong kỳ báo cáo cá nhân.'],
      ['PERSONAL_AGGREGATE_RECONCILIATION_FAILED', 'Không thể tổng hợp số liệu báo cáo giảng dạy cá nhân một cách nhất quán.'],
    ] as const)('maps %s to product-safe Vietnamese copy', (code, expectedMessage) => {
      const publicFinding = mapToPublicFinding({ code });
      expect(publicFinding).toEqual({
        severity: 'BLOCKER',
        code,
        message: expectedMessage,
      });
      expect(publicFinding).not.toHaveProperty('reason');
      expect(publicFinding).not.toHaveProperty('entityIds');
    });

    it('fails closed and throws sanitized InternalServerErrorException for unknown finding code', () => {
      expect(() => mapToPublicFinding({ code: 'UNKNOWN_FUTURE_CODE' })).toThrow(
        PUBLIC_PRESENTATION_INTEGRITY_ERROR,
      );
    });
  });

  describe('presentReportingStatementSummary', () => {
    it('presents a complete summary without exposing raw JSON or fingerprints', () => {
      const { row } = createValidFrozenFixtureV2();
      const summary = presentReportingStatementSummary(row);

      expect(summary).toEqual({
        revisionId: 'revision-uuid-1',
        seriesId: 'series-uuid-1',
        submitterUserId: 'user-1',
        submitterDisplayNameSnapshot: 'Nguyen Van A',
        submitterStaffCodeSnapshot: 'GV001',
        academicYearId: 'year-1',
        fromCivilDate: '2026-08-01',
        toCivilDate: '2026-08-31',
        asOfInstant: asOf.toISOString(),
        submittedAt: '2026-08-25T10:25:00.000Z',
        lifecycleState: 'SUBMITTED',
        predecessorRevisionId: null,
        supersedesRevisionId: null,
      });
      expect(summary).not.toHaveProperty('canonicalSnapshotJson');
      expect(summary).not.toHaveProperty('requestFingerprint');
    });

    it('throws InternalServerErrorException if row is missing state', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() => presentReportingStatementSummary({ ...row, state: null })).toThrow(
        PUBLIC_PRESENTATION_INTEGRITY_ERROR,
      );
    });
  });

  describe('parseAndVerifyFrozenSnapshot', () => {
    // A. valid historical V1 read PASS
    it('reads valid historical V1 snapshot successfully without requiring provenance fields', () => {
      const { row } = createValidFrozenFixtureV1();
      const snapshot = parseAndVerifyFrozenSnapshot(row);
      expect(snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V1);
      expect(snapshot.serializerVersion).toBe(REPORTING_STATEMENT_SERIALIZER_V1);
      expect(snapshot.submitterUserId).toBe('user-1');
      expect(snapshot.counts.completedCount).toBe(4);
      expect((snapshot as unknown as Record<string, unknown>).operationalStartPolicyVersionId).toBeUndefined();
      expect((snapshot as unknown as Record<string, unknown>).operationalStartDate).toBeUndefined();
    });

    // B. valid V2 read PASS
    it('reads valid V2 snapshot successfully with verified provenance fields', () => {
      const { row } = createValidFrozenFixtureV2();
      const snapshot = parseAndVerifyFrozenSnapshot(row);
      expect(snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V2);
      expect(snapshot.serializerVersion).toBe(REPORTING_STATEMENT_SERIALIZER_V1);
      expect(snapshot.submitterUserId).toBe('user-1');
      expect(snapshot.counts.completedCount).toBe(4);
      const v2 = snapshot as import('../../src/reporting-statement-internal/reporting-statement-canonicalizer').ReportingStatementSnapshotV2;
      expect(v2.operationalStartPolicyVersionId).toBe('policy-version-1');
      expect(v2.operationalStartDate).toBe('2026-08-15');
    });

    // D. row snapshotProfile V2 + canonical JSON V1: fail closed
    it('fails closed when row snapshotProfile V2 does not match canonical JSON profile V1', () => {
      const { row } = createValidFrozenFixtureV1();
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, snapshotProfile: REPORTING_STATEMENT_SNAPSHOT_V2 }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    // E. V2 missing policyVersionId: fail closed
    it('fails closed when V2 canonical JSON has missing or empty policyVersionId', () => {
      const { row } = createValidFrozenFixtureV2();
      const corruptedJson = row.canonicalSnapshotJson.replace(
        '"operationalStartPolicyVersionId":"policy-version-1"',
        '"operationalStartPolicyVersionId":""',
      );
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, canonicalSnapshotJson: corruptedJson }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    // F. V2 malformed operationalStartDate: fail closed
    it('fails closed when V2 canonical JSON has malformed operationalStartDate', () => {
      const { row } = createValidFrozenFixtureV2();
      const corruptedJson = row.canonicalSnapshotJson.replace(
        '"operationalStartDate":"2026-08-15"',
        '"operationalStartDate":"2026-02-30"',
      );
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, canonicalSnapshotJson: corruptedJson }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    // G. V2 semantic hash tampering: fail closed
    it('fails closed when V2 semantic hash does not match canonical JSON', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, semanticHash: 'f'.repeat(64) }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    // H. V2 canonical JSON tampering: fail closed
    it('fails closed when V2 canonical JSON is corrupted or invalid JSON', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, canonicalSnapshotJson: '{ corrupted json ' }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    // I. unknown profile: fail closed
    it('fails closed on unknown snapshot profile or serializerVersion', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, snapshotProfile: 'UNKNOWN_PROFILE_V3' }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, serializerVersion: 'CANONICAL_JSON_V2' }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    // J. V1 regression cases all continue PASS
    it('fails closed when re-canonicalized bytes do not match stored canonical JSON', () => {
      const { row, frozen } = createValidFrozenFixtureV2();
      const whitespaceJson = frozen.canonicalSnapshotJson.replace('{', '{ ');
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          canonicalSnapshotJson: whitespaceJson,
          semanticHash: 'any',
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    it('fails closed when series statementProfile does not match snapshot', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          series: { ...row.series, statementProfile: 'OTHER_PROFILE' },
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    it('fails closed when series submitterUserId does not match snapshot', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          series: { ...row.series, submitterUserId: 'different-user' },
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    it('fails closed when submitterDisplayNameSnapshot does not match snapshot', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          submitterDisplayNameSnapshot: 'Mismatched Name',
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    it('fails closed when submitterStaffCodeSnapshot does not match snapshot', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          submitterStaffCodeSnapshot: 'Mismatched StaffCode',
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    it('fails closed when series academicYearId does not match snapshot', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          series: { ...row.series, academicYearId: 'different-year' },
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    it('fails closed when series date range does not match snapshot', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          series: { ...row.series, fromCivilDate: new Date('2026-07-01') },
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          series: { ...row.series, toCivilDate: new Date('2026-09-01') },
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    it('fails closed when subjects in DB do not match responsibilityManifest', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          subjects: [{ subjectId: 'sub-a' }],
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });

    it('fails closed when asOfInstant does not match row.asOfInstant', () => {
      const { row } = createValidFrozenFixtureV2();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          asOfInstant: new Date('2020-01-01T00:00:00.000Z'),
        }),
      ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
    });
  });

  describe('presentReportingStatementDetail', () => {
    // C. V2 public response remains same contract shape
    it('presents sanitized public detail for V2 without exposing internal provenance fields', () => {
      const { row } = createValidFrozenFixtureV2();
      const detail = presentReportingStatementDetail(row, ['APPROVE', 'REJECT']);

      expect(detail.revisionId).toBe('revision-uuid-1');
      expect(detail.seriesId).toBe('series-uuid-1');
      expect(detail.statementProfile).toBe('PERSONAL_REPORTING_STATEMENT_V1');
      expect(detail.submitterUserId).toBe('user-1');
      expect(detail.submitterDisplayNameSnapshot).toBe('Nguyen Van A');
      expect(detail.submitterStaffCodeSnapshot).toBe('GV001');
      expect(detail.academicYearId).toBe('year-1');
      expect(detail.fromCivilDate).toBe('2026-08-01');
      expect(detail.toCivilDate).toBe('2026-08-31');
      expect(detail.asOfInstant).toBe(asOf.toISOString());
      expect(detail.submittedAt).toBe('2026-08-25T10:25:00.000Z');
      expect(detail.lifecycleState).toBe('SUBMITTED');
      expect(detail.lifecycleToken).toBe('token-uuid-1');
      expect(detail.counts).toEqual({
        distributedElapsedCount: 4,
        completedCount: 4,
        openDebtCount: 0,
        lateCount: 0,
        unconfirmedGapCount: 0,
      });
      expect(detail.sections).toHaveLength(2);
      expect(detail.responsibilityManifest).toHaveLength(2);
      expect(detail.frozenSubjectIds).toEqual(['sub-a', 'sub-b']);
      expect(detail.allowedActions).toEqual(['APPROVE', 'REJECT']);
      expect(detail.history).toHaveLength(1);
      expect(detail.history[0]).toEqual({
        id: 'hist-1',
        eventType: 'SUBMITTED',
        stateBefore: null,
        stateAfter: 'SUBMITTED',
        actorUserId: 'user-1',
        actorDisplayNameSnapshot: 'Nguyen Van A',
        actorStaffCodeSnapshot: 'GV001',
        createdAt: '2026-08-25T10:25:00.000Z',
        causedByRevisionId: null,
      });

      // Assert no internal provenance leakage
      expect(detail).not.toHaveProperty('operationalStartPolicyVersionId');
      expect(detail).not.toHaveProperty('operationalStartDate');
      expect(detail).not.toHaveProperty('canonicalSnapshotJson');
      expect(detail).not.toHaveProperty('requestFingerprint');
      expect(detail).not.toHaveProperty('requestKey');
      expect(detail).not.toHaveProperty('commandId');
    });

    it('presents sanitized public detail for historical V1 without error', () => {
      const { row } = createValidFrozenFixtureV1();
      const detail = presentReportingStatementDetail(row, ['APPROVE', 'REJECT']);
      expect(detail.revisionId).toBe('revision-uuid-v1');
      expect(detail.counts.completedCount).toBe(4);
      expect(detail).not.toHaveProperty('operationalStartPolicyVersionId');
    });

    it('presents sanitized public detail for V3 with specialProgrammeWorkload', () => {
      const { row } = createValidFrozenFixtureV3();
      const detail = presentReportingStatementDetail(row, ['APPROVE', 'REJECT']);
      expect(detail.revisionId).toBe('revision-uuid-v3');
      expect(detail.counts.completedCount).toBe(4);
      expect(detail.specialProgrammeWorkload).toBeDefined();
      expect(detail.specialProgrammeWorkload?.totalCredit).toBe(1.5);
      expect(detail.specialProgrammeWorkload?.contributions).toHaveLength(1);
    });

    it('fails closed for corrupt V3 count, sum, owner, and dedupe invariants', () => {
      const { row } = createValidFrozenFixtureV3();
      const snapshot = JSON.parse(row.canonicalSnapshotJson) as Record<string, unknown>;
      const workload = snapshot.specialProgrammeWorkload as Record<string, unknown>;
      const contributions = workload.contributions as Array<Record<string, unknown>>;
      const contribution = contributions[0];
      const corruptSnapshots = [
        { ...snapshot, specialProgrammeWorkload: { ...workload, contributionCount: 2 } },
        { ...snapshot, specialProgrammeWorkload: { ...workload, totalCredit: 999 } },
        {
          ...snapshot,
          specialProgrammeWorkload: {
            ...workload,
            contributions: [{ ...contribution, actualTeacherUserId: 'different-owner' }],
          },
        },
        {
          ...snapshot,
          specialProgrammeWorkload: {
            ...workload,
            contributionCount: 2,
            totalCredit: 3,
            contributions: [contribution, { ...contribution, executionId: 'exec-2' }],
          },
        },
      ];

      for (const corruptSnapshot of corruptSnapshots) {
        const canonicalSnapshotJson = canonicalizeJson(corruptSnapshot as never);
        expect(() =>
          parseAndVerifyFrozenSnapshot({
            ...row,
            canonicalSnapshotJson,
            semanticHash: sha256CanonicalJson(canonicalSnapshotJson),
          }),
        ).toThrow(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
      }
    });

    it('sorts history entries chronologically with deterministic tie-break', () => {
      const { row } = createValidFrozenFixtureV2();
      row.historyEntries = [
        {
          id: 'hist-2',
          eventType: 'APPROVED' as const,
          stateBefore: 'SUBMITTED' as const,
          stateAfter: 'APPROVED' as const,
          actorUserId: 'approver-1',
          actorDisplayNameSnapshot: 'Principal',
          actorStaffCodeSnapshot: 'BGH01',
          createdAt: new Date('2026-08-26T08:00:00.000Z'),
          causedByRevisionId: null,
        },
        {
          id: 'hist-1',
          eventType: 'SUBMITTED' as const,
          stateBefore: null,
          stateAfter: 'SUBMITTED' as const,
          actorUserId: 'user-1',
          actorDisplayNameSnapshot: 'Nguyen Van A',
          actorStaffCodeSnapshot: 'GV001',
          createdAt: new Date('2026-08-25T10:25:00.000Z'),
          causedByRevisionId: null,
        },
      ];

      const detail = presentReportingStatementDetail(row, []);
      expect(detail.history[0].id).toBe('hist-1');
      expect(detail.history[1].id).toBe('hist-2');
    });
  });

  describe('500 Exception Sanitization Security Guarantee', () => {
    it('ensures all integrity and decoding failures produce generic Vietnamese messages without internal leakage', () => {
      const { row } = createValidFrozenFixtureV2();
      const corruptedScenarios: FrozenRevisionRow[] = [
        { ...row, snapshotProfile: 'INVALID' },
        { ...row, serializerVersion: 'INVALID' },
        { ...row, semanticHash: '0'.repeat(64) },
        { ...row, canonicalSnapshotJson: '{ invalid json' },
        { ...row, series: { ...row.series, statementProfile: 'DIFF' } },
        { ...row, series: { ...row.series, submitterUserId: 'DIFF' } },
        { ...row, submitterDisplayNameSnapshot: 'DIFF' },
        { ...row, submitterStaffCodeSnapshot: 'DIFF' },
        { ...row, series: { ...row.series, academicYearId: 'DIFF' } },
        { ...row, series: { ...row.series, fromCivilDate: new Date('2026-01-01') } },
        { ...row, series: { ...row.series, toCivilDate: new Date('2026-12-31') } },
        { ...row, asOfInstant: new Date('2020-01-01T00:00:00.000Z') },
        { ...row, subjects: [] },
      ];

      for (const scenario of corruptedScenarios) {
        try {
          parseAndVerifyFrozenSnapshot(scenario);
          expect(true).toBe(false);
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(InternalServerErrorException);
          const message = (error as InternalServerErrorException).message;
          expect(message).toBe(PUBLIC_PRESENTATION_INTEGRITY_ERROR);
          expect(message).not.toMatch(/hash|canonical|submitter|series|database|prisma|sql|unknown|profile|serializer/i);
        }
      }
    });
  });
});
