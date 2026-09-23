import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { integration, normalizedCode, Phase01Harness, testDatabaseUrl } from '../helpers/phase01-test-harness';

integration('GDĐP coordinator key normalization migration (PostgreSQL integration)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "audit_events",
        "auth_sessions",
        "capability_grants",
        "capability_definitions",
        "subject_groups",
        "academic_years",
        "users"
      CASCADE;
    `);
  }

  const migrationFilePath = path.resolve(
    __dirname,
    '../../../../prisma/migrations/20260923193000_gddp_coordinator_key_normalization/migration.sql',
  );

  async function executeMigrationScript(): Promise<void> {
    const targetUrl = process.env.DATABASE_URL || testDatabaseUrl;
    if (!targetUrl) {
      throw new Error('No target database URL available for migration execution');
    }

    const parsed = new URL(targetUrl);
    const host = parsed.hostname || '127.0.0.1';
    const port = parsed.port || '5432';
    const user = decodeURIComponent(parsed.username || 'postgres');
    const password = decodeURIComponent(parsed.password || '');
    const database = decodeURIComponent((parsed.pathname || '').replace(/^\//, ''));

    const psqlBin = process.env.PSQL_PATH
      || (process.platform === 'win32' && fs.existsSync('D:\\PostgreSQL\\bin\\psql.exe')
        ? 'D:\\PostgreSQL\\bin\\psql.exe'
        : 'psql');

    const args = [
      '-X',
      '-h', host,
      '-p', port,
      '-U', user,
      '-d', database,
      '-v', 'ON_ERROR_STOP=1',
      '-f', migrationFilePath,
    ];

    const result = spawnSync(psqlBin, args, {
      env: {
        ...process.env,
        PGPASSWORD: password,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.error) {
      throw new Error(`Failed to invoke psql (${psqlBin}): ${result.error.message}`);
    }

    if (result.status !== 0) {
      const stderr = result.stderr ? String(result.stderr) : '';
      const stdout = result.stdout ? String(result.stdout) : '';
      throw new Error(`Migration execution failed (exit code ${result.status}):\n${stderr || stdout}`);
    }
  }

  beforeAll(async () => {
    await h.start();
  });

  afterAll(async () => {
    try {
      await clean();
    } finally {
      await h.stop();
    }
  });

  beforeEach(async () => {
    await clean();
  });

  it('migrates GDDDP_COORDINATOR to GDDP_COORDINATOR preserving grants and attestation provenance', async () => {
    // 1. Seed legacy definition
    await h.prisma.$executeRawUnsafe(`
      INSERT INTO "capability_definitions" ("key", "description", "allowed_scope_types", "is_system", "is_active")
      VALUES ('GDDDP_COORDINATOR', 'Điều phối Giáo dục địa phương.', ARRAY['ACTIVITY']::text[], true, true);
    `);

    // 2. Create user, academic year, master, plan version (DRAFT -> topic -> PUBLISHED), occurrence
    const user = await h.prisma.user.create({
      data: {
        username: `coord-${crypto.randomUUID()}`,
        passwordHash: 'test',
        status: 'ACTIVE',
      },
    });
    const year = await h.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y_GDDP_'),
        name: 'Năm học test',
      },
    });
    const master = await h.prisma.programmeMaster.create({
      data: {
        academicYearId: year.id,
        kind: 'GDDP',
        gradeLevel: 10,
        createdByUserId: user.id,
      },
    });
    const plan = await h.prisma.programmePlanVersion.create({
      data: {
        programmeMasterId: master.id,
        versionNumber: 1,
        status: 'DRAFT',
        draftRevision: 1,
        createdByUserId: user.id,
      },
    });
    const topic = await h.prisma.programmeTopicItem.create({
      data: {
        programmePlanVersionId: plan.id,
        sequence: 1,
        title: 'Chủ đề 1',
        requiredPeriods: 2,
        guidelineWeekFrom: 1,
        guidelineWeekTo: 2,
      },
    });
    await h.prisma.programmePlanVersion.update({
      where: { id: plan.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: user.id,
        publishedAt: new Date('2026-09-01T08:00:00.000Z'),
      },
    });
    const occ = await h.prisma.plannedProgrammeOccurrence.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: plan.id,
        programmeTopicItemId: topic.id,
        academicYearId: year.id,
        civilDate: new Date('2026-09-15'),
        mode: 'GRADE',
        gradeLevel: 10,
        status: 'PUBLISHED',
        draftRevision: 1,
        publishedByUserId: user.id,
        publishedAt: new Date('2026-09-01T08:30:00.000Z'),
        createdByUserId: user.id,
      },
    });

    // 3. Create capability grant referencing legacy key
    const grant = await h.prisma.capabilityGrant.create({
      data: {
        userId: user.id,
        capabilityKey: 'GDDDP_COORDINATOR',
        scopeType: 'ACTIVITY',
        scopeResourceId: master.id,
        validFrom: new Date('2026-09-01T00:00:00Z'),
        validUntil: new Date('2027-05-31T00:00:00Z'),
      },
    });

    // 4. Create programme occurrence attestation referencing legacy key
    const attestation = await h.prisma.programmeOccurrenceAttestation.create({
      data: {
        programmeMasterId: master.id,
        plannedProgrammeOccurrenceId: occ.id,
        attestedByUserId: user.id,
        authorityType: 'COORDINATOR',
        capabilityKey: 'GDDDP_COORDINATOR',
        scope: 'ACTIVITY',
        scopeResourceId: master.id,
        status: 'ACTIVE',
        createRequestKey: `req-${crypto.randomUUID()}`,
        createRequestFingerprint: 'dummy-fingerprint',
      },
    });

    // 5. Execute migration SQL via script executor
    await executeMigrationScript();

    // 6. Assertions
    // A. capability_definitions contains GDDP_COORDINATOR
    const newDef = await h.prisma.capabilityDefinition.findUnique({
      where: { key: 'GDDP_COORDINATOR' },
    });
    expect(newDef).toBeDefined();
    expect(newDef?.key).toBe('GDDP_COORDINATOR');

    // B. legacy definition GDDDP_COORDINATOR is absent
    const oldDef = await h.prisma.capabilityDefinition.findUnique({
      where: { key: 'GDDDP_COORDINATOR' },
    });
    expect(oldDef).toBeNull();

    // C. SAME grant row exists with updated key via ON UPDATE CASCADE
    const updatedGrant = await h.prisma.capabilityGrant.findUnique({
      where: { id: grant.id },
    });
    expect(updatedGrant).toBeDefined();
    expect(updatedGrant?.capabilityKey).toBe('GDDP_COORDINATOR');
    expect(updatedGrant?.userId).toBe(user.id);
    expect(updatedGrant?.scopeType).toBe('ACTIVITY');
    expect(updatedGrant?.scopeResourceId).toBe(master.id);
    expect(updatedGrant?.validFrom).toEqual(grant.validFrom);
    expect(updatedGrant?.validUntil).toEqual(grant.validUntil);

    // D. attestation provenance capability_key is normalized to GDDP_COORDINATOR
    const updatedAtt = await h.prisma.programmeOccurrenceAttestation.findUnique({
      where: { id: attestation.id },
    });
    expect(updatedAtt).toBeDefined();
    expect(updatedAtt?.capabilityKey).toBe('GDDP_COORDINATOR');
  });

  it('fails closed if BOTH GDDDP_COORDINATOR and GDDP_COORDINATOR exist', async () => {
    await h.prisma.$executeRawUnsafe(`
      INSERT INTO "capability_definitions" ("key", "description", "allowed_scope_types", "is_system", "is_active")
      VALUES
        ('GDDDP_COORDINATOR', 'Điều phối Giáo dục địa phương (legacy).', ARRAY['ACTIVITY']::text[], true, true),
        ('GDDP_COORDINATOR', 'Điều phối Giáo dục địa phương (canonical).', ARRAY['ACTIVITY']::text[], true, true);
    `);

    await expect(executeMigrationScript()).rejects.toThrow(
      /Both legacy and canonical GDĐP coordinator capability keys exist; reconciliation required/,
    );
  });

  it('is a no-op safe execution when GDDDP_COORDINATOR does not exist', async () => {
    // Empty database - neither key exists
    await expect(executeMigrationScript()).resolves.not.toThrow();
  });
});
