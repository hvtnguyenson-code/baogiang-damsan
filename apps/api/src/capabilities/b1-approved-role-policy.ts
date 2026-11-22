/**
 * P5-057 / WS1 — PO-approved G1/G3/G4, 22/11/2026.
 *
 * Defines staged B1 role policy only. This is NOT proof of an actual source,
 * technical issuer, bootstrap approval or authorization to enable the writer.
 * Legacy responsibility templates and existing persisted WS1-B1-v2 snapshots
 * are intentionally unchanged. Technical-source issue/revoke remains separate.
 */
import { ConflictException } from '@nestjs/common';
import type { CapabilityKey, ResponsibilityTemplateGrantSpec } from '@baogiang/contracts';
import { materializeTemplateGrants } from './responsibility-template-catalog';
import { SENSITIVE_CAPABILITY_KEYS } from './sensitive-capability-policy';

export const B1_APPROVED_POLICY_VERSION = 'WS1-B1-G1-G3-G4-20261122' as const;
export type B1PolicyRole = 'PRINCIPAL' | 'VICE_PRINCIPAL_ACADEMIC';

export const B1_SUPPORTED_SEATS_FOR_KEY: Readonly<Record<string, readonly string[]>> = Object.freeze({
  APPROVAL_PRINCIPAL: Object.freeze(['PRINCIPAL']),
  AUDIT_VIEW: Object.freeze(['PRINCIPAL', 'TECHNICAL_ACCOUNT_ADMIN']),
  APPROVAL_VICE_PRINCIPAL: Object.freeze(['VICE_PRINCIPAL_ACADEMIC']),
  ADDITIONAL_DUTY_CATALOG_MANAGE: Object.freeze(['VICE_PRINCIPAL_ACADEMIC', 'TECHNICAL_ACCOUNT_ADMIN']),
});

const sensitiveKeys: readonly CapabilityKey[] = [
  'APPROVAL_PRINCIPAL', 'AUDIT_VIEW',
  'APPROVAL_VICE_PRINCIPAL', 'ADDITIONAL_DUTY_CATALOG_MANAGE',
];

function keysFor(role: B1PolicyRole): readonly CapabilityKey[] {
  return Object.freeze(sensitiveKeys.filter((key) =>
    B1_SUPPORTED_SEATS_FOR_KEY[key].includes(role)));
}

export const B1_APPROVED_ROLE_SOURCE_KEYS: Readonly<Record<B1PolicyRole, readonly CapabilityKey[]>> = Object.freeze({
  PRINCIPAL: keysFor('PRINCIPAL'),
  VICE_PRINCIPAL_ACADEMIC: keysFor('VICE_PRINCIPAL_ACADEMIC'),
});

/** Shared B1-only grant specification; never used by generic template application. */
export function materializeB1RoleGrants(role: B1PolicyRole): ResponsibilityTemplateGrantSpec[] {
  const specs = materializeTemplateGrants({ templateKey: role });
  const approved = B1_APPROVED_ROLE_SOURCE_KEYS[role];
  // Fail closed rather than inheriting a new sensitive or AI key through catalog drift.
  if (specs.some((spec) =>
    SENSITIVE_CAPABILITY_KEYS.some((key) => key === spec.capabilityKey)
    && (!approved.includes(spec.capabilityKey)
      || spec.scopeType !== 'SCHOOL_WIDE' || spec.scopeResourceId !== null))) {
    throw new ConflictException('B1_APPROVED_ROLE_POLICY_DRIFT');
  }
  // G4 adds a B1 role source, not a grant to the released legacy PHT template.
  // The same complete specification is consumed by the writer and preview.
  for (const key of approved) {
    if (!specs.some((spec) => spec.capabilityKey === key
      && spec.scopeType === 'SCHOOL_WIDE' && spec.scopeResourceId === null)) {
      specs.push({
        capabilityKey: key, scopeType: 'SCHOOL_WIDE', scopeResourceId: null,
        category: 'SOURCE_AUTHORITY',
        description: 'Nguồn chức trách B1 đã được duyệt về nguyên tắc, cần chứng cứ nguồn và phê duyệt kích hoạt.',
      });
    }
  }
  return specs;
}
