'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { summarize, readSnapshot, validateTarget } = require('./b1-bootstrap-readonly-preflight.cjs');

const user = '10000000-0000-4000-8000-000000000001';
const issuer = '20000000-0000-4000-8000-000000000002';
function data(link = null) {
  const at = new Date('2026-11-21T15:00:00Z');
  const keys = ['USER_MANAGE', 'CAPABILITY_GRANT', 'AUDIT_VIEW',
    'SYSTEM_ADMIN', 'STAFF_VIEW', 'LESSON_REPORT', 'TIMETABLE_VIEW',
    'REPORTING_VIEW', 'SCHOOL_POLICY_VIEW'];
  const activeGrants = keys.map((capabilityKey, i) => ({
    id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    userId: user, capabilityKey, scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null, validFrom: at, validUntil: null,
    grantedByUserId: issuer, coordinateId: link,
  }));
  return { activeGrants, activeGrantCount: activeGrants.length,
    technicalSeatCount: 0, technicalEnabledSeatCount: 0, technicalAppointmentCount: 0,
    independentIssuerCandidateCount: 0, b1CommandCount: 0,
    coordinateCount: 0, grantSourceCount: 0, projectionRevisionCount: 0,
    authorizationEpoch: null };
}

test('nine unlinked legacy grants: no authority fabricated and no PII output', () => {
  const input = data();
  const before = structuredClone(input);
  const report = summarize(input);
  assert.equal(report.canConfirm, false);
  assert.equal(report.provenanceVerified, false);
  assert.equal(report.inventory.activeGrantCount, 9);
  assert.equal(report.inventory.activeLegacyUnlinkedCount, 9);
  assert.equal(report.inventory.candidateTechnicalUsersWithTwoGrantsCount, 1);
  assert.ok(report.databaseBlockers.includes('LEGACY_ACTIVE_GRANTS_UNLINKED'));
  assert.ok(report.databaseBlockers.includes('TECHNICAL_SEAT_NOT_UNIQUELY_ESTABLISHED'));
  assert.ok(report.databaseBlockers.includes('INDEPENDENT_TECHNICAL_APPOINTMENT_NOT_PROVEN'));
  const out = JSON.stringify(report);
  assert.ok(!out.includes(user));
  assert.ok(!out.includes(issuer));
  assert.deepEqual(input, before);
});

test('rights fingerprint detects grant modification, but is insensitive to linkage-only changes', () => {
  const legacy = summarize(data());
  const linked = summarize(data('40000000-0000-4000-8000-000000000004'));
  assert.equal(legacy.grantRightsFingerprintSha256, linked.grantRightsFingerprintSha256);
  assert.notEqual(legacy.grantLinkageFingerprintSha256, linked.grantLinkageFingerprintSha256);
  const replaced = data();
  replaced.activeGrants[0].capabilityKey = 'CHANGED';
  assert.notEqual(legacy.grantRightsFingerprintSha256,
    summarize(replaced).grantRightsFingerprintSha256);
});

test('duplicate effective grants and multiple admin seats fail closed', () => {
  const bad = data();
  bad.activeGrants.push({ ...bad.activeGrants[0], id: '50000000-0000-4000-8000-000000000005' });
  bad.activeGrantCount = bad.activeGrants.length;
  bad.technicalSeatCount = 2;
  bad.technicalEnabledSeatCount = 1;
  const report = summarize(bad);
  assert.equal(report.inventory.overlapsCount, 1);
  assert.ok(report.databaseBlockers.includes('OVERLAPPING_ACTIVE_GRANTS'));
  assert.ok(report.databaseBlockers.includes('TECHNICAL_SEAT_NOT_UNIQUELY_ESTABLISHED'));
});

test('even with technical evidence present, independent human signoff is not inferred', () => {
  const input = data('40000000-0000-4000-8000-000000000004');
  Object.assign(input, { technicalSeatCount: 1, technicalEnabledSeatCount: 1, technicalAppointmentCount: 1,
    independentIssuerCandidateCount: 1, b1CommandCount: 1 });
  const report = summarize(input);
  assert.equal(report.canConfirm, false);
  assert.equal(report.provenanceVerified, false);
  assert.deepEqual(report.databaseBlockers, []);
  assert.ok(report.externalApprovalsNotCertified.includes('INDEPENDENT_HUMAN_ATTESTATION'));
});

test('incomplete snapshot and bound overflow fail closed', () => {
  assert.throws(() => summarize({ activeGrants: null }), /B1_PREFLIGHT_INCOMPLETE_SNAPSHOT/);
  const big = data();
  big.activeGrants = Array.from({ length: 10001 }, (_, i) =>
    ({ ...big.activeGrants[0], id: String(i).padStart(12, '0') }));
  big.activeGrantCount = big.activeGrants.length;
  const report = summarize(big);
  assert.equal(report.inventory.inventoryTruncated, true);
  assert.equal(report.grantRightsFingerprintSha256, null);
  assert.ok(report.databaseBlockers.includes('ACTIVE_GRANT_INVENTORY_TRUNCATED'));
});

test('DB snapshot begins READ ONLY before any SELECT and disallows mutations', async () => {
  const calls = [];
  const fixed = data();
  const tx = {
    $executeRaw: async (parts) => {
      calls.push(parts.join(''));
      assert.match(parts.join(''), /^(SET TRANSACTION READ ONLY|SET LOCAL statement_timeout)/);
      return 0;
    },
    $queryRaw: async (parts) => {
      calls.push(parts.join(''));
      return [{ readOnly: 'on', at: new Date('2026-11-21T15:00:00Z') }];
    },
    capabilityGrant: {
      count: async () => fixed.activeGrants.length,
      findMany: async () => fixed.activeGrants,
    },
    authoritySeat: { findMany: async () => [] },
    roleAppointment: { findMany: async () => [] },
    accessCommand: { count: async () => 0 },
    accessCoordinate: { count: async () => 0 },
    grantSource: { count: async () => 0 },
    grantProjectionRevision: { count: async () => 0 },
    authorizationState: { findUnique: async () => null },
  };
  const client = { $transaction: async (cb) => cb(tx) };
  const snapshot = await readSnapshot(client);
  assert.equal(calls[0], 'SET TRANSACTION READ ONLY');
  assert.equal(calls[1].includes('transaction_read_only'), true);
  assert.equal(snapshot.activeGrantCount, 9);
  assert.ok(calls.every((c) => !/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|FOR UPDATE)\b/i.test(c)));
});

test('explicit READ ONLY verification is mandatory', async () => {
  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async () => [{ readOnly: 'off', at: new Date() }],
  };
  await assert.rejects(() => readSnapshot({ $transaction: async (cb) => cb(tx) }),
    /B1_READ_ONLY_TRANSACTION_NOT_VERIFIED/);
});
test('CLI rejects an unexpected database host, name, port, schema or protocol', () => {
  const valid = {
    B1_PREFLIGHT_ACK: 'READ_ONLY',
    B1_PREFLIGHT_EXPECT_HOST: '127.0.0.1',
    B1_PREFLIGHT_EXPECT_DATABASE: 'baogiang_test',
    B1_PREFLIGHT_EXPECT_PORT: '5432',
    B1_PREFLIGHT_EXPECT_SCHEMA: 'public',
    B1_PREFLIGHT_DATABASE_URL: 'postgresql://readonly@127.0.0.1:5432/baogiang_test?schema=public',
  };
  assert.equal(validateTarget(valid), valid.B1_PREFLIGHT_DATABASE_URL);
  const cases = [
    { B1_PREFLIGHT_ACK: '' },
    { B1_PREFLIGHT_EXPECT_HOST: 'vps-example.invalid' },
    { B1_PREFLIGHT_EXPECT_DATABASE: 'unrelated_database' },
    { B1_PREFLIGHT_EXPECT_PORT: '5433' },
    { B1_PREFLIGHT_EXPECT_SCHEMA: 'another_schema' },
    { B1_PREFLIGHT_DATABASE_URL: 'mysql://readonly@127.0.0.1/baogiang_test' },
    { B1_PREFLIGHT_DATABASE_URL: 'postgresql://readonly@other-host/baogiang_test' },
    { B1_PREFLIGHT_DATABASE_URL: 'postgresql://readonly@127.0.0.1/foreign_db' },
  ];
  for (const overrides of cases) {
    assert.throws(() => validateTarget({ ...valid, ...overrides }), /^Error: B1_/);
  }
});
