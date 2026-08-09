import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@prisma/client';
import request, { Agent } from 'supertest';
import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/auth/password.service';

export const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
export const integration = testDatabaseUrl ? describe : describe.skip;
export const testOrigin = 'http://127.0.0.1:5173';
export const testPassword = 'Phase01BackendPassword9';

export function normalizedCode(prefix: string, length = 8): string {
  return `${prefix}${crypto.randomUUID().replaceAll('-', '').slice(0, length).toUpperCase()}`;
}

export interface TestGrant {
  capabilityKey: string;
  scopeType?: string;
  scopeResourceId?: string;
}

export class Phase01Harness {
  app!: INestApplication;
  prisma!: PrismaClient;
  passwords!: PasswordService;

  async start(): Promise<void> {
    process.env['DATABASE_URL'] = testDatabaseUrl;
    process.env['NODE_ENV'] = 'test';
    process.env['CORS_ORIGINS'] = testOrigin;
    process.env['AUTH_COOKIE_SECURE'] = 'false';
    process.env['AUTH_LOGIN_RATE_LIMIT_MAX'] = '100';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    this.app = moduleRef.createNestApplication();
    this.app.setGlobalPrefix('api');
    this.app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await this.app.init();
    this.prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    this.passwords = this.app.get(PasswordService);
  }

  async stop(): Promise<void> {
    await this.prisma?.$disconnect();
    await this.app?.close();
  }

  async clean(): Promise<void> {
    await this.prisma.auditEvent.deleteMany();
    await this.prisma.authSession.deleteMany();
    await this.prisma.staffAdditionalDutyAssignment.deleteMany();
    await this.prisma.additionalDutyDefinition.deleteMany();
    await this.prisma.capabilityGrant.deleteMany();
    await this.prisma.subjectGroupMembership.deleteMany();
    await this.prisma.staffSubject.deleteMany();
    await this.prisma.subjectGroup.deleteMany();
    await this.prisma.subject.deleteMany();
    await this.prisma.staffProfile.deleteMany();
    await this.prisma.user.deleteMany();
    await this.prisma.capabilityDefinition.deleteMany();
  }

  async seedCapabilities(keys: Array<{ key: string; scopes: string[] }>): Promise<void> {
    await this.prisma.capabilityDefinition.createMany({
      data: keys.map(({ key, scopes }) => ({ key, description: key, allowedScopeTypes: scopes })),
    });
  }

  async actor(options: { grants?: TestGrant[]; mustChangePassword?: boolean; usernamePrefix?: string } = {}): Promise<{ agent: Agent; id: string }> {
    const user = await this.prisma.user.create({
      data: {
        username: `${options.usernamePrefix ?? 'actor'}-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: await this.passwords.hash(testPassword),
        status: UserStatus.ACTIVE,
        mustChangePassword: options.mustChangePassword ?? false,
        profile: { create: { displayName: 'Actor' } },
      },
    });
    for (const grant of options.grants ?? []) {
      await this.prisma.capabilityGrant.create({
        data: {
          userId: user.id,
          capabilityKey: grant.capabilityKey,
          scopeType: grant.scopeType ?? 'SCHOOL_WIDE',
          scopeResourceId: grant.scopeResourceId,
          validFrom: new Date(Date.now() - 1_000),
        },
      });
    }
    const agent = request.agent(this.app.getHttpServer());
    expect((await agent.post('/api/auth/login').send({ username: user.username, password: testPassword })).status).toBe(200);
    return { agent, id: user.id };
  }
}
