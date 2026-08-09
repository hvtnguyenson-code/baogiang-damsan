import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

integration('Phase 01 backend cross-domain preservation (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();
  beforeAll(() => h.start());
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: 'USER_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_GROUP_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'CAPABILITY_GRANT', scopes: ['SCHOOL_WIDE'] },
      { key: 'ADDITIONAL_DUTY_CATALOG_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', scopes: ['SUBJECT_GROUP', 'SCHOOL_WIDE'] },
      { key: 'TEACHER_BASE', scopes: ['PERSONAL'] },
    ]);
  });
  afterAll(() => h.stop());

  async function historyFixture() {
    const actor = await h.actor({ grants: [
      { capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'SUBJECT_GROUP_MANAGE' }, { capabilityKey: 'SUBJECT_MANAGE' },
      { capabilityKey: 'CAPABILITY_GRANT' }, { capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE' }, { capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE' },
    ] });
    const target = await h.prisma.user.create({ data: { username: `history-${crypto.randomUUID()}`, passwordHash: 'fixture', status: 'ACTIVE', mustChangePassword: false, profile: { create: { displayName: 'History' } } }, include: { profile: true } });
    const group = await h.prisma.subjectGroup.create({ data: { code: `HG${crypto.randomUUID().slice(0, 5)}`, name: 'History group' } });
    const subject = await h.prisma.subject.create({ data: { code: `HS${crypto.randomUUID().slice(0, 5)}`, name: 'History subject' } });
    const definition = await h.prisma.additionalDutyDefinition.create({ data: { code: `HD${crypto.randomUUID().slice(0, 5)}`, name: 'History duty', category: 'HISTORY', validFrom: new Date('2026-01-01') } });
    const membership = await h.prisma.subjectGroupMembership.create({ data: { userId: target.id, subjectGroupId: group.id, validFrom: new Date('2026-01-01') } });
    const staffSubject = await h.prisma.staffSubject.create({ data: { userId: target.id, subjectId: subject.id, validFrom: new Date('2026-01-01') } });
    const grant = await h.prisma.capabilityGrant.create({ data: { userId: target.id, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validFrom: new Date('2026-01-01'), grantedByUserId: actor.id } });
    const duty = await h.prisma.staffAdditionalDutyAssignment.create({ data: { staffProfileId: target.profile!.id, dutyDefinitionId: definition.id, scopeType: 'SUBJECT_GROUP', scopeResourceId: group.id, validFrom: new Date('2026-01-01'), createdByUserId: actor.id } });
    return { actor, target, group, subject, definition, membership, staffSubject, grant, duty };
  }

  it('user disable preserves organizational, capability and duty history', async () => {
    const fixture = await historyFixture();
    expect((await fixture.actor.agent.post(`/api/users/${fixture.target.id}/disable`).set('Origin', testOrigin)).status).toBe(200);
    expect(await h.prisma.subjectGroupMembership.findUnique({ where: { id: fixture.membership.id } })).not.toBeNull();
    expect(await h.prisma.staffSubject.findUnique({ where: { id: fixture.staffSubject.id } })).not.toBeNull();
    expect(await h.prisma.capabilityGrant.findUnique({ where: { id: fixture.grant.id } })).not.toBeNull();
    expect(await h.prisma.staffAdditionalDutyAssignment.findUnique({ where: { id: fixture.duty.id } })).not.toBeNull();
  });

  it('catalog deactivation preserves memberships, grants and duty assignments without temporal mutation', async () => {
    const fixture = await historyFixture();
    await fixture.actor.agent.post(`/api/subject-groups/${fixture.group.id}/deactivate`).set('Origin', testOrigin);
    await fixture.actor.agent.post(`/api/subjects/${fixture.subject.id}/deactivate`).set('Origin', testOrigin);
    const [membership, staffSubject, grant, duty] = await Promise.all([
      h.prisma.subjectGroupMembership.findUniqueOrThrow({ where: { id: fixture.membership.id } }),
      h.prisma.staffSubject.findUniqueOrThrow({ where: { id: fixture.staffSubject.id } }),
      h.prisma.capabilityGrant.findUniqueOrThrow({ where: { id: fixture.grant.id } }),
      h.prisma.staffAdditionalDutyAssignment.findUniqueOrThrow({ where: { id: fixture.duty.id } }),
    ]);
    expect(membership.validUntil).toBeNull();
    expect(staffSubject.validUntil).toBeNull();
    expect(grant.revokedAt).toBeNull();
    expect(duty.validUntil).toBeNull();
  });

  it('definition disable and capability revoke preserve independent domain histories', async () => {
    const fixture = await historyFixture();
    const countsBefore = {
      memberships: await h.prisma.subjectGroupMembership.count(),
      staffSubjects: await h.prisma.staffSubject.count(),
      duties: await h.prisma.staffAdditionalDutyAssignment.count(),
      grants: await h.prisma.capabilityGrant.count(),
    };
    await fixture.actor.agent.post(`/api/additional-duty-definitions/${fixture.definition.id}/disable`).set('Origin', testOrigin);
    await fixture.actor.agent.post(`/api/capability-grants/${fixture.grant.id}/revoke`).set('Origin', testOrigin);
    expect(await h.prisma.subjectGroupMembership.count()).toBe(countsBefore.memberships);
    expect(await h.prisma.staffSubject.count()).toBe(countsBefore.staffSubjects);
    expect(await h.prisma.staffAdditionalDutyAssignment.count()).toBe(countsBefore.duties);
    expect(await h.prisma.capabilityGrant.count()).toBe(countsBefore.grants);
    expect((await h.prisma.staffAdditionalDutyAssignment.findUniqueOrThrow({ where: { id: fixture.duty.id } })).validUntil).toBeNull();
    expect((await h.prisma.capabilityGrant.findUniqueOrThrow({ where: { id: fixture.grant.id } })).revokedAt).not.toBeNull();
  });
});
