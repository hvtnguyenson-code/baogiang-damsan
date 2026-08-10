import { AuditResult, PrismaClient } from '@prisma/client';
import { appConfig } from '../config/app.config';
import { PasswordService } from '../auth/password.service';

export const BOOTSTRAP_TECHNICAL_CAPABILITIES = [
  'SYSTEM_ADMIN',
  'USER_MANAGE',
  'SUBJECT_GROUP_MANAGE',
  'SUBJECT_MANAGE',
  'CAPABILITY_GRANT',
  'AUDIT_VIEW',
  'ADDITIONAL_DUTY_CATALOG_MANAGE',
  'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE',
  'ACADEMIC_STRUCTURE_MANAGE',
] as const;

export interface BootstrapAdminInput {
  username: string;
  displayName: string;
  password: string;
}

export async function bootstrapAdmin(
  prisma: PrismaClient,
  passwords: PasswordService,
  input: BootstrapAdminInput,
): Promise<string> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!username || !displayName) throw new Error('Bootstrap username and display name are required.');
  passwords.validatePolicy(input.password);

  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existing) {
    await prisma.auditEvent.create({
      data: { action: 'AUTH_BOOTSTRAP_ADMIN_FAILURE', entityType: 'User', entityId: existing.id, result: AuditResult.FAILURE, metadata: { reasonCode: 'USERNAME_EXISTS' } },
    });
    throw new Error('Bootstrap username already exists; no data was overwritten.');
  }
  const definitions = await prisma.capabilityDefinition.findMany({
    where: { key: { in: [...BOOTSTRAP_TECHNICAL_CAPABILITIES] }, isActive: true }, select: { key: true },
  });
  if (definitions.length !== BOOTSTRAP_TECHNICAL_CAPABILITIES.length) {
    await prisma.auditEvent.create({
      data: { action: 'AUTH_BOOTSTRAP_ADMIN_FAILURE', entityType: 'User', result: AuditResult.FAILURE, metadata: { reasonCode: 'CAPABILITY_CATALOG_INCOMPLETE' } },
    });
    throw new Error('Technical capability catalog is incomplete. Run the approved capability seed first.');
  }
  const passwordHash = await passwords.hash(input.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username, passwordHash, status: 'ACTIVE', mustChangePassword: true,
        profile: { create: { displayName, isTeachingStaff: false, positionTitle: 'Quản trị kỹ thuật' } },
      },
    });
    await tx.capabilityGrant.createMany({
      data: BOOTSTRAP_TECHNICAL_CAPABILITIES.map((capabilityKey) => ({
        userId: user.id, capabilityKey, scopeType: 'SCHOOL_WIDE', grantedByUserId: user.id,
      })),
    });
    await tx.auditEvent.create({
      data: { actorUserId: user.id, action: 'AUTH_BOOTSTRAP_ADMIN_SUCCESS', entityType: 'User', entityId: user.id, result: AuditResult.SUCCESS, metadata: { capabilityCount: BOOTSTRAP_TECHNICAL_CAPABILITIES.length } },
    });
    return user.id;
  });
}

async function main(): Promise<void> {
  const username = process.env['BOOTSTRAP_ADMIN_USERNAME'];
  const displayName = process.env['BOOTSTRAP_ADMIN_DISPLAY_NAME'];
  const password = process.env['BOOTSTRAP_ADMIN_PASSWORD'];
  if (!username || !displayName || !password) {
    throw new Error('BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_DISPLAY_NAME and BOOTSTRAP_ADMIN_PASSWORD are required.');
  }
  const config = appConfig();
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  try {
    const userId = await bootstrapAdmin(prisma, new PasswordService(config), { username, displayName, password });
    process.stdout.write(`Bootstrap admin created: ${userId}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`Bootstrap admin failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
