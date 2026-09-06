import type { BusinessConfigurationResource } from '@baogiang/contracts';
import type { ComponentType } from 'react';

export interface BusinessPolicyEditorProps<T = Record<string, unknown>> {
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export interface BusinessPolicySummaryProps<T = Record<string, unknown>> {
  payload: T;
}

export interface BusinessPolicyResourceEditorProps {
  resource: BusinessConfigurationResource;
  onChange: (resource: BusinessConfigurationResource) => void;
  disabled?: boolean;
}

export interface BusinessPolicyUiAdapter<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly familyKey: string;
  readonly validatorVersion: string;
  readonly displayName: string;
  readonly description: string;
  readonly resourceKind: BusinessConfigurationResource['kind'];
  readonly initialPayload: () => T;
  readonly validatePayload: (value: unknown) => { valid: true; payload: T } | { valid: false; error: string };
  readonly EditorComponent: ComponentType<BusinessPolicyEditorProps<Record<string, unknown>>>;
  readonly SummaryComponent: ComponentType<BusinessPolicySummaryProps<Record<string, unknown>>>;
  readonly ResourceEditorComponent?: ComponentType<BusinessPolicyResourceEditorProps>;
}

/**
 * Production UI adapter registry is intentionally empty in P1-022.
 * Family-specific UI adapters will be registered when their owner tasks are approved.
 */
export const PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS: readonly BusinessPolicyUiAdapter[] = [];

export function findUiAdapter(
  adapters: readonly BusinessPolicyUiAdapter[],
  familyKey: string,
  validatorVersion: string,
  resourceKind: BusinessConfigurationResource['kind'],
): BusinessPolicyUiAdapter | undefined {
  return adapters.find(
    (adapter) =>
      adapter.familyKey === familyKey &&
      adapter.validatorVersion === validatorVersion &&
      adapter.resourceKind === resourceKind,
  );
}

export interface AdapterReadMatchResult {
  isEligibleForRead: boolean;
  adapter?: BusinessPolicyUiAdapter;
  mismatchReason?: string;
}

export interface AdapterMutationMatchResult {
  isEligibleForMutation: boolean;
  adapter?: BusinessPolicyUiAdapter;
  mismatchReason?: string;
}

/**
 * Match eligibility for read/resolution purposes.
 * Does NOT gate on publicationEnabled, as historical policies may be resolved even when publication is disabled.
 */
export function matchUiAdapterForRead(
  adapters: readonly BusinessPolicyUiAdapter[],
  family?: {
    key: string;
    resourceKind: BusinessConfigurationResource['kind'];
    currentValidatorVersion: string;
  },
): AdapterReadMatchResult {
  if (!family) {
    return { isEligibleForRead: false, mismatchReason: 'Nhóm chính sách không tồn tại.' };
  }
  const adapter = findUiAdapter(adapters, family.key, family.currentValidatorVersion, family.resourceKind);
  if (!adapter) {
    const wrongKindAdapter = adapters.find(
      (a) => a.familyKey === family.key && a.validatorVersion === family.currentValidatorVersion,
    );
    if (wrongKindAdapter) {
      return {
        isEligibleForRead: false,
        mismatchReason: 'Phạm vi tài nguyên của giao diện không khớp với định nghĩa hệ thống.',
      };
    }
    const anyVersionAdapter = adapters.find((a) => a.familyKey === family.key);
    if (anyVersionAdapter) {
      return {
        isEligibleForRead: false,
        mismatchReason: 'Giao diện quản trị chưa hỗ trợ phiên bản hợp đồng hiện tại của nhóm chính sách.',
      };
    }
    return {
      isEligibleForRead: false,
      mismatchReason: 'Nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.',
    };
  }
  if (family.resourceKind === 'ACADEMIC_YEAR' && !adapter.ResourceEditorComponent) {
    return {
      isEligibleForRead: false,
      adapter,
      mismatchReason: 'Giao diện quản trị thiếu thành phần chọn tài nguyên năm học bắt buộc.',
    };
  }
  return { isEligibleForRead: true, adapter };
}

/**
 * Match eligibility for current-version mutations (create draft, replace, correct).
 * Requires publicationEnabled === true.
 */
export function matchUiAdapterForMutation(
  adapters: readonly BusinessPolicyUiAdapter[],
  family?: {
    key: string;
    resourceKind: BusinessConfigurationResource['kind'];
    currentValidatorVersion: string;
    publicationEnabled: boolean;
  },
): AdapterMutationMatchResult {
  if (!family) {
    return { isEligibleForMutation: false, mismatchReason: 'Nhóm chính sách không tồn tại.' };
  }
  const readMatch = matchUiAdapterForRead(adapters, family);
  if (!readMatch.isEligibleForRead || !readMatch.adapter) {
    return { isEligibleForMutation: false, mismatchReason: readMatch.mismatchReason };
  }
  if (!family.publicationEnabled) {
    return {
      isEligibleForMutation: false,
      adapter: readMatch.adapter,
      mismatchReason: 'Nhóm chính sách này hiện đang tạm dừng công bố.',
    };
  }
  return { isEligibleForMutation: true, adapter: readMatch.adapter };
}

export const matchUiAdapter = matchUiAdapterForMutation;

/**
 * Match eligibility for stored draft mutation (edit draft, publish draft).
 * Requires exact stored validatorVersion, exact resourceKind, and publicationEnabled === true.
 */
export function matchVersionUiAdapterForMutation(
  adapters: readonly BusinessPolicyUiAdapter[],
  family: {
    key: string;
    resourceKind: BusinessConfigurationResource['kind'];
    publicationEnabled: boolean;
  } | undefined,
  storedValidatorVersion: string,
  resourceKind: BusinessConfigurationResource['kind'],
): AdapterMutationMatchResult {
  if (!family) {
    return { isEligibleForMutation: false, mismatchReason: 'Nhóm chính sách không tồn tại.' };
  }
  if (!family.publicationEnabled) {
    return {
      isEligibleForMutation: false,
      mismatchReason: 'Nhóm chính sách hiện đang tạm dừng công bố và không cho phép thao tác quản trị.',
    };
  }
  const adapter = findUiAdapter(adapters, family.key, storedValidatorVersion, resourceKind);
  if (!adapter) {
    const wrongKindAdapter = adapters.find(
      (a) => a.familyKey === family.key && a.validatorVersion === storedValidatorVersion,
    );
    if (wrongKindAdapter) {
      return {
        isEligibleForMutation: false,
        mismatchReason: 'Phạm vi tài nguyên của giao diện không khớp với định nghĩa hệ thống.',
      };
    }
    return {
      isEligibleForMutation: false,
      mismatchReason: `Không thể thao tác vì thiếu giao diện cho phiên bản ${storedValidatorVersion}.`,
    };
  }
  if (resourceKind === 'ACADEMIC_YEAR' && !adapter.ResourceEditorComponent) {
    return {
      isEligibleForMutation: false,
      adapter,
      mismatchReason: 'Giao diện quản trị thiếu thành phần chọn tài nguyên năm học bắt buộc.',
    };
  }
  return { isEligibleForMutation: true, adapter };
}
