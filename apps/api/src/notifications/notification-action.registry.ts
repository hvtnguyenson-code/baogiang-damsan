import { Injectable } from '@nestjs/common';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ActionResolutionResult {
  allowed: boolean;
  targetUrl?: string;
  reason?: string;
}

export interface NotificationVisibilityCandidate {
  eventType: string;
  sourceKind?: string | null;
  sourceId?: string | null;
  actionKey?: string | null;
  actionParamsJson?: unknown;
}

@Injectable()
export class NotificationActionRegistry {
  constructor(
    private readonly capabilityAuth: CapabilityAuthorizationService,
    private readonly prisma: PrismaService,
  ) {}

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
          return { allowed: false, reason: 'Không còn quyền duyệt báo cáo kê khai.' };
        }

        const revisionId =
          typeof actionParamsJson?.['revisionId'] === 'string' ? actionParamsJson['revisionId'] : undefined;

        if (revisionId) {
          const revision = await this.prisma.reportingStatementRevision.findUnique({
            where: { id: revisionId },
            include: { state: true },
          });
          if (!revision || revision.state?.lifecycleState !== 'SUBMITTED') {
            return {
              allowed: false,
              reason: 'Báo cáo kê khai này không còn ở trạng thái chờ duyệt.',
            };
          }
        }

        const targetUrl = revisionId
          ? `/phe-duyet-bao-cao?revisionId=${encodeURIComponent(revisionId)}`
          : '/phe-duyet-bao-cao';
        return { allowed: true, targetUrl };
      }

      case 'REPORTING_VIEW': {
        const revisionId =
          typeof actionParamsJson?.['revisionId'] === 'string' ? actionParamsJson['revisionId'] : undefined;

        const canWide = await this.capabilityAuth.hasCapability({
          userId,
          capabilityKey: 'REPORTING_STATEMENT_READ',
          requestedScope: 'SCHOOL_WIDE',
        });

        if (revisionId) {
          const revision = await this.prisma.reportingStatementRevision.findUnique({
            where: { id: revisionId },
            include: { series: true },
          });
          if (!revision) {
            return { allowed: false, reason: 'Không tìm thấy báo cáo kê khai.' };
          }
          if (revision.series.submitterUserId === userId) {
            const canPersonal = await this.capabilityAuth.hasCapability({
              userId,
              capabilityKey: 'REPORTING_STATEMENT_READ',
              requestedScope: 'PERSONAL',
            });
            if (!canPersonal && !canWide) {
              return { allowed: false, reason: 'Không có quyền xem báo cáo kê khai cá nhân.' };
            }
          } else if (!canWide) {
            return { allowed: false, reason: 'Không có quyền xem báo cáo kê khai của giáo viên khác.' };
          }
        } else {
          const canPersonal = await this.capabilityAuth.hasCapability({
            userId,
            capabilityKey: 'REPORTING_STATEMENT_READ',
            requestedScope: 'PERSONAL',
          });
          if (!canPersonal && !canWide) {
            return { allowed: false, reason: 'Không còn quyền xem báo cáo kê khai.' };
          }
        }

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
          return { allowed: false, reason: 'Không còn quyền truy cập lịch dạy.' };
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
          return { allowed: false, reason: 'Không còn quyền điều hành chuyên môn.' };
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
          return { allowed: false, reason: 'Không còn quyền truy cập dữ liệu quản trị.' };
        }
        return { allowed: true, targetUrl: '/quan-tri/san-sang-du-lieu' };
      }

      default:
        return { allowed: false, reason: 'Loại công việc không được hỗ trợ hoặc đã thay đổi.' };
    }
  }

  async isNotificationVisible(
    userId: string,
    notification: NotificationVisibilityCandidate,
  ): Promise<boolean> {
    const { eventType, actionKey, sourceKind, sourceId } = notification;

    if (eventType === 'REPORTING_SUBMITTED' || actionKey === 'REPORTING_APPROVAL') {
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
      if (!isApprover) return false;

      // Fail-closed source revalidation (N04): source must be ReportingStatementRevision with valid sourceId
      if (sourceKind !== 'ReportingStatementRevision' || !sourceId) {
        return false;
      }

      const revision = await this.prisma.reportingStatementRevision.findUnique({
        where: { id: sourceId },
        include: { state: true },
      });
      if (!revision || revision.state?.lifecycleState !== 'SUBMITTED') {
        return false;
      }
      return true;
    }

    if (eventType === 'REPORTING_DECIDED' || actionKey === 'REPORTING_VIEW') {
      // Fail-closed source revalidation (N04): source must be ReportingStatementRevision with valid sourceId
      if (sourceKind !== 'ReportingStatementRevision' || !sourceId) {
        return false;
      }

      const revision = await this.prisma.reportingStatementRevision.findUnique({
        where: { id: sourceId },
        include: { series: true },
      });
      if (!revision) return false;

      const isSubmitter = revision.series.submitterUserId === userId;
      const canWide = await this.capabilityAuth.hasCapability({
        userId,
        capabilityKey: 'REPORTING_STATEMENT_READ',
        requestedScope: 'SCHOOL_WIDE',
      });

      if (eventType === 'REPORTING_DECIDED' && !isSubmitter) {
        return false;
      }

      if (!isSubmitter && !canWide) {
        return false;
      }
      return true;
    }

    if (eventType.startsWith('TIMETABLE_')) {
      const canPersonal = await this.capabilityAuth.hasCapability({
        userId,
        capabilityKey: 'TEACHER_BASE',
        requestedScope: 'PERSONAL',
      });
      return canPersonal;
    }

    if (eventType.startsWith('SYSTEM_')) {
      return true;
    }

    // Fail-closed on unrecognized notification type
    return false;
  }
}
