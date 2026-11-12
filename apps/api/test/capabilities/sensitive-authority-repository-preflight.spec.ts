import { PrismaClient } from '@prisma/client';
import {
  SensitiveAuthorityRepositoryPreflight, SensitiveAuthorityRequest, SENSITIVE_AUTHORITY_LIMITS,
} from '../../src/capabilities/sensitive-authority-repository-preflight';

const ids = {
  actor: '11111111-1111-4111-8111-111111111111',
  target: '22222222-2222-4222-8222-222222222222',
  original: '33333333-3333-4333-8333-333333333333',
  source: '44444444-4444-4444-8444-444444444444',
};
const at = new Date('2026-11-12T09:00:00.000Z');
const earlier = new Date('2026-11-12T08:00:00.000Z');

const request: SensitiveAuthorityRequest = {
  actorUserId: ids.actor, targetUserId: ids.target,
  capabilityKey: 'APPROVAL_PRINCIPAL', scopeType: 'SCHOOL_WIDE',
  scopeResourceId: null, command: 'APPOINT_SOURCE',
};

type DbRows = {
  clock: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  grants: Array<Record<string, unknown>>;
  seats: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
};
function fixture(): DbRows {
  return {
    clock: [{ at }],
    users: [
      { id: ids.actor, status: 'ACTIVE', mustChangePassword: false },
      { id: ids.target, status: 'ACTIVE', mustChangePassword: false },
    ],
    grants: [
      { capabilityKey: 'USER_MANAGE' },
      { capabilityKey: 'CAPABILITY_GRANT' },
    ],
    seats: [{
      id: '55555555-5555-4555-8555-555555555555',
      userId: ids.actor, templateKey: 'TECHNICAL_ACCOUNT_ADMIN',
      seatKey: 'TECHNICAL_ACCOUNT_ADMIN',
      validFrom: earlier, validUntil: null, cancelledAt: null,
      enabled: true, policyVersion: 1n, originalActorId: ids.original,
      originalTargetId: ids.actor,
    }],
    sources: [{
      id: ids.source, userId: ids.target, coordinateUserId: ids.target,
      capabilityKey: 'APPROVAL_PRINCIPAL', scopeType: 'SCHOOL_WIDE',
      scopeResourceId: null, kind: 'ROLE_TEMPLATE', legacyGrantId: null,
      appointmentId: '66666666-6666-4666-8666-666666666666',
      appointmentUserId: ids.target, appointmentTemplateKey: 'PRINCIPAL',
      appointmentValidFrom: earlier, appointmentValidUntil: null,
      appointmentCancelledAt: null,
      seatKey: 'PRINCIPAL', seatEnabled: true, seatPolicyVersion: 1n,
      sourceActorId: ids.original, sourceTargetId: ids.target,
      appointmentActorId: ids.original, appointmentTargetId: ids.target,
      disposition: 'ACCEPTED', revisionFrom: earlier, revisionUntil: null,
    }],
  };
}
function fakeDb(data: DbRows, fail?: string) {
  const statements: string[] = [];
  const options: Array<Record<string, unknown>> = [];
  const client = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, settings: Record<string, unknown>) => {
      options.push(settings);
      const tx = {
        $executeRaw: async (parts: TemplateStringsArray) => {
          const sql = parts.join('?').trim();
          statements.push(sql);
          if (fail === 'READ_ONLY' && sql === 'SET TRANSACTION READ ONLY') throw Error('READ_ONLY_DENIED');
          return 0;
        },
        $queryRaw: async (parts: TemplateStringsArray) => {
          const sql = parts.join('?').replace(/\s+/g, ' ').trim();
          statements.push(sql);
          const key: keyof DbRows | null =
            sql.includes('transaction_timestamp()') ? 'clock' :
            sql.includes('FROM users') ? 'users' :
            sql.includes('FROM capability_grants') ? 'grants' :
            sql.includes('FROM role_appointments a') ? 'seats' :
            sql.includes('FROM grant_sources src') ? 'sources' : null;
          if (!key) throw Error('UNRECOGNIZED_SQL');
          if (fail === key) throw Error('DATABASE_FAILURE');
          return data[key];
        },
      };
      return fn(tx);
    },
  };
  return { db: client as unknown as PrismaClient, statements, options };
}
const inspect = async (
  data = fixture(),
  patch: Partial<SensitiveAuthorityRequest> = {},
  failure?: string,
) => {
  const client = fakeDb(data, failure);
  const result = await new SensitiveAuthorityRepositoryPreflight(client.db).inspect({ ...request, ...patch });
  return { ...client, result };
};

describe('P5-057 WS1: server-selected authority evidence, read-only and advisory', () => {
  it('returns candidate only after DB actor seat and technical grants, with READ ONLY first', async () => {
    const { result, statements, options } = await inspect();
    expect(result).toEqual({
      mode: 'READ_ONLY', verdict: 'SOURCE_CANDIDATE', reason: 'CANDIDATE_ONLY',
      canConfirm: false, provenanceVerified: false, writerEnabled: false,
      actorSeatEvidence: 'READ_ONLY_CURRENT', sourceEvidence: 'NOT_APPLICABLE',
    });
    expect(statements[0]).toBe('SET TRANSACTION READ ONLY');
    expect(statements[1]).toContain('SET LOCAL statement_timeout');
    expect(statements.every((s) => !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|FOR UPDATE)\b/i.test(s))).toBe(true);
    expect(options).toEqual([expect.objectContaining({
      isolationLevel: 'RepeatableRead', maxWait: SENSITIVE_AUTHORITY_LIMITS.maxWait,
      timeout: SENSITIVE_AUTHORITY_LIMITS.timeout,
    })]);
  });

  it('checks exact server-fetched source on dismissal, never infers source from role name', async () => {
    const { result, statements } = await inspect(fixture(), {
      command: 'REMOVE_SOURCE', exactSourceId: ids.source,
    });
    expect(result).toMatchObject({
      verdict: 'SOURCE_CANDIDATE', sourceEvidence: 'CURRENT_SOURCE_MATCH',
      canConfirm: false, provenanceVerified: false, writerEnabled: false,
    });
    expect(statements.some((s) => s.includes('FROM grant_sources src'))).toBe(true);
  });

  it('fails closed on missing or malformed exactSourceId before opening a transaction', async () => {
    for (const exactSourceId of [undefined, '', 'xyz', '111; DELETE FROM users']) {
      const { result, statements } = await inspect(fixture(), { command: 'REMOVE_SOURCE', exactSourceId });
      expect(result.reason).toBe('SOURCE_NOT_FOUND_OR_UNTRUSTED');
      expect(statements).toEqual([]);
    }
  });

  it('rejects a source belonging to another target, coordinate, or capability', async () => {
    for (const field of ['userId', 'coordinateUserId', 'capabilityKey'] as const) {
      const d = fixture();
      d.sources[0][field] = '77777777-7777-4777-8777-777777777777';
      const { result } = await inspect(d, { command: 'REMOVE_SOURCE', exactSourceId: ids.source });
      expect(result.reason).toBe('SOURCE_NOT_FOUND_OR_UNTRUSTED');
    }
  });

  it('rejects legacy, disabled seat, cancelled role and inactive revisions', async () => {
    const variants: Array<[string, unknown]> = [
      ['kind', 'LEGACY_UNCLASSIFIED'], ['legacyGrantId', ids.source],
      ['seatEnabled', false], ['appointmentCancelledAt', at],
      ['disposition', 'CANCELLED'], ['revisionUntil', at],
      ['appointmentValidUntil', at], ['seatKey', 'VICE_PRINCIPAL_ACADEMIC'],
      ['sourceActorId', ids.target],
    ];
    for (const [key, value] of variants) {
      const d = fixture();
      d.sources[0][key] = value;
      const { result } = await inspect(d, { command: 'REMOVE_SOURCE', exactSourceId: ids.source });
      expect(result.reason).toBe('SOURCE_NOT_FOUND_OR_UNTRUSTED');
    }
  });

  it('requires exactly one active technical actor seat with matching source/command', async () => {
    const d = fixture();
    d.seats = [];
    expect((await inspect(d)).result.reason).toBe('NO_UNAMBIGUOUS_ACTOR_SEAT');
    d.seats = fixture().seats;
    d.seats.push({ ...d.seats[0], id: '99999999-9999-4999-8999-999999999999' });
    expect((await inspect(d)).result.reason).toBe('NO_UNAMBIGUOUS_ACTOR_SEAT');
    d.seats = fixture().seats;
    d.seats[0].originalActorId = ids.actor;
    expect((await inspect(d)).result.reason).toBe('NO_UNAMBIGUOUS_ACTOR_SEAT');
    d.seats = fixture().seats;
    d.seats[0].policyVersion = 0n;
    expect((await inspect(d)).result.reason).toBe('NO_UNAMBIGUOUS_ACTOR_SEAT');
  });

  it('requires both current technical capabilities, not a job title alone', async () => {
    const d = fixture();
    d.grants = [{ capabilityKey: 'USER_MANAGE' }];
    expect((await inspect(d)).result.reason).toBe('NO_TECHNICAL_CAPABILITIES');
    d.grants = [];
    expect((await inspect(d)).result.reason).toBe('NO_TECHNICAL_CAPABILITIES');
  });

  it('blocks when actor or target inactive, or actor must change password', async () => {
    const d = fixture();
    d.users[0].mustChangePassword = true;
    expect((await inspect(d)).result.reason).toBe('INACTIVE_OR_UNKNOWN_USER');
    d.users = fixture().users;
    d.users[1].status = 'DISABLED';
    expect((await inspect(d)).result.reason).toBe('INACTIVE_OR_UNKNOWN_USER');
    d.users = [];
    expect((await inspect(d)).result.reason).toBe('INACTIVE_OR_UNKNOWN_USER');
  });

  it('previews initial pending appointments and allows source withdrawal for disabled holders', async () => {
    const d = fixture();
    d.users[1].status = 'PENDING';
    expect((await inspect(d)).result.verdict).toBe('SOURCE_CANDIDATE');
    d.users[1].status = 'DISABLED';
    expect((await inspect(d, { command: 'REMOVE_SOURCE', exactSourceId: ids.source })).result.verdict)
      .toBe('SOURCE_CANDIDATE');
  });

  it('does not read DB for unknown keys, self elevation, invalid scope and generic grants', async () => {
    const variants: Partial<SensitiveAuthorityRequest>[] = [
      { capabilityKey: 'TEACHER_BASE' },
      { targetUserId: ids.actor },
      { scopeType: 'SUBJECT_GROUP' },
      { command: 'GENERIC_GRANT' }, { command: 'GENERIC_REVOKE' },
      { command: 'COMMAND_UNKNOWN' as SensitiveAuthorityRequest['command'] },
    ];
    for (const patch of variants) {
      const { result, statements } = await inspect(fixture(), patch);
      expect(result.verdict).toBe('UNVERIFIED');
      expect(statements).toHaveLength(0);
    }
  });

  it('keeps all five AI governance capabilities disabled and never reads DB for them', async () => {
    const keys = ['AI_CONFIGURE_POLICY', 'AI_VIEW_USAGE', 'AI_VIEW_COST', 'AI_VIEW_AUDIT', 'AI_DISABLE_SYSTEM'];
    for (const capabilityKey of keys) {
      const { result, statements } = await inspect(fixture(), { capabilityKey });
      expect(result.reason).toBe('AI_PHASE_11_NOT_ACTIVE');
      expect(statements).toHaveLength(0);
    }
  });

  it('cannot grant or revoke technical-admin audit source via this role-source path', async () => {
    const d = fixture();
    d.sources[0].capabilityKey = 'AUDIT_VIEW';
    const { result } = await inspect(d, { capabilityKey: 'AUDIT_VIEW', command: 'APPOINT_SOURCE' });
    expect(result).toMatchObject({ verdict: 'SOURCE_CANDIDATE', writerEnabled: false });
    const { result: legacy } = await inspect(d, {
      capabilityKey: 'AUDIT_VIEW', command: 'REMOVE_SOURCE', exactSourceId: ids.source,
    });
    expect(legacy).toMatchObject({ verdict: 'SOURCE_CANDIDATE', writerEnabled: false });
    // Both are Principal candidates, not technical sources; no mutation occurs.
  });

  it('fails closed on unavailable snapshots and READ ONLY refusal', async () => {
    for (const errorAt of ['READ_ONLY', 'clock', 'users', 'grants', 'seats', 'sources']) {
      const { result } = await inspect(fixture(), errorAt === 'sources' ?
        { command: 'REMOVE_SOURCE', exactSourceId: ids.source } : {}, errorAt);
      expect(result.verdict).toBe('UNVERIFIED');
      expect(result.reason).toBe('DATABASE_EVIDENCE_UNAVAILABLE');
    }
  });

  it('never returns real authorization for any source candidate', async () => {
    const variants: Partial<SensitiveAuthorityRequest>[] = [
      {}, { capabilityKey: 'AUDIT_VIEW' },
      { capabilityKey: 'APPROVAL_VICE_PRINCIPAL' },
      { capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE' },
      { command: 'REMOVE_SOURCE', exactSourceId: ids.source },
    ];
    for (const patch of variants) {
      const { result } = await inspect(fixture(), patch);
      expect(result.canConfirm).toBe(false);
      expect(result.provenanceVerified).toBe(false);
      expect(result.writerEnabled).toBe(false);
    }
  });
});
