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
): BusinessPolicyUiAdapter | undefined {
  return adapters.find(
    (adapter) => adapter.familyKey === familyKey && adapter.validatorVersion === validatorVersion,
  );
}

export interface AdapterMatchResult {
  isEligibleForMutation: boolean;
  adapter?: BusinessPolicyUiAdapter;
  mismatchReason?: string;
}

export function matchUiAdapter(
  adapters: readonly BusinessPolicyUiAdapter[],
  family?: {
    key: string;
    resourceKind: BusinessConfigurationResource['kind'];
    currentValidatorVersion: string;
    publicationEnabled: boolean;
  },
): AdapterMatchResult {
  if (!family) {
    return { isEligibleForMutation: false, mismatchReason: 'Nhóm chính sách không tồn tại.' };
  }
  const adapter = findUiAdapter(adapters, family.key, family.currentValidatorVersion);
  if (!adapter) {
    const anyVersionAdapter = adapters.find((a) => a.familyKey === family.key);
    if (anyVersionAdapter) {
      return {
        isEligibleForMutation: false,
        mismatchReason: 'Giao diện quản trị chưa hỗ trợ phiên bản hợp đồng hiện tại của nhóm chính sách.',
      };
    }
    return {
      isEligibleForMutation: false,
      mismatchReason: 'Nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.',
    };
  }
  if (adapter.resourceKind !== family.resourceKind) {
    return {
      isEligibleForMutation: false,
      mismatchReason: 'Phạm vi tài nguyên của giao diện không khớp với định nghĩa hệ thống.',
    };
  }
  if (family.resourceKind === 'ACADEMIC_YEAR' && !adapter.ResourceEditorComponent) {
    return {
      isEligibleForMutation: false,
      adapter,
      mismatchReason: 'Giao diện quản trị thiếu thành phần chọn tài nguyên năm học bắt buộc.',
    };
  }
  if (!family.publicationEnabled) {
    return {
      isEligibleForMutation: false,
      adapter,
      mismatchReason: 'Nhóm chính sách này hiện đang tạm dừng công bố.',
    };
  }
  return { isEligibleForMutation: true, adapter };
}
