import { PrismaClient } from '@prisma/client';
import { B1RepositoryInspector, B1_SNAPSHOT_LIMITS } from '../../src/capabilities/b1-repository-inspector';

const id = {
  grant: '11111111-1111-4111-8111-111111111111',
  coordinate: '22222222-2222-4222-8222-222222222222',
  user: '33333333-3333-4333-8333-333333333333',
  source: '44444444-4444-4444-8444-444444444444',
  source2: '55555555-5555-4555-8555-555555555555',
  revision: '66666666-6666-4666-8666-666666666666',
  revision2: '77777777-7777-4777-8777-777777777777',
  projection: '88888888-8888-4888-8888-888888888888',
  slice: '99999999-9999-4999-8999-999999999999',
};
const t0 = new Date('2026-11-08T08:00:00.000Z');
const now = new Date('2026-11-08T09:00:00.000Z');

type DbFixture = {
  clock: Array<{ at: Date }>;
  grants: Array<Record<string, unknown>>;
  coordinates: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  projections: Array<Record<string, unknown>>;
  slices: Array<Record<string, unknown>>;
  supports: Array<Record<string, unknown>>;
};

function fixture(): DbFixture {
  return {
    clock: [{ at: now }],
    grants: [{
      id: id.grant, userId: id.user, coordinateId: id.coordinate,
      capabilityKey: 'LESSON_REPORT', scopeType: 'SCHOOL', scopeResourceId: null,
      validFrom: t0, validUntil: null, revokedAt: null,
    }],
    coordinates: [{
      id: id.coordinate, userId: id.user, capabilityKey: 'LESSON_REPORT',
      scopeType: 'SCHOOL', scopeResourceId: null, version: 1n,
    }],
    sources: [{
      id: id.source, coordinateId: id.coordinate, userId: id.user,
      kind: 'ROLE_APPOINTMENT', appointmentId: null, legacyGrantId: null,
    }],
    revisions: [{
      id: id.revision, sourceId: id.source, coordinateId: id.coordinate,
      revision: 1n, validFrom: t0, validUntil: null, disposition: 'ACCEPTED',
    }],
    projections: [{ id: id.projection, coordinateId: id.coordinate, version: 1n }],
    slices: [{
      id: id.slice, projectionRevisionId: id.projection,
      coordinateId: id.coordinate, grantId: id.grant,
      validFrom: t0, validUntil: null,
    }],
    supports: [{
      sliceId: id.slice, sourceRevisionId: id.revision,
      coordinateId: id.coordinate, coveredFrom: t0, coveredUntil: null,
    }],
  };
}

function fakeDb(
  data: DbFixture,
  opts: { failAt?: keyof DbFixture; disallowReadOnly?: boolean } = {},
) {
  const statements: string[] = [];
  const transactionOptions: Array<Record<string, unknown>> = [];
  const client = {
    $transaction: async (
      callback: (tx: unknown) => Promise<unknown>,
      options: Record<string, unknown>,
    ) => {
      transactionOptions.push(options);
      const tx = {
        $executeRaw: async (parts: TemplateStringsArray) => {
          const sql = parts.join('?').trim();
          statements.push(sql);
          if (opts.disallowReadOnly && sql === 'SET TRANSACTION READ ONLY')
            throw new Error('READ_ONLY_NOT_AVAILABLE');
          return 0;
        },
        $queryRaw: async (parts: TemplateStringsArray) => {
          const sql = parts.join('?').replace(/\s+/g, ' ').trim();
          statements.push(sql);
          const table = sql.includes('transaction_timestamp()') ? 'clock'
            : sql.includes('FROM capability_grants') ? 'grants'
            : sql.includes('FROM access_coordinates') ? 'coordinates'
            : sql.includes('FROM grant_source_revisions') ? 'revisions'
            : sql.includes('FROM grant_sources') ? 'sources'
            : sql.includes('FROM grant_projection_revisions') ? 'projections'
            : sql.includes('FROM grant_projection_slices') ? 'slices'
            : sql.includes('FROM grant_supports') ? 'supports'
            : null;
          if (!table) throw new Error('UNKNOWN_SQL_STATEMENT');
          if (opts.failAt === table) throw new Error('DATABASE_QUERY_FAILED');
          return data[table];
        },
      };
      return callback(tx);
    },
  };
  return { client: client as unknown as PrismaClient, statements, transactionOptions };
}

describe('WS1-B B1 repository snapshot: no mutation, no API, no authorization', () => {
  it('accepts a single coherent PostgreSQL snapshot as candidate ONLY', async () => {
    const db = fakeDb(fixture());
    const result = await new B1RepositoryInspector(db.client).inspect(id.grant);
    expect(result).toEqual({
      verdict: 'SUPPORT_CANDIDATE', reason: 'CANDIDATE_ONLY',
      canConfirm: false, provenanceVerified: false, supportingSourceCount: 1,
    });
    expect(db.statements.slice(0, 3)).toEqual([
      'SET TRANSACTION READ ONLY',
      "SET LOCAL statement_timeout = '4000ms'",
      expect.stringContaining('transaction_timestamp()'),
    ]);
    expect(db.transactionOptions).toEqual([expect.objectContaining({
      isolationLevel: 'RepeatableRead', maxWait: 1500, timeout: 6000,
    })]);
    expect(db.statements.every((statement) =>
      !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|FOR UPDATE)\b/i.test(statement),
    )).toBe(true);
  });

  it('counts two independent valid support sources without authorizing a change', async () => {
    const data = fixture();
    data.sources.push({
      id: id.source2, coordinateId: id.coordinate, userId: id.user,
      kind: 'ROLE_APPOINTMENT', appointmentId: null, legacyGrantId: null,
    });
    data.revisions.push({
      id: id.revision2, sourceId: id.source2, coordinateId: id.coordinate,
      revision: 1n, validFrom: t0, validUntil: null, disposition: 'ACCEPTED',
    });
    data.supports.push({
      sliceId: id.slice, sourceRevisionId: id.revision2,
      coordinateId: id.coordinate, coveredFrom: t0, coveredUntil: null,
    });
    const result = await new B1RepositoryInspector(fakeDb(data).client).inspect(id.grant);
    expect(result).toMatchObject({
      verdict: 'SUPPORT_CANDIDATE', supportingSourceCount: 2,
      canConfirm: false, provenanceVerified: false,
    });
  });

  it('fails closed on legacy NULL coordinate before reading any history', async () => {
    const data = fixture();
    data.grants[0].coordinateId = null;
    const db = fakeDb(data);
    const result = await new B1RepositoryInspector(db.client).inspect(id.grant);
    expect(result.reason).toBe('MISSING_OR_LEGACY_COORDINATE');
    expect(db.statements.some((s) => s.includes('FROM access_coordinates'))).toBe(false);
  });

  it('rejects malformed grant IDs without entering a database transaction', async () => {
    const db = fakeDb(fixture());
    const result = await new B1RepositoryInspector(db.client).inspect('1; DROP TABLE users');
    expect(result.reason).toBe('INVALID_EVIDENCE');
    expect(db.statements).toHaveLength(0);
  });

  it('rejects coordinate/grant mismatch without loading B1 history', async () => {
    const data = fixture();
    data.coordinates[0].userId = id.source2;
    const db = fakeDb(data);
    expect((await new B1RepositoryInspector(db.client).inspect(id.grant)).reason)
      .toBe('INVALID_EVIDENCE');
    expect(db.statements.some((s) => s.includes('FROM grant_sources'))).toBe(false);
  });

  it('rejects CAS/projection disagreement even with otherwise valid support', async () => {
    const data = fixture();
    data.coordinates[0].version = 3n;
    expect((await new B1RepositoryInspector(fakeDb(data).client).inspect(id.grant)).reason)
      .toBe('INVALID_EVIDENCE');
  });

  it('does not silently truncate source history at the configured limit', async () => {
    const data = fixture();
    data.sources = Array.from({ length: B1_SNAPSHOT_LIMITS.sources + 1 }, (_, i) => ({
      ...data.sources[0], id: 'source-' + i,
    }));
    const result = await new B1RepositoryInspector(fakeDb(data).client).inspect(id.grant);
    expect(result).toMatchObject({
      verdict: 'UNVERIFIED', reason: 'INCOMPLETE_HISTORY', supportingSourceCount: 0,
    });
  });

  it('rejects orphan revisions and support pointing outside this coordinate', async () => {
    const invalid = fixture();
    invalid.revisions[0].sourceId = id.source2;
    expect((await new B1RepositoryInspector(fakeDb(invalid).client).inspect(id.grant)).reason)
      .toBe('INVALID_EVIDENCE');
    const support = fixture();
    support.supports[0].coordinateId = id.source2;
    expect((await new B1RepositoryInspector(fakeDb(support).client).inspect(id.grant)).reason)
      .toBe('INVALID_EVIDENCE');
  });

  it('refuses missing source revision instead of silently treating snapshot as complete', async () => {
    const data = fixture();
    data.revisions = [];
    const result = await new B1RepositoryInspector(fakeDb(data).client).inspect(id.grant);
    expect(result.reason).toBe('INVALID_EVIDENCE');
  });

  it('fails closed for transaction failures and denied PostgreSQL READ ONLY', async () => {
    const f = fixture();
    const badQuery = fakeDb(f, { failAt: 'supports' });
    const badMode = fakeDb(f, { disallowReadOnly: true });
    expect((await new B1RepositoryInspector(badQuery.client).inspect(id.grant)).reason)
      .toBe('INCOMPLETE_HISTORY');
    expect((await new B1RepositoryInspector(badMode.client).inspect(id.grant)).reason)
      .toBe('INCOMPLETE_HISTORY');
    expect(badMode.statements).toEqual(['SET TRANSACTION READ ONLY']);
  });

  it('does not mutate caller-owned mock rows while deriving evidence', async () => {
    const data = fixture();
    const before = structuredClone(data);
    await new B1RepositoryInspector(fakeDb(data).client).inspect(id.grant);
    expect(data).toEqual(before);
  });
});
