import type {
  BusinessConfigurationResource,
  BusinessPolicyAcademicYearOption,
  WorkloadAdjustmentAdditionalDutyOption,
  WorkloadAdjustmentCalculationType,
  WorkloadAdjustmentRuleV1,
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

export interface WorkloadAdjustmentPayload extends Record<string, unknown> {
  baseWeeklyNorm: number;
  rules: WorkloadAdjustmentRuleV1[];
}

export function initialWorkloadAdjustmentPayload(): WorkloadAdjustmentPayload {
  return {
    baseWeeklyNorm: 17,
    rules: [],
  };
}

export function validateWorkloadAdjustmentPayload(
  value: unknown,
): { valid: true; payload: WorkloadAdjustmentPayload } | { valid: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'Dữ liệu chính sách điều chỉnh định mức phải là đối tượng hợp lệ.' };
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  for (const k of keys) {
    if (k !== 'baseWeeklyNorm' && k !== 'rules') {
      return { valid: false, error: `Phát hiện trường không hợp lệ trong dữ liệu chính sách: ${k}.` };
    }
  }
  if (typeof obj.baseWeeklyNorm !== 'number' || !Number.isFinite(obj.baseWeeklyNorm) || obj.baseWeeklyNorm < 0) {
    return { valid: false, error: 'Định mức tuần cơ bản (baseWeeklyNorm) phải là số không âm.' };
  }
  const normStr = String(obj.baseWeeklyNorm);
  if (normStr.includes('.') && normStr.split('.')[1].length > 4) {
    return { valid: false, error: 'Định mức tuần cơ bản không được vượt quá 4 chữ số thập phân.' };
  }
  if (!Array.isArray(obj.rules)) {
    return { valid: false, error: 'Danh sách quy tắc (rules) phải là một danh sách hợp lệ.' };
  }
  const seenRuleIds = new Set<string>();
  const seenPriorities = new Set<number>();
  for (let i = 0; i < obj.rules.length; i++) {
    const r = obj.rules[i];
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      return { valid: false, error: `Quy tắc thứ ${i + 1} không phải là đối tượng hợp lệ.` };
    }
    const rKeys = Object.keys(r);
    for (const rk of rKeys) {
      if (!['ruleId', 'source', 'calculation', 'value', 'priority'].includes(rk)) {
        return { valid: false, error: `Quy tắc thứ ${i + 1} chứa trường không hợp lệ: ${rk}.` };
      }
    }
    if (typeof r.ruleId !== 'string' || !r.ruleId.trim()) {
      return { valid: false, error: `Quy tắc thứ ${i + 1} thiếu mã quy tắc (ruleId).` };
    }
    if (seenRuleIds.has(r.ruleId.trim())) {
      return { valid: false, error: `Mã quy tắc "${r.ruleId}" bị trùng lặp.` };
    }
    seenRuleIds.add(r.ruleId.trim());

    if (typeof r.priority !== 'number' || !Number.isFinite(r.priority) || r.priority < 0) {
      return { valid: false, error: `Thứ tự ưu tiên của quy tắc thứ ${i + 1} phải là số không âm.` };
    }
    if (seenPriorities.has(r.priority)) {
      return { valid: false, error: `Thứ tự ưu tiên "${r.priority}" bị trùng lặp.` };
    }
    seenPriorities.add(r.priority);

    if (!['TRU_TIET', 'TRU_PHAN_TRAM', 'GHI_DE'].includes(r.calculation)) {
      return { valid: false, error: `Hình thức điều chỉnh của quy tắc thứ ${i + 1} không hợp lệ.` };
    }

    if (typeof r.value !== 'number' || !Number.isFinite(r.value) || r.value < 0) {
      return { valid: false, error: `Giá trị điều chỉnh của quy tắc thứ ${i + 1} phải là số không âm.` };
    }
    const valStr = String(r.value);
    if (valStr.includes('.') && valStr.split('.')[1].length > 4) {
      return { valid: false, error: `Giá trị điều chỉnh của quy tắc thứ ${i + 1} không được vượt quá 4 chữ số thập phân.` };
    }
    if (r.calculation === 'TRU_PHAN_TRAM' && r.value > 100) {
      return { valid: false, error: `Tỷ lệ phần trăm giảm của quy tắc thứ ${i + 1} không được vượt quá 100%.` };
    }

    if (!r.source || typeof r.source !== 'object' || Array.isArray(r.source)) {
      return { valid: false, error: `Nguồn áp dụng của quy tắc thứ ${i + 1} không hợp lệ.` };
    }
    const s = r.source as Record<string, unknown>;
    if (s.kind === 'HOMEROOM_RESPONSIBILITY') {
      const sKeys = Object.keys(s);
      if (sKeys.length !== 1 || sKeys[0] !== 'kind') {
        return { valid: false, error: 'Nguồn giáo viên chủ nhiệm không được chứa trường mở rộng.' };
      }
    } else if (s.kind === 'ADDITIONAL_DUTY') {
      if (typeof s.dutyDefinitionId !== 'string' || !s.dutyDefinitionId.trim()) {
        return { valid: false, error: `Quy tắc thứ ${i + 1} thiếu thông tin nhiệm vụ kiêm nhiệm (dutyDefinitionId).` };
      }
      const sKeys = Object.keys(s);
      if (sKeys.length !== 2 || !sKeys.includes('kind') || !sKeys.includes('dutyDefinitionId')) {
        return { valid: false, error: 'Nguồn nhiệm vụ kiêm nhiệm chứa trường không hợp lệ.' };
      }
    } else {
      return { valid: false, error: `Nguồn áp dụng của quy tắc thứ ${i + 1} không hợp lệ.` };
    }
  }

  return {
    valid: true,
    payload: {
      baseWeeklyNorm: obj.baseWeeklyNorm as number,
      rules: obj.rules as WorkloadAdjustmentRuleV1[],
    },
  };
}

export function WorkloadAdjustmentEditor({
  value,
  onChange,
  disabled,
}: BusinessPolicyEditorProps<Record<string, unknown>>) {
  const typedValue = (value ?? {}) as Partial<WorkloadAdjustmentPayload>;
  const baseWeeklyNorm = typedValue.baseWeeklyNorm ?? 17;
  const rules = (typedValue.rules ?? []) as WorkloadAdjustmentRuleV1[];

  const [dutyOptions, setDutyOptions] = useState<WorkloadAdjustmentAdditionalDutyOption[]>([]);
  const [loadingDuties, setLoadingDuties] = useState(false);
  const [dutyError, setDutyError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingDuties(true);
    businessConfigurationApi.getWorkloadAdjustmentAdditionalDuties()
      .then((res) => {
        if (active) {
          setDutyOptions(res.items);
          setDutyError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setDutyError(err instanceof Error ? err.message : 'Không thể tải danh mục nhiệm vụ kiêm nhiệm.');
        }
      })
      .finally(() => {
        if (active) setLoadingDuties(false);
      });
    return () => { active = false; };
  }, []);

  const handleBaseNormChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onChange({
      ...value,
      baseWeeklyNorm: Number.isNaN(val) ? 0 : val,
    });
  };

  const handleAddRule = () => {
    const maxPriority = rules.reduce((max, r) => Math.max(max, r.priority), 0);
    const newRule: WorkloadAdjustmentRuleV1 = {
      ruleId: `rule_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      source: { kind: 'HOMEROOM_RESPONSIBILITY' },
      calculation: 'TRU_TIET',
      value: 0,
      priority: maxPriority + 10,
    };
    onChange({
      ...value,
      rules: [...rules, newRule],
    });
  };

  const handleRemoveRule = (index: number) => {
    const updated = rules.filter((_, idx) => idx !== index);
    onChange({
      ...value,
      rules: updated,
    });
  };

  const handleUpdateRule = (index: number, patch: Partial<WorkloadAdjustmentRuleV1>) => {
    const updated = rules.map((r, idx) => (idx === index ? { ...r, ...patch } : r));
    onChange({
      ...value,
      rules: updated,
    });
  };

  return createElement(
    'div',
    { className: 'workload-adjustment-editor', style: { display: 'flex', flexDirection: 'column', gap: '1.25rem' } },
    createElement(FormField, {
      id: 'workload-base-norm',
      label: 'Định mức cơ bản (tiết/tuần)',
      type: 'number',
      step: '0.0001',
      min: '0',
      hint: 'Định mức số tiết dạy chuẩn mỗi tuần của giáo viên trước khi điều chỉnh (thường là 17 tiết/tuần đối với THPT).',
      value: String(baseWeeklyNorm),
      disabled,
      onChange: handleBaseNormChange,
      required: true,
    }),
    createElement(
      'div',
      { className: 'rules-section', style: { borderTop: '1px solid var(--border-subtle, #e5e7eb)', paddingTop: '1rem' } },
      createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' } },
        createElement(
          'div',
          null,
          createElement('h4', { style: { margin: 0, fontSize: '1rem', fontWeight: 600 } }, 'Quy tắc điều chỉnh định mức'),
          createElement('p', { className: 'muted-copy', style: { margin: '0.25rem 0 0', fontSize: '0.85rem' } }, 'Các quy tắc được áp dụng theo thứ tự ưu tiên tăng dần (số nhỏ áp dụng trước).'),
        ),
        createElement(
          Button,
          {
            type: 'button',
            variant: 'secondary',
            disabled,
            onClick: handleAddRule,
            children: '+ Thêm quy tắc',
          },
        ),
      ),
      dutyError
        ? createElement(InlineAlert, { tone: 'warning', title: 'Lưu ý', children: dutyError })
        : null,
      rules.length === 0
        ? createElement(
            'p',
            { className: 'muted-copy', style: { fontStyle: 'italic', fontSize: '0.9rem', padding: '0.75rem 0' } },
            `Chưa có quy tắc điều chỉnh định mức nào. Giáo viên sẽ áp dụng định mức cơ bản ${baseWeeklyNorm} tiết/tuần.`,
          )
        : createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '1rem' } },
            rules.map((rule, index) => {
              const isHomeroom = rule.source.kind === 'HOMEROOM_RESPONSIBILITY';
              const dutyDefId = !isHomeroom ? (rule.source as { dutyDefinitionId: string }).dutyDefinitionId : '';

              return createElement(
                'div',
                {
                  key: rule.ruleId || String(index),
                  style: {
                    border: '1px solid var(--border-subtle, #e5e7eb)',
                    borderRadius: '6px',
                    padding: '1rem',
                    backgroundColor: 'var(--bg-subtle, #fafafa)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  },
                },
                createElement(
                  'div',
                  { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  createElement('span', { style: { fontWeight: 600, fontSize: '0.9rem' } }, `Quy tắc #${index + 1}`),
                  createElement(
                    Button,
                    {
                      type: 'button',
                      variant: 'quiet',
                      disabled,
                      onClick: () => handleRemoveRule(index),
                      style: { fontSize: '0.8rem', padding: '0.25rem 0.5rem', color: 'var(--color-danger, #dc2626)' },
                      children: 'Xóa quy tắc',
                    },
                  ),
                ),
                createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' } },
                  createElement(
                    SelectField,
                    {
                      id: `rule-source-kind-${index}`,
                      label: 'Nguồn áp dụng',
                      disabled,
                      value: rule.source.kind,
                      onChange: (e: ChangeEvent<HTMLSelectElement>) => {
                        const kind = e.target.value as 'HOMEROOM_RESPONSIBILITY' | 'ADDITIONAL_DUTY';
                        if (kind === 'HOMEROOM_RESPONSIBILITY') {
                          handleUpdateRule(index, { source: { kind: 'HOMEROOM_RESPONSIBILITY' } });
                        } else {
                          const firstDutyId = dutyOptions[0]?.id ?? '';
                          handleUpdateRule(index, { source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: firstDutyId } });
                        }
                      },
                      children: [
                        createElement('option', { key: 'HOMEROOM', value: 'HOMEROOM_RESPONSIBILITY' }, 'Giáo viên chủ nhiệm'),
                        createElement('option', { key: 'DUTY', value: 'ADDITIONAL_DUTY' }, 'Nhiệm vụ kiêm nhiệm'),
                      ],
                    },
                  ),
                  !isHomeroom
                    ? createElement(
                        SelectField,
                        {
                          id: `rule-duty-def-${index}`,
                          label: 'Nhiệm vụ kiêm nhiệm',
                          disabled: disabled || loadingDuties,
                          value: dutyDefId,
                          onChange: (e: ChangeEvent<HTMLSelectElement>) => {
                            handleUpdateRule(index, {
                              source: { kind: 'ADDITIONAL_DUTY', dutyDefinitionId: e.target.value },
                            });
                          },
                          hint: loadingDuties ? 'Đang tải danh mục nhiệm vụ...' : undefined,
                          children: [
                            dutyOptions.length === 0
                              ? createElement('option', { key: 'none', value: '' }, '-- Không có nhiệm vụ kiêm nhiệm --')
                              : dutyOptions.map((opt) =>
                                  createElement(
                                    'option',
                                    { key: opt.id, value: opt.id },
                                    `[${opt.code}] ${opt.name}${!opt.isActive ? ' (Hết hiệu lực)' : ''}`,
                                  ),
                                ),
                          ],
                        },
                      )
                    : null,
                  createElement(
                    SelectField,
                    {
                      id: `rule-calc-${index}`,
                      label: 'Hình thức điều chỉnh',
                      disabled,
                      value: rule.calculation,
                      onChange: (e: ChangeEvent<HTMLSelectElement>) => {
                        handleUpdateRule(index, {
                          calculation: e.target.value as WorkloadAdjustmentCalculationType,
                        });
                      },
                      children: [
                        createElement('option', { key: 'TRU_TIET', value: 'TRU_TIET' }, 'Trừ số tiết (TRU_TIET)'),
                        createElement('option', { key: 'TRU_PHAN_TRAM', value: 'TRU_PHAN_TRAM' }, 'Trừ theo phần trăm (TRU_PHAN_TRAM)'),
                        createElement('option', { key: 'GHI_DE', value: 'GHI_DE' }, 'Ghi đè định mức (GHI_DE)'),
                      ],
                    },
                  ),
                  createElement(FormField, {
                    id: `rule-value-${index}`,
                    label: `Giá trị điều chỉnh (${rule.calculation === 'TRU_PHAN_TRAM' ? '%' : 'tiết'})`,
                    type: 'number',
                    step: '0.0001',
                    min: '0',
                    max: rule.calculation === 'TRU_PHAN_TRAM' ? '100' : undefined,
                    value: String(rule.value),
                    disabled,
                    onChange: (e: ChangeEvent<HTMLInputElement>) => {
                      const val = parseFloat(e.target.value);
                      handleUpdateRule(index, { value: Number.isNaN(val) ? 0 : val });
                    },
                    required: true,
                  }),
                  createElement(FormField, {
                    id: `rule-priority-${index}`,
                    label: 'Thứ tự ưu tiên',
                    type: 'number',
                    step: '1',
                    min: '0',
                    hint: 'Ưu tiên thấp hơn chạy trước (ví dụ 10, 20...)',
                    value: String(rule.priority),
                    disabled,
                    onChange: (e: ChangeEvent<HTMLInputElement>) => {
                      const val = parseInt(e.target.value, 10);
                      handleUpdateRule(index, { priority: Number.isNaN(val) ? 0 : val });
                    },
                    required: true,
                  }),
                ),
              );
            }),
          ),
    ),
  );
}

export function WorkloadAdjustmentSummary({
  payload,
}: BusinessPolicySummaryProps<Record<string, unknown>>) {
  const typed = (payload ?? {}) as Partial<WorkloadAdjustmentPayload>;
  const baseWeeklyNorm = typed.baseWeeklyNorm ?? 0;
  const rules = (typed.rules ?? []) as WorkloadAdjustmentRuleV1[];

  return createElement(
    'div',
    { className: 'workload-adjustment-summary', style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } },
    createElement(
      'p',
      { style: { margin: 0, fontSize: '0.95rem' } },
      createElement('strong', null, 'Định mức cơ bản: '),
      `${baseWeeklyNorm} tiết/tuần`,
    ),
    rules.length > 0
      ? createElement(
          'div',
          null,
          createElement('p', { style: { margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.9rem' } }, `Quy tắc điều chỉnh (${rules.length}):`),
          createElement(
            'ul',
            { style: { margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem' } },
            rules
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((r, i) => {
                const sourceText =
                  r.source.kind === 'HOMEROOM_RESPONSIBILITY'
                    ? 'Giáo viên chủ nhiệm'
                    : `Nhiệm vụ kiêm nhiệm (${r.source.dutyDefinitionId})`;
                const calcText =
                  r.calculation === 'TRU_TIET'
                    ? `Trừ ${r.value} tiết`
                    : r.calculation === 'TRU_PHAN_TRAM'
                      ? `Giảm ${r.value}%`
                      : `Ghi đè thành ${r.value} tiết`;
                return createElement(
                  'li',
                  { key: r.ruleId || String(i), style: { marginBottom: '0.25rem' } },
                  `[Ưu tiên ${r.priority}] ${sourceText} → `,
                  createElement('strong', null, calcText),
                );
              }),
          ),
        )
      : createElement('p', { className: 'muted-copy', style: { margin: 0, fontSize: '0.85rem', fontStyle: 'italic' } }, 'Không có quy tắc điều chỉnh định mức nào.'),
  );
}

export const WORKLOAD_ADJUSTMENT_UI_ADAPTER: BusinessPolicyUiAdapter<WorkloadAdjustmentPayload> = {
  familyKey: 'WORKLOAD_ADJUSTMENT',
  validatorVersion: 'v1',
  displayName: 'Điều chỉnh định mức',
  description:
    'Cấu hình định mức tuần cơ bản và các quy tắc điều chỉnh định mức cho giáo viên (chủ nhiệm, kiêm nhiệm).',
  resourceKind: 'ACADEMIC_YEAR',
  initialPayload: initialWorkloadAdjustmentPayload,
  validatePayload: validateWorkloadAdjustmentPayload,
  EditorComponent: WorkloadAdjustmentEditor,
  SummaryComponent: WorkloadAdjustmentSummary,
  ResourceEditorComponent: OperationalStartResourceEditor,
};

/**
 * Production UI adapter registry contains OPERATIONAL_START and WORKLOAD_ADJUSTMENT.
 */
export const PRODUCTION_BUSINESS_POLICY_UI_ADAPTERS: readonly BusinessPolicyUiAdapter[] = [
  OPERATIONAL_START_UI_ADAPTER as unknown as BusinessPolicyUiAdapter,
  WORKLOAD_ADJUSTMENT_UI_ADAPTER as unknown as BusinessPolicyUiAdapter,
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
