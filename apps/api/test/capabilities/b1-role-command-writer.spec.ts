/* In-memory Prisma fixture deliberately handles heterogeneous model payloads. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';
import { B1RoleCommandWriter, B1RoleCommandInput, B1TrustedActor } from '../../src/capabilities/b1-role-command-writer';

const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const next = '44444444-4444-4444-8444-444444444444';
const issuer = '33333333-3333-4333-8333-333333333333';
const techSeat = '55555555-5555-4555-8555-555555555555';
const principalSeat = '66666666-6666-4666-8666-666666666666';
const viceSeat = '77777777-7777-4777-8777-777777777777';
const start = new Date('2026-11-12T09:00:00.000Z');
const oneHour = () => new Date('2026-11-12T10:00:00.000Z');

const trusted: B1TrustedActor = { userId: actor, requestId: 'ws1-internal-test' };
const appoint = (patch: Partial<B1RoleCommandInput> = {}): B1RoleCommandInput => ({
  operation: 'APPOINT', role: 'PRINCIPAL', targetUserId: target,
  expectedSeatVersion: '1', expectedAuthorizationEpoch: '0', requestKey: 'test-role-appoint-0001', ...patch,
});
const idOf = (n: number) => 'a' + n.toString(16).padStart(7, '0') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface DbState {
  now: Date; seq: number; users: Array<Record<string, any>>;
  seats: Array<Record<string, any>>; appointments: Array<Record<string, any>>;
  commands: Array<Record<string, any>>; grants: Array<Record<string, any>>;
  coordinates: Array<Record<string, any>>; sources: Array<Record<string, any>>;
  revisions: Array<Record<string, any>>; projections: Array<Record<string, any>>;
  audit: Array<Record<string, any>>; epoch: bigint;
}
const activeAt = (r: Record<string, any>, at: Date): boolean =>
  r.validFrom <= at && (r.validUntil === null || r.validUntil > at);
const initial = (): DbState => ({
  now: start, seq: 0,
  users: [actor, target, next].map((id) => ({ id, status: 'ACTIVE', mustChangePassword: false,
    profile: { isTeachingStaff: id !== actor } })),
  seats: [
    { id: techSeat, key: 'TECHNICAL_ACCOUNT_ADMIN', enabled: true, policyVersion: 1n },
    { id: principalSeat, key: 'PRINCIPAL', enabled: true, policyVersion: 1n },
    { id: viceSeat, key: 'VICE_PRINCIPAL_ACADEMIC', enabled: true, policyVersion: 1n },
  ],
  commands: [{ id: '88888888-8888-4888-8888-888888888888',
    actorUserId: issuer, targetUserId: actor, commandType: 'SEED', requestKey: 'seed',
    fingerprint: 'seed', result: {} }],
  appointments: [{ id: '99999999-9999-4999-8999-999999999999',
    userId: actor, seatId: techSeat, templateKey: 'TECHNICAL_ACCOUNT_ADMIN',
    validFrom: new Date(start.getTime() - 3600000), validUntil: null,
    cancelledAt: null, version: 0n,
    createdCommandId: '88888888-8888-4888-8888-888888888888' }],
  grants: ['USER_MANAGE', 'CAPABILITY_GRANT'].map((key, i) => ({
    id: idOf(100+i), userId: actor, capabilityKey: key, scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null, revokedAt: null, coordinateId: null,
    validFrom: new Date(start.getTime() - 3600000), validUntil: null,
  })),
  coordinates: [], sources: [], revisions: [], projections: [], audit: [], epoch: 0n,
});
function fake(initialState: DbState = initial()) {
  let state = initialState;
  const queries: string[] = [];
  let failCAS = false;
  const cloneValue = (v: any): any => v instanceof Date ? new Date(v.getTime()) :
    Array.isArray(v) ? v.map(cloneValue) : v && typeof v === 'object' ?
      Object.fromEntries(Object.entries(v).map(([k,x]) => [k,cloneValue(x)])) : v;
  const clone = (): DbState => cloneValue(state);
  const transaction = async (fn: (tx: any) => Promise<unknown>, options: Record<string, any>) => {
    expect(options.isolationLevel).toBe('Serializable');
    const s = clone();
    const newid = () => idOf(++s.seq);
    const seat = (seatId: string) => s.seats.find((v) => v.id === seatId) ?? null;
    const command = (id: string) => s.commands.find((v) => v.id === id) ?? null;
    const appointment = (id: string) => s.appointments.find((v) => v.id === id) ?? null;
    const q = (sql: TemplateStringsArray) => sql.join('?').replace(/\s+/g, ' ').trim();
    const tx = {
      $executeRaw: async (text: TemplateStringsArray) => { queries.push(q(text)); return 0; },
      $queryRaw: async (text: TemplateStringsArray) => {
        const sql = q(text); queries.push(sql);
        if (sql.includes('FROM authority_seats')) return [{ id: principalSeat }];
        if (sql.includes('FROM users')) return s.users.map((u) => ({ id: u.id }));
        if (sql.includes('transaction_timestamp()')) return [{ at: s.now }];
        throw Error('UNEXPECTED_QUERY '+sql);
      },
      authoritySeat: { findUnique: async ({ where }: any) => s.seats.find((v) => v.key === where.key) ?? null },
      user: { findMany: async ({ where }: any) => s.users.filter((u) => where.id.in.includes(u.id)) },
      roleAppointment: {
        findMany: async ({ where }: any) =>
          s.appointments.filter((a) => a.userId === where.userId || a.seatId === where.seatId)
            .filter((a) => a.templateKey === where.templateKey && a.cancelledAt === null && activeAt(a, s.now))
            .map((a) => ({ ...a, seat: seat(a.seatId), command: command(a.createdCommandId) })),
        findUnique: async ({ where }: any) => appointment(where.id),
        create: async ({ data }: any) => { const v = { id: newid(), version: 0n, cancelledAt: null, ...data };
          s.appointments.push(v); return v; },
        updateMany: async ({ where, data }: any) => {
          const a = appointment(where.id);
          if (!a || a.version !== where.version || a.cancelledAt !== where.cancelledAt) return { count: 0 };
          Object.assign(a, { validUntil: data.validUntil, version: a.version+1n });
          return { count: 1 };
        },
      },
      capabilityGrant: {
        findMany: async ({ where }: any) => s.grants.filter((g) =>
          g.userId === where.userId && g.revokedAt === null &&
          (typeof where.capabilityKey === 'string' ? g.capabilityKey === where.capabilityKey :
            where.capabilityKey?.in?.includes(g.capabilityKey)) &&
          g.scopeType === where.scopeType && g.scopeResourceId === null &&
          (!where.validFrom || g.validFrom <= s.now) &&
          (!where.OR || g.validUntil === null || g.validUntil > s.now)),
        findUnique: async ({ where }: any) => s.grants.find((g) => g.id === where.id) ?? null,
        create: async ({ data }: any) => { const g = { id: newid(), revokedAt: null, ...data }; s.grants.push(g); return g; },
        updateMany: async ({ where, data }: any) => { const g = s.grants.find((v) =>
          v.id === where.id && v.coordinateId === where.coordinateId && v.revokedAt === where.revokedAt);
          if (!g) return { count: 0 }; Object.assign(g,data); return { count: 1 }; },
      },
      accessCommand: {
        findUnique: async ({ where }: any) => {
          if (where.id) return command(where.id);
          const w = where.actorUserId_commandType_requestKey;
          return s.commands.find((c) => c.actorUserId === w.actorUserId &&
            c.commandType === w.commandType && c.requestKey === w.requestKey) ?? null;
        },
        findUniqueOrThrow: async ({ where }: any) => command(where.id) || (() => { throw Error('NOT_FOUND'); })(),
        create: async ({ data }: any) => { const c = { id: newid(), ...data }; s.commands.push(c); return c; },
        update: async () => { throw Error('APPEND_ONLY_ACCESS_COMMAND_TRIGGER'); },
      },
      accessCoordinate: {
        findMany: async ({ where }: any) => s.coordinates.filter((v) => v.userId === where.userId &&
          v.capabilityKey === where.capabilityKey && v.scopeType === where.scopeType &&
          v.scopeResourceId === where.scopeResourceId),
        create: async ({ data }: any) => { const c = { id: newid(), version: 0n, ...data };
          s.coordinates.push(c); return c; },
        updateMany: async ({ where }: any) => {
          const c = s.coordinates.find((v) => v.id === where.id && v.version === where.version);
          if (!c || failCAS) return { count: 0 }; c.version += 1n; return { count: 1 };
        },
      },
      grantSource: {
        findMany: async ({ where }: any) => s.sources.filter((v) =>
          (where.coordinateId ? v.coordinateId === where.coordinateId : v.appointmentId === where.appointmentId))
          .map((v) => {
            const a = appointment(v.appointmentId);
            return { ...v, revisions: s.revisions.filter((r) => r.sourceId === v.id)
              .sort((a,b) => Number(b.revision-a.revision)).slice(0,2),
              appointment: a ? { ...a, seat: seat(a.seatId), command: command(a.createdCommandId) } : null,
              command: command(v.createdCommandId) };
          }),
        create: async ({ data }: any) => { const v = { id: newid(), legacyGrantId: null, ...data };
          s.sources.push(v); return v; },
      },
      grantSourceRevision: {
        findFirst: async ({ where }: any) =>
          s.revisions.filter((r) => r.sourceId === where.sourceId)
            .sort((a,b) => Number(b.revision-a.revision))[0] ?? null,
        create: async ({ data }: any) => { const r = { id: newid(), ...data };
          s.revisions.push(r); return r; },
      },
      grantProjectionRevision: {
        findFirst: async ({ where }: any) =>
          s.projections.filter((v) => v.coordinateId === where.coordinateId)
            .sort((a,b) => Number(b.version-a.version))[0] ?? null,
        create: async ({ data }: any) => { const v = { id: newid(), slices: [], ...data };
          s.projections.push(v); return v; },
      },
      grantProjectionSlice: {
        create: async ({ data }: any) => { const v = { id: newid(), ...data, supports: [] as Array<Record<string,any>> };
          s.projections.find((p) => p.id === data.projectionRevisionId)!.slices.push(v); return v; },
      },
      grantSupport: {
        create: async ({ data }: any) => {
          const projection = s.projections.find((p) => p.slices.some((slice: any) => slice.id === data.sliceId))!;
          const slice = projection.slices.find((slice: any) => slice.id === data.sliceId)!;
          slice.supports.push(data); return data;
        },
      },
      authorizationState: { findUnique: async () => s.epoch === 0n ? null : { epoch: s.epoch },
        upsert: async () => { s.epoch++; return {}; } },
      auditEvent: { create: async ({ data }: any) => { s.audit.push(data); return data; } },
    };
    const result = await fn(tx);
    state = s;
    return result;
  };
  const prisma = { $transaction: transaction } as unknown as PrismaClient;
  return { prisma, queries, snapshot: () => clone(), setTime: (date: Date) => {state.now=date;},
    setCASFailure: (value: boolean) => {failCAS=value;},
    mutate: (fn: (s: DbState) => void) => fn(state) };
}

describe('P5-057 WS1 / inert B1 writer: atomic source-aware personnel commands', () => {
  it('applies a Principal appointment as one command with two independent B1 source supports', async () => {
    const db = fake();
    const receipt = await new B1RoleCommandWriter(db.prisma).execute(appoint(), trusted);
    expect(receipt).toMatchObject({ state:'APPLIED', role:'PRINCIPAL', sourcesOpened:2,
      grantsCreated:2, sourcesClosed:0, grantsRevoked:0 });
    const s=db.snapshot();
    expect(s.commands).toHaveLength(2);
    expect(s.appointments).toHaveLength(2);
    expect(s.sources).toHaveLength(2);
    expect(s.grants.filter((g) => g.userId === target && g.revokedAt === null)).toHaveLength(2);
    expect(s.audit).toHaveLength(1);
    expect(s.epoch).toBe(1n);
    expect(db.queries[0]).toContain('SET LOCAL statement_timeout');
    expect(db.queries[1]).toContain('FROM authority_seats');
    expect(db.queries[2]).toContain('FROM users');
  });

  it('is idempotent for same request and rejects same key with different arguments', async () => {
    const db=fake();const w=new B1RoleCommandWriter(db.prisma);
    const r=await w.execute(appoint(),trusted);
    expect(await w.execute(appoint(),trusted)).toEqual(r);
    expect(db.snapshot().sources).toHaveLength(2);
    await expect(w.execute(appoint({targetUserId:next}),trusted)).rejects.toThrow();
    expect(db.snapshot().sources).toHaveLength(2);
  });

  it('rejects self, invalid target UUID, malformed replay token and invalid operation before DB', async () => {
    const db=fake();const w=new B1RoleCommandWriter(db.prisma);
    for(const patch of [
      { targetUserId: actor },{ targetUserId:'not-a-uuid' }, { requestKey:'tiny' },
      { operation:'GENERIC_GRANT' as B1RoleCommandInput['operation'] },
    ]) await expect(w.execute(appoint(patch),trusted)).rejects.toThrow();
    expect(db.queries).toEqual([]);
  });

  it('fails closed on disabled seat and missing B1 technical issuer seat', async () => {
    const db=fake();const w=new B1RoleCommandWriter(db.prisma);
    db.mutate((s) => { s.seats.find((x) => x.id===principalSeat)!.enabled=false; });
    await expect(w.execute(appoint(),trusted)).rejects.toThrow('STALE_OR_DISABLED_AUTHORITY_SEAT');
    db.mutate((s) => {s.seats.find((x) => x.id===principalSeat)!.enabled=true;
      s.appointments=s.appointments.filter((x)=>x.userId!==actor);});
    await expect(w.execute(appoint(),trusted)).rejects.toThrow();
    expect(db.snapshot().sources).toHaveLength(0);
  });

  it('refuses to grant leadership to a non-teaching staff profile', async () => {
    const db=fake();db.mutate((s) => {s.users.find((u) => u.id===target)!.profile.isTeachingStaff=false;});
    await expect(new B1RoleCommandWriter(db.prisma).execute(appoint(),trusted))
      .rejects.toThrow('TARGET_NOT_TEACHING_STAFF');
    expect(db.snapshot().sources).toHaveLength(0);
  });

  it('fails closed on active legacy grant and preserves it without modifying records', async () => {
    const db=fake();db.mutate((s) => {s.grants.push({
      id:idOf(550),userId:target,capabilityKey:'AUDIT_VIEW',scopeType:'SCHOOL_WIDE',
      scopeResourceId:null,validFrom:start,validUntil:null,revokedAt:null,coordinateId:null,
    });});
    const before=db.snapshot();await expect(new B1RoleCommandWriter(db.prisma).execute(appoint(),trusted))
      .rejects.toThrow('LEGACY_OR_FOREIGN_GRANT_NEEDS_RECONCILIATION');
    const after=db.snapshot();
    expect(after.grants).toEqual(before.grants);
    expect(after.sources).toHaveLength(0);
    expect(after.audit).toHaveLength(0);
  });

  it('transfer is atomic and does not require any appointment end-date input', async () => {
    const db=fake();const w=new B1RoleCommandWriter(db.prisma);
    const first=await w.execute(appoint(),trusted);db.setTime(oneHour());
    const r=await w.execute(appoint({operation:'TRANSFER',targetUserId:next,
      previousUserId:target,expectedAppointmentId:first.appointmentId!,
      expectedAuthorizationEpoch:'1',requestKey:'test-role-transfer-0002'}),trusted);
    expect(r).toMatchObject({operation:'TRANSFER',sourcesOpened:2,sourcesClosed:2,
      grantsCreated:2,grantsRevoked:2});
    const s=db.snapshot();
    expect(s.grants.filter((g) => g.userId === target && g.revokedAt===null)).toHaveLength(0);
    expect(s.grants.filter((g) => g.userId === next && g.revokedAt===null)).toHaveLength(2);
    expect(s.appointments.find((a) => a.id===first.appointmentId)!.validUntil).toEqual(oneHour());
    expect(s.appointments.find((a) => a.id===first.appointmentId)!.cancelledAt).toBeNull();
    expect(s.audit).toHaveLength(2);
  });

  it('never writes a zero-length appointment or source interval on same-tick dismissal', async () => {
    const db=fake();const w=new B1RoleCommandWriter(db.prisma);
    const first=await w.execute(appoint(),trusted);
    await expect(w.execute(appoint({operation:'DISMISS',
      expectedAppointmentId:first.appointmentId!,expectedAuthorizationEpoch:'1',requestKey:'test-same-tick-dismiss'}),trusted))
      .rejects.toThrow('INVALID_APPOINTMENT_TO_CLOSE');
    expect(db.snapshot().audit).toHaveLength(1);
  });

  it('dismissal revokes only B1-sourced grants and records source end', async () => {
    const db=fake();const w=new B1RoleCommandWriter(db.prisma);
    const first=await w.execute(appoint(),trusted);db.setTime(oneHour());
    const result=await w.execute(appoint({operation:'DISMISS',expectedAppointmentId:first.appointmentId!,
      expectedAuthorizationEpoch:'1',requestKey:'test-role-dismiss-0003'}),trusted);
    expect(result).toMatchObject({sourcesOpened:0,sourcesClosed:2,grantsCreated:0,grantsRevoked:2});
    expect(db.snapshot().revisions.filter((r) => r.disposition==='ENDED')).toHaveLength(2);
  });

  it('preserves AUDIT_VIEW after ending Principal source when independent technical B1 support remains', async () => {
    const db = fake();
    const earlier = new Date(start.getTime() - 3600000);
    const ids = {cmd:idOf(301),role:idOf(302),coord:idOf(303),
      grant:idOf(304),source:idOf(305),revision:idOf(306),projection:idOf(307),slice:idOf(308)};
    db.mutate((s) => {
      s.commands.push({id:ids.cmd,actorUserId:actor,targetUserId:target,
        commandType:'B1_TECHNICAL_DIRECT_GRANT',requestKey:'seed-indep',fingerprint:'seed',result:{}});
      s.coordinates.push({id:ids.coord,userId:target,capabilityKey:'AUDIT_VIEW',
        scopeType:'SCHOOL_WIDE',scopeResourceId:null,version:1n});
      s.grants.push({id:ids.grant,userId:target,capabilityKey:'AUDIT_VIEW',
        scopeType:'SCHOOL_WIDE',scopeResourceId:null,coordinateId:ids.coord,
        revokedAt:null,validFrom:earlier,validUntil:null});
      s.sources.push({id:ids.source,coordinateId:ids.coord,userId:target,
        kind:'TECHNICAL_DIRECT',legacyGrantId:null,appointmentId:null,
        createdCommandId:ids.cmd});
      s.revisions.push({id:ids.revision,sourceId:ids.source,coordinateId:ids.coord,
        revision:1n,validFrom:earlier,validUntil:null,disposition:'ACCEPTED',commandId:ids.cmd});
      s.projections.push({id:ids.projection,coordinateId:ids.coord,version:1n,
        commandId:ids.cmd,effectiveAt:earlier,slices:[{
          id:ids.slice,projectionRevisionId:ids.projection,coordinateId:ids.coord,
          grantId:ids.grant,validFromSnapshot:earlier,validUntilSnapshot:null,
          supports:[{coordinateId:ids.coord,sourceRevisionId:ids.revision,
            coveredFrom:earlier,coveredUntil:null}],
        }]});
    });
    const w = new B1RoleCommandWriter(db.prisma);
    const initial = await w.execute(appoint(),trusted);
    expect(initial).toMatchObject({grantsCreated:1,sourcesOpened:2});
    let s=db.snapshot();
    expect(s.grants.filter((g)=>g.userId===target&&g.capabilityKey==='AUDIT_VIEW')).toHaveLength(1);
    const projectionsBefore = s.projections.filter((p)=>p.coordinateId===ids.coord);
    expect(projectionsBefore[projectionsBefore.length-1]!.slices[0].supports).toHaveLength(2);
    db.setTime(oneHour());
    const end = await w.execute(appoint({operation:'DISMISS',expectedAppointmentId:initial.appointmentId!,
      expectedAuthorizationEpoch:'1',requestKey:'test-principal-dismiss-independent-source'}),trusted);
    expect(end).toMatchObject({sourcesClosed:2,grantsRevoked:1});
    s=db.snapshot();
    const auditGrant=s.grants.find((g)=>g.id===ids.grant)!;
    expect(auditGrant.revokedAt).toBeNull();
    const projectionsAfter=s.projections.filter((p)=>p.coordinateId===ids.coord);
    const latest=projectionsAfter[projectionsAfter.length-1]!;
    expect(latest.slices).toHaveLength(1);
    expect(latest.slices[0].supports).toHaveLength(1);
    expect(latest.slices[0].supports[0].sourceRevisionId).toBe(ids.revision);
  });

  it('enforces exclusive Principal occupancy and rejects a stale seat policy version', async () => {
    const db=fake();const w=new B1RoleCommandWriter(db.prisma);
    await w.execute(appoint(),trusted);
    await expect(w.execute(appoint({targetUserId:next,
      expectedAuthorizationEpoch:'1',requestKey:'test-concurrent-principal-appointment'}),trusted))
      .rejects.toThrow('PRINCIPAL_SEAT_OCCUPANCY_CONFLICT');
    await expect(w.execute(appoint({targetUserId:next,expectedSeatVersion:'2',
      expectedAuthorizationEpoch:'1',requestKey:'test-stale-policy-seat'}),trusted))
      .rejects.toThrow('STALE_OR_DISABLED_AUTHORITY_SEAT');
    expect(db.snapshot().audit).toHaveLength(1);
  });

  it('CAS failure aborts the entire transaction, including source, grant, command and audit', async () => {
    const db=fake();db.setCASFailure(true);
    await expect(new B1RoleCommandWriter(db.prisma).execute(appoint(),trusted))
      .rejects.toThrow('STALE_COORDINATE_CAS');
    const s=db.snapshot();
    expect(s.commands).toHaveLength(1);
    expect(s.sources).toHaveLength(0);
    expect(s.audit).toHaveLength(0);
  });

  it('VP appointments can coexist, without granting the generic CAPABILITY_GRANT key', async () => {
    const db=fake();const w=new B1RoleCommandWriter(db.prisma);
    const a=await w.execute(appoint({role:'VICE_PRINCIPAL_ACADEMIC',
      requestKey:'test-vp-appoint-001'}),trusted);
    const b=await w.execute(appoint({role:'VICE_PRINCIPAL_ACADEMIC',
      targetUserId:next,expectedAuthorizationEpoch:'1',requestKey:'test-vp-appoint-002'}),trusted);
    expect(a.sourcesOpened+b.sourcesOpened).toBe(4);
    expect(db.snapshot().grants.filter((g)=>g.userId!==actor&&g.capabilityKey==='CAPABILITY_GRANT')).toHaveLength(0);
  });
});
