const { PrismaClient } = require('@prisma/client');

const CAPABILITIES = [
  ['TEACHER_BASE', 'Nền tảng truy cập chuyên môn cá nhân.', ['PERSONAL']],
  ['SUBJECT_GROUP_LEAD', 'Điều phối tổ chuyên môn trong phạm vi được cấp.', ['SUBJECT_GROUP']],
  ['APPROVAL_PRINCIPAL', 'Phê duyệt chuyên môn cấp trường dành cho người được cấp.', ['SCHOOL_WIDE']],
  ['APPROVAL_VICE_PRINCIPAL', 'Phê duyệt chuyên môn cấp trường theo phân công.', ['SCHOOL_WIDE']],
  ['GDDDP_COORDINATOR', 'Điều phối Giáo dục địa phương.', ['ACTIVITY']],
  ['HĐTN_COORDINATOR', 'Điều phối Hoạt động trải nghiệm, hướng nghiệp.', ['ACTIVITY']],
  ['SYSTEM_ADMIN', 'Quản trị kỹ thuật; không tự cấp quyền chuyên môn.', ['SCHOOL_WIDE']],
  ['USER_MANAGE', 'Quản trị tài khoản và trạng thái người dùng.', ['SCHOOL_WIDE']],
  ['SUBJECT_GROUP_MANAGE', 'Quản trị danh mục tổ chuyên môn và membership.', ['SCHOOL_WIDE']],
  ['SUBJECT_MANAGE', 'Quản trị danh mục môn học và phân công giảng dạy.', ['SCHOOL_WIDE']],
  ['CAPABILITY_GRANT', 'Cấp và thu hồi capability theo scope.', ['SCHOOL_WIDE']],
  ['AUDIT_VIEW', 'Xem audit log theo phạm vi được cấp.', ['SCHOOL_WIDE']],
  ['ADDITIONAL_DUTY_CATALOG_MANAGE', 'Quản trị catalog loại kiêm nhiệm.', ['SCHOOL_WIDE']],
  ['ACADEMIC_STRUCTURE_MANAGE', 'Quản trị năm học, phiên lịch học thuật và lớp học.', ['SCHOOL_WIDE']],
  ['TIMETABLE_MANAGE', 'Quản trị khung tiết và thời khóa biểu toàn trường.', ['SCHOOL_WIDE']],
  ['PPCT_MANAGE', 'Quản trị PPCT theo môn hoặc toàn trường.', ['SUBJECT', 'SCHOOL_WIDE']],
  [
    'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE',
    'Quản trị phân công kiêm nhiệm theo scope và hiệu lực.',
    ['SUBJECT_GROUP', 'SCHOOL_WIDE'],
  ],
  ['AI_ACTIVE_USE_SCHOOL', 'Sử dụng AI chủ động cấp trường khi policy cho phép.', ['SCHOOL_WIDE']],
  [
    'AI_ACTIVE_USE_DEPARTMENT',
    'Sử dụng AI chủ động trong tổ chuyên môn khi policy cho phép.',
    ['SUBJECT_GROUP'],
  ],
  ['AI_ACTIVE_USE_ACTIVITY', 'Sử dụng AI chủ động cho hoạt động được cấp.', ['ACTIVITY']],
  ['AI_RECEIVE_SUGGESTION', 'Nhận gợi ý AI thụ động.', ['PERSONAL']],
  ['AI_CONFIRM_SUGGESTION', 'Xác nhận gợi ý AI trước business command.', ['PERSONAL']],
  ['AI_EDIT_DRAFT', 'Chỉnh sửa bản nháp do AI tạo.', ['PERSONAL']],
  ['AI_CONFIGURE_POLICY', 'Quản trị policy, task, quota và budget AI.', ['SCHOOL_WIDE']],
  ['AI_VIEW_USAGE', 'Xem số liệu sử dụng AI.', ['SCHOOL_WIDE']],
  ['AI_VIEW_COST', 'Xem chi phí AI.', ['SCHOOL_WIDE']],
  ['AI_VIEW_AUDIT', 'Xem audit AI.', ['SCHOOL_WIDE']],
  ['AI_DISABLE_SYSTEM', 'Tắt AI toàn hệ thống theo policy.', ['SCHOOL_WIDE']],
];

async function seedCapabilityCatalog(prisma) {
  await prisma.$transaction(
    CAPABILITIES.map(([key, description, allowedScopeTypes]) =>
      prisma.capabilityDefinition.upsert({
        where: { key },
        update: {
          description,
          allowedScopeTypes,
          isSystem: true,
          isActive: true,
        },
        create: {
          key,
          description,
          allowedScopeTypes,
          isSystem: true,
          isActive: true,
        },
      }),
    ),
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedCapabilityCatalog(prisma);
    console.log(`Seeded ${CAPABILITIES.length} capability definitions.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Capability catalog seed failed.');
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

module.exports = { CAPABILITIES, seedCapabilityCatalog };
