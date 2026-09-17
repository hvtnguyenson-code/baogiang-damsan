import type {
  BusinessConfigurationResource,
  BusinessPolicyAcademicYearOption,
} from '@baogiang/contracts';
import {
  createElement,
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type ComponentType,
} from 'react';
import { Button } from '../components/ui/button';
import { InlineAlert } from '../components/ui/feedback';
import { FormField } from '../components/ui/form-field';
import { SelectField } from '../components/ui/management';
import {
  businessConfigurationApi,
  isValidCivilDate,
  normalizeCivilDate,
  translatePolicyError,
} from './business-configuration-api';

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

export interface OperationalStartPayload extends Record<string, unknown> {
  operationalStartDate: string;
}

export function initialOperationalStartPayload(): OperationalStartPayload {
  return {
    operationalStartDate: '',
  };
}

export function validateOperationalStartPayload(
  value: unknown,
): { valid: true; payload: OperationalStartPayload } | { valid: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      valid: false,
      error: 'Dữ liệu chính sách bắt đầu vận hành phải là đối tượng hợp lệ.',
    };
  }

  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== 'operationalStartDate') {
    return {
      valid: false,
      error: 'Dữ liệu chính sách chỉ được phép chứa duy nhất trường ngày bắt đầu vận hành (operationalStartDate).',
    };
  }

  const dateVal = (value as Record<string, unknown>).operationalStartDate;
  if (typeof dateVal !== 'string' || !isValidCivilDate(dateVal)) {
    return {
      valid: false,
      error: 'Ngày bắt đầu vận hành phải là ngày dân sự hợp lệ theo định dạng YYYY-MM-DD.',
    };
  }

  return {
    valid: true,
    payload: {
      operationalStartDate: dateVal,
    },
  };
}

export function OperationalStartEditor({
  value,
  onChange,
  disabled,
}: BusinessPolicyEditorProps<Record<string, unknown>>) {
  const typedValue = (value ?? {}) as Partial<OperationalStartPayload>;

  return createElement(
    'div',
    { className: 'operational-start-editor' },
    createElement(FormField, {
      id: 'operational-start-date',
      label: 'Ngày bắt đầu vận hành',
      type: 'text',
      placeholder: 'YYYY-MM-DD',
      hint: 'Định dạng chuẩn YYYY-MM-DD (ví dụ: 2026-09-05).',
      value: typedValue.operationalStartDate ?? '',
      disabled,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        onChange({
          ...value,
          operationalStartDate: e.target.value.trim(),
        });
      },
      required: true,
    }),
  );
}

export function OperationalStartSummary({
  payload,
}: BusinessPolicySummaryProps<Record<string, unknown>>) {
  const typedPayload = (payload ?? {}) as Partial<OperationalStartPayload>;
  const dateStr = typedPayload.operationalStartDate;
  const normalized = normalizeCivilDate(dateStr);

  return createElement(
    'div',
    { className: 'operational-start-summary' },
    createElement(
      'p',
      { style: { margin: 0, fontSize: '0.92rem' } },
      createElement('span', { className: 'muted-copy' }, 'Ngày bắt đầu vận hành: '),
      createElement('strong', null, normalized ?? dateStr ?? '—'),
    ),
  );
}

export function OperationalStartResourceEditor({
  resource,
  onChange,
  disabled,
}: BusinessPolicyResourceEditorProps) {
  const [options, setOptions] = useState<BusinessPolicyAcademicYearOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAllOptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let page = 1;
      const pageSize = 100;
      let allItems: BusinessPolicyAcademicYearOption[] = [];
      let total = 0;

      let hasMore = true;
      do {
        const res = await businessConfigurationApi.getAcademicYearOptions(page, pageSize);
        allItems = allItems.concat(res.items);
        total = res.total;
        page += 1;
        hasMore = allItems.length < total && res.items.length > 0;
      } while (hasMore);

      setOptions(allItems);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(translatePolicyError(msg) || 'Không thể tải danh sách năm học.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAllOptions();
  }, [loadAllOptions]);

  const selectedAcademicYearId =
    resource?.kind === 'ACADEMIC_YEAR' ? (resource.academicYearId ?? '') : '';

  if (isLoading) {
    return createElement(
      'div',
      {
        className: 'academic-year-picker-loading',
        style: { padding: '8px 0', fontSize: '0.9rem', color: '#49616f' },
      },
      'Đang tải danh sách năm học...',
    );
  }

  if (error) {
    return createElement(
      'div',
      {
        className: 'academic-year-picker-error',
        style: { display: 'flex', flexDirection: 'column', gap: '8px' },
      },
      createElement(
        InlineAlert,
        {
          title: 'Lỗi tải danh sách năm học',
          tone: 'error',
          children: createElement(
            'div',
            null,
            createElement('p', null, error),
            createElement(
              Button,
              {
                type: 'button',
                variant: 'secondary',
                onClick: () => void loadAllOptions(),
                disabled,
                children: 'Thử lại',
              },
            ),
          ),
        },
      ),
    );
  }

  if (options.length === 0) {
    return createElement(
      'div',
      { className: 'academic-year-picker-empty' },
      createElement(
        'p',
        {
          className: 'muted-copy',
          style: { fontStyle: 'italic', fontSize: '0.9rem' },
        },
        'Chưa có năm học nào trong hệ thống.',
      ),
    );
  }

  return createElement(
    'div',
    { className: 'academic-year-picker' },
    createElement(
      SelectField,
      {
        id: 'operational-start-academic-year-select',
        label: 'Năm học áp dụng',
        hint: 'Chọn năm học để xác lập thẩm quyền bắt đầu vận hành',
        disabled,
        value: selectedAcademicYearId,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => {
          onChange({
            kind: 'ACADEMIC_YEAR',
            academicYearId: e.target.value,
          });
        },
        required: true,
        children: [
          createElement('option', { key: 'empty', value: '' }, '-- Chọn năm học --'),
          ...options.map((opt) =>
            createElement(
              'option',
              { key: opt.id, value: opt.id },
              `${opt.code} — ${opt.name}`,
            ),
          ),
        ],
      },
    ),
  );
}

export const OPERATIONAL_START_UI_ADAPTER: BusinessPolicyUiAdapter<OperationalStartPayload> = {
  familyKey: 'OPERATIONAL_START',
  validatorVersion: 'v1',
  displayName: 'Bắt đầu vận hành',
  description:
    'Xác định ngày dân sự bắt đầu thẩm quyền vận hành bình thường cho năm học được chọn.',
  resourceKind: 'ACADEMIC_YEAR',
  initialPayload: initialOperationalStartPayload,
  validatePayload: validateOperationalStartPayload,
  EditorComponent: OperationalStartEditor,
  SummaryComponent: OperationalStartSummary,
  ResourceEditorComponent: OperationalStartResourceEditor,
};

/**
 * Production UI adapter registry contains exclusively OPERATIONAL_START in P1-032.
 */
export const PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS: readonly BusinessPolicyUiAdapter[] = [
  OPERATIONAL_START_UI_ADAPTER as unknown as BusinessPolicyUiAdapter,
];

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
