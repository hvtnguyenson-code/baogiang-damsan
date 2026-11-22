/**
 * P5-057 B1 — STAGED, OFFLINE-ONLY initial technical Admin bootstrap writer.
 *
 * NOT injectable, NOT registered in Nest, NOT exported via any CLI or route.
 * Requires independently pinned Ed25519 approving public key, valid detached
 * signature, rights fingerprint and a one-time SERIALIZABLE DB transaction.
 * Never assigns a capability grant, coordinate, projection or source to legacy.
 *
 * Executable production activation, approver key trust and release authorization
 * require independent school approval and are deliberately absent.
 */
import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { AuditResult, Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;
const keyFormat = /^[A-Za-z0-9._:-]{8,128}$/;
const maxGrants = 10_000;
const initialCommandType = 'B1_INITIAL_TECHNICAL_ADMIN';

export interface B1InitialBootstrapInput {
  issuerUserId: string;    // real independent actor in DB, never inferred from Admin grants
  adminUserId: string;     // existing legacy Admin beneficiary
  requestKey: string;
  expectedRightsSha256: string;
  externalDecisionSha256: string; // document content hash, NOT a decision invented by this code
  approvedUntil: string;   // ISO date/time in the future
  signatureBase64: string; // independent Ed25519 approval of canonical payload
}
export interface B1InitialBootstrapTrust {
  approvedKeyPem: string;
  pinnedKeyDerSha256: string; // supplied by a *separate trusted operator config*, never the request
}
export interface B1InitialBootstrapReceipt {
  state: 'BOOTSTRAP_APPLIED';
  commandId: string;
  appointmentId: string;
  seatId: string;
  rightsFingerprintSha256: string;
  externalDecisionSha256: string;
  issuedAt: string;
  grantWrites: 0;
  coordinateWrites: 0;
  sourceWrites: 0;
}

function hash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
function fail(reason: string): never { throw new ConflictException(reason); }
function reject(reason: string): never { throw new ForbiddenException(reason); }

/** Public for test generation of a signed *synthetic* approval; no signer lives in the app. */
export function canonicalInitialBootstrapPayload(input: Omit<B1InitialBootstrapInput,'signatureBase64'>): string {
  return JSON.stringify([
    'B1_INITIAL_TECHNICAL_ADMIN_V1', input.issuerUserId, input.adminUserId,
    input.requestKey, input.expectedRightsSha256, input.externalDecisionSha256,
    input.approvedUntil,
  ]);
}

function authenticateApproval(input: B1InitialBootstrapInput, trust: B1InitialBootstrapTrust, now: Date): string {
  if (!uuid.test(input.issuerUserId || '') || !uuid.test(input.adminUserId || '') ||
      input.issuerUserId === input.adminUserId ||
      !keyFormat.test(input.requestKey || '') ||
      !sha256.test(input.expectedRightsSha256 || '') ||
      !sha256.test(input.externalDecisionSha256 || '') ||
      !sha256.test(trust.pinnedKeyDerSha256 || '') ||
      !/^[A-Za-z0-9+/]{86}==$/.test(input.signatureBase64 || '')) {
    reject('B1_INITIAL_BOOTSTRAP_INVALID_INPUT');
  }
  const deadline = new Date(input.approvedUntil);
  if (!Number.isFinite(deadline.getTime()) ||
      deadline.toISOString() !== input.approvedUntil ||
      deadline <= now || deadline.getTime() - now.getTime() > 86_400_000) {
    reject('B1_INITIAL_BOOTSTRAP_APPROVAL_EXPIRED_OR_UNBOUNDED');
  }
  let publicKey;
  try { publicKey = createPublicKey(trust.approvedKeyPem); }
  catch { reject('B1_INITIAL_BOOTSTRAP_TRUST_KEY_INVALID'); }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    reject('B1_INITIAL_BOOTSTRAP_TRUST_KEY_NOT_ED25519');
  }
  const pinned = hash(publicKey.export({ type: 'spki', format: 'der' }));
  if (pinned !== trust.pinnedKeyDerSha256) {
    reject('B1_INITIAL_BOOTSTRAP_TRUST_KEY_NOT_PINNED');
  }
  const payload = canonicalInitialBootstrapPayload(input);
  let valid = false;
  try {
    valid = verify(null, Buffer.from(payload), publicKey,
      Buffer.from(input.signatureBase64, 'base64'));
  } catch { valid = false; }
  if (!valid) reject('B1_INITIAL_BOOTSTRAP_SIGNATURE_INVALID');
  return hash(payload);
}

type GrantRow = {
  id: string; userId: string; capabilityKey: string; scopeType: string;
  scopeResourceId: string | null; validFrom: Date; validUntil: Date | null;
  grantedByUserId: string | null; coordinateId: string | null;
};
function rightsHash(grants: GrantRow[]): string {
  const normalized = grants.map((g) => ({
    id: g.id, userId: g.userId, capabilityKey: g.capabilityKey,
    scopeType: g.scopeType, scopeResourceId: g.scopeResourceId,
    validFrom: g.validFrom.toISOString(),
    validUntil: g.validUntil?.toISOString() ?? null,
    grantedByUserId: g.grantedByUserId,
  })).sort((a,b) => a.id.localeCompare(b.id));
  return hash(JSON.stringify(normalized));
}

export class B1InitialTechnicalAdminBootstrap {
  constructor(private readonly prisma: PrismaClient, private readonly trust: B1InitialBootstrapTrust) {}
  async execute(input: B1InitialBootstrapInput): Promise<B1InitialBootstrapReceipt> {
    const digest = authenticateApproval(input, this.trust, new Date());
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
      // Serialize all bootstrap attempts, including attempts against distinct admins.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(152075, 1)::text AS "locked"`;
      const [clock] = await tx.$queryRaw<Array<{ at: Date }>>`SELECT transaction_timestamp() AS "at"`;
      if (!(clock?.at instanceof Date)) fail('B1_INITIAL_BOOTSTRAP_CLOCK_UNAVAILABLE');
      authenticateApproval(input, this.trust, clock.at);
      const ids = [input.issuerUserId, input.adminUserId].sort();
      await tx.$queryRaw`SELECT id FROM users
        WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id FOR UPDATE`;
      const people = await tx.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, mustChangePassword: true },
      });
      if (people.length !== 2 || people.some((p) =>
        p.status !== UserStatus.ACTIVE || p.mustChangePassword)) {
        reject('B1_INITIAL_BOOTSTRAP_USER_NOT_ELIGIBLE');
      }
      const existing = await tx.accessCommand.findUnique({
        where: { actorUserId_commandType_requestKey: {
          actorUserId: input.issuerUserId,
          commandType: initialCommandType, requestKey: input.requestKey,
        } },
      });
      if (existing) {
        if (existing.fingerprint !== digest || existing.targetUserId !== input.adminUserId) {
          fail('B1_INITIAL_BOOTSTRAP_IDEMPOTENCY_CONFLICT');
        }
        const receipt = existing.result as unknown as B1InitialBootstrapReceipt;
        if (receipt?.state !== 'BOOTSTRAP_APPLIED' || receipt.commandId !== existing.id) {
          fail('B1_INITIAL_BOOTSTRAP_RECEIPT_INVALID');
        }
        return receipt;
      }
      const [seatCount, appointmentCount, initialCommandCount] = await Promise.all([
        tx.authoritySeat.count({ where: { key: 'TECHNICAL_ACCOUNT_ADMIN' } }),
        tx.roleAppointment.count({ where: { templateKey: 'TECHNICAL_ACCOUNT_ADMIN' } }),
        tx.accessCommand.count({ where: { commandType: initialCommandType } }),
      ]);
      if (seatCount !== 0 || appointmentCount !== 0 || initialCommandCount !== 0) {
        fail('B1_INITIAL_BOOTSTRAP_ALREADY_ESTABLISHED');
      }
      const activeGrants = await tx.capabilityGrant.findMany({
        where: { revokedAt: null, validFrom: { lte: clock.at },
          OR: [{ validUntil: null }, { validUntil: { gt: clock.at } }] },
        select: {
          id: true, userId: true, capabilityKey: true, scopeType: true,
          scopeResourceId: true, validFrom: true, validUntil: true,
          grantedByUserId: true, coordinateId: true,
        },
        orderBy: { id: 'asc' }, take: maxGrants + 1,
      });
      if (activeGrants.length > maxGrants || rightsHash(activeGrants) !== input.expectedRightsSha256) {
        fail('B1_INITIAL_BOOTSTRAP_RIGHTS_SNAPSHOT_CHANGED');
      }
      const candidate = new Map<string, Set<string>>();
      for (const grant of activeGrants) {
        if (grant.scopeType === 'SCHOOL_WIDE' &&
            grant.scopeResourceId === null &&
            ['USER_MANAGE','CAPABILITY_GRANT'].includes(grant.capabilityKey)) {
          if (!candidate.has(grant.userId)) candidate.set(grant.userId,new Set());
          candidate.get(grant.userId)!.add(grant.capabilityKey);
        }
      }
      const eligibleCandidates = [...candidate].filter(([, keys]) =>
        keys.has('USER_MANAGE') && keys.has('CAPABILITY_GRANT'));
      if (eligibleCandidates.length !== 1 || eligibleCandidates[0][0] !== input.adminUserId) {
        fail('B1_INITIAL_BOOTSTRAP_UNIQUE_ADMIN_NOT_PROVEN');
      }
      const legacy = activeGrants.filter((g) => g.userId === input.adminUserId);
      if (legacy.length === 0 || legacy.some((g) => g.coordinateId !== null)) {
        fail('B1_INITIAL_BOOTSTRAP_LEGACY_RECONCILIATION_REQUIRED');
      }
      for (const key of ['USER_MANAGE','CAPABILITY_GRANT']) {
        if (legacy.filter((g) => g.capabilityKey === key &&
          g.scopeType === 'SCHOOL_WIDE' && g.scopeResourceId === null).length !== 1) {
          fail('B1_INITIAL_BOOTSTRAP_REQUIRED_GRANTS_NOT_UNIQUE');
        }
      }
      const commandId = randomUUID();
      const appointmentId = randomUUID();
      const seatId = randomUUID();
      const receipt: B1InitialBootstrapReceipt = {
        state: 'BOOTSTRAP_APPLIED', commandId, appointmentId, seatId,
        rightsFingerprintSha256: input.expectedRightsSha256,
        externalDecisionSha256: input.externalDecisionSha256,
        issuedAt: clock.at.toISOString(), grantWrites: 0, coordinateWrites: 0, sourceWrites: 0,
      };
      await tx.authoritySeat.create({ data: {
        id: seatId, key: 'TECHNICAL_ACCOUNT_ADMIN', policyVersion: 1n, enabled: true,
      } });
      const command = await tx.accessCommand.create({ data: {
        id: commandId, actorUserId: input.issuerUserId,
        targetUserId: input.adminUserId, commandType: initialCommandType,
        requestKey: input.requestKey, fingerprint: digest,
        effectiveAt: clock.at, result: receipt as unknown as Prisma.InputJsonValue,
      } });
      await tx.roleAppointment.create({ data: {
        id: appointmentId, userId: input.adminUserId, seatId, createdCommandId: command.id,
        templateKey: 'TECHNICAL_ACCOUNT_ADMIN',
        templateVersion: 'WS1-B1-INITIAL-v1',
        templateSnapshot: {
          decisionSha256: input.externalDecisionSha256,
          decisionPayloadFingerprintSha256: digest,
          signerKeyFingerprintSha256: this.trust.pinnedKeyDerSha256,
          rightsFingerprintSha256: input.expectedRightsSha256,
          preExistingLegacyGrantsUntouched: true,
        },
        validFrom: clock.at,
      } });
      await tx.authorizationState.upsert({
        where: { id: 'B1_GLOBAL' },
        create: { id: 'B1_GLOBAL', epoch: 1n, lastMutationAt: clock.at },
        update: { epoch: { increment: 1n }, lastMutationAt: clock.at },
      });
      await tx.auditEvent.create({ data: {
        actorUserId: input.issuerUserId,
        action: 'B1_INITIAL_TECHNICAL_ADMIN_BOOTSTRAP',
        entityType: 'AccessCommand', entityId: command.id, result: AuditResult.SUCCESS,
        metadata: { targetUserId: input.adminUserId,
          decisionSha256: input.externalDecisionSha256,
          signerKeyFingerprintSha256: this.trust.pinnedKeyDerSha256,
          rightsFingerprintSha256: input.expectedRightsSha256,
          appointmentId, seatId, grantWrites: 0, sourceWrites: 0 },
      } });
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 4000, timeout: 20000 });
  }
}
