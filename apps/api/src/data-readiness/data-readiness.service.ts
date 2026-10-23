import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  DataReadinessDomainItem,
  DataReadinessFinding,
  DataReadinessImportWorkflowStep,
  DataReadinessStatus,
  DataReadinessSummaryResponse,
} from '@baogiang/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { AuthenticatedRequest } from '../auth/auth.types';

@Injectable()
export class DataReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: CapabilityAuthorizationService,
  ) {}

  async requireAccess(request: AuthenticatedRequest): Promise<void> {
    if (!request.auth || !request.auth.user || request.auth.user.mustChangePassword) {
      throw new ForbiddenException('Bạn không có quyền truy cập Trung tâm sẵn sàng dữ liệu.');
    }
    const evalTime = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: request.auth.user.id },
      select: { status: true, lockedUntil: true },
    });
    if (!user || user.status !== 'ACTIVE' || (user.lockedUntil && user.lockedUntil > evalTime)) {
      throw new ForbiddenException('Tài khoản không hợp lệ hoặc đã bị khóa.');
    }

    const grants = await this.authorization.listEffectiveCapabilities(request.auth.user.id, evalTime);
    const hasAllowedGrant = grants.some(
      (g) =>
        g.scope === 'SCHOOL_WIDE' &&
        [
          'APPROVAL_PRINCIPAL',
          'APPROVAL_VICE_PRINCIPAL',
          'TIMETABLE_MANAGE',
          'PPCT_MANAGE',
          'USER_MANAGE',
          'ACADEMIC_STRUCTURE_MANAGE',
          'TEACHING_EXECUTION_MANAGE',
        ].includes(g.key),
    );
    if (!hasAllowedGrant) {
      throw new ForbiddenException('Bạn không có quyền truy cập Trung tâm sẵn sàng dữ liệu.');
    }
  }

  async getSummary(request: AuthenticatedRequest, academicYearId?: string): Promise<DataReadinessSummaryResponse> {
    await this.requireAccess(request);

    const academicYears = await this.prisma.academicYear.findMany({
      orderBy: [{ code: 'desc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true },
    });

    if (academicYears.length === 0) {
      return {
        academicYear: null,
        academicYears: [],
        overallStatus: 'NO_DATA',
        overallStatusLabel: 'Chưa có dữ liệu năm học',
        domains: this.buildEmptyDomains(),
        evaluatedAt: new Date().toISOString(),
      };
    }

    const selectedYear = academicYearId
      ? academicYears.find((y) => y.id === academicYearId) ?? academicYears[0]
      : academicYears[0];

    const yearId = selectedYear.id;

    const [tkbItem, ppctItem, historyItem, gddpItem, hdtnItem] = await Promise.all([
      this.evaluateTkb(yearId),
      this.evaluatePpct(yearId),
      this.evaluateHistory(yearId),
      this.evaluateGddp(yearId),
      this.evaluateHdtn(yearId),
    ]);

    const domains = [tkbItem, ppctItem, historyItem, gddpItem, hdtnItem];
    const overallStatus = this.determineOverallStatus(domains);
    const overallStatusLabel = this.getOverallStatusLabel(overallStatus);

    return {
      academicYear: selectedYear,
      academicYears,
      overallStatus,
      overallStatusLabel,
      domains,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private determineOverallStatus(domains: DataReadinessDomainItem[]): DataReadinessStatus {
    if (domains.every((d) => d.status === 'READY')) {
      return 'READY';
    }
    if (domains.some((d) => d.status === 'NOT_READY')) {
      return 'NOT_READY';
    }
    if (domains.some((d) => d.status === 'NO_DATA')) {
      return 'NOT_READY';
    }
    if (domains.some((d) => d.status === 'ATTENTION_REQUIRED')) {
      return 'ATTENTION_REQUIRED';
    }
    return 'NOT_ASSESSED';
  }

  private getOverallStatusLabel(status: DataReadinessStatus): string {
    switch (status) {
      case 'READY':
        return 'Tất cả dữ liệu năm học đã sẵn sàng vận hành';
      case 'ATTENTION_REQUIRED':
        return 'Có dữ liệu cần kiểm tra hoặc ban hành trước khi vận hành';
      case 'NOT_READY':
        return 'Chưa sẵn sàng: còn dữ liệu quan trọng chưa hoàn tất';
      case 'NO_DATA':
        return 'Chưa có đủ dữ liệu năm học';
      default:
        return 'Chưa đủ thông tin xác minh';
    }
  }

  private buildEmptyDomains(): DataReadinessDomainItem[] {
    const keys: { key: DataReadinessDomainItem['key']; label: string; to: string }[] = [
      { key: 'TKB', label: 'Thời khóa biểu', to: '/quan-tri/thoi-khoa-bieu' },
      { key: 'PPCT', label: 'Phân phối chương trình', to: '/quan-tri/ppct/nhap' },
      { key: 'HISTORICAL_TEACHING', label: 'Lịch sử giảng dạy', to: '/quan-tri/lich-su-giang-day' },
      { key: 'GDDP', label: 'Giáo dục địa phương', to: '/quan-tri/chuong-trinh-dac-thu' },
      { key: 'HDTN_HN', label: 'HĐTN - Hướng nghiệp', to: '/quan-tri/chuong-trinh-dac-thu' },
    ];
    return keys.map((k) => ({
      key: k.key,
      label: k.label,
      description: `Quản lý và kiểm tra dữ liệu ${k.label}`,
      status: 'NO_DATA',
      statusLabel: 'Chưa có năm học',
      latestVersion: null,
      latestImport: null,
      findings: [{ code: 'NO_ACADEMIC_YEAR', severity: 'BLOCKER', message: 'Hệ thống chưa thiết lập năm học nào.' }],
      nextAction: 'Thiết lập năm học tại phân hệ Cấu trúc năm học.',
      primaryAction: { label: 'Đến cấu trúc năm học', to: '/quan-tri/cau-truc-nam-hoc' },
      workflowSteps: this.defaultWorkflowSteps(k.key, false, false, false, false, false),
      stats: {},
    }));
  }

  private defaultWorkflowSteps(
    domain: DataReadinessDomainItem['key'],
    step1Done: boolean,
    step2Done: boolean,
    step3Done: boolean,
    step4Done: boolean,
    step5Done: boolean,
    step6Done?: boolean,
  ): DataReadinessImportWorkflowStep[] {
    const isHistory = domain === 'HISTORICAL_TEACHING';
    return [
      {
        stepNumber: 1,
        label: 'Chọn tệp',
        isCompleted: step1Done,
        isCurrent: !step1Done,
        isApplicable: true,
        description: 'Tải tệp bảng tính nguồn hợp lệ',
      },
      {
        stepNumber: 2,
        label: 'Kiểm tra cấu trúc',
        isCompleted: step2Done,
        isCurrent: step1Done && !step2Done,
        isApplicable: true,
        description: 'Xác minh dòng, cột và định dạng tiêu đề',
      },
      {
        stepNumber: 3,
        label: 'Xử lý giá trị chưa nhận diện',
        isCompleted: step3Done,
        isCurrent: step2Done && !step3Done,
        isApplicable: true,
        description: 'Đối chiếu mã giáo viên, lớp học và môn học',
      },
      {
        stepNumber: 4,
        label: 'Xem trước & đối chiếu',
        isCompleted: step4Done,
        isCurrent: step3Done && !step4Done,
        isApplicable: true,
        description: 'Kiểm tra xung đột và dữ liệu sẽ ghi nhận',
      },
      {
        stepNumber: 5,
        label: 'Xác nhận',
        isCompleted: step5Done,
        isCurrent: step4Done && !step5Done,
        isApplicable: true,
        description: 'Lưu dữ liệu vào hệ thống',
      },
      {
        stepNumber: 6,
        label: isHistory ? 'Kích hoạt (Không áp dụng)' : 'Kích hoạt / Ban hành',
        isCompleted: isHistory ? false : Boolean(step6Done),
        isCurrent: isHistory ? false : step5Done && !step6Done,
        isApplicable: !isHistory,
        description: isHistory
          ? 'Minh chứng lịch sử được ghi nhận ngay sau xác nhận'
          : 'Công bố phiên bản chính thức để đưa vào vận hành',
      },
    ];
  }

  private async evaluateTkb(yearId: string): Promise<DataReadinessDomainItem> {
    const [versions, calendar, slotCount] = await Promise.all([
      this.prisma.timetableVersion.findMany({
        where: { academicYearId: yearId },
        orderBy: [{ versionNumber: 'desc' }],
        include: { _count: { select: { entries: true } } },
      }),
      this.prisma.academicCalendarVersion.findFirst({
        where: { academicYearId: yearId, isActive: true },
      }),
      this.prisma.timeSlotDefinition.count({
        where: { academicYearId: yearId, isActive: true },
      }),
    ]);

    const activeVersion = versions.find((v) => v.status === 'ACTIVE');
    const latestVersion = versions[0];
    const findings: DataReadinessFinding[] = [];

    if (versions.length === 0) {
      findings.push({
        code: 'TKB_NO_VERSION',
        severity: 'BLOCKER',
        message: 'Chưa có phiên bản thời khóa biểu nào được tạo hoặc nhập cho năm học này.',
      });
      return {
        key: 'TKB',
        label: 'Thời khóa biểu (TKB)',
        description: 'Thời khóa biểu chính khóa và phân phối tiết học theo lớp và giáo viên.',
        status: 'NO_DATA',
        statusLabel: 'Chưa có dữ liệu',
        latestVersion: null,
        latestImport: null,
        findings,
        nextAction: 'Nhập thời khóa biểu từ tệp mẫu Đam San (.xlsx) tại trang Thời khóa biểu & Khung tiết.',
        primaryAction: { label: 'Đến Thời khóa biểu & Khung tiết', to: '/quan-tri/thoi-khoa-bieu' },
        secondaryAction: null,
        workflowSteps: this.defaultWorkflowSteps('TKB', false, false, false, false, false, false),
        stats: { totalVersions: 0, activeVersionNumber: null, activeSlotCount: slotCount, hasCalendar: Boolean(calendar) },
      };
    }

    const versionToDisplay = activeVersion ?? latestVersion;
    const hasActive = Boolean(activeVersion);
    const isApprovedOrValidated = latestVersion.status === 'APPROVED' || latestVersion.status === 'VALIDATED';
    const isDraft = latestVersion.status === 'DRAFT';

    let status: DataReadinessStatus = 'NOT_READY';
    let statusLabel = 'Chưa sẵn sàng';
    let nextAction = '';

    if (hasActive) {
      if (slotCount === 0) {
        status = 'ATTENTION_REQUIRED';
        statusLabel = 'Khung tiết chưa kích hoạt';
        findings.push({
          code: 'TKB_NO_SLOTS',
          severity: 'BLOCKER',
          message: 'Thời khóa biểu đang áp dụng nhưng chưa có khung tiết học nào hoạt động.',
        });
        nextAction = 'Kích hoạt danh sách khung tiết học trong năm học.';
      } else if (!calendar) {
        status = 'ATTENTION_REQUIRED';
        statusLabel = 'Lịch năm học chưa kích hoạt';
        findings.push({
          code: 'TKB_NO_CALENDAR',
          severity: 'WARNING',
          message: 'Lịch năm học chưa được kích hoạt chính thức.',
        });
        nextAction = 'Kiểm tra và kích hoạt lịch năm học chính thức.';
      } else {
        status = 'READY';
        statusLabel = 'Đang áp dụng';
        nextAction = 'Thời khóa biểu đã sẵn sàng vận hành. Cập nhật theo buổi khi có điều chỉnh.';
      }
    } else if (isApprovedOrValidated) {
      status = 'ATTENTION_REQUIRED';
      statusLabel = latestVersion.status === 'APPROVED' ? 'Đã phê duyệt (chờ áp dụng)' : 'Đã kiểm tra hợp lệ';
      findings.push({
        code: 'TKB_PENDING_ACTIVATION',
        severity: 'WARNING',
        message: `Phiên bản ${latestVersion.versionNumber} đã kiểm tra/phê duyệt nhưng chưa kích hoạt áp dụng.`,
      });
      nextAction = `Kích hoạt phiên bản ${latestVersion.versionNumber} để đưa vào áp dụng chính thức.`;
    } else if (isDraft) {
      status = 'NOT_READY';
      statusLabel = 'Bản nháp';
      findings.push({
        code: 'TKB_DRAFT_ONLY',
        severity: 'BLOCKER',
        message: `Phiên bản mới nhất (${latestVersion.versionNumber}) đang là Bản nháp, chưa thể vận hành.`,
      });
      nextAction = 'Kiểm tra tính hợp lệ và phê duyệt bản nháp thời khóa biểu.';
    }

    const versionStatusTextMap: Record<string, string> = {
      DRAFT: 'Bản nháp',
      VALIDATED: 'Đã kiểm tra hợp lệ',
      APPROVED: 'Đã phê duyệt',
      ACTIVE: 'Đang áp dụng',
      SUPERSEDED: 'Đã thay thế',
    };

    return {
      key: 'TKB',
      label: 'Thời khóa biểu (TKB)',
      description: 'Thời khóa biểu chính khóa và phân phối tiết học theo lớp và giáo viên.',
      status,
      statusLabel,
      latestVersion: {
        number: versionToDisplay.versionNumber,
        status: versionToDisplay.status,
        statusLabel: versionStatusTextMap[versionToDisplay.status] ?? versionToDisplay.status,
        effectiveRange: versionToDisplay.effectiveFrom
          ? `${versionToDisplay.effectiveFrom.toISOString().slice(0, 10)}${versionToDisplay.effectiveUntil ? ` đến ${versionToDisplay.effectiveUntil.toISOString().slice(0, 10)}` : ' (hiện hành)'}`
          : null,
        updatedAt: versionToDisplay.updatedAt?.toISOString() ?? null,
      },
      latestImport: {
        batchRef: null,
        sourceFileName: 'Đam San TKB Workbook',
        importedAt: versionToDisplay.createdAt?.toISOString() ?? null,
        rowCount: versionToDisplay._count?.entries ?? 0,
        importedBy: null,
      },
      findings,
      nextAction,
      primaryAction: { label: 'Đến Thời khóa biểu & Khung tiết', to: '/quan-tri/thoi-khoa-bieu' },
      secondaryAction: null,
      workflowSteps: this.defaultWorkflowSteps('TKB', true, true, true, true, true, hasActive),
      stats: {
        totalVersions: versions.length,
        activeVersionNumber: activeVersion?.versionNumber ?? null,
        entryCount: versionToDisplay._count?.entries ?? 0,
        activeSlotCount: slotCount,
        hasCalendar: Boolean(calendar),
      },
    };
  }

  private async evaluatePpct(yearId: string): Promise<DataReadinessDomainItem> {
    const [activeSubjects, plans, associationCount] = await Promise.all([
      this.prisma.subject.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.ppctPlan.findMany({
        where: { academicYearId: yearId },
        include: {
          versions: {
            orderBy: [{ versionNumber: 'desc' }],
            take: 1,
            select: { id: true, versionNumber: true, status: true, updatedAt: true },
          },
        },
      }),
      this.prisma.ppctClassAssociation.count({
        where: { academicYearId: yearId },
      }),
    ]);

    const findings: DataReadinessFinding[] = [];

    if (plans.length === 0) {
      findings.push({
        code: 'PPCT_NO_PLANS',
        severity: 'BLOCKER',
        message: 'Chưa có kế hoạch phân phối chương trình nào cho năm học này.',
      });
      return {
        key: 'PPCT',
        label: 'Phân phối chương trình (PPCT)',
        description: 'Kế hoạch số tiết, bài học và chuyên đề theo từng môn học và khối lớp.',
        status: 'NO_DATA',
        statusLabel: 'Chưa có dữ liệu',
        latestVersion: null,
        latestImport: null,
        findings,
        nextAction: 'Nhập phân phối chương trình từ tệp Excel chuẩn Đam San.',
        primaryAction: { label: 'Nhập PPCT', to: '/quan-tri/ppct/nhap' },
        secondaryAction: { label: 'Áp dụng chuyên đề', to: '/quan-tri/ppct/ap-dung-chuyen-de' },
        workflowSteps: this.defaultWorkflowSteps('PPCT', false, false, false, false, false, false),
        stats: { totalPlans: 0, publishedCount: 0, draftCount: 0, associationCount: 0 },
      };
    }

    const publishedCount = plans.filter((p) => p.versions[0]?.status === 'PUBLISHED').length;
    const draftCount = plans.filter((p) => p.versions[0]?.status === 'DRAFT').length;
    const planSubjectIds = new Set(plans.map((p) => p.subjectId));
    const missingSubjects = activeSubjects.filter((s) => !planSubjectIds.has(s.id));

    let status: DataReadinessStatus = 'READY';
    let statusLabel = 'Đã ban hành';
    let nextAction = 'Phân phối chương trình đã sẵn sàng. Thiết lập áp dụng chuyên đề cho các lớp nếu có.';

    if (draftCount > 0) {
      status = 'ATTENTION_REQUIRED';
      statusLabel = `Có ${draftCount} bản nháp chưa ban hành`;
      findings.push({
        code: 'PPCT_DRAFT_PENDING',
        severity: 'WARNING',
        message: `Có ${draftCount} kế hoạch PPCT đang ở trạng thái Bản nháp, cần ban hành để giáo viên thực hiện.`,
      });
      nextAction = 'Kiểm tra và ban hành các bản nháp PPCT còn tồn đọng.';
    } else if (missingSubjects.length > 0 && plans.length < activeSubjects.length) {
      status = 'NOT_READY';
      statusLabel = 'Thiếu môn học';
      findings.push({
        code: 'PPCT_SUBJECTS_INCOMPLETE',
        severity: 'BLOCKER',
        message: `Còn ${missingSubjects.length} môn học chưa có kế hoạch PPCT (${missingSubjects.slice(0, 3).map((s) => s.name).join(', ')}${missingSubjects.length > 3 ? '...' : ''}).`,
      });
      nextAction = 'Tải lên tệp PPCT cho các môn học còn thiếu.';
    }

    if (associationCount === 0 && plans.length > 0) {
      findings.push({
        code: 'PPCT_NO_ASSOCIATIONS',
        severity: 'INFO',
        message: 'Chưa có phân công lớp áp dụng chuyên đề riêng; hệ thống mặc định áp dụng cốt lõi.',
      });
    }

    const latestPlanWithVersion = plans
      .filter((p) => p.versions.length > 0)
      .sort((a, b) => (b.versions[0].updatedAt.getTime() - a.versions[0].updatedAt.getTime()))[0];

    const latestVer = latestPlanWithVersion?.versions[0];

    return {
      key: 'PPCT',
      label: 'Phân phối chương trình (PPCT)',
      description: 'Kế hoạch số tiết, bài học và chuyên đề theo từng môn học và khối lớp.',
      status,
      statusLabel,
      latestVersion: latestVer
        ? {
            number: latestVer.versionNumber,
            status: latestVer.status,
            statusLabel: latestVer.status === 'PUBLISHED' ? 'Đã ban hành' : 'Bản nháp',
            effectiveRange: null,
            updatedAt: latestVer.updatedAt.toISOString(),
          }
        : null,
      latestImport: {
        batchRef: null,
        sourceFileName: 'Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx',
        importedAt: latestVer?.updatedAt.toISOString() ?? null,
        rowCount: plans.length,
        importedBy: null,
      },
      findings,
      nextAction,
      primaryAction: { label: 'Nhập PPCT', to: '/quan-tri/ppct/nhap' },
      secondaryAction: { label: 'Áp dụng chuyên đề', to: '/quan-tri/ppct/ap-dung-chuyen-de' },
      workflowSteps: this.defaultWorkflowSteps('PPCT', true, true, true, true, true, publishedCount > 0),
      stats: {
        totalPlans: plans.length,
        publishedCount,
        draftCount,
        missingSubjectCount: missingSubjects.length,
        associationCount,
      },
    };
  }

  private async evaluateHistory(yearId: string): Promise<DataReadinessDomainItem> {
    const [opStartPolicy, calendar, batches, historicalExecutionCount] = await Promise.all([
      this.prisma.businessPolicyVersion.findFirst({
        where: {
          status: 'PUBLISHED',
          stream: {
            familyKey: 'OPERATIONAL_START',
            academicYearId: yearId,
          },
        },
        orderBy: { versionNumber: 'desc' },
      }),
      this.prisma.academicCalendarVersion.findFirst({
        where: { academicYearId: yearId, isActive: true },
      }),
      this.prisma.historicalTeachingImportBatch.findMany({
        where: { academicYearId: yearId },
        orderBy: [{ createdAt: 'desc' }],
        take: 1,
        include: {
          confirmedBy: { select: { profile: { select: { displayName: true } } } },
          _count: { select: { rows: true } },
        },
      }),
      this.prisma.curricularTeachingExecution.count({
        where: { academicYearId: yearId, historicalImportRow: { isNot: null } },
      }),
    ]);

    const findings: DataReadinessFinding[] = [];
    const opStartDate = opStartPolicy?.payload && typeof opStartPolicy.payload === 'object'
      ? (opStartPolicy.payload as Record<string, unknown>).operationalStartDate as string | undefined
      : undefined;

    const delayedGoLiveApplies = Boolean(
      opStartDate && calendar?.startDate && new Date(opStartDate) > new Date(calendar.startDate),
    );

    const latestBatch = batches[0];
    const rowCount = latestBatch?._count?.rows ?? 0;

    if (!delayedGoLiveApplies) {
      return {
        key: 'HISTORICAL_TEACHING',
        label: 'Lịch sử giảng dạy',
        description: 'Dữ liệu giảng dạy trước thời điểm đưa hệ thống vào vận hành thực tế.',
        status: 'READY',
        statusLabel: 'Không yêu cầu nạp lịch sử',
        latestVersion: null,
        latestImport: latestBatch
          ? {
              batchRef: latestBatch.id,
              sourceFileName: 'Tệp minh chứng giảng dạy',
              importedAt: latestBatch.createdAt.toISOString(),
              rowCount,
              importedBy: latestBatch.confirmedBy?.profile?.displayName ?? null,
            }
          : null,
        findings: [],
        nextAction: 'Hệ thống vận hành từ ngày đầu năm học, không phát sinh tiết dạy lịch sử trước vận hành.',
        primaryAction: { label: 'Xem trang Lịch sử giảng dạy', to: '/quan-tri/lich-su-giang-day' },
        secondaryAction: null,
        workflowSteps: this.defaultWorkflowSteps('HISTORICAL_TEACHING', true, true, true, true, true, false),
        stats: {
          delayedGoLiveApplies: false,
          batchCount: batches.length,
          historicalExecutionCount,
        },
      };
    }

    if (batches.length === 0) {
      findings.push({
        code: 'HISTORICAL_DATA_MISSING',
        severity: 'BLOCKER',
        message: `Hệ thống bắt đầu vận hành từ ngày ${opStartDate}. Cần nạp minh chứng các tiết dạy đã thực hiện trước ngày này.`,
      });
      return {
        key: 'HISTORICAL_TEACHING',
        label: 'Lịch sử giảng dạy',
        description: 'Dữ liệu giảng dạy trước thời điểm đưa hệ thống vào vận hành thực tế.',
        status: 'NOT_READY',
        statusLabel: 'Chưa nạp lịch sử',
        latestVersion: null,
        latestImport: null,
        findings,
        nextAction: 'Nạp dữ liệu giảng dạy lịch sử từ tệp CSV/TSV vào hệ thống.',
        primaryAction: { label: 'Nạp lịch sử giảng dạy', to: '/quan-tri/lich-su-giang-day' },
        secondaryAction: null,
        workflowSteps: this.defaultWorkflowSteps('HISTORICAL_TEACHING', false, false, false, false, false, false),
        stats: {
          delayedGoLiveApplies: true,
          operationalStartDate: opStartDate ?? null,
          batchCount: 0,
          historicalExecutionCount: 0,
        },
      };
    }

    return {
      key: 'HISTORICAL_TEACHING',
      label: 'Lịch sử giảng dạy',
      description: 'Dữ liệu giảng dạy trước thời điểm đưa hệ thống vào vận hành thực tế.',
      status: 'READY',
      statusLabel: 'Đã nạp minh chứng',
      latestVersion: null,
      latestImport: {
        batchRef: latestBatch.id,
        sourceFileName: 'Tệp minh chứng lịch sử',
        importedAt: latestBatch.createdAt.toISOString(),
        rowCount,
        importedBy: latestBatch.confirmedBy?.profile?.displayName ?? null,
      },
      findings: [],
      nextAction: `Đã nạp ${rowCount} tiết giảng dạy lịch sử. Kiểm tra đối chiếu khi cần.`,
      primaryAction: { label: 'Xem và đối chiếu lịch sử', to: '/quan-tri/lich-su-giang-day' },
      secondaryAction: null,
      workflowSteps: this.defaultWorkflowSteps('HISTORICAL_TEACHING', true, true, true, true, true, false),
      stats: {
        delayedGoLiveApplies: true,
        operationalStartDate: opStartDate ?? null,
        batchCount: batches.length,
        latestBatchRef: latestBatch.id,
        historicalExecutionCount,
      },
    };
  }

  private async evaluateGddp(yearId: string): Promise<DataReadinessDomainItem> {
    const gddpMasters = await this.prisma.programmeMaster.findMany({
      where: { kind: 'GDDP', academicYearId: yearId },
    });
    const masterIds = gddpMasters.map((m) => m.id);

    const [planVersions, occurrences] = await Promise.all([
      masterIds.length > 0
        ? this.prisma.programmePlanVersion.findMany({
            where: { programmeMasterId: { in: masterIds } },
            orderBy: [{ versionNumber: 'desc' }],
          })
        : [],
      masterIds.length > 0
        ? this.prisma.plannedProgrammeOccurrence.findMany({
            where: { programmeMasterId: { in: masterIds } },
            select: { id: true, programmeMasterId: true, status: true },
          })
        : [],
    ]);

    const latestPlanByMaster = new Map<string, typeof planVersions[0]>();
    for (const pv of planVersions) {
      if (!latestPlanByMaster.has(pv.programmeMasterId)) {
        latestPlanByMaster.set(pv.programmeMasterId, pv);
      }
    }

    const findings: DataReadinessFinding[] = [];

    if (gddpMasters.length === 0) {
      findings.push({
        code: 'NO_GDDP_PROGRAMME',
        severity: 'BLOCKER',
        message: 'Chưa có kế hoạch Giáo dục địa phương nào cho các khối 10, 11, 12.',
      });
      return {
        key: 'GDDP',
        label: 'Giáo dục địa phương (GDĐP)',
        description: 'Kế hoạch nội dung, phân công giáo viên và thời lượng Giáo dục địa phương theo khối.',
        status: 'NO_DATA',
        statusLabel: 'Chưa có dữ liệu',
        latestVersion: null,
        latestImport: null,
        findings,
        nextAction: 'Nhập kế hoạch GDĐP từ tệp Excel 5 cột tại phân hệ HĐTN-HN & GDĐP.',
        primaryAction: { label: 'Đến HĐTN-HN & GDĐP', to: '/quan-tri/chuong-trinh-dac-thu' },
        secondaryAction: null,
        workflowSteps: this.defaultWorkflowSteps('GDDP', false, false, false, false, false, false),
        stats: { totalMasters: 0, publishedCount: 0, draftCount: 0 },
      };
    }

    const presentGrades = new Set(gddpMasters.map((m) => m.gradeLevel));
    let publishedCount = 0;
    let draftCount = 0;
    for (const m of gddpMasters) {
      const plan = latestPlanByMaster.get(m.id);
      if (plan?.status === 'PUBLISHED') publishedCount++;
      if (plan?.status === 'DRAFT') draftCount++;
    }
    const missingGrades = [10, 11, 12].filter((g) => !presentGrades.has(g));

    let status: DataReadinessStatus = 'READY';
    let statusLabel = publishedCount === 3 && missingGrades.length === 0 ? 'Đã ban hành đầy đủ' : 'Đã ban hành';
    let nextAction = 'Kế hoạch GDĐP đã sẵn sàng cho cả 3 khối lớp.';

    if (draftCount > 0) {
      status = 'ATTENTION_REQUIRED';
      statusLabel = `Có ${draftCount} khối đang là bản nháp`;
      findings.push({
        code: 'GDDP_DRAFT_PENDING',
        severity: 'WARNING',
        message: `Có ${draftCount} khối lớp GDĐP đang ở bản nháp, cần ban hành kế hoạch.`,
      });
      nextAction = 'Ban hành các kế hoạch GDĐP đang ở trạng thái bản nháp.';
    } else if (missingGrades.length > 0) {
      status = 'NOT_READY';
      statusLabel = 'Thiếu khối lớp';
      findings.push({
        code: 'GDDP_MISSING_GRADES',
        severity: 'BLOCKER',
        message: `Chưa có kế hoạch GDĐP cho khối ${missingGrades.join(', ')}.`,
      });
      nextAction = 'Nhập bổ sung kế hoạch GDĐP cho các khối còn thiếu.';
    }

    const latestPlanVer = planVersions[0];

    return {
      key: 'GDDP',
      label: 'Giáo dục địa phương (GDĐP)',
      description: 'Kế hoạch nội dung, phân công giáo viên và thời lượng Giáo dục địa phương theo khối.',
      status,
      statusLabel,
      latestVersion: latestPlanVer
        ? {
            number: latestPlanVer.versionNumber,
            status: latestPlanVer.status,
            statusLabel: latestPlanVer.status === 'PUBLISHED' ? 'Đã ban hành' : 'Bản nháp',
            effectiveRange: null,
            updatedAt: latestPlanVer.updatedAt.toISOString(),
          }
        : null,
      latestImport: {
        batchRef: null,
        sourceFileName: 'Tệp GDĐP Excel 5 cột',
        importedAt: latestPlanVer?.createdAt?.toISOString() ?? null,
        rowCount: occurrences.length,
        importedBy: null,
      },
      findings,
      nextAction,
      primaryAction: { label: 'Đến HĐTN-HN & GDĐP', to: '/quan-tri/chuong-trinh-dac-thu' },
      secondaryAction: null,
      workflowSteps: this.defaultWorkflowSteps('GDDP', true, true, true, true, true, publishedCount === 3),
      stats: {
        totalMasters: gddpMasters.length,
        publishedCount,
        draftCount,
        missingGradesCount: missingGrades.length,
      },
    };
  }

  private async evaluateHdtn(yearId: string): Promise<DataReadinessDomainItem> {
    const hdtnMasters = await this.prisma.programmeMaster.findMany({
      where: { kind: 'HDTN_HN', academicYearId: yearId },
    });
    const masterIds = hdtnMasters.map((m) => m.id);

    const [planVersions, occurrences] = await Promise.all([
      masterIds.length > 0
        ? this.prisma.programmePlanVersion.findMany({
            where: { programmeMasterId: { in: masterIds } },
            orderBy: [{ versionNumber: 'desc' }],
          })
        : [],
      masterIds.length > 0
        ? this.prisma.plannedProgrammeOccurrence.findMany({
            where: { programmeMasterId: { in: masterIds } },
            select: { id: true, programmeMasterId: true, status: true },
          })
        : [],
    ]);

    const latestPlanByMaster = new Map<string, typeof planVersions[0]>();
    for (const pv of planVersions) {
      if (!latestPlanByMaster.has(pv.programmeMasterId)) {
        latestPlanByMaster.set(pv.programmeMasterId, pv);
      }
    }

    const findings: DataReadinessFinding[] = [];

    if (hdtnMasters.length === 0) {
      findings.push({
        code: 'NO_HDTN_PROGRAMME',
        severity: 'BLOCKER',
        message: 'Chưa có kế hoạch Hoạt động trải nghiệm, hướng nghiệp cho năm học này.',
      });
      return {
        key: 'HDTN_HN',
        label: 'Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)',
        description: 'Kế hoạch chuyên đề, quy mô hoạt động và phân công nhân sự HĐTN-HN.',
        status: 'NO_DATA',
        statusLabel: 'Chưa có dữ liệu',
        latestVersion: null,
        latestImport: null,
        findings,
        nextAction: 'Nhập kế hoạch HĐTN-HN từ tệp Excel 7 cột tại phân hệ HĐTN-HN & GDĐP.',
        primaryAction: { label: 'Đến HĐTN-HN & GDĐP', to: '/quan-tri/chuong-trinh-dac-thu' },
        secondaryAction: null,
        workflowSteps: this.defaultWorkflowSteps('HDTN_HN', false, false, false, false, false, false),
        stats: { totalMasters: 0, publishedCount: 0, draftCount: 0 },
      };
    }

    let publishedPlansCount = 0;
    let draftPlansCount = 0;
    for (const m of hdtnMasters) {
      const plan = latestPlanByMaster.get(m.id);
      if (plan?.status === 'PUBLISHED') publishedPlansCount++;
      if (plan?.status === 'DRAFT') draftPlansCount++;
    }

    let status: DataReadinessStatus = 'READY';
    let statusLabel = 'Đã ban hành';
    let nextAction = 'Kế hoạch HĐTN-HN đã sẵn sàng cho vận hành.';

    if (draftPlansCount > 0) {
      status = 'ATTENTION_REQUIRED';
      statusLabel = 'Bản nháp chưa ban hành';
      findings.push({
        code: 'HDTN_DRAFT_PENDING',
        severity: 'WARNING',
        message: 'Kế hoạch HĐTN-HN đang ở trạng thái bản nháp, cần ban hành để đưa vào lịch dạy.',
      });
      nextAction = 'Kiểm tra và ban hành kế hoạch HĐTN-HN.';
    } else if (publishedPlansCount === 0) {
      status = 'NOT_READY';
      statusLabel = 'Chưa ban hành';
      findings.push({
        code: 'HDTN_NOT_PUBLISHED',
        severity: 'BLOCKER',
        message: 'Kế hoạch HĐTN-HN chưa được ban hành chính thức.',
      });
      nextAction = 'Ban hành kế hoạch HĐTN-HN.';
    }

    const latestPlanVer = planVersions[0];

    return {
      key: 'HDTN_HN',
      label: 'Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)',
      description: 'Kế hoạch chuyên đề, quy mô hoạt động và phân công nhân sự HĐTN-HN.',
      status,
      statusLabel,
      latestVersion: latestPlanVer
        ? {
            number: latestPlanVer.versionNumber,
            status: latestPlanVer.status,
            statusLabel: latestPlanVer.status === 'PUBLISHED' ? 'Đã ban hành' : 'Bản nháp',
            effectiveRange: null,
            updatedAt: latestPlanVer.updatedAt.toISOString(),
          }
        : null,
      latestImport: {
        batchRef: null,
        sourceFileName: 'Tệp HĐTN-HN Excel 7 cột',
        importedAt: latestPlanVer?.createdAt?.toISOString() ?? null,
        rowCount: occurrences.length,
        importedBy: null,
      },
      findings,
      nextAction,
      primaryAction: { label: 'Đến HĐTN-HN & GDĐP', to: '/quan-tri/chuong-trinh-dac-thu' },
      secondaryAction: null,
      workflowSteps: this.defaultWorkflowSteps('HDTN_HN', true, true, true, true, true, publishedPlansCount > 0),
      stats: {
        totalMasters: hdtnMasters.length,
        publishedCount: publishedPlansCount,
        draftCount: draftPlansCount,
      },
    };
  }
}
