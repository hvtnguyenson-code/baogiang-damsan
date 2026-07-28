import { Injectable, Logger } from '@nestjs/common';
import {
  AiAssistantPort,
  AiAuditLogEntry,
  AiAuditService,
  AiBudgetGuard,
  AiContextQueryPort,
  AiCostLedger,
  AiOutputValidator,
  AiPassiveTriggerEvent,
  AiPassiveTriggerPort,
  AiPolicyGuard,
  AiProviderAdapter,
  AiProviderRequest,
  AiProviderResponse,
  AiQuotaGuard,
  AiRequestContext,
  AiResultCache,
  AiSuggestionDeliveryPort,
  AiSuggestionRecord,
  AiSuggestionResult,
  AiSuggestionStore,
  AiTaskCatalog,
  AiTaskDefinition,
  AiUsageEvent,
  AiUsageMeter,
  PromptTemplateRegistry,
} from './ai-ports';

/**
 * DisabledAiAssistantAdapter
 *
 * Safe no-op adapter implementing all AI ports.
 * Used when AI_ENABLED=false (the default).
 *
 * This adapter:
 * - NEVER makes network calls to any AI provider
 * - NEVER writes data to business databases
 * - Returns clearly marked "disabled" or "empty" responses
 * - Logs warnings if called (should not happen in normal flow)
 *
 * See: docs/decisions/ADR-002-AI-READY-BUT-DISABLED.md
 * See: docs/architecture/AI_GOVERNANCE_AND_ACCESS_MODEL.md
 * See: docs/requirements/PHASE-00-AI-PORTS-ADDENDUM.md
 */
@Injectable()
export class DisabledAiAssistantAdapter
  implements
    AiAssistantPort,
    AiContextQueryPort,
    AiPolicyGuard,
    AiTaskCatalog,
    PromptTemplateRegistry,
    AiQuotaGuard,
    AiBudgetGuard,
    AiUsageMeter,
    AiCostLedger,
    AiPassiveTriggerPort,
    AiSuggestionDeliveryPort,
    AiProviderAdapter,
    AiOutputValidator,
    AiSuggestionStore,
    AiAuditService,
    AiResultCache
{
  private readonly logger = new Logger(DisabledAiAssistantAdapter.name);

  /** 1. AiAssistantPort */
  async draftLessonReport(
    _context: AiRequestContext,
    _lessonData: Record<string, unknown>,
  ): Promise<AiSuggestionResult<string>> {
    this.logger.warn('AI đang tắt (AI_ENABLED=false). Không thực hiện tác vụ AI.');
    return {
      suggestion: '',
      isDisabled: true,
      reasoning: 'AI tính năng bị tắt. Liên hệ quản trị viên hệ thống.',
    };
  }

  /** 2. AiContextQueryPort */
  async querySummary(
    _context: AiRequestContext,
    _query: string,
  ): Promise<AiSuggestionResult<string>> {
    this.logger.warn('AI đang tắt (AI_ENABLED=false). Không thực hiện truy vấn AI.');
    return {
      suggestion: '',
      isDisabled: true,
      reasoning: 'AI tính năng bị tắt.',
    };
  }

  /** 3. AiPolicyGuard */
  isActionPermissible(
    actionType: 'SUGGEST' | 'SUMMARIZE' | 'DRAFT' | 'AUTO_APPROVE' | 'AUTO_REJECT' | 'AUTO_MODIFY',
  ): boolean {
    // Auto-approve, auto-reject, auto-modify are ALWAYS forbidden
    if (
      actionType === 'AUTO_APPROVE' ||
      actionType === 'AUTO_REJECT' ||
      actionType === 'AUTO_MODIFY'
    ) {
      return false;
    }
    // Suggest/summarize/draft require AI to be enabled (false in Phase 00)
    return false;
  }

  /** 4. AiTaskCatalog */
  async getTaskDefinition(_taskType: string): Promise<AiTaskDefinition | null> {
    return null;
  }

  async listApprovedTasks(): Promise<AiTaskDefinition[]> {
    return [];
  }

  /** 5. PromptTemplateRegistry */
  async getTemplate(_taskType: string, _version?: string): Promise<string | null> {
    return null;
  }

  /** 6. AiQuotaGuard */
  async checkQuota(_userId: string, _taskType: string): Promise<{ isAllowed: boolean; remaining: number }> {
    return { isAllowed: false, remaining: 0 };
  }

  /** 7. AiBudgetGuard */
  async checkBudget(_departmentId?: string): Promise<{ isAllowed: boolean; remainingBudget: number }> {
    return { isAllowed: false, remainingBudget: 0 };
  }

  /** 8. AiUsageMeter */
  async recordUsage(_event: AiUsageEvent): Promise<void> {
    // No-op
  }

  /** 9. AiCostLedger */
  async getMonthlyCost(_yearMonth: string): Promise<number> {
    return 0;
  }

  /** 10. AiPassiveTriggerPort */
  async onDomainEvent(_event: AiPassiveTriggerEvent): Promise<void> {
    // No-op when AI disabled
  }

  /** 11. AiSuggestionDeliveryPort */
  async deliverSuggestion(_userId: string, _suggestion: AiSuggestionResult): Promise<void> {
    // No-op
  }

  /** 12. AiProviderAdapter */
  async complete(_request: AiProviderRequest): Promise<AiProviderResponse> {
    throw new Error('AI Provider Adapter is disabled (AI_ENABLED=false). Direct completion calls forbidden.');
  }

  /** 13. AiOutputValidator */
  validateOutput<T>(_rawOutput: string, _schemaName?: string): { isValid: boolean; parsed?: T; error?: string } {
    return { isValid: false, error: 'AI output validation disabled.' };
  }

  /** 14. AiSuggestionStore */
  async save(record: Omit<AiSuggestionRecord, 'id' | 'createdAt'>): Promise<AiSuggestionRecord> {
    return {
      id: 'disabled-stub',
      ...record,
      createdAt: new Date().toISOString(),
    };
  }

  async getById(_id: string): Promise<AiSuggestionRecord | null> {
    return null;
  }

  /** 15. AiAuditService */
  async log(_entry: AiAuditLogEntry): Promise<void> {
    // No-op
  }

  /** 16. AiResultCache */
  async get<T>(_cacheKey: string): Promise<T | null> {
    return null;
  }

  async set<T>(_cacheKey: string, _value: T, _ttlSeconds?: number): Promise<void> {
    // No-op
  }
}
