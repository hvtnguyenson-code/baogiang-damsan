'use strict';
/**
 * P5-057 WS1/B1: whole-database READ ONLY inventory, not a bootstrap writer.
 * No API/route/cron, no actor selection, no production mutation.
 *
 * B1_PREFLIGHT_ACK=READ_ONLY B1_PREFLIGHT_DATABASE_URL=postgresql://...
 *   node scripts/ops/b1-bootstrap-readonly-preflight.cjs
 */
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');

const MAX_ACTIVE_GRANTS = 10000;
const digest = (records) => createHash('sha256').update(JSON.stringify(records)).digest('hex');

function summarize(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.activeGrants) ||
      !Number.isInteger(snapshot.technicalSeatCount) ||
      !Number.isInteger(snapshot.technicalAppointmentCount)) {
    throw new Error('B1_PREFLIGHT_INCOMPLETE_SNAPSHOT');
  }
  const rows = snapshot.activeGrants;
  const truncated = rows.length > MAX_ACTIVE_GRANTS;
  const active = rows.slice(0, MAX_ACTIVE_GRANTS);
  const normalized = active.map((g) => ({
    id: g.id, userId: g.userId, capabilityKey: g.capabilityKey,
    scopeType: g.scopeType, scopeResourceId: g.scopeResourceId,
    validFrom: g.validFrom.toISOString(),
    validUntil: g.validUntil?.toISOString() || null,
    grantedByUserId: g.grantedByUserId,
  })).sort((a, b) => a.id.localeCompare(b.id));
  const coordinatesByGrantId = new Map(active.map((g) => [g.id, g.coordinateId]));
  const full = normalized.map((g) => ({
    ...g, coordinateId: coordinatesByGrantId.get(g.id),
  }));
  const activeLegacyUnlinked = active.filter((g) => g.coordinateId === null).length;
  const technicalGrants = new Map();
  const overlaps = new Map();
  for (const g of active) {
    if (g.scopeType === 'SCHOOL_WIDE' && g.scopeResourceId === null &&
        ['USER_MANAGE', 'CAPABILITY_GRANT'].includes(g.capabilityKey)) {
      if (!technicalGrants.has(g.userId)) technicalGrants.set(g.userId, new Set());
      technicalGrants.get(g.userId).add(g.capabilityKey);
    }
    const key = [g.userId,g.capabilityKey,g.scopeType,g.scopeResourceId || ''].join('|');
    overlaps.set(key, (overlaps.get(key) || 0) + 1);
  }
  const candidateCount = [...technicalGrants.values()]
    .filter((keys) => keys.has('USER_MANAGE') && keys.has('CAPABILITY_GRANT')).length;
  const blockers = [];
  if (truncated) blockers.push('ACTIVE_GRANT_INVENTORY_TRUNCATED');
  if (activeLegacyUnlinked) blockers.push('LEGACY_ACTIVE_GRANTS_UNLINKED');
  if (snapshot.technicalSeatCount !== 1 || snapshot.technicalEnabledSeatCount !== 1)
    blockers.push('TECHNICAL_SEAT_NOT_UNIQUELY_ESTABLISHED');
  if (snapshot.technicalAppointmentCount !== 1 ||
      snapshot.independentIssuerCandidateCount !== 1) {
    blockers.push('INDEPENDENT_TECHNICAL_APPOINTMENT_NOT_PROVEN');
  }
  if (!snapshot.b1CommandCount) blockers.push('B1_COMMAND_EVIDENCE_MISSING');
  if ([...overlaps.values()].some((n) => n > 1)) blockers.push('OVERLAPPING_ACTIVE_GRANTS');
  return {
    mode: 'READ_ONLY',
    canConfirm: false,
    provenanceVerified: false,
    grantRightsFingerprintSha256: truncated ? null : digest(normalized),
    grantLinkageFingerprintSha256: truncated ? null : digest(full),
    inventory: {
      activeGrantCount: snapshot.activeGrantCount,
      inventoriedActiveGrantCount: active.length,
      activeLegacyUnlinkedCount: activeLegacyUnlinked,
      candidateTechnicalUsersWithTwoGrantsCount: candidateCount,
      technicalSeatCount: snapshot.technicalSeatCount,
      technicalEnabledSeatCount: snapshot.technicalEnabledSeatCount,
      technicalAppointmentCount: snapshot.technicalAppointmentCount,
      independentIssuerCandidateCount: snapshot.independentIssuerCandidateCount,
      b1CommandCount: snapshot.b1CommandCount,
      coordinateCount: snapshot.coordinateCount,
      grantSourceCount: snapshot.grantSourceCount,
      projectionRevisionCount: snapshot.projectionRevisionCount,
      authorizationEpoch: snapshot.authorizationEpoch,
      overlapsCount: [...overlaps.values()].filter((n) => n > 1).length,
      inventoryTruncated: truncated,
    },
    databaseBlockers: blockers,
    externalApprovalsNotCertified: [
      'INDEPENDENT_HUMAN_ATTESTATION',
      'G1_G3_G4_POLICY_DECISIONS',
      'LEGACY_PROVENANCE_RECONCILIATION',
      'BACKUP_AND_ROLLBACK_REHEARSAL',
      'SEVEN_PERSONA_INTERACTIVE_UAT',
      'EXPLICIT_PRODUCTION_CUTOVER_APPROVAL',
    ],
  };
}

async function readSnapshot(client) {
  const { Prisma } = require('@prisma/client');
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const setting = await tx.$queryRaw`SELECT current_setting('transaction_read_only') AS "readOnly", transaction_timestamp() AS "at"`;
    if (setting.length !== 1 || setting[0].readOnly !== 'on' ||
        !(setting[0].at instanceof Date)) {
      throw new Error('B1_READ_ONLY_TRANSACTION_NOT_VERIFIED');
    }
    await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
    const now = setting[0].at;
    const activeWhere = {
      revokedAt: null, validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    };
    const [activeGrantCount, activeGrants, technicalSeats, technicalAppointments,
      b1CommandCount, coordinateCount, grantSourceCount,
      projectionRevisionCount, authState] = await Promise.all([
      tx.capabilityGrant.count({ where: activeWhere }),
      tx.capabilityGrant.findMany({ where: activeWhere, orderBy: { id: 'asc' },
        take: MAX_ACTIVE_GRANTS + 1,
        select: { id: true, userId: true, capabilityKey: true,
          scopeType: true, scopeResourceId: true, validFrom: true,
          validUntil: true, grantedByUserId: true, coordinateId: true } }),
      tx.authoritySeat.findMany({ where: { key: 'TECHNICAL_ACCOUNT_ADMIN' },
        select: { key: true, enabled: true, policyVersion: true }, take: 2 }),
      tx.roleAppointment.findMany({ where: {
        templateKey: 'TECHNICAL_ACCOUNT_ADMIN', cancelledAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      }, select: { userId: true, seat: { select: { key: true, enabled: true } },
        command: { select: { actorUserId: true, targetUserId: true } } }, take: 3 }),
      tx.accessCommand.count({ where: { commandType: { startsWith: 'B1_' } } }),
      tx.accessCoordinate.count(), tx.grantSource.count(),
      tx.grantProjectionRevision.count(),
      tx.authorizationState.findUnique({ where: { id: 'B1_GLOBAL' },
        select: { epoch: true } }),
    ]);
    const independentIssuerCandidateCount = technicalAppointments.filter((a) =>
      a.seat?.key === 'TECHNICAL_ACCOUNT_ADMIN' && a.seat.enabled &&
      a.command.targetUserId === a.userId && a.command.actorUserId !== a.userId).length;
    return {
      activeGrantCount, activeGrants,
      technicalSeatCount: technicalSeats.length,
      technicalEnabledSeatCount: technicalSeats.filter((s) => s.enabled && s.policyVersion >= 1n).length,
      technicalAppointmentCount: technicalAppointments.length,
      independentIssuerCandidateCount, b1CommandCount,
      coordinateCount, grantSourceCount, projectionRevisionCount,
      authorizationEpoch: authState?.epoch.toString() || null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    maxWait: 3000, timeout: 20000 });
}

function validateTarget(env) {
  const raw = env.B1_PREFLIGHT_DATABASE_URL?.trim();
  if (env.B1_PREFLIGHT_ACK !== 'READ_ONLY' || !raw ||
      !env.B1_PREFLIGHT_EXPECT_HOST?.trim() ||
      !env.B1_PREFLIGHT_EXPECT_DATABASE?.trim()) {
    throw new Error('B1_EXPLICIT_READ_ONLY_CONNECTION_REQUIRED');
  }
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('B1_PREFLIGHT_DATABASE_TARGET_MISMATCH'); }
  const db = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const actualHost = url.hostname.toLowerCase();
  const expectedHost = env.B1_PREFLIGHT_EXPECT_HOST.trim().toLowerCase();
  const expectedDb = env.B1_PREFLIGHT_EXPECT_DATABASE.trim();
  const expectedPort = env.B1_PREFLIGHT_EXPECT_PORT?.trim() || '5432';
  const expectedSchema = env.B1_PREFLIGHT_EXPECT_SCHEMA?.trim() || 'public';
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !actualHost || actualHost !== expectedHost ||
      (url.port || '5432') !== expectedPort ||
      db !== expectedDb || !db ||
      (url.searchParams.get('schema') || 'public') !== expectedSchema ||
      url.hash) {
    throw new Error('B1_PREFLIGHT_DATABASE_TARGET_MISMATCH');
  }
  return raw;
}

async function main() {
  const verifiedUrl = validateTarget(process.env);
  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient({
    datasources: { db: { url: verifiedUrl } },
  });
  try {
    const report = summarize(await readSnapshot(client));
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } finally {
    await client.$disconnect();
  }
}

module.exports = { summarize, readSnapshot, validateTarget };
if (require.main === module) {
  main().catch((error) => {
    // Never print Prisma connection strings, user records, query parameters or passwords.
    const code = /^B1_[A-Z_]+$/.test(error.message) ? error.message
      : 'B1_PREFLIGHT_DATABASE_READ_FAILED';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  });
}
