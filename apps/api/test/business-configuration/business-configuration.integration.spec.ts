import { BadRequestException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AuditService } from '../../src/audit/audit.service';
import { BusinessConfigurationService } from '../../src/business-configuration/business-configuration.service';
import {
  BUSINESS_POLICY_REGISTRY,
  PRODUCTION_BUSINESS_POLICY_FAMILIES,
} from '../../src/business-configuration/business-policy-registry';
import { Phase01Harness, integration, normalizedCode, testOrigin } from '../helpers/phase01-test-harness';
import { TEST_BUSINESS_POLICY_REGISTRY } from './test-business-policy-registry';

integration('Business Configuration API (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();

  beforeAll(() => h.start([{ token: BUSINESS_POLICY_REGISTRY, value: TEST_BUSINESS_POLICY_REGISTRY }]));
  beforeEach(async () => {
    await h.clean();
    await h.prisma.systemSetting.deleteMany();
    await h.seedCapabilities([
      { key: 'BUSINESS_CONFIGURATION_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHER_BASE', scopes: ['PERSONAL'] },
    ]);
  });
  afterAll(async () => {
    try {
      await h.clean();
    } finally {
      await h.stop();
    }
  });

  const body = (commandId: string, payload: Record<string, unknown> = { enabled: true, threshold: 1 }, extra: Record<string, unknown> = {}) => ({
    family: 'TEST_BOOLEAN_THRESHOLD',
    resource: { kind: 'SCHOOL_WIDE' },
    payload,
    effectiveFrom: '2026-09-01',
    commandId,
    ...extra,
  });

  // =========================================================================
  // Section 24: Test Registry Isolation
  // =========================================================================
  it('enforces production registry isolation (no test family in production catalog)', () => {
    expect(PRODUCTION_BUSINESS_POLICY_FAMILIES.some((f) => f.key === 'TEST_BOOLEAN_THRESHOLD')).toBe(false);
    expect(TEST_BUSINESS_POLICY_REGISTRY.some((f) => f.key === 'TEST_BOOLEAN_THRESHOLD')).toBe(true);
  });

  // =========================================================================
  // Section 8: Authorization Integration Matrix
  // =========================================================================
  describe('Authorization matrix (ADR-008)', () => {
    it('grants access ONLY to active user with explicit BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE', scopeType: 'SCHOOL_WIDE' }] });
      const res = await manager.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(200);
    });

    it('denies access when user has no grant', async () => {
      const actor = await h.actor();
      const res = await actor.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(403);
    });

    it('denies access for SYSTEM_ADMIN only without explicit capability', async () => {
      const actor = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN', scopeType: 'SCHOOL_WIDE' }] });
      const res = await actor.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(403);
    });

    it('denies access for wrong capability', async () => {
      const actor = await h.actor({ grants: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }] });
      const res = await actor.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(403);
    });

    it('denies access when grant is in the future', async () => {
      const actor = await h.actor();
      await h.prisma.capabilityGrant.create({
        data: {
          userId: actor.id,
          capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE',
          scopeType: 'SCHOOL_WIDE',
          validFrom: new Date(Date.now() + 86400_000), // tomorrow
        },
      });
      const res = await actor.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(403);
    });

    it('denies access when grant is expired', async () => {
      const actor = await h.actor();
      await h.prisma.capabilityGrant.create({
        data: {
          userId: actor.id,
          capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE',
          scopeType: 'SCHOOL_WIDE',
          validFrom: new Date(Date.now() - 86400_000 * 2),
          validUntil: new Date(Date.now() - 86400_000), // yesterday
        },
      });
      const res = await actor.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(403);
    });

    it('denies access when grant is revoked', async () => {
      const actor = await h.actor();
      await h.prisma.capabilityGrant.create({
        data: {
          userId: actor.id,
          capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE',
          scopeType: 'SCHOOL_WIDE',
          validFrom: new Date(Date.now() - 86400_000),
          revokedAt: new Date(),
        },
      });
      const res = await actor.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(403);
    });

    it('denies access when SCHOOL_WIDE grant has malformed scopeResourceId', async () => {
      const actor = await h.actor();
      await h.prisma.capabilityGrant.create({
        data: {
          userId: actor.id,
          capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE',
          scopeType: 'SCHOOL_WIDE',
          scopeResourceId: '00000000-0000-0000-0000-000000000123',
          validFrom: new Date(Date.now() - 86400_000),
        },
      });
      const res = await actor.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(403);
    });

    it('denies access when user status is DISABLED', async () => {
      const actor = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE', scopeType: 'SCHOOL_WIDE' }] });
      await h.prisma.user.update({
        where: { id: actor.id },
        data: { status: UserStatus.DISABLED },
      });
      const res = await actor.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(401);
    });

    it('denies access when user is locked', async () => {
      const actor = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE', scopeType: 'SCHOOL_WIDE' }] });
      await h.prisma.user.update({
        where: { id: actor.id },
        data: { lockedUntil: new Date(Date.now() + 3_600_000) },
      });
      const res = await actor.agent.get('/api/business-configuration/families');
      expect(res.status).toBe(401);
    });

    it('denies mutation and writes NO success audit on unauthorized attempts', async () => {
      const unauthorized = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
      const res = await unauthorized.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('unauth-1'));
      expect(res.status).toBe(403);
      expect(await h.prisma.businessPolicyStream.count()).toBe(0);
      expect(await h.prisma.businessPolicyVersion.count()).toBe(0);
      expect(await h.prisma.businessPolicyCommand.count()).toBe(0);
      expect(await h.prisma.auditEvent.count({ where: { action: 'BUSINESS_POLICY_DRAFT_CREATED' } })).toBe(0);
    });
  });

  // =========================================================================
  // Section 9: Create Draft Test Matrix & Technical Field Rejections
  // =========================================================================
  describe('Create draft matrix', () => {
    it('creates valid draft, reuses logical stream, and records receipt + audit', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      const res1 = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('draft-1', { enabled: true, threshold: 10 }));
      expect(res1.status).toBe(201);
      expect(res1.body.outcome).toBe('CREATED');
      const streamId1 = res1.body.streamId;

      // Draft is not authoritative in resolver
      const resolveRes = await manager.agent.get(
        '/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-05',
      );
      expect(resolveRes.body.outcome).toBe('POLICY_NOT_CONFIGURED');

      // Second draft for same family + resource reuses stream
      const res2 = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('draft-2', { enabled: false, threshold: 20 }, { effectiveFrom: '2026-10-01' }));
      expect(res2.status).toBe(201);
      expect(res2.body.streamId).toBe(streamId1);

      expect(await h.prisma.businessPolicyStream.count()).toBe(1);
      expect(await h.prisma.businessPolicyVersion.count()).toBe(2);
      expect(await h.prisma.businessPolicyCommand.count()).toBe(2);
      expect(await h.prisma.auditEvent.count({ where: { action: 'BUSINESS_POLICY_DRAFT_CREATED' } })).toBe(2);
    });

    it('rejects unknown family or invalid resource shape', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      // Unknown family
      const res1 = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('bad-1', { enabled: true, threshold: 1 }, { family: 'UNKNOWN_FAMILY' }));
      expect(res1.status).toBe(400);

      // Wrong resource kind for SCHOOL_WIDE family
      const res2 = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('bad-2', { enabled: true, threshold: 1 }, { resource: { kind: 'ACADEMIC_YEAR', academicYearId: '00000000-0000-0000-0000-000000000000' } }));
      expect(res2.status).toBe(400);
    });

    it('rejects missing or wrong-typed payload fields', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      // Missing threshold
      expect((await manager.agent.post('/api/business-configuration/policies/drafts').set('Origin', testOrigin).send(body('inv-1', { enabled: true }))).status).toBe(400);

      // Wrong type for threshold
      expect((await manager.agent.post('/api/business-configuration/policies/drafts').set('Origin', testOrigin).send(body('inv-2', { enabled: true, threshold: 'not-a-number' }))).status).toBe(400);

      // Unknown extra field
      expect((await manager.agent.post('/api/business-configuration/policies/drafts').set('Origin', testOrigin).send(body('inv-3', { enabled: true, threshold: 1, extraField: 'val' }))).status).toBe(400);
    });

    const technicalFields = [
      'DATABASE_URL',
      'postgresPassword',
      'apiToken',
      'telegramToken',
      'tlsPrivateKey',
      'nginxPath',
      'processPort',
      'deploymentPath',
    ];
    test.each(technicalFields)('rejects payload containing technical config: %s', async (fieldName) => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });
      const res = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body(`tech-${fieldName}`, { enabled: true, threshold: 1, [fieldName]: 'secret-value' }));
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // Section 10: Edit Draft
  // =========================================================================
  describe('Edit draft', () => {
    it('updates payload on valid revision and rejects stale revisions', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });
      const created = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('cmd-create-draft', { enabled: true, threshold: 5 }));
      const versionId = created.body.versionId;

      // Valid edit at expectedRevision = 1
      const editRes1 = await manager.agent
        .post(`/api/business-configuration/policy-versions/${versionId}/edit-draft`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-edit-1', expectedRevision: 1, payload: { enabled: true, threshold: 15 } });
      expect(editRes1.status).toBe(200);
      expect(editRes1.body.outcome).toBe('UPDATED');

      const v = await h.prisma.businessPolicyVersion.findUnique({ where: { id: versionId } });
      expect(v?.draftRevision).toBe(2);
      expect((v?.payload as Record<string, unknown>).threshold).toBe(15);

      // Stale revision edit (expectedRevision = 1 fails now that revision is 2)
      const editRes2 = await manager.agent
        .post(`/api/business-configuration/policy-versions/${versionId}/edit-draft`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-edit-stale', expectedRevision: 1, payload: { enabled: true, threshold: 25 } });
      expect(editRes2.status).toBe(409);
      expect(await h.prisma.auditEvent.count({ where: { action: 'BUSINESS_POLICY_DRAFT_EDITED' } })).toBe(1);
    });
  });

  // =========================================================================
  // Section 11 & 12: Publish & Effectivity
  // =========================================================================
  describe('Publish and effectivity semantics', () => {
    it('publishes draft and enforces interval overlap prevention', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      // Create draft A: 2026-09-01..2026-09-10
      const draftA = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('cmd-draft-a', { enabled: true, threshold: 10 }, { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-10' }));
      const vA = draftA.body.versionId;

      // Publish A
      const pubA = await manager.agent
        .post(`/api/business-configuration/policy-versions/${vA}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-pub-a' });
      expect(pubA.status).toBe(200);

      const publishedRowA = await h.prisma.businessPolicyVersion.findUnique({ where: { id: vA } });
      expect(publishedRowA?.status).toBe('PUBLISHED');
      expect(publishedRowA?.publishedByUserId).toBe(manager.id);
      expect(publishedRowA?.publishedAt).not.toBeNull();

      // Published version cannot be edited via edit-draft
      const editPub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${vA}/edit-draft`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-edit-published', expectedRevision: 1, payload: { enabled: true, threshold: 99 } });
      expect(editPub.status).toBe(409);

      // Create draft B adjacent: 2026-09-11..2026-09-20 -> PASS
      const draftB = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('cmd-draft-b', { enabled: true, threshold: 20 }, { effectiveFrom: '2026-09-11', effectiveUntil: '2026-09-20' }));
      const pubB = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draftB.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-pub-b' });
      expect(pubB.status).toBe(200);

      // Create draft C with deliberate gap: 2026-09-25..2026-09-30 -> PASS
      const draftC = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('cmd-draft-c', { enabled: true, threshold: 30 }, { effectiveFrom: '2026-09-25', effectiveUntil: '2026-09-30' }));
      const pubC = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draftC.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-pub-c' });
      expect(pubC.status).toBe(200);

      // Create draft D overlapping with A on 2026-09-10 -> FAIL on publish
      const draftD = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('cmd-draft-d', { enabled: true, threshold: 40 }, { effectiveFrom: '2026-09-10', effectiveUntil: '2026-09-15' }));
      const pubD = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draftD.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-pub-d' });
      expect(pubD.status).toBe(409);
    });
  });

  // =========================================================================
  // Section 13 & 14: Historical and Current Resolver
  // =========================================================================
  describe('Historical and current resolver', () => {
    it('resolves exact dates, gaps, invalid inputs, and current server date', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      // Version A: 2026-09-01..2026-09-10
      const draftA = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('r-draft-a', { enabled: true, threshold: 10 }, { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-10' }));
      await manager.agent.post(`/api/business-configuration/policy-versions/${draftA.body.versionId}/publish`).set('Origin', testOrigin).send({ commandId: 'r-pub-a' });

      // Version B: 2026-09-20..2026-09-30 (deliberate gap 11-19)
      const draftB = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('r-draft-b', { enabled: false, threshold: 20 }, { effectiveFrom: '2026-09-20', effectiveUntil: '2026-09-30' }));
      await manager.agent.post(`/api/business-configuration/policy-versions/${draftB.body.versionId}/publish`).set('Origin', testOrigin).send({ commandId: 'r-pub-b' });

      // Historical resolution in A
      const resA = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-05');
      expect(resA.body).toMatchObject({
        outcome: 'RESOLVED',
        family: 'TEST_BOOLEAN_THRESHOLD',
        resource: { kind: 'SCHOOL_WIDE' },
        requestedCivilDate: '2026-09-05',
        policyVersionId: draftA.body.versionId,
        validatorVersion: 'v1',
        payload: { enabled: true, threshold: 10 },
        effectiveFrom: '2026-09-01',
        effectiveUntil: '2026-09-10',
      });

      // Historical resolution in B
      const resB = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-25');
      expect(resB.body.outcome).toBe('RESOLVED');
      expect(resB.body.policyVersionId).toBe(draftB.body.versionId);
      expect(resB.body.payload).toEqual({ enabled: false, threshold: 20 });

      // Deliberate gap
      const resGap = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-15');
      expect(resGap.body.outcome).toBe('POLICY_NOT_CONFIGURED');

      // Invalid civil date
      const resBadDate = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-02-30');
      expect(resBadDate.body.outcome).toBe('INVALID_EFFECTIVE_DATE');

      // Server-owned current resolution without civilDate parameter
      const service = h.app.get(BusinessConfigurationService);
      const spy = jest.spyOn(service, 'businessCivilDate').mockReturnValue('2026-09-05');
      const resCurrent = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE');
      expect(resCurrent.body.outcome).toBe('RESOLVED');
      expect(resCurrent.body.policyVersionId).toBe(draftA.body.versionId);
      expect(resCurrent.body.requestedCivilDate).toBe('2026-09-05');
      spy.mockRestore();
    });
  });

  // =========================================================================
  // Section 15: Planned Replace
  // =========================================================================
  describe('Planned replace', () => {
    it('prospectively replaces open-ended published policy and preserves history', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      // Open-ended source: 2026-09-01..NULL
      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('rep-draft', { enabled: true, threshold: 10 }, { effectiveFrom: '2026-09-01' }));
      const vSource = draft.body.versionId;
      await manager.agent.post(`/api/business-configuration/policy-versions/${vSource}/publish`).set('Origin', testOrigin).send({ commandId: 'rep-pub' });

      // Prospective replace from 2026-10-01
      const replaceRes = await manager.agent
        .post(`/api/business-configuration/policy-versions/${vSource}/replace`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'rep-cmd-1',
          effectiveFrom: '2026-10-01',
          payload: { enabled: true, threshold: 99 },
        });
      expect(replaceRes.status).toBe(200);
      expect(replaceRes.body.outcome).toBe('REPLACED');
      const vReplacement = replaceRes.body.versionId;

      // Verify source closed to 2026-09-30
      const sourceRow = await h.prisma.businessPolicyVersion.findUnique({ where: { id: vSource } });
      expect(sourceRow?.effectiveUntil?.toISOString().slice(0, 10)).toBe('2026-09-30');

      // Verify replacement is PUBLISHED with lineage
      const replacementRow = await h.prisma.businessPolicyVersion.findUnique({ where: { id: vReplacement } });
      expect(replacementRow?.status).toBe('PUBLISHED');
      expect(replacementRow?.replacesVersionId).toBe(vSource);
      expect(replacementRow?.effectiveFrom.toISOString().slice(0, 10)).toBe('2026-10-01');
      expect(replacementRow?.effectiveUntil).toBeNull();

      // Resolver verifies both periods
      const resOld = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-15');
      expect(resOld.body.policyVersionId).toBe(vSource);

      const resNew = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-10-15');
      expect(resNew.body.policyVersionId).toBe(vReplacement);

      // Stale second replace fails
      const staleReplace = await manager.agent
        .post(`/api/business-configuration/policy-versions/${vSource}/replace`)
        .set('Origin', testOrigin)
        .send({ commandId: 'rep-cmd-stale', effectiveFrom: '2026-11-01', payload: { enabled: true, threshold: 100 } });
      expect(staleReplace.status).toBe(409);
    });
  });

  // =========================================================================
  // Section 16: Retire
  // =========================================================================
  describe('Retire', () => {
    it('retires open-ended policy without physical delete', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('ret-draft', { enabled: true, threshold: 10 }, { effectiveFrom: '2026-09-01' }));
      const vId = draft.body.versionId;
      await manager.agent.post(`/api/business-configuration/policy-versions/${vId}/publish`).set('Origin', testOrigin).send({ commandId: 'ret-pub' });

      // Retire on 2026-12-31
      const retRes = await manager.agent
        .post(`/api/business-configuration/policy-versions/${vId}/retire`)
        .set('Origin', testOrigin)
        .send({ commandId: 'ret-cmd-1', effectiveUntil: '2026-12-31', reason: 'Nghỉ hưu chính sách' });
      expect(retRes.status).toBe(200);

      // History resolved before retirement date
      const resBefore = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-11-01');
      expect(resBefore.body.outcome).toBe('RESOLVED');

      // Not configured after retirement date
      const resAfter = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2027-01-05');
      expect(resAfter.body.outcome).toBe('POLICY_NOT_CONFIGURED');
    });
  });

  // =========================================================================
  // Section 17: Correct
  // =========================================================================
  describe('Correct', () => {
    it('reverses source, retains history, creates corrected replacement with lineage and audit', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('cor-draft', { enabled: true, threshold: 5 }, { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30' }));
      const vSource = draft.body.versionId;
      await manager.agent.post(`/api/business-configuration/policy-versions/${vSource}/publish`).set('Origin', testOrigin).send({ commandId: 'cor-pub' });

      // Correct without reason rejected
      const noReason = await manager.agent
        .post(`/api/business-configuration/policy-versions/${vSource}/correct`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cor-no-reason', payload: { enabled: true, threshold: 8 } });
      expect(noReason.status).toBe(400);

      // Valid correction
      const correctRes = await manager.agent
        .post(`/api/business-configuration/policy-versions/${vSource}/correct`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'cor-cmd-1',
          reason: 'Đính chính mức ngưỡng theo quyết định mới',
          payload: { enabled: true, threshold: 8 },
        });
      expect(correctRes.status).toBe(200);
      const vCorrected = correctRes.body.versionId;

      // Source still exists, is REVERSED, payload untouched
      const sourceRow = await h.prisma.businessPolicyVersion.findUnique({ where: { id: vSource } });
      expect(sourceRow?.status).toBe('REVERSED');
      expect((sourceRow?.payload as Record<string, unknown>).threshold).toBe(5);
      expect(sourceRow?.correctionReason).toBe('Đính chính mức ngưỡng theo quyết định mới');
      expect(sourceRow?.reversedByUserId).toBe(manager.id);
      expect(sourceRow?.reversedAt).not.toBeNull();

      // Corrected replacement is PUBLISHED with correctsVersionId
      const correctedRow = await h.prisma.businessPolicyVersion.findUnique({ where: { id: vCorrected } });
      expect(correctedRow?.status).toBe('PUBLISHED');
      expect(correctedRow?.correctsVersionId).toBe(vSource);
      expect((correctedRow?.payload as Record<string, unknown>).threshold).toBe(8);

      // Resolver returns corrected policy
      const res = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-15');
      expect(res.body.outcome).toBe('RESOLVED');
      expect(res.body.policyVersionId).toBe(vCorrected);
      expect(res.body.payload).toEqual({ enabled: true, threshold: 8 });

      // Audit recorded
      expect(await h.prisma.auditEvent.count({ where: { action: 'BUSINESS_POLICY_CORRECTED' } })).toBe(1);
    });
  });

  // =========================================================================
  // Section 18: Idempotency
  // =========================================================================
  describe('Command idempotency', () => {
    it('returns identical result on replay with different key order, rejects conflicting payload', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      const payload1 = { enabled: true, threshold: 10 };
      const res1 = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send({ family: 'TEST_BOOLEAN_THRESHOLD', resource: { kind: 'SCHOOL_WIDE' }, payload: payload1, effectiveFrom: '2026-09-01', commandId: 'idem-1' });
      expect(res1.status).toBe(201);

      // Replay with reversed keys in payload
      const payloadReversed = { threshold: 10, enabled: true };
      const resReplay = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send({ family: 'TEST_BOOLEAN_THRESHOLD', resource: { kind: 'SCHOOL_WIDE' }, payload: payloadReversed, effectiveFrom: '2026-09-01', commandId: 'idem-1' });
      expect(resReplay.status).toBe(201);
      expect(resReplay.body).toEqual(res1.body);
      expect(await h.prisma.businessPolicyCommand.count()).toBe(1);
      expect(await h.prisma.businessPolicyVersion.count()).toBe(1);

      // Conflicting payload with same commandId
      const resConflict = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send({ family: 'TEST_BOOLEAN_THRESHOLD', resource: { kind: 'SCHOOL_WIDE' }, payload: { enabled: true, threshold: 11 }, effectiveFrom: '2026-09-01', commandId: 'idem-1' });
      expect(resConflict.status).toBe(409);
      expect(await h.prisma.businessPolicyVersion.count()).toBe(1);
    });
  });

  // =========================================================================
  // Section 19: Audit Atomicity / Rollback
  // =========================================================================
  describe('Audit atomicity and rollback', () => {
    it('rolls back database mutations when AuditService.write throws inside transaction', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      const auditService = h.app.get(AuditService);
      const auditSpy = jest.spyOn(auditService, 'write').mockImplementationOnce(async () => {
        throw new Error('SIMULATED_AUDIT_FAILURE');
      });

      const res = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('audit-fail-cmd'));
      expect(res.status).toBe(500);

      expect(await h.prisma.businessPolicyStream.count()).toBe(0);
      expect(await h.prisma.businessPolicyVersion.count()).toBe(0);
      expect(await h.prisma.businessPolicyCommand.count()).toBe(0);
      expect(await h.prisma.auditEvent.count({ where: { action: 'BUSINESS_POLICY_DRAFT_CREATED' } })).toBe(0);

      auditSpy.mockRestore();
    });
  });

  // =========================================================================
  // Section 20: Corruption Detection
  // =========================================================================
  // =========================================================================
  // Section 21: Corruption handling
  // =========================================================================
  describe('Corruption handling', () => {
    it('detects unknown validator version, invalid payload, or corrupt lineage', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      // Create stream
      const stream = await h.prisma.businessPolicyStream.create({
        data: {
          familyKey: 'TEST_BOOLEAN_THRESHOLD',
          resourceKind: 'SCHOOL_WIDE',
        },
      });

      // 1. Stored validator version unknown in registry (direct INSERT fixture with complete publication evidence)
      const corruptValidatorVersion = await h.prisma.businessPolicyVersion.create({
        data: {
          streamId: stream.id,
          versionNumber: 1,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: 'unknown_version_99',
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
          effectiveUntil: new Date('2026-09-10T00:00:00.000Z'),
          createdByUserId: manager.id,
          publishedByUserId: manager.id,
          publishedAt: new Date(),
        },
      });

      const res1 = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-05');
      expect(res1.body.outcome).toBe('POLICY_CORRUPT');

      // 2. Corrupt payload violating validator (direct INSERT fixture)
      await h.prisma.businessPolicyVersion.create({
        data: {
          streamId: stream.id,
          versionNumber: 2,
          status: 'PUBLISHED',
          payload: { corrupt: true },
          validatorVersion: 'v1',
          effectiveFrom: new Date('2026-09-11T00:00:00.000Z'),
          effectiveUntil: new Date('2026-09-20T00:00:00.000Z'),
          createdByUserId: manager.id,
          publishedByUserId: manager.id,
          publishedAt: new Date(),
        },
      });

      const res2 = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-15');
      expect(res2.body.outcome).toBe('POLICY_CORRUPT');

      // 3. Corrupt lineage: correctsVersionId pointing to non-REVERSED version (direct INSERT fixture)
      await h.prisma.businessPolicyVersion.create({
        data: {
          streamId: stream.id,
          versionNumber: 3,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 30 },
          validatorVersion: 'v1',
          effectiveFrom: new Date('2026-09-21T00:00:00.000Z'),
          effectiveUntil: new Date('2026-09-30T00:00:00.000Z'),
          createdByUserId: manager.id,
          publishedByUserId: manager.id,
          publishedAt: new Date(),
          correctsVersionId: corruptValidatorVersion.id, // ancestor is PUBLISHED, not REVERSED
        },
      });

      const res3 = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-25');
      expect(res3.body.outcome).toBe('POLICY_CORRUPT');

      // 4. Immutable DB trigger verification: direct SQL update on published row is rejected
      await expect(
        h.prisma.businessPolicyVersion.update({
          where: { id: corruptValidatorVersion.id },
          data: { payload: { tampered: true } },
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // Section 22: Real Concurrent Publish
  // =========================================================================
  describe('Concurrent publish', () => {
    it('ensures exactly one winner and one conflict on parallel publication', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      // Create two drafts with overlapping dates in same stream
      const draft1 = await manager.agent.post('/api/business-configuration/policies/drafts').set('Origin', testOrigin).send(body('conc-pub-d1', { enabled: true, threshold: 1 }));
      const draft2 = await manager.agent.post('/api/business-configuration/policies/drafts').set('Origin', testOrigin).send(body('conc-pub-d2', { enabled: false, threshold: 2 }));

      const [res1, res2] = await Promise.allSettled([
        manager.agent.post(`/api/business-configuration/policy-versions/${draft1.body.versionId}/publish`).set('Origin', testOrigin).send({ commandId: 'cmd-win-1' }),
        manager.agent.post(`/api/business-configuration/policy-versions/${draft2.body.versionId}/publish`).set('Origin', testOrigin).send({ commandId: 'cmd-win-2' }),
      ]);

      const resp1 = (res1 as PromiseFulfilledResult<{ status: number; body: { versionId?: string } }>).value;
      const resp2 = (res2 as PromiseFulfilledResult<{ status: number; body: { versionId?: string } }>).value;

      const [winnerRes, loserRes, winnerCmd, loserCmd, winnerDraftId, loserDraftId] =
        resp1.status === 200
          ? [resp1, resp2, 'cmd-win-1', 'cmd-win-2', draft1.body.versionId as string, draft2.body.versionId as string]
          : [resp2, resp1, 'cmd-win-2', 'cmd-win-1', draft2.body.versionId as string, draft1.body.versionId as string];

      expect(winnerRes.status).toBe(200);
      expect(loserRes.status).toBe(409);
      expect(await h.prisma.businessPolicyVersion.count({ where: { status: 'PUBLISHED' } })).toBe(1);

      // Receipt idempotency & audit assertions
      const winnerReceipt = await h.prisma.businessPolicyCommand.findUnique({
        where: { actorUserId_commandId: { actorUserId: manager.id, commandId: winnerCmd } },
      });
      expect(winnerReceipt).not.toBeNull();

      const loserReceipt = await h.prisma.businessPolicyCommand.findUnique({
        where: { actorUserId_commandId: { actorUserId: manager.id, commandId: loserCmd } },
      });
      expect(loserReceipt).toBeNull();

      const commandReceipts = await h.prisma.businessPolicyCommand.count({
        where: { actorUserId: manager.id, commandId: { in: ['cmd-win-1', 'cmd-win-2'] } },
      });
      expect(commandReceipts).toBe(1);

      const publishAudits = await h.prisma.auditEvent.findMany({
        where: {
          action: 'BUSINESS_POLICY_PUBLISHED',
          entityId: { in: [draft1.body.versionId, draft2.body.versionId] },
        },
      });
      expect(publishAudits).toHaveLength(1);
      expect(publishAudits[0].entityId).toBe(winnerDraftId);

      const loserAudits = await h.prisma.auditEvent.count({
        where: {
          action: 'BUSINESS_POLICY_PUBLISHED',
          entityId: loserDraftId,
        },
      });
      expect(loserAudits).toBe(0);

      const loserDraft = await h.prisma.businessPolicyVersion.findUnique({
        where: { id: loserDraftId },
      });
      expect(loserDraft?.status).toBe('DRAFT');
    });
  });

  // =========================================================================
  // Section 23: Real Concurrent Replace
  // =========================================================================
  describe('Concurrent replace', () => {
    it('ensures exactly one replacement succeeds and source is closed once', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      const draft = await manager.agent.post('/api/business-configuration/policies/drafts').set('Origin', testOrigin).send(body('conc-rep-source', { enabled: true, threshold: 1 }));
      await manager.agent.post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`).set('Origin', testOrigin).send({ commandId: 'conc-rep-pub' });

      const [res1, res2] = await Promise.allSettled([
        manager.agent.post(`/api/business-configuration/policy-versions/${draft.body.versionId}/replace`).set('Origin', testOrigin).send({ commandId: 'rep-par-1', effectiveFrom: '2026-10-01', payload: { enabled: true, threshold: 10 } }),
        manager.agent.post(`/api/business-configuration/policy-versions/${draft.body.versionId}/replace`).set('Origin', testOrigin).send({ commandId: 'rep-par-2', effectiveFrom: '2026-10-01', payload: { enabled: true, threshold: 20 } }),
      ]);

      const resp1 = (res1 as PromiseFulfilledResult<{ status: number; body: { versionId?: string } }>).value;
      const resp2 = (res2 as PromiseFulfilledResult<{ status: number; body: { versionId?: string } }>).value;

      const [winnerRes, loserRes, winnerCmd, loserCmd] =
        resp1.status === 200
          ? [resp1, resp2, 'rep-par-1', 'rep-par-2']
          : [resp2, resp1, 'rep-par-2', 'rep-par-1'];

      expect(winnerRes.status).toBe(200);
      expect(loserRes.status).toBe(409);

      // Source effectiveUntil closed exactly once to exact expected date (2026-09-30)
      const updatedSource = await h.prisma.businessPolicyVersion.findUnique({
        where: { id: draft.body.versionId },
      });
      expect(updatedSource).not.toBeNull();
      expect(updatedSource!.effectiveUntil).toEqual(new Date('2026-09-30T00:00:00.000Z'));

      // Exactly one replacement child exists in stream
      const replacements = await h.prisma.businessPolicyVersion.findMany({
        where: { replacesVersionId: draft.body.versionId },
      });
      expect(replacements).toHaveLength(1);
      expect(replacements[0].id).toBe(winnerRes.body.versionId);
      expect(replacements[0].status).toBe('PUBLISHED');
      expect(replacements[0].effectiveFrom).toEqual(new Date('2026-10-01T00:00:00.000Z'));
      expect(replacements[0].effectiveUntil).toBeNull();

      // Exactly one receipt
      const winnerReceipt = await h.prisma.businessPolicyCommand.findUnique({
        where: { actorUserId_commandId: { actorUserId: manager.id, commandId: winnerCmd } },
      });
      expect(winnerReceipt).not.toBeNull();

      const loserReceipt = await h.prisma.businessPolicyCommand.findUnique({
        where: { actorUserId_commandId: { actorUserId: manager.id, commandId: loserCmd } },
      });
      expect(loserReceipt).toBeNull();

      const replaceReceipts = await h.prisma.businessPolicyCommand.count({
        where: { actorUserId: manager.id, commandId: { in: ['rep-par-1', 'rep-par-2'] } },
      });
      expect(replaceReceipts).toBe(1);

      // Exactly one BUSINESS_POLICY_REPLACED audit
      const replaceAudits = await h.prisma.auditEvent.findMany({
        where: {
          action: 'BUSINESS_POLICY_REPLACED',
          entityId: draft.body.versionId,
        },
      });
      expect(replaceAudits).toHaveLength(1);
      const auditMeta = replaceAudits[0].metadata as Record<string, unknown>;
      expect(auditMeta.replacementVersionId).toBe(winnerRes.body.versionId);
      expect(auditMeta.commandId).toBe(winnerCmd);
      expect(auditMeta.sourceEffectiveUntilBefore).toBeNull();
      expect(auditMeta.sourceEffectiveUntilAfter).toBe('2026-09-30');
      expect(auditMeta.replacementEffectiveFrom).toBe('2026-10-01');
      expect(auditMeta.replacementEffectiveUntil).toBeNull();

      // Loser left no partial audit
      const loserAudits = await h.prisma.auditEvent.count({
        where: {
          action: 'BUSINESS_POLICY_REPLACED',
          metadata: { path: ['commandId'], equals: loserCmd },
        },
      });
      expect(loserAudits).toBe(0);
    });
  });

  // =========================================================================
  // Section 6: SystemSetting Exclusion
  // =========================================================================
  describe('SystemSetting exclusion', () => {
    it('does not fall back to SystemSetting when Business Configuration is missing', async () => {
      await h.prisma.systemSetting.create({ data: { key: 'TEST_BOOLEAN_THRESHOLD', value: 'fallback-value' } });
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });
      const result = await manager.agent.get('/api/business-configuration/resolve?family=TEST_BOOLEAN_THRESHOLD&kind=SCHOOL_WIDE&civilDate=2026-09-01');
      expect(result.status).toBe(200);
      expect(result.body.outcome).toBe('POLICY_NOT_CONFIGURED');
    });
  });

  // =========================================================================
  // Section 25: Harness Cleanup Regression Evidence
  // =========================================================================
  describe('Harness cleanup regression (replacement and correction lineage)', () => {
    it('cleans tables successfully after replacement lineage without violating immutable triggers', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      const draft = await manager.agent.post('/api/business-configuration/policies/drafts').set('Origin', testOrigin).send(body('cleanup-rep-draft', { enabled: true, threshold: 1 }));
      await manager.agent.post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`).set('Origin', testOrigin).send({ commandId: 'cleanup-rep-pub' });
      await manager.agent.post(`/api/business-configuration/policy-versions/${draft.body.versionId}/replace`).set('Origin', testOrigin).send({ commandId: 'cleanup-rep-rep', effectiveFrom: '2026-10-01', payload: { enabled: true, threshold: 2 } });

      // Verify replacement lineage exists
      expect(await h.prisma.businessPolicyVersion.count({ where: { replacesVersionId: draft.body.versionId } })).toBe(1);

      // Execute h.clean() and assert all business policy tables are zero
      await h.clean();
      expect(await h.prisma.businessPolicyCommand.count()).toBe(0);
      expect(await h.prisma.businessPolicyVersion.count()).toBe(0);
      expect(await h.prisma.businessPolicyStream.count()).toBe(0);
    });

    it('cleans tables successfully after correction lineage without violating immutable triggers', async () => {
      const manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });

      const draft = await manager.agent.post('/api/business-configuration/policies/drafts').set('Origin', testOrigin).send(body('cleanup-cor-draft', { enabled: true, threshold: 1 }));
      await manager.agent.post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`).set('Origin', testOrigin).send({ commandId: 'cleanup-cor-pub' });
      await manager.agent.post(`/api/business-configuration/policy-versions/${draft.body.versionId}/correct`).set('Origin', testOrigin).send({ commandId: 'cleanup-cor-cor', payload: { enabled: true, threshold: 3 }, reason: 'Correction for test' });

      // Verify correction lineage and REVERSED status exist
      expect(await h.prisma.businessPolicyVersion.count({ where: { status: 'REVERSED' } })).toBe(1);
      expect(await h.prisma.businessPolicyVersion.count({ where: { correctsVersionId: draft.body.versionId } })).toBe(1);

      // Execute h.clean() and assert all business policy tables are zero
      await h.clean();
      expect(await h.prisma.businessPolicyCommand.count()).toBe(0);
      expect(await h.prisma.businessPolicyVersion.count()).toBe(0);
      expect(await h.prisma.businessPolicyStream.count()).toBe(0);
    });
  });

  // =========================================================================
  // Section 25: OPERATIONAL_START Production Policy Family (ADR-049 / P1-031)
  // =========================================================================
  describe('OPERATIONAL_START production policy family (ADR-049 / P1-031)', () => {
    let manager: Awaited<ReturnType<typeof h.actor>>;
    let academicYear: { id: string; code: string; name: string };

    beforeEach(async () => {
      manager = await h.actor({ grants: [{ capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE' }] });
      academicYear = await h.prisma.academicYear.create({
        data: { code: normalizedCode('YEAR'), name: '2026-2027' },
      });
    });

    const opBody = (commandId: string, operationalStartDate: string, effectiveFrom: string, extra: Record<string, unknown> = {}) => ({
      family: 'OPERATIONAL_START',
      resource: { kind: 'ACADEMIC_YEAR', academicYearId: academicYear.id },
      payload: { operationalStartDate },
      effectiveFrom,
      commandId,
      ...extra,
    });

    it('rejects invalid payload at draft creation', async () => {
      const res = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send({
          family: 'OPERATIONAL_START',
          resource: { kind: 'ACADEMIC_YEAR', academicYearId: academicYear.id },
          payload: { invalidKey: '2026-09-01' },
          effectiveFrom: '2026-08-01',
          commandId: 'op-invalid-payload',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('INVALID_OPERATIONAL_START_POLICY_PAYLOAD');
    });

    it('rejects publication when there is no active calendar', async () => {
      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(opBody('op-draft-no-cal', '2026-09-01', '2026-08-01'));
      expect(draft.status).toBe(201);

      const pub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'op-pub-no-cal' });
      expect(pub.status).toBe(400);
      expect(pub.body.message).toBe('ACADEMIC_CALENDAR_VERSION_INVALID');
    });

    it('rejects publication when there are two active calendars (ambiguous)', async () => {
      const service = h.app.get(BusinessConfigurationService);

      type ServiceWithPrivate = {
        requireActiveCalendar: (tx: unknown, academicYearId: string) => Promise<{ id: string; startDate: Date; endDate: Date }>;
      };
      const privateService = service as unknown as ServiceWithPrivate;

      // Verify exact transactional helper throws when multiple active calendars are detected
      const mockTx = {
        academicCalendarVersion: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'cal-1',
              startDate: new Date('2026-08-01T00:00:00.000Z'),
              endDate: new Date('2027-05-31T00:00:00.000Z'),
              versionNumber: 1,
            },
            {
              id: 'cal-2',
              startDate: new Date('2026-08-01T00:00:00.000Z'),
              endDate: new Date('2027-05-31T00:00:00.000Z'),
              versionNumber: 2,
            },
          ]),
        },
      };
      await expect(privateService.requireActiveCalendar(mockTx, academicYear.id)).rejects.toThrow(
        'ACADEMIC_CALENDAR_VERSION_INVALID',
      );

      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(opBody('op-draft-two-cal', '2026-09-01', '2026-08-01'));
      expect(draft.status).toBe(201);

      jest.spyOn(privateService, 'requireActiveCalendar').mockRejectedValueOnce(
        new BadRequestException('ACADEMIC_CALENDAR_VERSION_INVALID'),
      );

      const pub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'op-pub-two-cal' });
      expect(pub.status).toBe(400);
      expect(pub.body.message).toBe('ACADEMIC_CALENDAR_VERSION_INVALID');
    });

    it('rejects publication when operationalStartDate is before calendar startDate', async () => {
      await h.prisma.academicCalendarVersion.create({
        data: {
          academicYearId: academicYear.id,
          versionNumber: 1,
          startDate: new Date('2026-08-15T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
          officialWeekCount: 35,
          reserveWeekCount: 1,
          teachingWeekdays: ['MONDAY', 'TUESDAY'],
          isActive: true,
          activatedAt: new Date('2026-08-15T00:00:00.000Z'),
        },
      });

      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(opBody('op-draft-before-start', '2026-08-10', '2026-08-01'));
      expect(draft.status).toBe(201);

      const pub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'op-pub-before-start' });
      expect(pub.status).toBe(400);
      expect(pub.body.message).toBe('OPERATIONAL_START_DATE_OUTSIDE_CALENDAR');
    });

    it('rejects publication when operationalStartDate is after calendar endDate', async () => {
      await h.prisma.academicCalendarVersion.create({
        data: {
          academicYearId: academicYear.id,
          versionNumber: 1,
          startDate: new Date('2026-08-15T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
          officialWeekCount: 35,
          reserveWeekCount: 1,
          teachingWeekdays: ['MONDAY', 'TUESDAY'],
          isActive: true,
          activatedAt: new Date('2026-08-15T00:00:00.000Z'),
        },
      });

      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(opBody('op-draft-after-end', '2027-06-01', '2026-08-15'));
      expect(draft.status).toBe(201);

      const pub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'op-pub-after-end' });
      expect(pub.status).toBe(400);
      expect(pub.body.message).toBe('OPERATIONAL_START_DATE_OUTSIDE_CALENDAR');
    });

    it('rejects publication when effectiveFrom > operationalStartDate (initial publication invariant)', async () => {
      await h.prisma.academicCalendarVersion.create({
        data: {
          academicYearId: academicYear.id,
          versionNumber: 1,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
          officialWeekCount: 35,
          reserveWeekCount: 1,
          teachingWeekdays: ['MONDAY', 'TUESDAY'],
          isActive: true,
          activatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      });

      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(opBody('op-draft-effective-after', '2026-09-01', '2026-09-15'));
      expect(draft.status).toBe(201);

      const pub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'op-pub-effective-after' });
      expect(pub.status).toBe(400);
      expect(pub.body.message).toBe('OPERATIONAL_START_INITIAL_PUBLICATION_INVALID');
    });

    it('allows publication when operationalStartDate == calendar startDate', async () => {
      await h.prisma.academicCalendarVersion.create({
        data: {
          academicYearId: academicYear.id,
          versionNumber: 1,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
          officialWeekCount: 35,
          reserveWeekCount: 1,
          teachingWeekdays: ['MONDAY', 'TUESDAY'],
          isActive: true,
          activatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      });

      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(opBody('op-draft-exact-start', '2026-08-01', '2026-08-01'));
      expect(draft.status).toBe(201);

      const pub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'op-pub-exact-start' });
      expect(pub.status).toBe(200);
      expect(pub.body.outcome).toBe('PUBLISHED');
    });

    it('allows publication when operationalStartDate == calendar endDate', async () => {
      await h.prisma.academicCalendarVersion.create({
        data: {
          academicYearId: academicYear.id,
          versionNumber: 1,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
          officialWeekCount: 35,
          reserveWeekCount: 1,
          teachingWeekdays: ['MONDAY', 'TUESDAY'],
          isActive: true,
          activatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      });

      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(opBody('op-draft-exact-end', '2027-05-31', '2026-08-01'));
      expect(draft.status).toBe(201);

      const pub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'op-pub-exact-end' });
      expect(pub.status).toBe(200);
      expect(pub.body.outcome).toBe('PUBLISHED');
    });

    it('allows publication when effectiveFrom < operationalStartDate and validates resolver output', async () => {
      await h.prisma.academicCalendarVersion.create({
        data: {
          academicYearId: academicYear.id,
          versionNumber: 1,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
          officialWeekCount: 35,
          reserveWeekCount: 1,
          teachingWeekdays: ['MONDAY', 'TUESDAY'],
          isActive: true,
          activatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      });

      const service = h.app.get(BusinessConfigurationService);

      // Verify resolver returns POLICY_NOT_CONFIGURED before publication
      const beforePub = await service.resolveEffectiveBusinessPolicy(
        'OPERATIONAL_START',
        { kind: 'ACADEMIC_YEAR', academicYearId: academicYear.id },
        '2026-09-15',
      );
      expect(beforePub.outcome).toBe('POLICY_NOT_CONFIGURED');

      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(opBody('op-draft-valid', '2026-09-01', '2026-08-15'));
      expect(draft.status).toBe(201);

      const pub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'op-pub-valid' });
      expect(pub.status).toBe(200);
      expect(pub.body.outcome).toBe('PUBLISHED');

      // Verify resolver smoke test (Section 15)
      const afterPub = await service.resolveEffectiveBusinessPolicy(
        'OPERATIONAL_START',
        { kind: 'ACADEMIC_YEAR', academicYearId: academicYear.id },
        '2026-09-15',
      );
      expect(afterPub.outcome).toBe('RESOLVED');
      if (afterPub.outcome === 'RESOLVED') {
        expect(afterPub.policyVersionId).toBe(draft.body.versionId);
        expect(afterPub.validatorVersion).toBe('v1');
        expect(afterPub.payload).toEqual({ operationalStartDate: '2026-09-01' });
        expect(afterPub.effectiveFrom).toBe('2026-08-15');
        expect(afterPub.effectiveUntil).toBeNull();
      }

      // Verify missing date before effectiveFrom
      const beforeEffective = await service.resolveEffectiveBusinessPolicy(
        'OPERATIONAL_START',
        { kind: 'ACADEMIC_YEAR', academicYearId: academicYear.id },
        '2026-08-10',
      );
      expect(beforeEffective.outcome).toBe('POLICY_NOT_CONFIGURED');
    });

    it('preserves generic TEST policy family publication behavior without regression', async () => {
      const draft = await manager.agent
        .post('/api/business-configuration/policies/drafts')
        .set('Origin', testOrigin)
        .send(body('generic-reg-draft', { enabled: true, threshold: 5 }));
      expect(draft.status).toBe(201);

      const pub = await manager.agent
        .post(`/api/business-configuration/policy-versions/${draft.body.versionId}/publish`)
        .set('Origin', testOrigin)
        .send({ commandId: 'generic-reg-pub' });
      expect(pub.status).toBe(200);
      expect(pub.body.outcome).toBe('PUBLISHED');
    });
  });
});