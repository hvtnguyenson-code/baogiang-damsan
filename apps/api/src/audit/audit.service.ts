import { Injectable } from '@nestjs/common';
import { AuditResult, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEY = /password|token|cookie|secret|hash|authorization|credential|bearer|api[_-]?key|database[_-]?url/i;
const MAX_METADATA_DEPTH = 8;

export interface AuditInput {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  requestId?: string;
  result: AuditResult;
  metadata?: Record<string, unknown>;
}

type AuditDb = Pick<PrismaClient, 'auditEvent'> | Prisma.TransactionClient;
type SafeJson = string | number | boolean | null | SafeJson[] | { [key: string]: SafeJson };

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  sanitize(metadata?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
    if (!metadata) return undefined;
    return this.sanitizeValue(metadata, 0, new WeakSet<object>()) as Prisma.InputJsonValue;
  }

  private sanitizeValue(
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
  ): SafeJson | undefined {
    if (depth > MAX_METADATA_DEPTH || value === undefined) return undefined;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'object') return undefined;
    if (seen.has(value)) return undefined;
    seen.add(value);
    if (Array.isArray(value)) {
      const output: SafeJson[] = [];
      for (const item of value) {
        const sanitized = this.sanitizeValue(item, depth + 1, seen);
        if (sanitized !== undefined) output.push(sanitized);
      }
      return output;
    }
    const output: Record<string, SafeJson> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      const sanitized = this.sanitizeValue(item, depth + 1, seen);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  }

  async write(input: AuditInput, db: AuditDb = this.prisma): Promise<void> {
    await db.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId,
        result: input.result,
        metadata: this.sanitize(input.metadata),
      },
    });
  }
}
