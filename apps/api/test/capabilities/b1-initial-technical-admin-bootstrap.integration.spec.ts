import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient, UserStatus } from '@prisma/client';
import {
  B1InitialTechnicalAdminBootstrap, B1InitialBootstrapInput,
  canonicalInitialBootstrapPayload,
} from '../../src/capabilities/b1-initial-technical-admin-bootstrap';
import { resolveSafeTestDatabaseUrl } from '../helpers/test-database-safety';

const safeUrl = resolveSafeTestDatabaseUrl(process.env);
const integration = safeUrl ? describe : describe.skip;
const grantKeys = ['USER_MANAGE','CAPABILITY_GRANT',
  ...Array.from({ length: 7 }, (_, i) => `B1_BOOTSTRAP_LEGACY_${i}`)];

integration('B1 INITIAL technical Admin bootstrap: isolated, sign-verified, zero legacy grant mutations', () => {
  const schema = `b1init_${randomUUID().replaceAll('-', '')}`;
  let owner: PrismaClient | null = null;
  let db: PrismaClient | null = null;
  let created = false;

  beforeAll(async () => {
    if (!safeUrl || process.env.NODE_ENV !== 'test' ||
        process.env.BAOGIANG_ALLOW_DESTRUCTIVE_TEST_DB !== '1') {
      throw new Error('B1_INITIAL_BOOTSTRAP_CERTIFIED_TEST_DATABASE_REQUIRED');
    }
    const url = new URL(safeUrl);
    if (!['localhost','127.0.0.1','::1'].includes(url.hostname) ||
        url.pathname !== '/baogiang_test') {
      throw new Error('B1_INITIAL_BOOTSTRAP_EXACT_TEST_DATABASE_REQUIRED');
    }
    owner = new PrismaClient({ datasources: { db: { url: safeUrl } } });
    await owner.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    const isolated = url.toString();
    const root = resolve(__dirname, '../../../..');
    const migrated = spawnSync(process.execPath,
      [resolve(root,'node_modules/prisma/build/index.js'),'migrate','deploy',
        '--schema',resolve(root,'prisma/schema.prisma')],
      { cwd: root, env: { ...process.env, DATABASE_URL: isolated },
        encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    if (migrated.status !== 0) throw new Error('B1_INITIAL_BOOTSTRAP_MIGRATION_FAILED');
    db = new PrismaClient({ datasources: { db: { url: isolated } } });
    await db.$connect();
  }, 150_000);

  afterAll(async () => {
    try {
      await db?.$disconnect();
      if (created && owner && /^b1init_[0-9a-f]{32}$/.test(schema)) {
        await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally { await owner?.$disconnect(); }
  }, 60_000);

  it('rejects forged/self approvals and stale grants, then creates one signed command & seat without changing 9 grants', async () => {
    if (!db) throw new Error('B1_INITIAL_BOOTSTRAP_TEST_DB_NOT_READY');
    const issuer = await db.user.create({ data: {
      username: `b1-issuer-${randomUUID()}`, passwordHash: 'synthetic-fixture',
      status: UserStatus.ACTIVE, mustChangePassword: false,
    } });
    const admin = await db.user.create({ data: {
      username: `b1-admin-${randomUUID()}`, passwordHash: 'synthetic-fixture',
      status: UserStatus.ACTIVE, mustChangePassword: false,
    } });
    for (const key of grantKeys) {
      await db.capabilityDefinition.create({ data: {
        key, description: 'Synthetic bootstrap', allowedScopeTypes: ['SCHOOL_WIDE'],
        isActive: true, isSystem: true,
      } });
      await db.capabilityGrant.create({ data: {
        userId: admin.id, capabilityKey: key, scopeType: 'SCHOOL_WIDE',
        validFrom: new Date(Date.now() - 60000), grantedByUserId: issuer.id,
      } });
    }
    const getGrants = () => db!.capabilityGrant.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true, userId: true, capabilityKey: true, scopeType: true,
        scopeResourceId: true, validFrom: true, validUntil: true,
        grantedByUserId: true, coordinateId: true, revokedAt: true,
      },
    });
    const before = await getGrants();
    expect(before).toHaveLength(9);
    expect(before.every((g) => g.revokedAt === null)).toBe(true);
    const rights = before.map(({ revokedAt: _revokedAt, coordinateId: _coordinateId, ...g }) => ({
      id:g.id,userId:g.userId,capabilityKey:g.capabilityKey,scopeType:g.scopeType,
      scopeResourceId:g.scopeResourceId,validFrom:g.validFrom.toISOString(),
      validUntil:g.validUntil?.toISOString() ?? null,
      grantedByUserId:g.grantedByUserId,
    })).sort((a,b)=>a.id.localeCompare(b.id));
    const rightsFingerprint = createHash('sha256')
      .update(JSON.stringify(rights)).digest('hex');

    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const trustedPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const trust = {
      approvedKeyPem: trustedPublicKey,
      pinnedKeyDerSha256: createHash('sha256').update(publicKey.export({
        type: 'spki', format: 'der',
      })).digest('hex'),
    };
    const bootstrap = new B1InitialTechnicalAdminBootstrap(db, trust);
    const base = {
      issuerUserId: issuer.id, adminUserId: admin.id,
      requestKey: `b1-initial-${randomUUID()}`,
      expectedRightsSha256: rightsFingerprint,
      externalDecisionSha256: createHash('sha256').update('synthetic-human-decision-fixture')
        .digest('hex'),
      approvedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    const approve = (values: typeof base): B1InitialBootstrapInput => ({
      ...values, signatureBase64: sign(null,
        Buffer.from(canonicalInitialBootstrapPayload(values)), privateKey).toString('base64'),
    });
    const signed = approve(base);
    await expect(bootstrap.execute({ ...signed, issuerUserId: admin.id }))
      .rejects.toThrow('B1_INITIAL_BOOTSTRAP_INVALID_INPUT');
    await expect(bootstrap.execute({ ...signed, signatureBase64: 'A'.repeat(86)+'==' }))
      .rejects.toThrow('B1_INITIAL_BOOTSTRAP_SIGNATURE_INVALID');
    await expect(new B1InitialTechnicalAdminBootstrap(db, {
      ...trust, pinnedKeyDerSha256:'f'.repeat(64),
    }).execute(signed)).rejects.toThrow('B1_INITIAL_BOOTSTRAP_TRUST_KEY_NOT_PINNED');
    await expect(bootstrap.execute(approve({ ...base,
      expectedRightsSha256: 'a'.repeat(64),
    }))).rejects.toThrow('B1_INITIAL_BOOTSTRAP_RIGHTS_SNAPSHOT_CHANGED');
    expect(await db.accessCommand.count()).toBe(0);
    expect(await db.roleAppointment.count()).toBe(0);
    expect(await db.authoritySeat.count()).toBe(0);
    expect(await getGrants()).toEqual(before);

    const receipt = await bootstrap.execute(signed);
    expect(receipt).toMatchObject({
      state: 'BOOTSTRAP_APPLIED', rightsFingerprintSha256: rightsFingerprint,
      grantWrites: 0, coordinateWrites: 0, sourceWrites: 0,
    });
    expect(await getGrants()).toEqual(before);
    expect(await db.authoritySeat.count({where:{key:'TECHNICAL_ACCOUNT_ADMIN'}})).toBe(1);
    expect(await db.roleAppointment.count({where:{
      userId:admin.id,templateKey:'TECHNICAL_ACCOUNT_ADMIN',
    }})).toBe(1);
    const command=await db.accessCommand.findUniqueOrThrow({where:{id:receipt.commandId}});
    expect(command.actorUserId).toBe(issuer.id);
    expect(command.targetUserId).toBe(admin.id);
    expect(command.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(await db.authorizationState.findUnique({where:{id:'B1_GLOBAL'}}))
      .toMatchObject({epoch:1n});
    expect(await bootstrap.execute(signed)).toEqual(receipt);
    expect(await db.accessCommand.count()).toBe(1);
    await expect(bootstrap.execute(approve({ ...base,
      externalDecisionSha256: 'c'.repeat(64),
    }))).rejects.toThrow('B1_INITIAL_BOOTSTRAP_IDEMPOTENCY_CONFLICT');
    await expect(bootstrap.execute(approve({ ...base,requestKey:`new-${randomUUID()}` })))
      .rejects.toThrow('B1_INITIAL_BOOTSTRAP_ALREADY_ESTABLISHED');
    expect(await getGrants()).toEqual(before);
  }, 180_000);
});
