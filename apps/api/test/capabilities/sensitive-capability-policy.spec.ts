import {
  inspectSensitiveCapabilityPolicy,
  SENSITIVE_CAPABILITY_KEYS,
  SensitivePolicyCandidateInput,
} from '../../src/capabilities/sensitive-capability-policy';

const valid: SensitivePolicyCandidateInput = {
  actorUserId: '11111111-1111-4111-8111-111111111111',
  targetUserId: '22222222-2222-4222-8222-222222222222',
  actorResponsibility: 'TECHNICAL_ACCOUNT_ADMIN',
  targetResponsibility: 'PRINCIPAL',
  sourceResponsibility: 'PRINCIPAL',
  sourceKind: 'ROLE_TEMPLATE',
  capabilityKey: 'APPROVAL_PRINCIPAL',
  scopeType: 'SCHOOL_WIDE',
  scopeResourceId: null,
  command: 'APPOINT_SOURCE',
};

const inspect = (patch: Partial<SensitivePolicyCandidateInput> = {}) =>
  inspectSensitiveCapabilityPolicy({ ...valid, ...patch });

describe('P5-057 / WS1 sensitive policy: inert, PO-approved source matrix', () => {
  it('tracks exactly nine unique sensitive capabilities', () => {
    expect(SENSITIVE_CAPABILITY_KEYS).toHaveLength(9);
    expect(new Set(SENSITIVE_CAPABILITY_KEYS).size).toBe(9);
  });

  it('permits an Admin-recorded Principal source as an untrusted candidate, with no hardcoded target', () => {
    for (const targetUserId of ['22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555']) {
      const result = inspect({ targetUserId });
      expect(result).toEqual({
        verdict: 'CANDIDATE_ONLY',
        reason: 'POLICY_CANDIDATE_ONLY',
        canConfirm: false,
        provenanceVerified: false,
        writerEnabled: false,
        requiresServerAuthorityProof: true,
      });
    }
  });

  it('permits the confirmed Admin → PHT appointment, without giving PHT generic grant', () => {
    expect(inspect({
      targetResponsibility: 'VICE_PRINCIPAL_ACADEMIC',
      sourceResponsibility: 'VICE_PRINCIPAL_ACADEMIC',
      capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
    }).verdict).toBe('CANDIDATE_ONLY');
    expect(inspect({
      targetResponsibility: 'VICE_PRINCIPAL_ACADEMIC',
      sourceResponsibility: 'VICE_PRINCIPAL_ACADEMIC',
      capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
      actorResponsibility: 'VICE_PRINCIPAL_ACADEMIC',
    }).verdict).toBe('BLOCKED');
  });

  it('derives Principal AUDIT_VIEW only from its independent Principal role source', () => {
    expect(inspect({ capabilityKey: 'AUDIT_VIEW' }).verdict).toBe('CANDIDATE_ONLY');
    expect(inspect({
      capabilityKey: 'AUDIT_VIEW',
      targetResponsibility: 'TECHNICAL_ACCOUNT_ADMIN',
      sourceResponsibility: 'TECHNICAL_ACCOUNT_ADMIN',
    }).reason).toBe('UNAPPROVED_TECHNICAL_SOURCE_CHANGE');
    expect(inspect({
      capabilityKey: 'AUDIT_VIEW',
      sourceResponsibility: 'VICE_PRINCIPAL_ACADEMIC',
    }).reason).toBe('WRONG_ISSUER_OR_SOURCE');
  });

  it('restricts new additional-duty catalog source to Vice Principal role', () => {
    expect(inspect({
      capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE',
      targetResponsibility: 'VICE_PRINCIPAL_ACADEMIC',
      sourceResponsibility: 'VICE_PRINCIPAL_ACADEMIC',
    }).verdict).toBe('CANDIDATE_ONLY');
    expect(inspect({
      capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE',
      targetResponsibility: 'TECHNICAL_ACCOUNT_ADMIN',
      sourceResponsibility: 'TECHNICAL_ACCOUNT_ADMIN',
    }).verdict).toBe('BLOCKED');
  });

  it.each(SENSITIVE_CAPABILITY_KEYS)('blocks generic create/revoke on %s', (capabilityKey) => {
    expect(inspect({ capabilityKey, command: 'GENERIC_GRANT' }).reason).toBe('GENERIC_WRITER_BLOCKED');
    expect(inspect({ capabilityKey, command: 'GENERIC_REVOKE' }).reason).toBe('GENERIC_WRITER_BLOCKED');
  });

  it.each(SENSITIVE_CAPABILITY_KEYS.filter((key) => key.startsWith('AI_')))(
    'blocks new %s until Phase 11 even through role source', (capabilityKey) => {
      expect(inspect({ capabilityKey }).reason).toBe('AI_PHASE_11_NOT_ACTIVE');
    },
  );

  it('forbids self-assignment and missing accounts', () => {
    expect(inspect({ targetUserId: valid.actorUserId }).reason).toBe('SELF_ASSIGNMENT');
    expect(inspect({ actorUserId: '' }).reason).toBe('INVALID_TARGET_OR_ACTOR');
    expect(inspect({ targetUserId: '   ' }).reason).toBe('INVALID_TARGET_OR_ACTOR');
  });

  it('forbids cross-scope grants and resource-encoded school wide scopes', () => {
    expect(inspect({ scopeType: 'SUBJECT_GROUP' }).reason).toBe('SCOPE_NOT_ALLOWED');
    expect(inspect({ scopeResourceId: 'some-uuid' }).reason).toBe('SCOPE_NOT_ALLOWED');
  });

  it('blocks legacy and direct sources even if an Admin has a role', () => {
    for (const sourceKind of ['LEGACY_UNCLASSIFIED', 'TECHNICAL_DIRECT', 'ACADEMIC_DIRECT', 'unknown']) {
      expect(inspect({ sourceKind }).reason).toBe('UNTRUSTED_OR_LEGACY_SOURCE');
    }
  });

  it('requires an exact source for dismissal, never infers from template label', () => {
    expect(inspect({ command: 'REMOVE_SOURCE' }).reason).toBe('MISSING_EXACT_SOURCE_FOR_REMOVAL');
    expect(inspect({ command: 'REMOVE_SOURCE', exactSourceId: '33333333-3333-4333-8333-333333333333' }).verdict)
      .toBe('CANDIDATE_ONLY');
    expect(inspect({
      command: 'REMOVE_SOURCE',
      exactSourceId: '44444444-4444-4444-8444-444444444444',
      capabilityKey: 'AUDIT_VIEW',
      targetResponsibility: 'TECHNICAL_ACCOUNT_ADMIN',
      sourceResponsibility: 'TECHNICAL_ACCOUNT_ADMIN',
    }).reason).toBe('UNAPPROVED_TECHNICAL_SOURCE_CHANGE');
  });

  it('requires correct issuer and role evidence, never infers from title or target UUID', () => {
    expect(inspect({ actorResponsibility: 'PRINCIPAL' }).reason).toBe('WRONG_ISSUER_OR_SOURCE');
    expect(inspect({ targetResponsibility: 'SUBJECT_LEADER' }).reason).toBe('WRONG_ISSUER_OR_SOURCE');
    expect(inspect({ sourceResponsibility: 'VICE_PRINCIPAL_ACADEMIC' }).reason)
      .toBe('WRONG_ISSUER_OR_SOURCE');
  });

  it('fails closed on malformed IDs, invalid commands and invalid source IDs', () => {
    expect(inspect({ actorUserId: 'not-a-uuid' }).reason).toBe('INVALID_TARGET_OR_ACTOR');
    expect(inspect({ command: 'DELETE_EVERYTHING' as SensitivePolicyCandidateInput['command'] }).reason)
      .toBe('INVALID_COMMAND');
    expect(inspect({ command: 'REMOVE_SOURCE', exactSourceId: 'not-a-uuid' }).reason)
      .toBe('INVALID_SOURCE_ID');
  });

  it('rejects unknown capabilities and never returns real authorization', () => {
    expect(inspect({ capabilityKey: 'TEACHER_BASE' }).reason).toBe('UNKNOWN_CAPABILITY');
    const inputVariants: Partial<SensitivePolicyCandidateInput>[] = [
      {}, { command: 'GENERIC_GRANT' }, { sourceKind: 'LEGACY_UNCLASSIFIED' },
      { capabilityKey: 'AI_DISABLE_SYSTEM' }, { actorResponsibility: 'PRINCIPAL' },
    ];
    for (const input of inputVariants) {
      const result = inspect(input);
      expect(result.canConfirm).toBe(false);
      expect(result.provenanceVerified).toBe(false);
      expect(result.writerEnabled).toBe(false);
      expect(result.requiresServerAuthorityProof).toBe(true);
    }
  });
});
