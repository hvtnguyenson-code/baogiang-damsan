import { Controller, Get, INestApplication, Param, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthModule } from '../../src/auth/auth.module';
import { PasswordService } from '../../src/auth/password.service';
import { SessionAuthGuard } from '../../src/auth/session-auth.guard';
import { AuthorizationModule } from '../../src/authorization/authorization.module';
import { CapabilityGuard } from '../../src/authorization/capability.guard';
import { RequireCapability } from '../../src/authorization/require-capability.decorator';
import { AppConfigModule } from '../../src/config/app-config.module';
import { CapabilityAuthorizationService } from '../../src/authorization/capability-authorization.service';

@Controller('__test/authorization')
@UseGuards(SessionAuthGuard, CapabilityGuard)
class AuthorizationTestController {
  @Get('school')
  @RequireCapability('USER_MANAGE', { scope: 'SCHOOL_WIDE' })
  school(): { allowed: true } {
    return { allowed: true };
  }

  @Get('groups/:groupId')
  @RequireCapability('SUBJECT_GROUP_LEAD', { scope: 'SUBJECT_GROUP', resourceParam: 'groupId' })
  group(@Param('groupId') _groupId: string): { allowed: true } {
    return { allowed: true };
  }

  @Get('groups-school')
  @RequireCapability('SUBJECT_GROUP_LEAD', { scope: 'SCHOOL_WIDE' })
  groupsSchool(): { allowed: true } {
    return { allowed: true };
  }

  @Get('approval')
  @RequireCapability('APPROVAL_PRINCIPAL', { scope: 'SCHOOL_WIDE' })
  approval(): { allowed: true } {
    return { allowed: true };
  }

  @Get('personal')
  @RequireCapability('TEACHER_BASE', { scope: 'PERSONAL' })
  personal(): { allowed: true } {
    return { allowed: true };
  }
}

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const integration = testDatabaseUrl ? describe : describe.skip;
const groupId = '22222222-2222-4222-8222-222222222222';
const otherGroupId = '33333333-3333-4333-8333-333333333333';
const password = 'AuthorizationPassword9';

integration('Capability authorization (isolated PostgreSQL integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let passwords: PasswordService;
  let authorization: CapabilityAuthorizationService;
  let assignmentTablesAvailable = false;

  beforeAll(async () => {
    process.env['DATABASE_URL'] = testDatabaseUrl;
    process.env['NODE_ENV'] = 'test';
    process.env['CORS_ORIGINS'] = 'http://127.0.0.1:5173';
    process.env['AUTH_COOKIE_SECURE'] = 'false';
    process.env['AUTH_LOGIN_RATE_LIMIT_MAX'] = '100';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AppConfigModule, AuthModule, AuthorizationModule],
      controllers: [AuthorizationTestController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    passwords = app.get(PasswordService);
    authorization = app.get(CapabilityAuthorizationService);
    const tableCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.staff_additional_duty_assignments') IS NOT NULL AS "exists"
    `;
    assignmentTablesAvailable = tableCheck[0]?.exists ?? false;
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.teachingAssignment.deleteMany();
    await prisma.capabilityGrant.deleteMany();
    if (assignmentTablesAvailable) {
      await prisma.staffAdditionalDutyAssignment.deleteMany();
      await prisma.additionalDutyDefinition.deleteMany();
      await prisma.subjectGroupMembership.deleteMany();
    }
    await prisma.staffProfile.deleteMany();
    await prisma.user.deleteMany();
    if (assignmentTablesAvailable) await prisma.subjectGroup.deleteMany();
    await prisma.capabilityDefinition.deleteMany();
    await prisma.capabilityDefinition.createMany({
      data: [
        { key: 'USER_MANAGE', description: 'Manage users', allowedScopeTypes: ['SCHOOL_WIDE'] },
        { key: 'SUBJECT_GROUP_LEAD', description: 'Lead group', allowedScopeTypes: ['SUBJECT_GROUP', 'SCHOOL_WIDE'] },
        { key: 'APPROVAL_PRINCIPAL', description: 'Principal approval', allowedScopeTypes: ['SCHOOL_WIDE'] },
        { key: 'SYSTEM_ADMIN', description: 'Technical administration', allowedScopeTypes: ['SCHOOL_WIDE'] },
        { key: 'TEACHER_BASE', description: 'Personal teacher access', allowedScopeTypes: ['PERSONAL'] },
        { key: 'AUDIT_VIEW', description: 'View audit', allowedScopeTypes: ['SCHOOL_WIDE'], isActive: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  async function createAgent(username: string, mustChangePassword = false) {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await passwords.hash(password),
        status: 'ACTIVE',
        mustChangePassword,
        profile: { create: { displayName: username, isTeachingStaff: true } },
      },
    });
    const agent = request.agent(app.getHttpServer());
    expect((await agent.post('/api/auth/login').send({ username, password })).status).toBe(200);
    return { user, agent };
  }

  async function grant(userId: string, capabilityKey: string, scopeType: string, scopeResourceId: string | null = null, overrides = {}) {
    return prisma.capabilityGrant.create({
      data: { userId, capabilityKey, scopeType, scopeResourceId, validFrom: new Date(Date.now() - 60_000), ...overrides },
    });
  }

  it('enforces exact resource grants and records a safe denial event', async () => {
    const { user, agent } = await createAgent('group-lead');
    await grant(user.id, 'SUBJECT_GROUP_LEAD', 'SUBJECT_GROUP', groupId);
    expect((await agent.get(`/api/__test/authorization/groups/${groupId}`)).status).toBe(200);
    expect((await agent.get(`/api/__test/authorization/groups/${otherGroupId}`)).status).toBe(403);
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'AUTHORIZATION_DENIED' } });
    expect(event.actorUserId).toBe(user.id);
    expect(event.result).toBe('DENIED');
    expect(event.metadata).toMatchObject({
      capabilityKey: 'SUBJECT_GROUP_LEAD', scope: 'SUBJECT_GROUP', resourceId: otherGroupId, reasonCode: 'GRANT_NOT_FOUND', method: 'GET',
    });
  });

  it('allows school-wide grants to cover narrower requests', async () => {
    const { user, agent } = await createAgent('school-lead');
    await grant(user.id, 'SUBJECT_GROUP_LEAD', 'SCHOOL_WIDE');
    expect((await agent.get(`/api/__test/authorization/groups/${groupId}`)).status).toBe(200);
  });

  it('does not let a narrower grant cover a school-wide request', async () => {
    const { user, agent } = await createAgent('narrow-lead');
    await grant(user.id, 'SUBJECT_GROUP_LEAD', 'SUBJECT_GROUP', groupId);
    expect((await agent.get('/api/__test/authorization/groups-school')).status).toBe(403);
  });

  it('normalizes PERSONAL to the authenticated user and never accepts another target', async () => {
    const { user, agent } = await createAgent('personal-user');
    await grant(user.id, 'TEACHER_BASE', 'PERSONAL');
    expect((await agent.get('/api/__test/authorization/personal')).status).toBe(200);
    await expect(authorization.evaluate({
      userId: user.id, capabilityKey: 'TEACHER_BASE', requestedScope: 'PERSONAL', resourceId: otherGroupId,
    })).resolves.toMatchObject({ allowed: false, reasonCode: 'RESOURCE_INVALID' });
  });

  it('does not let SYSTEM_ADMIN imply professional approval', async () => {
    const { user, agent } = await createAgent('technical-admin');
    await grant(user.id, 'SYSTEM_ADMIN', 'SCHOOL_WIDE');
    expect((await agent.get('/api/__test/authorization/approval')).status).toBe(403);
    expect(await prisma.auditEvent.count({ where: { action: 'AUTHORIZATION_DENIED' } })).toBe(1);
  });

  it('denies future, expired, revoked, and malformed grants without repairing them', async () => {
    const cases = [
      { username: 'future', overrides: { validFrom: new Date(Date.now() + 60_000) } },
      { username: 'expired', overrides: { validUntil: new Date(Date.now() - 1) } },
      { username: 'revoked', overrides: { revokedAt: new Date() } },
      { username: 'malformed', scopeType: 'SUBJECT_GROUP', overrides: {} },
    ];
    for (const item of cases) {
      const { user, agent } = await createAgent(item.username);
      await grant(user.id, 'SUBJECT_GROUP_LEAD', item.scopeType ?? 'SUBJECT_GROUP', item.username === 'malformed' ? null : groupId, item.overrides);
      expect((await agent.get(`/api/__test/authorization/groups/${groupId}`)).status).toBe(403);
    }
    expect(await prisma.capabilityGrant.count()).toBe(4);
  });

  it('denies inactive definitions and inactive or temporarily locked users even when grants exist', async () => {
    const { user } = await createAgent('state-user');
    await grant(user.id, 'AUDIT_VIEW', 'SCHOOL_WIDE');
    await expect(authorization.evaluate({ userId: user.id, capabilityKey: 'AUDIT_VIEW', requestedScope: 'SCHOOL_WIDE' }))
      .resolves.toMatchObject({ allowed: false, reasonCode: 'CAPABILITY_INACTIVE' });
    await grant(user.id, 'USER_MANAGE', 'SCHOOL_WIDE');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
    await expect(authorization.evaluate({ userId: user.id, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE' }))
      .resolves.toMatchObject({ allowed: false, reasonCode: 'USER_INACTIVE' });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', lockedUntil: new Date(Date.now() + 60_000) } });
    await expect(authorization.evaluate({ userId: user.id, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE' }))
      .resolves.toMatchObject({ allowed: false, reasonCode: 'USER_LOCKED' });
  });

  it('does not derive capabilities from membership or additional-duty assignment', async () => {
    const { user } = await createAgent('assigned-user');
    let requestedGroupId = groupId;
    if (assignmentTablesAvailable) {
      const group = await prisma.subjectGroup.create({ data: { code: 'MATH', name: 'Mathematics' } });
      requestedGroupId = group.id;
      await prisma.subjectGroupMembership.create({ data: { userId: user.id, subjectGroupId: group.id, isPrimary: true } });
      const profile = await prisma.staffProfile.findUniqueOrThrow({ where: { userId: user.id } });
      const duty = await prisma.additionalDutyDefinition.create({
        data: { code: 'LEAD', name: 'Lead', category: 'LEADERSHIP' },
      });
      await prisma.staffAdditionalDutyAssignment.create({
        data: {
          staffProfileId: profile.id,
          dutyDefinitionId: duty.id,
          scopeType: 'SUBJECT_GROUP',
          scopeResourceId: group.id,
          createdByUserId: user.id,
        },
      });
    }
    await expect(authorization.evaluate({
      userId: user.id, capabilityKey: 'SUBJECT_GROUP_LEAD', requestedScope: 'SUBJECT_GROUP', resourceId: requestedGroupId,
    })).resolves.toMatchObject({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
  });

  it('blocks first-login users before evaluating an otherwise valid grant', async () => {
    const { user, agent } = await createAgent('first-login', true);
    await grant(user.id, 'USER_MANAGE', 'SCHOOL_WIDE');
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await agent.get('/api/__test/authorization/school')).status).toBe(403);
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'AUTHORIZATION_DENIED' } });
    expect(event.metadata).toMatchObject({ reasonCode: 'PASSWORD_CHANGE_REQUIRED' });
    expect((await agent.post('/api/auth/change-password').set('Origin', 'http://127.0.0.1:5173').send({
      currentPassword: password,
      newPassword: 'ReplacementAuthorization9',
    })).status).toBe(200);
    expect((await agent.get('/api/__test/authorization/school')).status).toBe(200);
    expect((await agent.post('/api/auth/logout').set('Origin', 'http://127.0.0.1:5173')).status).toBe(200);
  });

  it('/auth/me exposes only active public capability fields in deterministic order', async () => {
    const { user, agent } = await createAgent('me-capabilities');
    await grant(user.id, 'USER_MANAGE', 'SCHOOL_WIDE');
    await grant(user.id, 'SUBJECT_GROUP_LEAD', 'SUBJECT_GROUP', groupId);
    await grant(user.id, 'SUBJECT_GROUP_LEAD', 'SUBJECT_GROUP', otherGroupId, { validFrom: new Date(Date.now() + 60_000) });
    await grant(user.id, 'APPROVAL_PRINCIPAL', 'SCHOOL_WIDE', null, { revokedAt: new Date() });
    await grant(user.id, 'AUDIT_VIEW', 'SCHOOL_WIDE');
    await grant(user.id, 'SUBJECT_GROUP_LEAD', 'SUBJECT_GROUP');

    const response = await agent.get('/api/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.capabilities).toEqual([
      { key: 'SUBJECT_GROUP_LEAD', scope: 'SUBJECT_GROUP', resourceId: groupId },
      { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
    ]);
    expect(JSON.stringify(response.body.capabilities)).not.toMatch(/grant|valid|revoked|created|updated/i);
  });
});
