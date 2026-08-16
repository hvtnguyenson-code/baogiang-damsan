import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';

@Injectable()
export class TeachingExecutionAccessService {
  private readonly logger = new Logger(TeachingExecutionAccessService.name);
  constructor(private readonly authorization: CapabilityAuthorizationService, private readonly audit: AuditService) {}

  async requireCurricular(request: AuthenticatedRequest, actualTeacherUserId: string, subjectId: string): Promise<'PERSONAL' | 'SUBJECT' | 'SCHOOL_WIDE'> {
    if (!request.auth || request.auth.user.mustChangePassword) return this.deny(request, 'TEACHING_EXECUTION_RECORD', 'PASSWORD_CHANGE_REQUIRED');
    if (request.auth.user.id === actualTeacherUserId && (await this.authorization.evaluate({ userId: request.auth.user.id, capabilityKey: 'TEACHING_EXECUTION_RECORD', requestedScope: 'PERSONAL' })).allowed) return 'PERSONAL';
    if ((await this.authorization.evaluate({ userId: request.auth.user.id, capabilityKey: 'TEACHING_EXECUTION_MANAGE', requestedScope: 'SCHOOL_WIDE' })).allowed) return 'SCHOOL_WIDE';
    if ((await this.authorization.evaluate({ userId: request.auth.user.id, capabilityKey: 'TEACHING_EXECUTION_MANAGE', requestedScope: 'SUBJECT', resourceId: subjectId })).allowed) return 'SUBJECT';
    return this.deny(request, 'TEACHING_EXECUTION_MANAGE', 'GRANT_NOT_FOUND');
  }

  async requireActivity(request: AuthenticatedRequest, actualTeacherUserId: string): Promise<'PERSONAL' | 'SCHOOL_WIDE'> {
    if (!request.auth || request.auth.user.mustChangePassword) return this.deny(request, 'TEACHING_EXECUTION_RECORD', 'PASSWORD_CHANGE_REQUIRED');
    if (request.auth.user.id === actualTeacherUserId && (await this.authorization.evaluate({ userId: request.auth.user.id, capabilityKey: 'TEACHING_EXECUTION_RECORD', requestedScope: 'PERSONAL' })).allowed) return 'PERSONAL';
    if ((await this.authorization.evaluate({ userId: request.auth.user.id, capabilityKey: 'TEACHING_EXECUTION_MANAGE', requestedScope: 'SCHOOL_WIDE' })).allowed) return 'SCHOOL_WIDE';
    return this.deny(request, 'TEACHING_EXECUTION_MANAGE', 'GRANT_NOT_FOUND');
  }

  private async deny(request: AuthenticatedRequest, capabilityKey: string, reasonCode: string): Promise<never> {
    try { await this.audit.write({ actorUserId: request.auth?.user.id, action: 'AUTHORIZATION_DENIED', entityType: 'CapabilityDefinition', entityId: capabilityKey, result: 'DENIED', metadata: { capabilityKey, reasonCode, route: request.route?.path ?? request.path, method: request.method } }); }
    catch (error) { this.logger.error(`Failed authorization denial audit: ${error instanceof Error ? error.message : 'unknown error'}`); }
    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
  }
}
