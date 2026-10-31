import { Injectable } from '@nestjs/common';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';

export interface ActionResolutionResult {
  allowed: boolean;
  targetUrl?: string;
  reason?: string;
}

@Injectable()
export class NotificationActionRegistry {
  constructor(private readonly capabilityAuth: CapabilityAuthorizationService) {}

  async resolveAction(
    userId: string,
    actionKey: string | null | undefined,
    actionParamsJson: Record<string, unknown> | null | undefined,
  ): Promise<ActionResolutionResult> {
    if (!actionKey) {
      return { allowed: true, targetUrl: '/thong-bao' };
    }

    switch (actionKey) {
      case 'REPORTING_APPROVAL': {
        const hasPerm =
          (await this.capabilityAuth.hasCapability({
            userId,
            capabilityKey: 'APPROVAL_PRINCIPAL',
            requestedScope: 'SCHOOL_WIDE',
          })) ||
          (await this.capabilityAuth.hasCapability({
            userId,
            capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
            requestedScope: 'SCHOOL_WIDE',
          }));
        if (!hasPerm) {
          return { allowed: false, reason: 'Không còn quyền truy cập hoặc công việc đã thay đổi.' };
        }
        const revisionId =
          typeof actionParamsJson?.['revisionId'] === 'string' ? actionParamsJson['revisionId'] : undefined;
        const targetUrl = revisionId
          ? `/phe-duyet-bao-cao?revisionId=${encodeURIComponent(revisionId)}`
          : '/phe-duyet-bao-cao';
        return { allowed: true, targetUrl };
      }

      case 'REPORTING_VIEW': {
        const canPersonal = await this.capabilityAuth.hasCapability({
          userId,
          capabilityKey: 'REPORTING_STATEMENT_READ',
          requestedScope: 'PERSONAL',
        });
        const canWide = await this.capabilityAuth.hasCapability({
          userId,
          capabilityKey: 'REPORTING_STATEMENT_READ',
          requestedScope: 'SCHOOL_WIDE',
        });
        if (!canPersonal && !canWide) {
          return { allowed: false, reason: 'Không còn quyền truy cập hoặc công việc đã thay đổi.' };
        }
        const revisionId =
          typeof actionParamsJson?.['revisionId'] === 'string' ? actionParamsJson['revisionId'] : undefined;
        const targetUrl = revisionId
          ? `/bao-cao-ke-khai/${encodeURIComponent(revisionId)}`
          : '/bao-cao-ke-khai';
        return { allowed: true, targetUrl };
      }

      case 'TIMETABLE_VIEW': {
        const hasPerm = await this.capabilityAuth.hasCapability({
          userId,
          capabilityKey: 'TEACHER_BASE',
          requestedScope: 'PERSONAL',
        });
        if (!hasPerm) {
          return { allowed: false, reason: 'Không còn quyền truy cập hoặc công việc đã thay đổi.' };
        }
        return { allowed: true, targetUrl: '/lich-day' };
      }

      case 'OPERATIONAL_MANAGEMENT': {
        const hasPerm = await this.capabilityAuth.hasCapability({
          userId,
          capabilityKey: 'TEACHING_OPERATION_MANAGE',
          requestedScope: 'SCHOOL_WIDE',
        });
        if (!hasPerm) {
          return { allowed: false, reason: 'Không còn quyền truy cập hoặc công việc đã thay đổi.' };
        }
        return { allowed: true, targetUrl: '/quan-tri/dieu-hanh-chuyen-mon' };
      }

      case 'DATA_READINESS': {
        const readinessKeys = [
          'APPROVAL_PRINCIPAL',
          'APPROVAL_VICE_PRINCIPAL',
          'TIMETABLE_MANAGE',
          'PPCT_MANAGE',
          'USER_MANAGE',
          'ACADEMIC_STRUCTURE_MANAGE',
          'TEACHING_EXECUTION_MANAGE',
        ] as const;

        let hasPerm = false;
        for (const key of readinessKeys) {
          if (
            await this.capabilityAuth.hasCapability({
              userId,
              capabilityKey: key,
              requestedScope: 'SCHOOL_WIDE',
            })
          ) {
            hasPerm = true;
            break;
          }
        }

        if (!hasPerm) {
          return { allowed: false, reason: 'Không còn quyền truy cập hoặc công việc đã thay đổi.' };
        }
        return { allowed: true, targetUrl: '/quan-tri/san-sang-du-lieu' };
      }

      default:
        return { allowed: false, reason: 'Không còn quyền truy cập hoặc công việc đã thay đổi.' };
    }
  }

  async isNotificationVisible(
    userId: string,
    notification: { eventType: string; actionKey?: string | null },
  ): Promise<boolean> {
    if (notification.eventType === 'REPORTING_SUBMITTED' || notification.actionKey === 'REPORTING_APPROVAL') {
      const isApprover =
        (await this.capabilityAuth.hasCapability({
          userId,
          capabilityKey: 'APPROVAL_PRINCIPAL',
          requestedScope: 'SCHOOL_WIDE',
        })) ||
        (await this.capabilityAuth.hasCapability({
          userId,
          capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
          requestedScope: 'SCHOOL_WIDE',
        }));
      return isApprover;
    }
    return true;
  }
}
