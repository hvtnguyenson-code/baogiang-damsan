import * as fs from 'node:fs';
import * as path from 'node:path';
import { integration, Phase01Harness } from '../helpers/phase01-test-harness';

integration('GDĐP coordinator key normalization migration (PostgreSQL integration)', () => {
  const h = new Phase01Harness();
  const migrationSql = fs.readFileSync(
    path.join(
      __dirname,
      '../../../../prisma/migrations/20260923193000_gddp_coordinator_key_normalization/migration.sql',
    ),
    'utf-8',
  );

  beforeAll(async () => {
    await h.start();
  });

  afterAll(async () => {
    try {
      await h.clean();
    } finally {
      await h.stop();
    }
  });

  beforeEach(async () => {
    await h.clean();
  });

  it('migrates GDDDP_COORDINATOR to GDDP_COORDINATOR preserving grants and attestation provenance', async () => {
    // 1. Seed legacy definition
    await h.prisma.$executeRawUnsafe(`
      INSERT INTO "capability_definitions" ("key", "description", "allowed_scope_types", "is_system", "is_active")
      VALUES ('GDDDP_COORDINATOR', 'Điều phối Giáo dục địa phương.', ARRAY['ACTIVITY']::text[], true, true);
    `);

    // 2. Create user, academic year, master, plan version, occurrence
    const user = await h.prisma.user.create({
      data: {
        username: `coord-${crypto.randomUUID()}`,
        passwordHash: 'test',
        status: 'ACTIVE',
      },
    });
    const year = await h.prisma.academicYear.create({
      data: {
        code: `Y-${crypto.randomUUID().slice(0, 8)}`,
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
        status: 'PUBLISHED',
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

    // 5. Execute migration SQL
    await h.prisma.$executeRawUnsafe(migrationSql);

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

    await expect(h.prisma.$executeRawUnsafe(migrationSql)).rejects.toThrow(
      /Both legacy and canonical GDĐP coordinator capability keys exist; reconciliation required/,
    );
  });

  it('is a no-op safe execution when GDDDP_COORDINATOR does not exist', async () => {
    // Empty database - neither key exists
    await expect(h.prisma.$executeRawUnsafe(migrationSql)).resolves.not.toThrow();
  });
});
