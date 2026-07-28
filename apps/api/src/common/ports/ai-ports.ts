/**
 * AI Ports — Architecture Integration Layer
 *
 * These interfaces define the ports through which AI capabilities
 * will be integrated in the final AI phase.
 *
 * IMPORTANT CONSTRAINTS (from master specification & AI Governance):
 * - AI is disabled by default (AI_ENABLED=false)
 * - No AI provider calls are made in Phase 00
 * - No AI endpoints are exposed in Phase 00
 * - Core system must function fully without AI
 * - AI may only suggest, summarize, and draft — never auto-approve,
 *   auto-reject, or auto-modify business data
 *
 * See: docs/decisions/ADR-002-AI-READY-BUT-DISABLED.md
 * See: docs/architecture/AI_GOVERNANCE_AND_ACCESS_MODEL.md
 * See: docs/requirements/PHASE-00-AI-PORTS-ADDENDUM.md
 */

// ============================================================
// Context and Query Ports
// ============================================================

/** Context passed to AI when querying for assistance */
export interface AiRequestContext {
  userId: string;
  sessionId: string;
  locale: 'vi';
  scope?: string;
  capabilityKey?: string;
}

/** Generic AI response wrapper */
export interface AiSuggestionResult<T = unknown> {
  suggestion: T;
  confidence?: number;
  reasoning?: string;
  /** Whether this is a real AI response or a stub/disabled response */
  isDisabled: boolean;
}

/**
 * 1. AiContextQueryPort
 * Port for querying AI about business context (e.g., schedule anomalies).
 * Implemented in Phase AI only.
 */
export interface AiContextQueryPort {
  querySummary(
    context: AiRequestContext,
    query: string,
  ): Promise<AiSuggestionResult<string>>;
}

/**
 * 2. AiAssistantPort
 * Port for AI-assisted drafting (e.g., drafting a lesson report).
 * Implemented in Phase AI only.
 */
export interface AiAssistantPort {
  draftLessonReport(
    context: AiRequestContext,
    lessonData: Record<string, unknown>,
  ): Promise<AiSuggestionResult<string>>;
}

// ============================================================
// Policy & Task Governance Ports
// ============================================================

/**
 * 3. AiPolicyGuard
 * Enforces that AI cannot perform auto-approval, auto-rejection,
 * or modification of business data.
 *
 * This is a compile-time and runtime guardrail.
 */
export interface AiPolicyGuard {
  /**
   * Checks whether an AI-suggested action is permissible.
   * Auto-approval, auto-rejection, and auto-modification are NEVER permissible.
   */
  isActionPermissible(
    actionType: 'SUGGEST' | 'SUMMARIZE' | 'DRAFT' | 'AUTO_APPROVE' | 'AUTO_REJECT' | 'AUTO_MODIFY',
  ): boolean;
}

/** Definition of an approved AI task */
export interface AiTaskDefinition {
  taskType: string;
  name: string;
  allowedScopes: string[];
  requiredCapability: string;
  maxTokens: number;
}

/**
 * 4. AiTaskCatalog
 * Registry of approved AI task types and metadata.
 */
export interface AiTaskCatalog {
  getTaskDefinition(taskType: string): Promise<AiTaskDefinition | null>;
  listApprovedTasks(): Promise<AiTaskDefinition[]>;
}

/**
 * 5. PromptTemplateRegistry
 * Registry for versioned prompt templates.
 */
export interface PromptTemplateRegistry {
  getTemplate(taskType: string, version?: string): Promise<string | null>;
}

// ============================================================
// Quota & Cost Control Ports
// ============================================================

/**
 * 6. AiQuotaGuard
 * Enforces per-user / per-department quota limits.
 */
export interface AiQuotaGuard {
  checkQuota(userId: string, taskType: string): Promise<{ isAllowed: boolean; remaining: number }>;
}

/**
 * 7. AiBudgetGuard
 * Enforces monthly/term budget limits.
 */
export interface AiBudgetGuard {
  checkBudget(departmentId?: string): Promise<{ isAllowed: boolean; remainingBudget: number }>;
}

/** Usage event data for metering */
export interface AiUsageEvent {
  userId: string;
  taskType: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  estimatedCost: number;
  timestamp: string;
}

/**
 * 8. AiUsageMeter
 * Meters input/output token usage per call.
 */
export interface AiUsageMeter {
  recordUsage(event: AiUsageEvent): Promise<void>;
}

/**
 * 9. AiCostLedger
 * Ledger recording financial cost of AI requests.
 */
export interface AiCostLedger {
  getMonthlyCost(yearMonth: string): Promise<number>;
}

// ============================================================
// Passive & Trigger Delivery Ports
// ============================================================

/** Event that triggers passive AI evaluation */
export interface AiPassiveTriggerEvent {
  eventType: string;
  entityId: string;
  userId: string;
  payload: Record<string, unknown>;
}

/**
 * 10. AiPassiveTriggerPort
 * Trigger port for passive AI processing upon domain events.
 */
export interface AiPassiveTriggerPort {
  onDomainEvent(event: AiPassiveTriggerEvent): Promise<void>;
}

/**
 * 11. AiSuggestionDeliveryPort
 * Port for delivering passive suggestions to users.
 */
export interface AiSuggestionDeliveryPort {
  deliverSuggestion(userId: string, suggestion: AiSuggestionResult): Promise<void>;
}

// ============================================================
// Execution & Provider Adapters Ports
// ============================================================

/** Request payload sent to LLM provider */
export interface AiProviderRequest {
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

/** Raw output from LLM provider */
export interface AiProviderResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

/**
 * 12. AiProviderAdapter
 * Low-level adapter connecting to LLM providers.
 * Must NEVER be invoked directly when AI_ENABLED=false.
 */
export interface AiProviderAdapter {
  complete(request: AiProviderRequest): Promise<AiProviderResponse>;
}

/**
 * 13. AiOutputValidator
 * Validates output structure and ensures no unsafe content or forbidden actions.
 */
export interface AiOutputValidator {
  validateOutput<T>(rawOutput: string, schemaName?: string): { isValid: boolean; parsed?: T; error?: string };
}

/** Stored AI suggestion entity */
export interface AiSuggestionRecord {
  id: string;
  userId: string;
  taskType: string;
  suggestion: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EDITED';
  createdAt: string;
}

/**
 * 14. AiSuggestionStore
 * Store for persisting AI suggestions for user review.
 */
export interface AiSuggestionStore {
  save(record: Omit<AiSuggestionRecord, 'id' | 'createdAt'>): Promise<AiSuggestionRecord>;
  getById(id: string): Promise<AiSuggestionRecord | null>;
}

/**
 * 15. AiAuditService
 * Immutable audit logger for AI requests and decisions.
 */
export interface AiAuditLogEntry {
  requestId: string;
  userId: string;
  actionType: string;
  taskType: string;
  success: boolean;
  timestamp: string;
}

export interface AiAuditService {
  log(entry: AiAuditLogEntry): Promise<void>;
}

/**
 * 16. AiResultCache
 * Cache for idempotent AI query results.
 */
export interface AiResultCache {
  get<T>(cacheKey: string): Promise<T | null>;
  set<T>(cacheKey: string, value: T, ttlSeconds?: number): Promise<void>;
}

// ============================================================
// Notification and Push Ports (Foundation)
// ============================================================

/** A notification payload to be published */
export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  deepLink?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}

/**
 * NotificationPublisherPort
 * Port for publishing in-app notifications.
 * Implemented in Phase 03+.
 */
export interface NotificationPublisherPort {
  publish(payload: NotificationPayload): Promise<void>;
  publishBulk(payloads: NotificationPayload[]): Promise<void>;
}

/** A push subscription for a single device */
export interface PushSubscription {
  deviceId: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * PushGatewayPort
 * Port for sending Web Push notifications.
 * Push failures must NOT cause in-app notification loss.
 * Implemented in Phase 03+.
 */
export interface PushGatewayPort {
  send(subscription: PushSubscription, payload: NotificationPayload): Promise<{ success: boolean; error?: string }>;
}
