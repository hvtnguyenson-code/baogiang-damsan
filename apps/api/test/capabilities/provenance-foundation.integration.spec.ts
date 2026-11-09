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
  it('retains one grant when a role source ends but independent baseline still supports it', () => isolated(async (tx, f) => {
    const seat = await tx.authoritySeat.create({ data: {
      key: 'B1_TEST_' + randomUUID(), policyVersion: 1n, enabled: false,
    } });
    const appointment = await tx.roleAppointment.create({ data: {
      userId: f.user.id, seatId: seat.id, templateKey: 'SUBJECT_LEADER',
      templateVersion: 'fixture', templateSnapshot: { onlyTest: true },
      validFrom: from, validUntil: until, createdCommandId: f.command.id,
    } });
    const roleSource = await tx.grantSource.create({ data: {
      coordinateId: f.coordinate.id, userId: f.user.id,
      kind: 'ROLE_TEMPLATE', appointmentId: appointment.id,
      createdCommandId: f.command.id,
    } });
    const roleRevision = await tx.grantSourceRevision.create({ data: {
      sourceId: roleSource.id, coordinateId: f.coordinate.id, revision: 1n,
      validFrom: from, validUntil: until, disposition: 'ACCEPTED', commandId: f.command.id,
    } });
    // Two distinct sources, one real grant, one source-supported projection.
    const projection2 = await tx.grantProjectionRevision.create({ data: {
      coordinateId: f.coordinate.id, version: 2n, commandId: f.command.id, effectiveAt: from,
    } });
    const slice2 = await tx.grantProjectionSlice.create({ data: {
      projectionRevisionId: projection2.id, coordinateId: f.coordinate.id,
      grantId: f.grant.id, validFromSnapshot: from, validUntilSnapshot: until,
    } });
    for (const revision of [f.revision, roleRevision]) {
      await tx.grantSupport.create({ data: {
        sliceId: slice2.id, sourceRevisionId: revision.id,
        coordinateId: f.coordinate.id, coveredFrom: from, coveredUntil: until,
      } });
    }
    expect(await tx.capabilityGrant.count({ where: {
      userId: f.user.id, capabilityKey: f.key, scopeType: 'PERSONAL', revokedAt: null,
    } })).toBe(1);
    expect(await tx.grantSupport.count({ where: { sliceId: slice2.id } })).toBe(2);

    // A second overlapping grant must be rejected even when the source is independent.
    await tx.$executeRawUnsafe('SAVEPOINT b1_two_source_overlap');
    let overlapFailure: unknown;
    try {
      await tx.capabilityGrant.create({ data: {
        userId: f.user.id, capabilityKey: f.key, scopeType: 'PERSONAL',
        coordinateId: f.coordinate.id,
        validFrom: new Date('2026-11-15T00:00:00.000Z'), validUntil: until,
      } });
    } catch (error) { overlapFailure = error; }
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT b1_two_source_overlap');
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT b1_two_source_overlap');
    expect(overlapFailure).toBeDefined();

    const effectiveAt = new Date('2026-11-15T00:00:00.000Z');
    const endCommand = await tx.accessCommand.create({ data: {
      actorUserId: f.other.id, targetUserId: f.user.id,
      commandType: 'TEST_DISMISS_ROLE', requestKey: randomUUID(),
      fingerprint: 'b'.repeat(64), effectiveAt,
      result: { onlyTest: true },
    } });
    await tx.roleAppointment.update({ where: { id: appointment.id }, data: { validUntil: effectiveAt } });
    await tx.grantSourceRevision.create({ data: {
      sourceId: roleSource.id, coordinateId: f.coordinate.id,
      revision: 2n, validFrom: from, validUntil: effectiveAt,
      disposition: 'ENDED', commandId: endCommand.id,
    } });
    const projection3 = await tx.grantProjectionRevision.create({ data: {
      coordinateId: f.coordinate.id, version: 3n,
      commandId: endCommand.id, effectiveAt,
    } });
    const slice3 = await tx.grantProjectionSlice.create({ data: {
      projectionRevisionId: projection3.id, coordinateId: f.coordinate.id,
      grantId: f.grant.id, validFromSnapshot: effectiveAt, validUntilSnapshot: until,
    } });
    await tx.grantSupport.create({ data: {
      sliceId: slice3.id, sourceRevisionId: f.revision.id,
      coordinateId: f.coordinate.id, coveredFrom: effectiveAt, coveredUntil: until,
    } });
    const sameGrant = await tx.capabilityGrant.findUniqueOrThrow({ where: { id: f.grant.id } });
    expect(sameGrant.revokedAt).toBeNull();
    expect(sameGrant.validUntil?.toISOString()).toBe(until.toISOString());
    const latestSupport = await tx.grantSupport.findMany({
      where: { sliceId: slice3.id }, select: { sourceRevisionId: true },
    });
    expect(latestSupport.map(row => row.sourceRevisionId)).toEqual([f.revision.id]);
    const latestRole = await tx.grantSourceRevision.findFirstOrThrow({
      where: { sourceId: roleSource.id }, orderBy: { revision: 'desc' },
    });
    expect(latestRole.disposition).toBe('ENDED');
    expect(latestRole.validUntil?.toISOString()).toBe(effectiveAt.toISOString());
    expect(await tx.grantSupport.count({ where: { sliceId: slice2.id } })).toBe(2);
  }));

  it('closes future grant coverage at confirmation when the only source ends', () => isolated(async (tx, f) => {
    const effectiveAt = new Date('2026-11-15T00:00:00.000Z');
    const endCommand = await tx.accessCommand.create({ data: {
      actorUserId: f.other.id, targetUserId: f.user.id,
      commandType: 'TEST_END_ONLY_SOURCE', requestKey: randomUUID(),
      fingerprint: 'c'.repeat(64), effectiveAt, result: { onlyTest: true },
    } });
    await tx.grantSourceRevision.create({ data: {
      sourceId: f.source.id, coordinateId: f.coordinate.id,
      revision: 2n, validFrom: from, validUntil: effectiveAt,
      disposition: 'ENDED', commandId: endCommand.id,
    } });
    const changed = await tx.capabilityGrant.update({
      where: { id: f.grant.id }, data: { validUntil: effectiveAt },
    });
    expect(changed.revokedAt).toBeNull();
    expect(changed.validUntil?.toISOString()).toBe(effectiveAt.toISOString());
    const projection = await tx.grantProjectionRevision.create({ data: {
      coordinateId: f.coordinate.id, version: 2n, commandId: endCommand.id, effectiveAt,
    } });
    expect(await tx.grantProjectionSlice.count({ where: { projectionRevisionId: projection.id } })).toBe(0);
    expect(await tx.capabilityGrant.count({ where: {
      id: f.grant.id, revokedAt: null, validFrom: { lte: effectiveAt },
      OR: [{ validUntil: null }, { validUntil: { gt: effectiveAt } }],
    } })).toBe(0);
    expect(await tx.capabilityGrant.count({ where: { id: f.grant.id } })).toBe(1);
    expect(await tx.grantProjectionSlice.count({ where: { id: f.slice.id } })).toBe(1);
  }));


  it('rejects stale coordinate and appointment version writes before projection commit', () => isolated(async (tx, f) => {
    const first = await tx.accessCoordinate.updateMany({
      where: { id: f.coordinate.id, version: 0n },
      data: { version: { increment: 1n } },
    });
    const stale = await tx.accessCoordinate.updateMany({
      where: { id: f.coordinate.id, version: 0n },
      data: { version: { increment: 1n } },
    });
    expect(first.count).toBe(1);
    expect(stale.count).toBe(0);
    expect((await tx.accessCoordinate.findUniqueOrThrow({ where: { id: f.coordinate.id } })).version).toBe(1n);

    const seat = await tx.authoritySeat.create({
      data: { key: 'B1_CAS_' + randomUUID(), policyVersion: 1n, enabled: false },
    });
    const appointment = await tx.roleAppointment.create({ data: {
      userId: f.user.id, seatId: seat.id, templateKey: 'SUBJECT_LEADER',
      templateVersion: 'fixture', templateSnapshot: { onlyTest: true },
      validFrom: from, validUntil: until, createdCommandId: f.command.id,
    } });
    const endedAt = new Date('2026-11-15T00:00:00.000Z');
    const accepted = await tx.roleAppointment.updateMany({
      where: { id: appointment.id, version: 0n },
      data: { validUntil: endedAt, version: { increment: 1n } },
    });
    const rejectedStale = await tx.roleAppointment.updateMany({
      where: { id: appointment.id, version: 0n },
      data: { validUntil: new Date('2026-11-20T00:00:00.000Z'), version: { increment: 1n } },
    });
    expect(accepted.count).toBe(1);
    expect(rejectedStale.count).toBe(0);
    const current = await tx.roleAppointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(current.version).toBe(1n);
    expect(current.validUntil?.toISOString()).toBe(endedAt.toISOString());
    expect(await tx.grantProjectionRevision.count({ where: { coordinateId: f.coordinate.id } })).toBe(1);
  }));

  it('preserves the first receipt on an actor/type/request-key replay with different payload', () => isolated(async (tx, f) => {
    const requestKey = randomUUID();
    const first = await tx.accessCommand.create({ data: {
      actorUserId: f.other.id, targetUserId: f.user.id,
      commandType: 'B1_TEST_REPLAY', requestKey, fingerprint: 'd'.repeat(64),
      effectiveAt: from, result: { outcome: 'FIRST' },
    } });
    await tx.$executeRawUnsafe('SAVEPOINT b1_conflicting_replay');
    let failure: unknown;
    try {
      await tx.accessCommand.create({ data: {
        actorUserId: f.other.id, targetUserId: f.user.id,
        commandType: 'B1_TEST_REPLAY', requestKey, fingerprint: 'e'.repeat(64),
        effectiveAt: until, result: { outcome: 'SECOND' },
      } });
    } catch (error) { failure = error; }
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT b1_conflicting_replay');
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT b1_conflicting_replay');
    expect(failure).toBeDefined();
    const receipt = await tx.accessCommand.findUniqueOrThrow({ where: { id: first.id } });
    expect(receipt.fingerprint).toBe('d'.repeat(64));
    expect(receipt.result).toEqual({ outcome: 'FIRST' });
    expect(await tx.accessCommand.count({ where: {
      actorUserId: f.other.id, commandType: 'B1_TEST_REPLAY', requestKey,
    } })).toBe(1);
  }));

  it('rolls back the command, source revision and grant adjustment together on failure', async () => {
    const failure = new Error('synthetic downstream failure');
    let commandId = '';
    let userId = '';
    let grantId = '';
    await expect(db.$transaction(async (tx) => {
      const f = await fixture(tx);
      userId = f.user.id;
      grantId = f.grant.id;
      const command = await tx.accessCommand.create({ data: {
        actorUserId: f.other.id, targetUserId: f.user.id,
        commandType: 'B1_TEST_ROLLBACK', requestKey: randomUUID(),
        fingerprint: 'f'.repeat(64), effectiveAt: from, result: { onlyTest: true },
      } });
      commandId = command.id;
      const endedAt = new Date('2026-11-15T00:00:00.000Z');
      await tx.grantSourceRevision.create({ data: {
        sourceId: f.source.id, coordinateId: f.coordinate.id,
        revision: 2n, validFrom: from, validUntil: endedAt,
        disposition: 'ENDED', commandId,
      } });
      await tx.capabilityGrant.update({
        where: { id: f.grant.id }, data: { validUntil: endedAt },
      });
      throw failure;
    }, { timeout: 20000 })).rejects.toBe(failure);
    expect(await db.accessCommand.findUnique({ where: { id: commandId } })).toBeNull();
    expect(await db.capabilityGrant.findUnique({ where: { id: grantId } })).toBeNull();
    expect(await db.user.findUnique({ where: { id: userId } })).toBeNull();
  });

});
