import { InternalServerErrorException } from '@nestjs/common';
import {
  freezeReportingStatementSnapshot,
  REPORTING_STATEMENT_SNAPSHOT_V1,
} from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';
import {
  parseAndVerifyFrozenSnapshot,
  presentReportingStatementDetail,
  presentReportingStatementSummary,
} from '../../src/reporting-statements/reporting-statement.presenter';

const asOf = new Date('2026-08-25T10:20:30.400Z');

function createValidFrozenFixture(ownerId = 'user-1', subjectIds = ['sub-a', 'sub-b']) {
  const frozen = freezeReportingStatementSnapshot({
    statementProfile: 'PERSONAL_REPORTING_STATEMENT_V1',
    submitterUserId: ownerId,
    submitterDisplayNameSnapshot: 'Nguyen Van A',
    submitterStaffCodeSnapshot: 'GV001',
    asOfInstant: asOf,
    projection: {
      profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
      scope: {
        academicYearId: 'year-1',
        targetUserId: ownerId,
        fromCivilDate: '2026-08-01',
        toCivilDate: '2026-08-31',
        asOfInstant: asOf,
      },
      responsibilityState: 'RESPONSIBILITY_PRESENT',
      status: 'PASS',
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
        validFrom: '2026-08-01',
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
            validFrom: '2026-08-01',
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
    } as never,
  });

  const row = {
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
    ] as Array<{
      id: string;
      eventType: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
      stateBefore: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED' | null;
      stateAfter: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
      actorUserId: string;
      actorDisplayNameSnapshot: string | null;
      actorStaffCodeSnapshot: string | null;
      createdAt: Date;
      causedByRevisionId: string | null;
    }>,
  };


  return { frozen, row };
}

describe('Reporting Statement Presenter & Integrity', () => {
  describe('presentReportingStatementSummary', () => {
    it('presents a complete summary without exposing raw JSON or fingerprints', () => {
      const { row } = createValidFrozenFixture();
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
      const { row } = createValidFrozenFixture();
      expect(() => presentReportingStatementSummary({ ...row, state: null })).toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('parseAndVerifyFrozenSnapshot', () => {
    it('verifies a valid snapshot successfully', () => {
      const { row } = createValidFrozenFixture();
      const snapshot = parseAndVerifyFrozenSnapshot(row);
      expect(snapshot.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V1);
      expect(snapshot.submitterUserId).toBe('user-1');
      expect(snapshot.counts.completedCount).toBe(4);
    });

    it('fails closed when snapshot profile or serializer version is invalid', () => {
      const { row } = createValidFrozenFixture();
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, snapshotProfile: 'INVALID_PROFILE' }),
      ).toThrow(InternalServerErrorException);
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, serializerVersion: 'INVALID_VERSION' }),
      ).toThrow(InternalServerErrorException);
    });

    it('fails closed when semantic hash does not match canonical JSON', () => {
      const { row } = createValidFrozenFixture();
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, semanticHash: 'f'.repeat(64) }),
      ).toThrow(InternalServerErrorException);
    });

    it('fails closed when canonical JSON is corrupted or invalid JSON', () => {
      const { row } = createValidFrozenFixture();
      expect(() =>
        parseAndVerifyFrozenSnapshot({ ...row, canonicalSnapshotJson: '{ corrupted json ' }),
      ).toThrow(InternalServerErrorException);
    });

    it('fails closed when re-canonicalized bytes do not match stored canonical JSON', () => {
      const { row, frozen } = createValidFrozenFixture();
      // Inject extra whitespace into canonicalSnapshotJson while matching hash
      const whitespaceJson = frozen.canonicalSnapshotJson.replace('{', '{ ');
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          canonicalSnapshotJson: whitespaceJson,
          semanticHash: 'any',
        }),
      ).toThrow(InternalServerErrorException);
    });

    it('fails closed when subjects in DB do not match responsibilityManifest', () => {
      const { row } = createValidFrozenFixture();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          subjects: [{ subjectId: 'sub-a' }], // Missing sub-b
        }),
      ).toThrow(InternalServerErrorException);
    });

    it('fails closed when asOfInstant does not match row.asOfInstant', () => {
      const { row } = createValidFrozenFixture();
      expect(() =>
        parseAndVerifyFrozenSnapshot({
          ...row,
          asOfInstant: new Date('2020-01-01T00:00:00.000Z'),
        }),
      ).toThrow(InternalServerErrorException);
    });
  });

  describe('presentReportingStatementDetail', () => {
    it('presents sanitized public detail with verified snapshot and allowedActions', () => {
      const { row } = createValidFrozenFixture();
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

      // Confirm no raw/internal persistence properties leaked
      expect(detail).not.toHaveProperty('canonicalSnapshotJson');
      expect(detail).not.toHaveProperty('requestFingerprint');
      expect(detail).not.toHaveProperty('requestKey');
      expect(detail).not.toHaveProperty('commandId');
    });

    it('sorts history entries chronologically with deterministic tie-break', () => {
      const { row } = createValidFrozenFixture();
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
});
