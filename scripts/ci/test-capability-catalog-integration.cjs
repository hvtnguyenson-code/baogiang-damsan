const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { CAPABILITIES, syncCapabilityCatalog, verifyCapabilityCatalog } = require('../../prisma/capability-catalog.cjs');

async function main() {
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || !/^postgresql:\/\/[^/]+@127\.0\.0\.1:5432\/baogiang_test\?schema=public$/.test(process.env.DATABASE_URL ?? '')) throw new Error('Catalog integration requires the certified isolated CI database.');
  const prisma = new PrismaClient();
  try {
    await prisma.capabilityGrant.deleteMany(); await prisma.capabilityDefinition.deleteMany();
    const cli = spawnSync(process.execPath, [path.join(__dirname, '..', 'deploy', 'node', 'sync-capability-catalog.cjs')], { env: process.env, encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr); // P1: exact production entrypoint
    const cliSummary = JSON.parse(cli.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(cliSummary.state, 'completed');
    assert.equal(cliSummary.expectedDefinitionCount, CAPABILITIES.length);
    assert.equal(cliSummary.verifiedDefinitionCount, CAPABILITIES.length);
    await verifyCapabilityCatalog(prisma);
    await syncCapabilityCatalog(prisma); // P2
    assert.equal(await prisma.capabilityDefinition.count({ where: { key: { in: CAPABILITIES.map(([key]) => key) } } }), CAPABILITIES.length);
    await prisma.capabilityDefinition.update({ where: { key: 'REPORTING_STATEMENT_READ' }, data: { description: 'drift', allowedScopeTypes: ['PERSONAL'], isSystem: false, isActive: false } });
    await syncCapabilityCatalog(prisma); // P3
    await prisma.capabilityDefinition.create({ data: { key: 'CUSTOM_LEGACY_CAPABILITY', description: 'preserved', allowedScopeTypes: ['SCHOOL_WIDE'], isSystem: false, isActive: false } });
    const user = await prisma.user.create({ data: { username: 'catalog-sync-test', passwordHash: 'test' } });
    const grant = await prisma.capabilityGrant.create({ data: { userId: user.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'PERSONAL' } });
    await syncCapabilityCatalog(prisma); // P4/P5
    assert.ok(await prisma.capabilityDefinition.findUnique({ where: { key: 'CUSTOM_LEGACY_CAPABILITY' } }));
    assert.deepEqual(await prisma.capabilityGrant.findUnique({ where: { id: grant.id } }), grant);
    const scopes = new Map((await prisma.capabilityDefinition.findMany({ where: { key: { in: ['REPORTING_STATEMENT_SUBMIT', 'REPORTING_STATEMENT_READ', 'APPROVAL_PRINCIPAL', 'APPROVAL_VICE_PRINCIPAL'] } } })).map((row) => [row.key, row.allowedScopeTypes]));
    assert.deepEqual(scopes.get('REPORTING_STATEMENT_SUBMIT'), ['PERSONAL']); assert.deepEqual(scopes.get('REPORTING_STATEMENT_READ'), ['PERSONAL', 'SUBJECT', 'SCHOOL_WIDE']); assert.deepEqual(scopes.get('APPROVAL_PRINCIPAL'), ['SCHOOL_WIDE']); assert.deepEqual(scopes.get('APPROVAL_VICE_PRINCIPAL'), ['SCHOOL_WIDE']); // P6
    await verifyCapabilityCatalog(prisma); console.log('[capability-catalog-integration] PASS');
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error('[capability-catalog-integration] FAIL'); console.error(error.message); process.exitCode = 1; });
