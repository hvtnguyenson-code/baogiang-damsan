import {
  ResponsibilityTemplateDefinition,
  ResponsibilityTemplateGrantSpec,
  ResponsibilityTemplateKey,
} from '@baogiang/contracts';

export const TEMPLATE_VERSION = 'v1' as const;

export interface ResolvedTemplateGrants {
  sourceAuthorityGrants: ResponsibilityTemplateGrantSpec[];
  productOperabilityGrants: ResponsibilityTemplateGrantSpec[];
  technicalGrants: ResponsibilityTemplateGrantSpec[];
  allGrants: ResponsibilityTemplateGrantSpec[];
}

export const TEACHER_SOURCE_GRANTS: readonly ResponsibilityTemplateGrantSpec[] = [
  {
    capabilityKey: 'TEACHER_BASE',
    scopeType: 'PERSONAL',
    scopeResourceId: null,
    category: 'SOURCE_AUTHORITY',
    description: 'Nền tảng truy cập chuyên môn cá nhân.',
  },
];

export const TEACHER_OPERABILITY_GRANTS: readonly ResponsibilityTemplateGrantSpec[] = [
  {
    capabilityKey: 'REPORTING_STATEMENT_SUBMIT',
    scopeType: 'PERSONAL',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Nộp báo cáo kê khai cá nhân.',
  },
  {
    capabilityKey: 'REPORTING_STATEMENT_READ',
    scopeType: 'PERSONAL',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Xem báo cáo kê khai đã lưu cá nhân.',
  },
  {
    capabilityKey: 'TEACHING_EXECUTION_RECORD',
    scopeType: 'PERSONAL',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Ghi nhận và hiệu chỉnh bằng chứng thực hiện giảng dạy cá nhân.',
  },
];

export const PHT_OPERABILITY_GRANTS: readonly ResponsibilityTemplateGrantSpec[] = [
  {
    capabilityKey: 'REPORTING_READ',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Xem báo cáo giảng dạy toàn trường.',
  },
  {
    capabilityKey: 'TIMETABLE_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản trị khung tiết và thời khóa biểu toàn trường.',
  },
  {
    capabilityKey: 'PPCT_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản trị PPCT toàn trường.',
  },
  {
    capabilityKey: 'ACADEMIC_STRUCTURE_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản trị năm học, phiên lịch học thuật và lớp học.',
  },
  {
    capabilityKey: 'CALENDAR_EXCEPTION_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản lý ngoại lệ lịch học toàn trường.',
  },
  {
    capabilityKey: 'TEACHING_OPERATION_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản lý điều hành tiết dạy toàn trường.',
  },
  {
    capabilityKey: 'TEACHING_EXECUTION_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản lý bằng chứng thực hiện giảng dạy toàn trường.',
  },
  {
    capabilityKey: 'HOMEROOM_ASSIGNMENT_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản lý phân công giáo viên chủ nhiệm toàn trường.',
  },
  {
    capabilityKey: 'SPECIAL_ACTIVITY_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản lý hoạt động đặc thù (Special Activity) toàn trường.',
  },
  {
    capabilityKey: 'BUSINESS_CONFIGURATION_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản trị Business Configuration toàn trường theo policy được duyệt.',
  },
  {
    capabilityKey: 'SUBJECT_GROUP_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản trị danh mục tổ chuyên môn và membership.',
  },
  {
    capabilityKey: 'SUBJECT_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản trị danh mục môn học và phân công giảng dạy.',
  },
  {
    capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'PRODUCT_OPERABILITY',
    description: 'Quản trị phân công kiêm nhiệm toàn trường.',
  },
];

export const TECHNICAL_ADMIN_SOURCE_GRANTS: readonly ResponsibilityTemplateGrantSpec[] = [
  {
    capabilityKey: 'USER_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'TECHNICAL',
    description: 'Quản trị tài khoản và trạng thái người dùng.',
  },
  {
    capabilityKey: 'CAPABILITY_GRANT',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'TECHNICAL',
    description: 'Cấp và thu hồi capability theo scope.',
  },
];

export const TECHNICAL_ADMIN_ADDITIONAL_GRANTS: readonly ResponsibilityTemplateGrantSpec[] = [
  {
    capabilityKey: 'AUDIT_VIEW',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'TECHNICAL',
    description: 'Xem audit log toàn trường.',
  },
  {
    capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE',
    scopeType: 'SCHOOL_WIDE',
    scopeResourceId: null,
    category: 'TECHNICAL',
    description: 'Quản trị catalog loại kiêm nhiệm.',
  },
];

export const RESPONSIBILITY_TEMPLATE_DEFINITIONS: Record<ResponsibilityTemplateKey, ResponsibilityTemplateDefinition> = {
  TEACHER: {
    key: 'TEACHER',
    name: 'Giáo viên',
    description: 'Quyền cơ bản của nhân sự giảng dạy: chuyên môn cá nhân, nộp báo cáo kê khai, ghi nhận tiến độ thực hiện.',
    version: TEMPLATE_VERSION,
    requiresTeachingStaff: true,
    requiredResourceKind: 'NONE',
    sourceAuthorityGrants: [...TEACHER_SOURCE_GRANTS],
    productOperabilityGrants: [...TEACHER_OPERABILITY_GRANTS],
    forbiddenDefaults: ['SYSTEM_ADMIN', 'USER_MANAGE', 'CAPABILITY_GRANT', 'APPROVAL_PRINCIPAL', 'APPROVAL_VICE_PRINCIPAL'],
    notes: ['Không chứa quyền quản trị hay phê duyệt; chỉ bao gồm quyền chuyên môn cá nhân giáo viên.'],
  },
  SUBJECT_LEADER: {
    key: 'SUBJECT_LEADER',
    name: 'Tổ trưởng chuyên môn',
    description: 'Quyền giáo viên cộng quyền điều phối tổ chuyên môn, phân công kiêm nhiệm tổ và quản lý chuyên môn theo các môn học thuộc tổ.',
    version: TEMPLATE_VERSION,
    requiresTeachingStaff: true,
    requiredResourceKind: 'SUBJECT_GROUP',
    sourceAuthorityGrants: [
      ...TEACHER_SOURCE_GRANTS,
      {
        capabilityKey: 'SUBJECT_GROUP_LEAD',
        scopeType: 'SUBJECT_GROUP',
        scopeResourceId: null, // materialized per subjectGroupId
        category: 'SOURCE_AUTHORITY',
        description: 'Điều phối tổ chuyên môn trong phạm vi được cấp.',
      },
    ],
    productOperabilityGrants: [
      ...TEACHER_OPERABILITY_GRANTS,
      {
        capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE',
        scopeType: 'SUBJECT_GROUP',
        scopeResourceId: null, // materialized per subjectGroupId
        category: 'PRODUCT_OPERABILITY',
        description: 'Quản trị phân công kiêm nhiệm trong tổ chuyên môn.',
      },
      // Note: PPCT_MANAGE, TEACHING_OPERATION_MANAGE, TEACHING_EXECUTION_MANAGE,
      // REPORTING_READ, REPORTING_STATEMENT_READ materialize per resolved subjectId
    ],
    forbiddenDefaults: ['SYSTEM_ADMIN', 'USER_MANAGE', 'CAPABILITY_GRANT', 'APPROVAL_PRINCIPAL', 'APPROVAL_VICE_PRINCIPAL'],
    notes: [
      'Chỉ áp dụng trong phạm vi tổ chuyên môn và môn học thuộc tổ; không có quyền quản trị toàn trường.',
      'Các quyền theo môn học (PPCT, điều hành, thực hiện giảng dạy, báo cáo) chỉ materialize khi xác định rõ môn học hợp lệ thuộc tổ.',
    ],
  },
  VICE_PRINCIPAL_ACADEMIC: {
    key: 'VICE_PRINCIPAL_ACADEMIC',
    name: 'Phó Hiệu trưởng phụ trách chuyên môn',
    description: 'Quyền giáo viên cộng thẩm quyền phê duyệt chuyên môn PHT, đọc báo cáo kê khai toàn trường và điều hành học thuật/PPCT/TKB toàn trường.',
    version: TEMPLATE_VERSION,
    requiresTeachingStaff: true,
    requiredResourceKind: 'NONE',
    sourceAuthorityGrants: [
      ...TEACHER_SOURCE_GRANTS,
      {
        capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
        scopeType: 'SCHOOL_WIDE',
        scopeResourceId: null,
        category: 'SOURCE_AUTHORITY',
        description: 'Phê duyệt chuyên môn cấp trường theo phân công của PHT.',
      },
      {
        capabilityKey: 'REPORTING_STATEMENT_READ',
        scopeType: 'SCHOOL_WIDE',
        scopeResourceId: null,
        category: 'SOURCE_AUTHORITY',
        description: 'Xem báo cáo kê khai toàn trường.',
      },
    ],
    productOperabilityGrants: [
      ...TEACHER_OPERABILITY_GRANTS,
      ...PHT_OPERABILITY_GRANTS,
    ],
    forbiddenDefaults: [
      'SYSTEM_ADMIN',
      'USER_MANAGE',
      'CAPABILITY_GRANT',
      'APPROVAL_PRINCIPAL',
    ],
    notes: [
      'Tuyệt đối không cấp SYSTEM_ADMIN, USER_MANAGE, CAPABILITY_GRANT hoặc APPROVAL_PRINCIPAL mặc định.',
    ],
  },
  PRINCIPAL: {
    key: 'PRINCIPAL',
    name: 'Hiệu trưởng',
    description: 'Quyền giáo viên cộng thẩm quyền phê duyệt chuyên môn Hiệu trưởng, xem audit log và điều hành học thuật toàn trường.',
    version: TEMPLATE_VERSION,
    requiresTeachingStaff: true,
    requiredResourceKind: 'NONE',
    sourceAuthorityGrants: [
      ...TEACHER_SOURCE_GRANTS,
      {
        capabilityKey: 'APPROVAL_PRINCIPAL',
        scopeType: 'SCHOOL_WIDE',
        scopeResourceId: null,
        category: 'SOURCE_AUTHORITY',
        description: 'Phê duyệt chuyên môn cấp trường dành cho Hiệu trưởng.',
      },
      {
        capabilityKey: 'REPORTING_STATEMENT_READ',
        scopeType: 'SCHOOL_WIDE',
        scopeResourceId: null,
        category: 'SOURCE_AUTHORITY',
        description: 'Xem báo cáo kê khai toàn trường.',
      },
      {
        capabilityKey: 'AUDIT_VIEW',
        scopeType: 'SCHOOL_WIDE',
        scopeResourceId: null,
        category: 'SOURCE_AUTHORITY',
        description: 'Xem audit log toàn trường.',
      },
    ],
    productOperabilityGrants: [
      ...TEACHER_OPERABILITY_GRANTS,
      ...PHT_OPERABILITY_GRANTS,
    ],
    forbiddenDefaults: [
      'SYSTEM_ADMIN',
      'USER_MANAGE',
      'CAPABILITY_GRANT',
      'APPROVAL_VICE_PRINCIPAL',
    ],
    notes: [
      'Không mặc định cấp quyền quản trị kỹ thuật (SYSTEM_ADMIN, USER_MANAGE, CAPABILITY_GRANT).',
      'Không cấp APPROVAL_VICE_PRINCIPAL mặc định.',
    ],
  },
  GDDP_COORDINATOR: {
    key: 'GDDP_COORDINATOR',
    name: 'Điều phối Giáo dục địa phương (GDĐP)',
    description: 'Quyền giáo viên cộng thẩm quyền điều phối hoạt động Giáo dục địa phương (GDĐP) cho chương trình được chỉ định.',
    version: TEMPLATE_VERSION,
    requiresTeachingStaff: true,
    requiredResourceKind: 'ACTIVITY',
    sourceAuthorityGrants: [
      ...TEACHER_SOURCE_GRANTS,
      {
        capabilityKey: 'GDDP_COORDINATOR',
        scopeType: 'ACTIVITY',
        scopeResourceId: null, // materialized per programmeMasterId
        category: 'SOURCE_AUTHORITY',
        description: 'Điều phối Giáo dục địa phương cho chương trình cụ thể.',
      },
    ],
    productOperabilityGrants: [...TEACHER_OPERABILITY_GRANTS],
    forbiddenDefaults: ['SYSTEM_ADMIN', 'USER_MANAGE', 'CAPABILITY_GRANT', 'APPROVAL_PRINCIPAL', 'APPROVAL_VICE_PRINCIPAL'],
    notes: ['Chỉ áp dụng cho chương trình có kind = GDDP; không áp dụng cho hoạt động trải nghiệm hay quản trị chung.'],
  },
  HDTN_COORDINATOR: {
    key: 'HDTN_COORDINATOR',
    name: 'Điều phối Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)',
    description: 'Quyền giáo viên cộng thẩm quyền điều phối Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN) cho chương trình được chỉ định.',
    version: TEMPLATE_VERSION,
    requiresTeachingStaff: true,
    requiredResourceKind: 'ACTIVITY',
    sourceAuthorityGrants: [
      ...TEACHER_SOURCE_GRANTS,
      {
        capabilityKey: 'HĐTN_COORDINATOR',
        scopeType: 'ACTIVITY',
        scopeResourceId: null, // materialized per programmeMasterId
        category: 'SOURCE_AUTHORITY',
        description: 'Điều phối Hoạt động trải nghiệm, hướng nghiệp cho chương trình cụ thể.',
      },
    ],
    productOperabilityGrants: [...TEACHER_OPERABILITY_GRANTS],
    forbiddenDefaults: ['SYSTEM_ADMIN', 'USER_MANAGE', 'CAPABILITY_GRANT', 'APPROVAL_PRINCIPAL', 'APPROVAL_VICE_PRINCIPAL'],
    notes: ['Chỉ áp dụng cho chương trình có kind = HDTN_HN; không áp dụng cho GDĐP hay quản trị chung.'],
  },
  TECHNICAL_ACCOUNT_ADMIN: {
    key: 'TECHNICAL_ACCOUNT_ADMIN',
    name: 'Quản trị tài khoản & kỹ thuật',
    description: 'Quản trị tài khoản người dùng, cấp phát capability, xem audit log và quản trị catalog kiêm nhiệm.',
    version: TEMPLATE_VERSION,
    requiresTeachingStaff: false,
    requiredResourceKind: 'NONE',
    sourceAuthorityGrants: [...TECHNICAL_ADMIN_SOURCE_GRANTS],
    productOperabilityGrants: [...TECHNICAL_ADMIN_ADDITIONAL_GRANTS],
    forbiddenDefaults: [
      'SYSTEM_ADMIN',
      'APPROVAL_PRINCIPAL',
      'APPROVAL_VICE_PRINCIPAL',
      'TEACHER_BASE',
    ],
    notes: [
      'Tuyệt đối không cấp SYSTEM_ADMIN mặc định.',
      'Không cấp quyền phê duyệt chuyên môn (APPROVAL_PRINCIPAL, APPROVAL_VICE_PRINCIPAL).',
      'Không cấp TEACHER_BASE nếu tài khoản không phải nhân sự giảng dạy (isTeachingStaff=false).',
    ],
  },
};

export function getTemplateDefinition(key: ResponsibilityTemplateKey): ResponsibilityTemplateDefinition {
  const definition = RESPONSIBILITY_TEMPLATE_DEFINITIONS[key];
  if (!definition) throw new Error(`Không tìm thấy Responsibility Template: ${key}`);
  return definition;
}

export function listTemplateDefinitions(): ResponsibilityTemplateDefinition[] {
  return Object.values(RESPONSIBILITY_TEMPLATE_DEFINITIONS);
}

export interface MaterializeTemplateOptions {
  templateKey: ResponsibilityTemplateKey;
  subjectGroupId?: string;
  resolvedSubjectIds?: string[];
  programmeMasterId?: string;
}

/**
 * Materializes the exact set of grant specifications for a given template and resolved resources.
 */
export function materializeTemplateGrants(
  options: MaterializeTemplateOptions,
): ResponsibilityTemplateGrantSpec[] {
  const def = getTemplateDefinition(options.templateKey);
  const grants: ResponsibilityTemplateGrantSpec[] = [];

  switch (options.templateKey) {
    case 'TEACHER':
    case 'VICE_PRINCIPAL_ACADEMIC':
    case 'PRINCIPAL':
    case 'TECHNICAL_ACCOUNT_ADMIN': {
      grants.push(...def.sourceAuthorityGrants);
      grants.push(...def.productOperabilityGrants);
      break;
    }
    case 'GDDP_COORDINATOR': {
      grants.push(...TEACHER_SOURCE_GRANTS);
      grants.push(...TEACHER_OPERABILITY_GRANTS);
      if (options.programmeMasterId) {
        grants.push({
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: options.programmeMasterId,
          category: 'SOURCE_AUTHORITY',
          description: 'Điều phối Giáo dục địa phương cho chương trình cụ thể.',
        });
      }
      break;
    }
    case 'HDTN_COORDINATOR': {
      grants.push(...TEACHER_SOURCE_GRANTS);
      grants.push(...TEACHER_OPERABILITY_GRANTS);
      if (options.programmeMasterId) {
        grants.push({
          capabilityKey: 'HĐTN_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: options.programmeMasterId,
          category: 'SOURCE_AUTHORITY',
          description: 'Điều phối Hoạt động trải nghiệm, hướng nghiệp cho chương trình cụ thể.',
        });
      }
      break;
    }
    case 'SUBJECT_LEADER': {
      // 1. Teacher baseline & operability
      grants.push(...TEACHER_SOURCE_GRANTS);
      grants.push(...TEACHER_OPERABILITY_GRANTS);

      // 2. Subject group level grants
      if (options.subjectGroupId) {
        grants.push({
          capabilityKey: 'SUBJECT_GROUP_LEAD',
          scopeType: 'SUBJECT_GROUP',
          scopeResourceId: options.subjectGroupId,
          category: 'SOURCE_AUTHORITY',
          description: 'Điều phối tổ chuyên môn trong phạm vi được cấp.',
        });
        grants.push({
          capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE',
          scopeType: 'SUBJECT_GROUP',
          scopeResourceId: options.subjectGroupId,
          category: 'PRODUCT_OPERABILITY',
          description: 'Quản trị phân công kiêm nhiệm trong tổ chuyên môn.',
        });
      }

      // 3. Subject level grants (materialize only for valid resolved subjects)
      if (options.resolvedSubjectIds && options.resolvedSubjectIds.length > 0) {
        for (const subjectId of options.resolvedSubjectIds) {
          grants.push({
            capabilityKey: 'PPCT_MANAGE',
            scopeType: 'SUBJECT',
            scopeResourceId: subjectId,
            category: 'PRODUCT_OPERABILITY',
            description: 'Quản trị PPCT môn học thuộc tổ.',
          });
          grants.push({
            capabilityKey: 'TEACHING_OPERATION_MANAGE',
            scopeType: 'SUBJECT',
            scopeResourceId: subjectId,
            category: 'PRODUCT_OPERABILITY',
            description: 'Quản lý điều hành tiết dạy môn học thuộc tổ.',
          });
          grants.push({
            capabilityKey: 'TEACHING_EXECUTION_MANAGE',
            scopeType: 'SUBJECT',
            scopeResourceId: subjectId,
            category: 'PRODUCT_OPERABILITY',
            description: 'Quản lý bằng chứng thực hiện giảng dạy môn học thuộc tổ.',
          });
          grants.push({
            capabilityKey: 'REPORTING_READ',
            scopeType: 'SUBJECT',
            scopeResourceId: subjectId,
            category: 'PRODUCT_OPERABILITY',
            description: 'Xem báo cáo giảng dạy môn học thuộc tổ.',
          });
          grants.push({
            capabilityKey: 'REPORTING_STATEMENT_READ',
            scopeType: 'SUBJECT',
            scopeResourceId: subjectId,
            category: 'PRODUCT_OPERABILITY',
            description: 'Xem báo cáo kê khai môn học thuộc tổ.',
          });
        }
      }
      break;
    }
  }

  // Deduplicate deterministically by key:scope:resourceId
  const seen = new Map<string, ResponsibilityTemplateGrantSpec>();
  for (const grant of grants) {
    const coordKey = `${grant.capabilityKey}:${grant.scopeType}:${grant.scopeResourceId ?? ''}`;
    if (!seen.has(coordKey)) {
      seen.set(coordKey, grant);
    }
  }
  return [...seen.values()];
}
