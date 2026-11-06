import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { integration, testDatabaseUrl } from '../helpers/phase01-test-harness';

// Every new provenance row is a synthetic fixture rolled back with its transaction.
// No runtime writer, appointment API, backfill or new capability is enabled.
integration('P5-057 B1 inert provenance schema', () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const rollback = new Error('B1 fixture rollback');
  const from = new Date('2026-11-01T00:00:00.000Z');
  const until = new Date('2026-12-01T00:00:00.000Z');
  afterAll(() => db.$disconnect());

  async function rejected(tx: Prisma.TransactionClient, statement: string, code: string) {
    await tx.$executeRawUnsafe('SAVEPOINT b1_rejection');
    let failure: unknown;
    try { await tx.$executeRawUnsafe(statement); } catch (error) { failure = error; }
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT b1_rejection');
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT b1_rejection');
    expect(failure).toBeDefined();
    expect((failure as { meta?: { code?: string } }).meta?.code).toBe(code);
  }

  async function fixture(tx: Prisma.TransactionClient) {
    const user = await tx.user.create({ data: { username: `b1-${randomUUID()}`, passwordHash: 'fixture-only' } });
    const other = await tx.user.create({ data: { username: `b1-${randomUUID()}`, passwordHash: 'fixture-only' } });
    const key = `B1_${randomUUID().replaceAll('-', '').toUpperCase()}`;
    await tx.capabilityDefinition.create({ data: { key, description: 'fixture-only', allowedScopeTypes: ['PERSONAL', 'SUBJECT'] } });
    const command = await tx.accessCommand.create({ data: { actorUserId: user.id, targetUserId: user.id,
      commandType: 'FIXTURE', requestKey: randomUUID(), fingerprint: 'a'.repeat(64), effectiveAt: from, result: {} } });
    const coordinate = await tx.accessCoordinate.create({ data: { userId: user.id, capabilityKey: key, scopeType: 'PERSONAL' } });
    const source = await tx.grantSource.create({ data: { coordinateId: coordinate.id, userId: user.id,
      kind: 'PROFESSIONAL_BASELINE', createdCommandId: command.id } });
    const revision = await tx.grantSourceRevision.create({ data: { sourceId: source.id, coordinateId: coordinate.id,
      revision: 1n, validFrom: from, validUntil: until, disposition: 'ACCEPTED', commandId: command.id } });
    const grant = await tx.capabilityGrant.create({ data: { userId: user.id, capabilityKey: key,
      scopeType: 'PERSONAL', coordinateId: coordinate.id, validFrom: from, validUntil: until } });
    const projection = await tx.grantProjectionRevision.create({ data: { coordinateId: coordinate.id,
      version: 1n, commandId: command.id, effectiveAt: from } });
    const slice = await tx.grantProjectionSlice.create({ data: { projectionRevisionId: projection.id,
      coordinateId: coordinate.id, grantId: grant.id, validFromSnapshot: from, validUntilSnapshot: until } });
    return { user, other, key, command, coordinate, source, revision, grant, projection, slice };
  }
  async function isolated(run: (tx: Prisma.TransactionClient, f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
    try {
      await db.$transaction(async tx => { await run(tx, await fixture(tx)); throw rollback; }, { timeout: 20000 });
    } catch (error) { if (error !== rollback) throw error; }
  }

  it('retains both legacy indexes and the active overlap exclusion alongside the candidate index', async () => {
    const indexes = await db.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname,indexdef FROM pg_indexes WHERE tablename='capability_grants'`;
    expect(indexes.find(i => i.indexname === 'capability_grants_exact_key')?.indexdef).not.toContain('WHERE');
    expect(indexes.find(i => i.indexname === 'capability_grants_live_exact_key')?.indexdef).toContain('WHERE (revoked_at IS NULL)');
    const constraints = await db.$queryRaw<Array<{ def: string }>>`SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conname='capability_grants_no_active_overlap'`;
    expect(constraints[0].def).toContain('WHERE ((revoked_at IS NULL))');
  });

  it('normalizes NULL resource identity and rejects malformed coordinates and negative versions', () => isolated(async (tx, f) => {
    const values = `'${randomUUID()}','${f.user.id}','${f.key}'`;
    await rejected(tx, `INSERT INTO access_coordinates(id,user_id,capability_key,scope_type) VALUES (${values},'PERSONAL')`, '23505');
    await rejected(tx, `INSERT INTO access_coordinates(id,user_id,capability_key,scope_type) VALUES (${values},'SUBJECT')`, '23514');
    await rejected(tx, `UPDATE access_coordinates SET version=-1 WHERE id='${f.coordinate.id}'`, '23514');
    await rejected(tx, `INSERT INTO access_coordinates(id,user_id,capability_key,scope_type,scope_resource_id)
      VALUES (${values},'PERSONAL','${randomUUID()}')`, '23514');
  }));

  it('still rejects an identical interval after revocation because B1 retains the old full-history index', () => isolated(async (tx, f) => {
    await tx.capabilityGrant.update({ where: { id: f.grant.id }, data: { revokedAt: until } });
    await rejected(tx, `INSERT INTO capability_grants(id,user_id,capability_key,scope_type,valid_from,valid_until,updated_at)
      VALUES ('${randomUUID()}','${f.user.id}','${f.key}','PERSONAL','2026-11-01Z','2026-12-01Z',now())`, '23505');
  }));

  it('blocks cross-user and cross-resource grant/source links including nullable composite FK cases', () => isolated(async (tx, f) => {
    await rejected(tx, `UPDATE capability_grants SET user_id='${f.other.id}' WHERE id='${f.grant.id}'`, '23503');
    await rejected(tx, `INSERT INTO grant_sources(id,coordinate_id,user_id,kind,created_command_id)
      VALUES ('${randomUUID()}','${f.coordinate.id}','${f.other.id}','ACADEMIC_DIRECT','${f.command.id}')`, '23503');
    const a = await tx.accessCoordinate.create({ data: { userId: f.user.id, capabilityKey: f.key, scopeType: 'SUBJECT', scopeResourceId: randomUUID() } });
    await rejected(tx, `INSERT INTO grant_sources(id,coordinate_id,user_id,kind,legacy_grant_id,created_command_id)
      VALUES ('${randomUUID()}','${a.id}','${f.user.id}','LEGACY_UNCLASSIFIED','${f.grant.id}','${f.command.id}')`, '23503');
    await rejected(tx, `INSERT INTO capability_grants(id,user_id,capability_key,scope_type,scope_resource_id,coordinate_id,updated_at)
      VALUES ('${randomUUID()}','${f.user.id}','${f.key}','SUBJECT','${randomUUID()}','${a.id}',now())`, '23503');
    await rejected(tx, `INSERT INTO capability_grants(id,user_id,capability_key,scope_type,coordinate_id,updated_at)
      VALUES ('${randomUUID()}','${f.user.id}','${f.key}','SUBJECT','${a.id}',now())`, '23514');
  }));

  it('keeps legacy NULL-coordinate grants valid and does not enable evaluator semantics from provenance', () => isolated(async (tx, f) => {
    const grant = await tx.capabilityGrant.create({ data: { userId: f.other.id, capabilityKey: f.key,
      scopeType: 'PERSONAL', validFrom: from, validUntil: until } });
    expect(grant.coordinateId).toBeNull();
    await rejected(tx, `INSERT INTO grant_sources(id,coordinate_id,user_id,kind,created_command_id)
      VALUES ('${randomUUID()}','${f.coordinate.id}','${f.user.id}','LEGACY_UNCLASSIFIED','${f.command.id}')`, '23514');
  }));

  it('enforces exact coordinate identity throughout source, projection, slice and support FKs', () => isolated(async (tx, f) => {
    const c = await tx.accessCoordinate.create({ data: { userId: f.other.id, capabilityKey: f.key, scopeType: 'PERSONAL' } });
    await rejected(tx, `INSERT INTO grant_source_revisions(id,source_id,coordinate_id,revision,valid_from,disposition,command_id)
      VALUES ('${randomUUID()}','${f.source.id}','${c.id}',2,'2026-11-01Z','ACCEPTED','${f.command.id}')`, '23503');
    const otherProjection = await tx.grantProjectionRevision.create({ data: { coordinateId: c.id,
      version: 1n, commandId: f.command.id, effectiveAt: from } });
    await rejected(tx, `INSERT INTO grant_projection_slices(id,projection_revision_id,coordinate_id,grant_id,valid_from_snapshot)
      VALUES ('${randomUUID()}','${otherProjection.id}','${c.id}','${f.grant.id}','2026-11-01Z')`, '23503');
    await rejected(tx, `INSERT INTO grant_supports(slice_id,source_revision_id,coordinate_id,covered_from)
      VALUES ('${f.slice.id}','${f.revision.id}','${c.id}','2026-11-01Z')`, '23514');
  }));

  it('rejects out-of-range and cancelled-source support while retaining immutable snapshots', () => isolated(async (tx, f) => {
    await rejected(tx, `INSERT INTO grant_supports(slice_id,source_revision_id,coordinate_id,covered_from)
      VALUES ('${f.slice.id}','${f.revision.id}','${f.coordinate.id}','2026-11-01Z')`, '23514');
    await tx.grantSupport.create({ data: { sliceId: f.slice.id, sourceRevisionId: f.revision.id,
      coordinateId: f.coordinate.id, coveredFrom: from, coveredUntil: until } });
    const cancelled = await tx.grantSourceRevision.create({ data: { sourceId: f.source.id, coordinateId: f.coordinate.id,
      revision: 2n, validFrom: from, validUntil: until, disposition: 'CANCELLED', commandId: f.command.id } });
    await rejected(tx, `INSERT INTO grant_supports(slice_id,source_revision_id,coordinate_id,covered_from,covered_until)
      VALUES ('${f.slice.id}','${cancelled.id}','${f.coordinate.id}','2026-11-01Z','2026-12-01Z')`, '23514');
    for (const table of ['access_commands','grant_sources','grant_source_revisions','grant_projection_revisions','grant_projection_slices','grant_supports']) {
      await rejected(tx, `DELETE FROM ${table}`, '23514');
    }
    await rejected(tx, `UPDATE grant_source_revisions SET disposition='CANCELLED' WHERE id='${f.revision.id}'`, '23514');
    await rejected(tx, `DELETE FROM users WHERE id='${f.user.id}'`, '23503');
  }));

  it('enforces positive intervals, revision uniqueness and actor/type/request idempotency key uniqueness', () => isolated(async (tx, f) => {
    await rejected(tx, `INSERT INTO grant_source_revisions(id,source_id,coordinate_id,revision,valid_from,valid_until,disposition,command_id)
      VALUES ('${randomUUID()}','${f.source.id}','${f.coordinate.id}',2,'2026-11-01Z','2026-11-01Z','ENDED','${f.command.id}')`, '23514');
    await rejected(tx, `INSERT INTO grant_source_revisions(id,source_id,coordinate_id,revision,valid_from,disposition,command_id)
      VALUES ('${randomUUID()}','${f.source.id}','${f.coordinate.id}',1,'2026-11-01Z','ACCEPTED','${f.command.id}')`, '23505');
    await rejected(tx, `INSERT INTO access_commands(id,actor_user_id,target_user_id,command_type,request_key,fingerprint,effective_at,result)
      VALUES ('${randomUUID()}','${f.user.id}','${f.user.id}','FIXTURE','${f.command.requestKey}','${'a'.repeat(64)}','2026-11-01Z','{}')`, '23505');
  }));

  it('uses half-open seat occupancy without a global PHT count and binds appointment source ownership', () => isolated(async (tx, f) => {
    const seat = await tx.authoritySeat.create({ data: { key: randomUUID(), policyVersion: 1n, enabled: false } });
    const appointment = await tx.roleAppointment.create({ data: { userId: f.user.id, seatId: seat.id,
      templateKey: 'FIXTURE', templateVersion: 'fixture', templateSnapshot: {}, validFrom: from,
      validUntil: until, createdCommandId: f.command.id } });
    await rejected(tx, `INSERT INTO role_appointments(id,user_id,seat_id,template_key,template_version,template_snapshot,valid_from,created_command_id)
      VALUES ('${randomUUID()}','${f.other.id}','${seat.id}','FIXTURE','fixture','{}','2026-11-15Z','${f.command.id}')`, '23P01');
    await tx.roleAppointment.create({ data: { userId: f.other.id, seatId: seat.id, templateKey: 'FIXTURE',
      templateVersion: 'fixture', templateSnapshot: {}, validFrom: until, createdCommandId: f.command.id } });
    const c = await tx.accessCoordinate.create({ data: { userId: f.other.id, capabilityKey: f.key, scopeType: 'PERSONAL' } });
    await rejected(tx, `INSERT INTO grant_sources(id,coordinate_id,user_id,kind,appointment_id,created_command_id)
      VALUES ('${randomUUID()}','${c.id}','${f.other.id}','ROLE_TEMPLATE','${appointment.id}','${f.command.id}')`, '23503');
  }));
});
