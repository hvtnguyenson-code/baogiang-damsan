/**
 * P5-057 / WS1: PO-approved sensitive capability source rules.
 *
 * This is a pure, INERT preflight for future source-aware B1 commands.
 * Not registered as a NestJS provider, not exposed by HTTP or called by a
 * grant writer. A candidate is NOT authorization: caller assertions about
 * role/seat/source are untrusted until checked inside a DB transaction.
 * This function MUST NOT be wired into production as a writer gate without
 * server-owned issuer-seat and source-history verification.
 */
export const SENSITIVE_CAPABILITY_KEYS = [
  'APPROVAL_PRINCIPAL',
  'APPROVAL_VICE_PRINCIPAL',
  'AUDIT_VIEW',
  'ADDITIONAL_DUTY_CATALOG_MANAGE',
  'AI_CONFIGURE_POLICY',
  'AI_VIEW_USAGE',
  'AI_VIEW_COST',
  'AI_VIEW_AUDIT',
  'AI_DISABLE_SYSTEM',
] as const;

export type SensitiveCapabilityKey = typeof SENSITIVE_CAPABILITY_KEYS[number];
export type ResponsibilitySource = 'PRINCIPAL' | 'VICE_PRINCIPAL_ACADEMIC' | 'TECHNICAL_ACCOUNT_ADMIN';
export type SensitiveCommand = 'APPOINT_SOURCE' | 'REMOVE_SOURCE' | 'GENERIC_GRANT' | 'GENERIC_REVOKE';
export type SensitivePolicyReason =
  | 'POLICY_CANDIDATE_ONLY'
  | 'UNKNOWN_CAPABILITY'
  | 'INVALID_COMMAND'
  | 'INVALID_SOURCE_ID'
  | 'INVALID_TARGET_OR_ACTOR'
  | 'SELF_ASSIGNMENT'
  | 'SCOPE_NOT_ALLOWED'
  | 'GENERIC_WRITER_BLOCKED'
  | 'AI_PHASE_11_NOT_ACTIVE'
  | 'UNTRUSTED_OR_LEGACY_SOURCE'
  | 'UNAPPROVED_TECHNICAL_SOURCE_CHANGE'
  | 'WRONG_ISSUER_OR_SOURCE'
  | 'MISSING_EXACT_SOURCE_FOR_REMOVAL';

export interface SensitivePolicyCandidateInput {
  // Must eventually come from server DB/session, NEVER request body or role label.
  actorUserId: string;
  targetUserId: string;
  actorResponsibility: string;
  targetResponsibility: string;
  sourceResponsibility: string | null;
  sourceKind: string;
  capabilityKey: string;
  scopeType: string;
  scopeResourceId: string | null;
  command: SensitiveCommand;
  exactSourceId?: string | null;
}

export interface SensitivePolicyCandidateResult {
  verdict: 'CANDIDATE_ONLY' | 'BLOCKED';
  reason: SensitivePolicyReason;
  canConfirm: false;
  provenanceVerified: false;
  writerEnabled: false;
  requiresServerAuthorityProof: true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AI_GOVERNANCE_KEYS = new Set<string>(SENSITIVE_CAPABILITY_KEYS.filter((key) => key.startsWith('AI_')));

const blocked = (reason: SensitivePolicyReason): SensitivePolicyCandidateResult => ({
  verdict: 'BLOCKED',
  reason,
  canConfirm: false,
  provenanceVerified: false,
  writerEnabled: false,
  requiresServerAuthorityProof: true,
});

const candidate = (): SensitivePolicyCandidateResult => ({
  verdict: 'CANDIDATE_ONLY',
  reason: 'POLICY_CANDIDATE_ONLY',
  canConfirm: false,
  provenanceVerified: false,
  writerEnabled: false,
  requiresServerAuthorityProof: true,
});

/**
 * Pure decision matrix ONLY; no writes, no capability evaluation, no PG access.
 * A real B1 writer must re-read actor and target seats, source provenance and
 * policy version in one serializable/CAS transaction before any mutation.
 */
export function inspectSensitiveCapabilityPolicy(input: SensitivePolicyCandidateInput): SensitivePolicyCandidateResult {
  if (!SENSITIVE_CAPABILITY_KEYS.some((key) => key === input.capabilityKey)) {
    return blocked('UNKNOWN_CAPABILITY');
  }
  if (!UUID_RE.test(input.actorUserId || '') || !UUID_RE.test(input.targetUserId || '')) {
    return blocked('INVALID_TARGET_OR_ACTOR');
  }
  if (input.actorUserId === input.targetUserId) {
    return blocked('SELF_ASSIGNMENT');
  }
  if (input.scopeType !== 'SCHOOL_WIDE' || input.scopeResourceId !== null) {
    return blocked('SCOPE_NOT_ALLOWED');
  }
  if (!['APPOINT_SOURCE', 'REMOVE_SOURCE', 'GENERIC_GRANT', 'GENERIC_REVOKE'].includes(input.command)) {
    return blocked('INVALID_COMMAND');
  }
  if (input.command === 'GENERIC_GRANT' || input.command === 'GENERIC_REVOKE') {
    return blocked('GENERIC_WRITER_BLOCKED');
  }
  if (AI_GOVERNANCE_KEYS.has(input.capabilityKey)) {
    return blocked('AI_PHASE_11_NOT_ACTIVE');
  }
  if (input.sourceKind !== 'ROLE_TEMPLATE') {
    // Includes unknown / legacy / technical direct sources; no inferred revoke.
    return blocked('UNTRUSTED_OR_LEGACY_SOURCE');
  }
  if (input.command === 'REMOVE_SOURCE') {
    if (!input.exactSourceId?.trim()) return blocked('MISSING_EXACT_SOURCE_FOR_REMOVAL');
    if (!UUID_RE.test(input.exactSourceId)) return blocked('INVALID_SOURCE_ID');
  }
  if (input.capabilityKey === 'AUDIT_VIEW' &&
      input.sourceResponsibility === 'TECHNICAL_ACCOUNT_ADMIN') {
    // Preserve the active technical/legacy source until explicit reconciliation,
    // but do not create/withdraw it using this not-yet-authorized writer.
    return blocked('UNAPPROVED_TECHNICAL_SOURCE_CHANGE');
  }

  const admin = input.actorResponsibility === 'TECHNICAL_ACCOUNT_ADMIN';
  const principal = input.sourceResponsibility === 'PRINCIPAL' &&
    input.targetResponsibility === 'PRINCIPAL';
  const vice = input.sourceResponsibility === 'VICE_PRINCIPAL_ACADEMIC' &&
    input.targetResponsibility === 'VICE_PRINCIPAL_ACADEMIC';
  const allowed =
    input.capabilityKey === 'APPROVAL_PRINCIPAL' ? admin && principal :
    input.capabilityKey === 'APPROVAL_VICE_PRINCIPAL' ? admin && vice :
    input.capabilityKey === 'AUDIT_VIEW' ? admin && principal :
    input.capabilityKey === 'ADDITIONAL_DUTY_CATALOG_MANAGE' ? admin && vice :
    false;

  return allowed ? candidate() : blocked('WRONG_ISSUER_OR_SOURCE');
}
