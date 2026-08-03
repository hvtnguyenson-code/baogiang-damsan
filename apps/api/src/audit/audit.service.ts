import { Injectable } from '@nestjs/common';
import { AuditResult, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEY = /password|token|cookie|secret|hash|authorization/i;

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

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  sanitize(metadata?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
    if (!metadata) return undefined;
    const output: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (SENSITIVE_KEY.test(key) || value === undefined) continue;
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        output[key] = value as Prisma.InputJsonValue;
      } else if (Array.isArray(value)) {
        output[key] = value
          .filter((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)) as Prisma.InputJsonArray;
      } else if (typeof value === 'object') {
        output[key] = this.sanitize(value as Record<string, unknown>) ?? {};
      }
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
