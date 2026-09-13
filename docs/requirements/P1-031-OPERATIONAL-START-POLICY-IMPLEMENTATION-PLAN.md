# Kế hoạch Triển khai P1-031 — Chính sách Bắt đầu Vận hành (Operational-Start Policy Implementation Plan)

## 1. Thẩm quyền và Nhiệm vụ Phụ thuộc (Authority & Dependencies)

- **Mã task:** `P1-031`
- **Tên task:** Operational-start policy implementation
- **Trạng thái:** `IN_PROGRESS`
- **Nhánh làm việc chuyên biệt (Dedicated Branch):** `feat/operational-start-policy-implementation-031`
- **Commit xuất phát chuẩn tắc (Starting Canonical Base):** `13a87538b38312a2dfb482c358b17ac23f4b2ee8`
- **Authoritative Baseline CI:** CI #438 (run id: `34730231091`) — SUCCESS
- **Nhiệm vụ tiền nhiệm bắt buộc (Dependencies):**
  - `P1-021` — Business Configuration persistence/control plane: **CLOSED** (đóng bởi `SYNC-P1-021`)
  - `P1-030` — Delayed go-live / operational-start architecture: **CLOSED** (đóng bởi `SYNC-P1-030`)
  - `P2-003` — Component-aware PPCT allocation and curricular projections: **CLOSED** (đóng bởi `SYNC-P2-003`)
- **Ma trận truy vết (Traceability Matrix):** `T28`, `T30`
- **Quyết định kiến trúc kiểm soát (Controlling Decisions):**
  - `docs/decisions/ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md` (Accepted)
  - `docs/decisions/ADR-046-BUSINESS-CONFIGURATION-CONTROL-PLANE.md` (Accepted)
- **Tài liệu yêu cầu chuẩn tắc:** `docs/requirements/P1-030-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md`
- **Thẩm quyền Product Owner bất biến:** PO-1 (tiến trình PPCT replay TKB), PO-2 (không giá trị mặc định ngầm / fail-closed khi thiếu chính sách), PO-3 (ranh giới thống nhất cho chính khóa, tham chiếu cho P4), PO-4 (không tạo cờ trạng thái toàn cục).

---

## 2. Điểm Nối Mã Nguồn Hiện Hữu Chuẩn xác (Exact Current Code Seams)

1. **Đăng ký Policy Family:**
   - File: `apps/api/src/business-configuration/business-policy-registry.ts`
   - `PRODUCTION_BUSINESS_POLICY_FAMILIES`: Hiện tại là mảng rỗng `[]`. Không có bất kỳ mock policy nào trong production registry (các family test gồm `TEST_BOOLEAN_THRESHOLD` và `TEST_ACADEMIC_YEAR_CONFIG` nằm riêng tại `apps/api/test/business-configuration/test-business-policy-registry.ts`).
   - Cấu trúc chuẩn của `BusinessPolicyFamilyDefinition`:
     - `key: string`
     - `resourceKind: BusinessConfigurationResource['kind']`
     - `currentValidatorVersion: string`
     - `validators: readonly BusinessPolicyPayloadValidator[]`
     - `publicationEnabled: boolean`
     - `downstreamAuthority: string`
   - Tuyệt đối không có các trường phát minh như `familyKey`, `validatorVersion`, `defaultStatus`, hay `validator`.

2. **Xác thực và Quản lý Vòng đời Chính sách:**
   - File: `apps/api/src/business-configuration/business-configuration.service.ts`
   - Tên chính xác của các phương thức hiện hành:
     - `createDraft(dto, actor, meta)`
     - `editDraft(id, dto, actor, meta)`
     - `publish(id, dto, actor, meta)`
     - `replace(id, dto, actor, meta)`
     - `retire(id, dto, actor, meta)`
     - `correct(id, dto, actor, meta)`
     - `resolveEffectiveBusinessPolicy(familyKey, resource, civilDate, db)`
   - Cần bổ sung các kiểm tra vòng đời chuyên biệt cho `OPERATIONAL_START` tại các phương thức này:
     - `retire`: Bị từ chối ngay lập tức (`BadRequestException('OPERATIONAL_START_RETIRE_FORBIDDEN')`).
     - `publish`: Kiểm tra `effectiveFrom <= operationalStartDate` và tính hợp lệ với lịch năm học.
     - `replace`: Chỉ cho phép khi `businessCivilDate() < currentOperationalStartDate`, mốc mới phải lớn hơn ngày hiện tại, đảm bảo tính liên tục (no gap).
     - `correct`: Cho phép sửa đổi khi mốc đã qua hoặc cần điều chỉnh sự thật lịch sử, yêu cầu lý do và bảo tồn phả hệ.

3. **Thẩm quyền Lịch Năm học Chuẩn tắc:**
   - File: `prisma/schema.prisma` (`AcademicCalendarVersion`), các pattern hiện hữu tại `apps/api/src/homeroom-assignments/homeroom-assignment-policy.ts` và `apps/api/src/teaching-assignments/teaching-assignment-policy.ts`.
   - Seam: Truy vấn `academicCalendarVersion` với điều kiện `{ where: { academicYearId, isActive: true } }`. Yêu cầu đúng 1 phiên bản active; kiểm tra `startDate <= operationalStartDate <= endDate`. Nếu thiếu, mơ hồ hoặc vi phạm khoảng lịch: fail-closed với `BadRequestException`.

4. **Thẩm quyền Ngày Dân sự Máy chủ Sở hữu (Shared HCM Civil Date Authority):**
   - Hiện trạng:
     - `BusinessConfigurationService.businessCivilDate()` sử dụng `Asia/Ho_Chi_Minh` lấy trực tiếp `new Date()`.
     - `progress-debt.policy.ts` có `hcmCivilDate(instant: Date)`.
   - Phương án P1-031: Đưa helper chuyển đổi chuẩn sang vị trí dùng chung `apps/api/src/common/validation/civil-date.ts` nhận tham số `instant: Date` (mặc định là `new Date()`), định dạng bằng `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })`.
   - Các consumer tái sử dụng:
     - `BusinessConfigurationService.businessCivilDate()` ủy quyền tới helper dùng chung;
     - `ProgressDebt` tái sử dụng helper;
     - `ReportingStatementsService.submit` dùng helper với pinned `asOf` instant;
     - `TeachingExecutionsService` dùng cùng helper khi cần.
   - Tuyệt đối không tạo phụ thuộc ngược `BusinessConfiguration` / `ReportingStatement` sang `progress-debt` chỉ để lấy ngày dân sự.
   - Tuyệt đối không dùng `toISOString().slice(0, 10)` để suy ra ngày dân sự máy chủ từ một thời điểm (`instant`). (Lưu ý: `toISOString().slice(0, 10)` chỉ tồn tại hợp lệ khi định dạng trường PostgreSQL DATE đã lưu ở UTC midnight).

5. **Bộ Giải quyết Chính sách (Resolver / Read Authority):**
   - File: `apps/api/src/business-configuration/business-configuration.service.ts`
   - Phương thức hiện hữu: `resolveEffectiveBusinessPolicy(familyKey, resource, civilDate, db)`.
   - Cung cấp typed helper chuyên trách:
     ```typescript
     async resolveOperationalStartPolicy(
       academicYearId: string,
       civilDate: string,
       db: Db = this.prisma,
     ): Promise<{
       operationalStartDate: CivilDateString;
       policyVersionId: string;
       validatorVersion: string;
       academicYearId: string;
       effectiveFrom: CivilDateString;
       effectiveUntil: CivilDateString | null;
     }>
     ```
   - Transaction-aware nhận `db: Prisma.TransactionClient | PrismaService`. Fail-closed triệt để nếu `POLICY_NOT_CONFIGURED`, `POLICY_AMBIGUOUS`, `POLICY_CORRUPT`, `INVALID_POLICY_RESOURCE` hoặc `INVALID_EFFECTIVE_DATE`.

6. **Tiến trình PPCT và Phân bổ Cơ hội:**
   - File: `apps/api/src/ppct-occurrence-allocation/ppct-occurrence-allocation.service.ts`
   - Bảo toàn 100% thuật toán replay TKB lịch sử của `PpctOccurrenceAllocationService`. Không lọc allocator. Không restart sequence 1. Toàn bộ các cơ hội TKB định kỳ trong giai đoạn tiền vận hành vẫn được phát lại đầy đủ để xác định tiến độ PPCT kỳ vọng kế tục liền mạch cho ngày bắt đầu vận hành.

7. **Đánh giá Tiến độ, Nợ tiết và Trễ hạn (Progress & Debt Boundary):**
   - File: `apps/api/src/progress-debt/progress-debt.service.ts` (`resolve`, `resolveV2`, `resolveInTransaction`, `resolveInTransactionV2`)
   - File: `apps/api/src/progress-debt/progress-debt.types.ts` (`ProgressDebtClassification`, `ProgressDebtCounts`)
   - Giữ nguyên `ProgressDebtClassification = 'COMPLETED' | 'PROVEN_OPEN_DEBT' | 'UNCONFIRMED_COMPLETION_GAP'`.
   - Giữ nguyên `ProgressDebtCounts`: `distributedElapsedCount`, `completedCount`, `openDebtCount`, `lateCount`, `unconfirmedGapCount`.
   - Giải quyết chính sách `OPERATIONAL_START` cho năm học.
   - Đối với các cơ hội giảng dạy có `sourceCivilDate < operationalStartDate`:
     - Nếu có bản ghi thực thi hợp lệ (ended ACTIVE execution candidate đã đối soát): vẫn emit `COMPLETED` bình thường vào `items`.
     - Nếu bằng chứng thực thi bị trùng lặp hoặc sai hỏng: vẫn fail-closed với finding tương ứng (`ACTIVE_FULFILLMENT_AMBIGUOUS`, `RECONCILIATION_REQUIRED`).
     - Nếu KHÔNG có bản ghi thực thi: trạng thái kiến trúc nội bộ là `PRE_OPERATIONAL_UNCONFIRMED` -> **KHÔNG emit item operational vào returned `items`**, **KHÔNG tạo `PROVEN_OPEN_DEBT`**, **KHÔNG tạo `UNCONFIRMED_COMPLETION_GAP`**, **KHÔNG tăng `openDebtCount`**, **KHÔNG tăng `lateCount`**, **KHÔNG tăng `unconfirmedGapCount`**.
     - Các sự kiện vận hành tiêu cực tiền vận hành (như `ABSENCE_NO_REPLACEMENT`) khi không có bản ghi thực thi cũng không tự động biến thành nợ vận hành chính thức.
   - Đối với các cơ hội giảng dạy có `sourceCivilDate >= operationalStartDate`: giữ nguyên toàn bộ ngữ nghĩa phân loại và đếm hiện hành.
   - Bảo toàn đẳng thức đếm:
     `distributedElapsedCount = completedCount + openDebtCount + unconfirmedGapCount`
     `lateCount = openDebtCount`.
   - `distributedElapsedCount` trong phép chiếu này đại diện cho số obligation/item được phát hành vào operational progress/debt projection sau khi áp dụng operational-start boundary (bao gồm cả tiết `COMPLETED` lịch sử nếu có minh chứng hợp lệ).

8. **Cổng Lệnh Xác nhận Thực thi Giảng dạy:**
   - File: `apps/api/src/teaching-executions/teaching-executions.service.ts` (`confirmNormalTx`, `confirmMakeupTx`)
   - Routes: `POST /teaching-executions/curricular/normal` và `POST /teaching-executions/curricular/makeup`.
   - **Thẩm quyền mốc giải quyết chính sách (Policy Resolution Anchor):**
     - Luôn sử dụng thời điểm nhận lệnh của máy chủ: `const commandNow = this.clock.now()`.
     - Quy đổi sang ngày dân sự chuẩn HCM: `const policyResolutionCivilDate = hcmCivilDate(commandNow)`.
     - Giải quyết chính sách: `resolveOperationalStartPolicy(academicYearId, policyResolutionCivilDate, tx)`.
     - `sourceCivilDate` (đối với NORMAL) và `originalCivilDate` (đối với MAKEUP) là **BUSINESS OBLIGATION DATE**, KHÔNG PHẢI mốc giải quyết chính sách. Tuyệt đối không giải quyết policy version riêng cho từng occurrence date.
   - `confirmNormalTx`: Sau khi vượt qua kiểm tra idempotent replay (`curricularReplay`), capture `commandNow` một lần, resolve `OPERATIONAL_START` tại `policyResolutionCivilDate`. Nếu `dto.sourceCivilDate < operationalStartDate`: fail-closed với `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION')`. Tái sử dụng `commandNow` cho `assertEnded(...)`.
   - `confirmMakeupTx`: Sau khi vượt qua idempotent replay và xác định lịch bù ACTIVE, capture `commandNow` một lần, resolve `OPERATIONAL_START` tại `policyResolutionCivilDate = hcmCivilDate(commandNow)`. Lấy ngày nghĩa vụ gốc `originalCivilDate = formatCivilDate(m.originalCivilDate)`. Nếu `originalCivilDate < operationalStartDate`: fail-closed với `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION')`. Không cho phép dùng ngày dạy bù thực tế (`targetCivilDate`) để lách ranh giới nghĩa vụ tiền vận hành. Tái sử dụng `commandNow` cho `assertEnded(...)`.

9. **Đóng băng Báo cáo Thống kê Tiết dạy và Nguồn gốc (Provenance):**
   - File: `apps/api/src/reporting-statements/reporting-statements.service.ts` (`submit`)
   - File: `apps/api/src/reporting-statement-internal/reporting-statement-canonicalizer.ts`
   - File: `apps/api/src/reporting-statements/reporting-statement.presenter.ts`
   - Fact chuẩn xác: Trong `submit()`, mốc `const asOf = this.clock.now();` được ghim trước `return this.retry(...)`, và exact `asOf` được tái sử dụng trong `projection.resolveInTransaction`, `freezeReportingStatementSnapshot`, và kết quả `asOfInstant`. Không có `statement.cutoffInstant ?? now`.
   - Tính toán `policyResolutionCivilDate = hcmCivilDate(asOf)` và resolve `OPERATIONAL_START` trong transaction.
   - Lưu trữ thật trong DB: Bảng `reporting_statement_revisions` gồm `snapshotProfile`, `serializerVersion`, `canonicalSnapshotJson` (Text), `semanticHash`, `asOfInstant`. Không có cột `snapshotData JSON`.
   - Để bảo đảm tính tương thích ngược (backward compatibility) và tính toàn vẹn fail-closed:
     - Các bản ghi nộp trong quá khứ với profile `REPORTING_STATEMENT_SNAPSHOT_V1` tiếp tục được đọc và xác thực nguyên vẹn;
     - Các bản ghi mới sau P1-031 sử dụng profile `REPORTING_STATEMENT_SNAPSHOT_V2` mang thêm 2 trường provenance: `operationalStartPolicyVersionId` và `operationalStartDate`;
     - `serializerVersion` giữ nguyên `REPORTING_STATEMENT_CANONICAL_JSON_V1` vì thuật toán tuần tự hóa JSON chuẩn tắc không đổi;
     - `statementProfile` giữ nguyên `PERSONAL_REPORTING_STATEMENT_PROFILE` (`PERSONAL_V1`);
     - Presenter và canonicalizer hỗ trợ cả V1 và V2 theo cơ chế kiểm tra toàn vẹn tương ứng từng profile.
   - Vì pre-op unconfirmed không được emit từ `ProgressDebtService`, toàn bộ chuỗi hợp đồng downstream (`ReportingProjectionService`, `PersonalReportingProjectionService`, `packages/contracts`, và Web UI `ReportingPresentation.tsx`) **HOÀN TOÀN KHÔNG CẦN THAY ĐỔI** phân loại hay đếm.

---

## 3. Kế hoạch Thay đổi Từng Tệp (File-Level Change Plan)

### A. Tầng Hợp đồng và Định nghĩa Family (Contracts & Registry)
1. `apps/api/src/common/validation/civil-date.ts`:
   - Bổ sung helper dùng chung: `hcmCivilDate(instant: Date = new Date()): CivilDateString` sử dụng `Intl.DateTimeFormat` với múi giờ `Asia/Ho_Chi_Minh`.
2. `apps/api/src/business-configuration/business-policy-registry.ts`:
   - Định nghĩa `OPERATIONAL_START_FAMILY_DEFINITION`:
     - `key = 'OPERATIONAL_START'`
     - `resourceKind = 'ACADEMIC_YEAR'`
     - `currentValidatorVersion = 'v1'`
     - `publicationEnabled = true`
     - `downstreamAuthority = 'docs/decisions/ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md'`
     - `validators`: mảng chứa validator `v1`.
   - Validator `v1` (pure synchronous validator):
     - Dùng `strictObject(payload)` hiện có.
     - Kiểm tra `Object.keys(row).length === 1 && typeof row.operationalStartDate === 'string'`.
     - Xác thực bằng `isCivilDate(row.operationalStartDate)` từ `civil-date.ts`.
     - Bắt lỗi: ném `BadRequestException('Business policy payload phải chứa đúng 1 trường operationalStartDate dạng YYYY-MM-DD.')`. Không dùng hoặc nhắc tới `BusinessPolicyValidationError`.
   - Đưa `OPERATIONAL_START_FAMILY_DEFINITION` vào `PRODUCTION_BUSINESS_POLICY_FAMILIES`.

### B. Tầng Kiểm soát Vòng đời và Thẩm quyền Lịch (Business Configuration Service)
3. `apps/api/src/business-configuration/business-configuration.service.ts`:
   - Cập nhật `businessCivilDate()` ủy quyền tới `hcmCivilDate()`.
   - Bổ sung helper nội bộ: `validateOperationalStartCalendar(tx, academicYearId, operationalStartDate)`.
   - Cập nhật các phương thức vòng đời hiện hành:
     - `createDraft`: Nếu là `OPERATIONAL_START`, kiểm tra tính hợp lệ của `operationalStartDate` với lịch active của năm học.
     - `editDraft`: Nếu là `OPERATIONAL_START`, kiểm tra `operationalStartDate` với lịch active.
     - `publish`: Nếu là `OPERATIONAL_START`, kiểm tra `effectiveFrom <= operationalStartDate` và kiểm tra lịch active.
     - `replace`: Nếu là `OPERATIONAL_START`, kiểm tra `this.businessCivilDate() < currentOperationalStartDate`, mốc mới phải `> this.businessCivilDate()`, kiểm tra lịch active, đảm bảo liên tục hiệu lực.
     - `retire`: Nếu là `OPERATIONAL_START`, ném ngay `BadRequestException('OPERATIONAL_START_RETIRE_FORBIDDEN')`.
     - `correct`: Nếu là `OPERATIONAL_START`, kiểm tra lịch active, bắt buộc có lý do và bảo lưu lineage.
   - Bổ sung typed helper: `resolveOperationalStartPolicy(academicYearId, civilDate, db)`.

### C. Tầng Tiến độ và Nợ tiết (Progress & Debt)
4. `apps/api/src/progress-debt/progress-debt.policy.ts`:
   - Ủy quyền `hcmCivilDate` sang helper dùng chung trong `civil-date.ts`.
5. `apps/api/src/progress-debt/progress-debt.types.ts`:
   - Giữ nguyên `ProgressDebtClassification = 'COMPLETED' | 'PROVEN_OPEN_DEBT' | 'UNCONFIRMED_COMPLETION_GAP'`.
   - Giữ nguyên `ProgressDebtCounts` (không thêm trường mới).
6. `apps/api/src/progress-debt/progress-debt.service.ts`:
   - Inject `BusinessConfigurationService`.
   - Trong `resolveInTransaction` và `resolveInTransactionV2`:
     - Resolve `OPERATIONAL_START` của `academicYearId` tại ngày `throughCivilDate`. Nếu không có hoặc lỗi -> fail-closed.
     - Với mỗi allocation:
       - Nếu `occurrence.civilDate < operationalStartDate`:
         - Nếu có execution candidate kết thúc hợp lệ: reconcile và emit `COMPLETED`.
         - Nếu execution candidate bị mơ hồ/sai hỏng: fail-closed với finding tương ứng.
         - Nếu KHÔNG có execution candidate: coi là `PRE_OPERATIONAL_UNCONFIRMED` nội bộ -> không emit item operational vào `items`.
       - Nếu `occurrence.civilDate >= operationalStartDate`:
         - Giữ nguyên quy trình phân loại: `COMPLETED`, `PROVEN_OPEN_DEBT`, `UNCONFIRMED_COMPLETION_GAP`.
     - Tính `counts` trên tập `items` đã emit:
       - `distributedElapsedCount = items.length`
       - `completedCount = items.filter(i => i.classification === 'COMPLETED').length`
       - `openDebtCount = items.filter(i => i.classification === 'PROVEN_OPEN_DEBT').length`
       - `lateCount = items.filter(i => i.classification === 'PROVEN_OPEN_DEBT').length`
       - `unconfirmedGapCount = items.filter(i => i.classification === 'UNCONFIRMED_COMPLETION_GAP').length`
     - Bất biến đếm hiện hành `distributedElapsedCount === completedCount + openDebtCount + unconfirmedGapCount` được bảo toàn tuyệt đối.

### D. Tầng Xác nhận Thực thi (Teaching Executions)
7. `apps/api/src/teaching-executions/teaching-executions.service.ts`:
   - Inject `BusinessConfigurationService`.
   - Trong `confirmNormalTx`:
     - Giữ `curricularReplay(...)` ở bước đầu tiên. Chỉ thực thi policy guard đối với các mutation mới.
     - Capture `const commandNow = this.clock.now()`.
     - Xác định `policyResolutionCivilDate = hcmCivilDate(commandNow)`.
     - Resolve `OPERATIONAL_START` của `dto.academicYearId` tại `policyResolutionCivilDate` theo transaction `tx`.
     - Nếu `dto.sourceCivilDate < operationalStartDate`: ném `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION')`.
     - Dùng cùng `commandNow` cho `assertEnded(...)`.
   - Trong `confirmMakeupTx`:
     - Giữ `curricularReplay(...)` ở bước đầu tiên.
     - Sau khi load và kiểm tra `makeupTeachingSchedule m` ACTIVE, capture `const commandNow = this.clock.now()`.
     - Xác định `policyResolutionCivilDate = hcmCivilDate(commandNow)`.
     - Resolve `OPERATIONAL_START` của `m.academicYearId` tại `policyResolutionCivilDate` theo transaction `tx`.
     - Lấy ngày nghĩa vụ gốc `originalCivilDate = formatCivilDate(m.originalCivilDate)`.
     - Nếu `originalCivilDate < operationalStartDate`: ném `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION')`.
     - Dùng cùng `commandNow` cho `assertEnded(...)`.

### E. Tầng Đóng băng Báo cáo (Reporting Statements)
8. `apps/api/src/reporting-statement-internal/reporting-statement-canonicalizer.ts`:
   - Định nghĩa snapshot profile mới: `export const REPORTING_STATEMENT_SNAPSHOT_V2 = 'REPORTING_STATEMENT_SNAPSHOT_V2' as const;`
   - Định nghĩa `ReportingStatementSnapshotV2` kế thừa/mở rộng các trường của V1, bổ sung:
     - `operationalStartPolicyVersionId: string`
     - `operationalStartDate: string`
   - Cập nhật `freezeReportingStatementSnapshot` sinh `REPORTING_STATEMENT_SNAPSHOT_V2` cho các lệnh submit mới.
   - Cập nhật `assertFrozenReportingStatementIntegrity` hỗ trợ xác thực fail-closed cả V1 và V2.
9. `apps/api/src/reporting-statements/reporting-statement.presenter.ts`:
   - Cập nhật `parseAndVerifyFrozenSnapshot` hỗ trợ parse và xác thực toàn vẹn cả `REPORTING_STATEMENT_SNAPSHOT_V1` và `REPORTING_STATEMENT_SNAPSHOT_V2`.
10. `apps/api/src/reporting-statements/reporting-statements.service.ts`:
    - Trong `submit`:
      - Dùng `policyResolutionCivilDate = hcmCivilDate(asOf)`.
      - Resolve `OPERATIONAL_START` theo giao dịch `tx`.
      - Truyền `operationalStartPolicyVersionId` và `operationalStartDate` vào `freezeReportingStatementSnapshot`.

---

## 4. Ranh giới Giao dịch (Transaction Boundaries)

- Tất cả các thao tác ghi dữ liệu (`createDraft`, `editDraft`, `publish`, `replace`, `retire`, `correct`, `confirmNormalTx`, `confirmMakeupTx`, `submit`) đều thực thi trong giao dịch cô lập cấp cao nhất của PostgreSQL (`Serializable`).
- Việc đọc và giải quyết chính sách (`resolveEffectiveBusinessPolicy`) nhận trực tiếp client giao dịch `tx` để bảo đảm dữ liệu đọc được không bị chênh lệch hoặc trôi dạt trong cùng chu trình xử lý.
- Mốc thời gian `asOfInstant` được khóa cố định trước vòng lặp thử lại giao dịch (`const asOf = this.clock.now()`), đảm bảo mọi lần retry đều sử dụng cùng một mốc thời gian và cùng ngày dân sự giải quyết chính sách.

---

## 5. Phân tách Xác thực Payload và Kiểm tra Lịch Năm học (Policy Validator / Calendar Validation Split)

- **Pure Payload Validator (Đồng bộ, không phụ thuộc DB):**
  - Thực thi trong `BusinessPolicyPayloadValidator.validate(payload)`.
  - Kiểm tra tính nguyên vẹn về mặt cú pháp: đối tượng nghiêm ngặt (`strictObject`), chỉ chứa duy nhất trường `operationalStartDate`, chuỗi ngày dân sự ISO hợp lệ (`isCivilDate`).
  - Ném `BadRequestException` khi sai lệch cú pháp. Không sử dụng và không phát minh class lỗi riêng.
- **Calendar-Dependent Validation (Bất đồng bộ, phụ thuộc DB):**
  - Thực thi trong `BusinessConfigurationService` tại các lệnh thay đổi trạng thái hoặc tạo mới phiên bản.
  - Sử dụng `tx` để kiểm tra:
    1. Phiên bản lịch `AcademicCalendarVersion` đang `isActive = true` của năm học.
    2. Nếu không có hoặc có nhiều hơn 1 phiên bản lịch: fail-closed với `BadRequestException('ACADEMIC_CALENDAR_VERSION_INVALID')`.
    3. Kiểm tra `startDate <= operationalStartDate <= endDate`. Nếu vi phạm: `BadRequestException('OPERATIONAL_START_DATE_OUTSIDE_CALENDAR')`.

---

## 6. Kế hoạch Kiểm soát Vòng đời Đặc thù (Lifecycle Enforcement Plan)

Áp dụng cho family `OPERATIONAL_START` tại các phương thức của `BusinessConfigurationService`:
1. **Lệnh `retire`:** Bị từ chối triệt để. Ném `BadRequestException('OPERATIONAL_START_RETIRE_FORBIDDEN')`.
2. **Lệnh `publish` (Chỉ cho phép thẩm quyền đầu tiên):**
   - Chỉ được phép thiết lập thẩm quyền ban đầu (`initial-publish-only`). Sau khi luồng đã từng có phiên bản `PUBLISHED` hoặc `REVERSED`, mọi lệnh direct publish tiếp theo trên cùng luồng đều bị từ chối với `BadRequestException('OPERATIONAL_START_DIRECT_PUBLISH_AFTER_AUTHORITY_FORBIDDEN')` (phải đi qua `replace` hoặc `correct`).
   - Bắt buộc kiểm tra `effectiveFrom <= operationalStartDate`. Nếu vi phạm: ném `BadRequestException('OPERATIONAL_START_INITIAL_PUBLICATION_INVALID')`.
   - Không cho phép khoảng trống hiệu lực sau khi luồng đã được xuất bản.
3. **Lệnh `replace` (Thay thế tương lai):**
   - Chỉ được phép khi `this.businessCivilDate() < currentOperationalStartDate`. Nếu ngày hiện tại đã `>= currentOperationalStartDate`: ném `BadRequestException('OPERATIONAL_START_REPLACE_AFTER_BOUNDARY_FORBIDDEN')`.
   - Mốc `operationalStartDate` mới phải lớn hơn ngày dân sự máy chủ hiện tại (`newOperationalStartDate > this.businessCivilDate()`).
   - Mốc `operationalStartDate` mới phải nằm trong khoảng thời gian của lịch năm học active duy nhất (`startDate <= newOperationalStartDate <= endDate`), nếu vi phạm ném `BadRequestException('OPERATIONAL_START_DATE_OUTSIDE_CALENDAR')` hoặc `BadRequestException('ACADEMIC_CALENDAR_VERSION_INVALID')`.
   - Ngày hiệu lực thay thế phải liên tục với ngày kết thúc của phiên bản trước (không tạo gap).
4. **Lệnh `correct` (Điều chỉnh có lưu vết):**
   - Được phép cả khi mốc `operationalStartDate` đã trôi qua trong quá khứ hoặc cần sửa sai dữ liệu.
   - Bắt buộc nhập `reason`, lưu trữ `correctsVersionId`, chuyển trạng thái phiên bản cũ sang `REVERSED`.
   - Bắt buộc giữ nguyên khoảng hiệu lực `effectiveFrom` / `effectiveUntil` của phiên bản gốc, không cho phép mở gap hay thay đổi khoảng hiệu lực qua correction; nếu vi phạm ném `BadRequestException('OPERATIONAL_START_CORRECTION_EFFECTIVITY_CHANGE_FORBIDDEN')`.
   - Mốc `operationalStartDate` sau điều chỉnh phải nằm trong lịch active duy nhất của năm học.

---

## 7. Kế hoạch Tích hợp Resolver và Thẩm quyền Đọc (Resolver Plan)

- Bổ sung helper trong `BusinessConfigurationService`:
  ```typescript
  async resolveOperationalStartPolicy(
    academicYearId: string,
    civilDate: string,
    db: Db = this.prisma,
  ): Promise<{
    operationalStartDate: CivilDateString;
    policyVersionId: string;
    validatorVersion: string;
    academicYearId: string;
    effectiveFrom: CivilDateString;
    effectiveUntil: CivilDateString | null;
  }>
  ```
- Helper gọi `resolveEffectiveBusinessPolicy('OPERATIONAL_START', { kind: 'ACADEMIC_YEAR', academicYearId }, civilDate, db)`.
- Nếu kết quả trả về:
  - `RESOLVED`: trả về kết quả đã bóc tách typed payload `{ operationalStartDate }`.
  - `POLICY_NOT_CONFIGURED`: ném `ConflictException('POLICY_NOT_CONFIGURED')`.
  - `POLICY_AMBIGUOUS`: ném `ConflictException('POLICY_AMBIGUOUS')`.
  - `POLICY_CORRUPT`: ném `ConflictException('POLICY_CORRUPT')`.
  - `INVALID_POLICY_RESOURCE`: ném `BadRequestException('INVALID_POLICY_RESOURCE')`.
  - `INVALID_EFFECTIVE_DATE`: ném `BadRequestException('INVALID_EFFECTIVE_DATE')`.
- Ngăn chặn hoàn toàn việc fallback hay đoán nhận giá trị mặc định ngầm.

---

## 8. Kế hoạch Tích hợp Đánh giá Nợ tiết và Tiến trình PPCT (Progress/Debt Integration Plan)

- **Giữ nguyên 100% thuật toán replay của `PpctOccurrenceAllocationService`**: Chuỗi các bài học PPCT trong giai đoạn tiền vận hành vẫn được phát lại đầy đủ để tính đúng bài học kế tiếp cho ngày bắt đầu vận hành. Không lọc allocator.
- **Biểu diễn kỹ thuật của `PRE_OPERATIONAL_UNCONFIRMED`**:
  - Là trạng thái đánh giá kiến trúc nội bộ (architectural / internal evaluation state) tại `ProgressDebtService`.
  - **KHÔNG** thêm vào `ProgressDebtClassification`.
  - **KHÔNG** thêm vào `ReportingProgressDebtClassification`.
  - **KHÔNG** thêm `preOperationalUnconfirmedCount` vào `ProgressDebtCounts` hay `ReportingCounts`.
  - **KHÔNG** thay đổi schema cơ sở dữ liệu hay Postgres enum.
  - **KHÔNG** thay đổi Web UI `ReportingPresentation.tsx`.
- **Cơ chế xử lý tại `ProgressDebtService`**:
  - Đối với các cơ hội TKB có `sourceCivilDate < operationalStartDate`:
    - Nếu có minh chứng giảng dạy hợp lệ (ACTIVE ended execution candidate): vẫn emit item `COMPLETED`.
    - Nếu minh chứng giảng dạy bị xung đột/sai hỏng: fail-closed với finding tương ứng.
    - Nếu không có minh chứng: coi là `PRE_OPERATIONAL_UNCONFIRMED` nội bộ -> **không emit item** vào returned `items`, không tạo nợ, không tạo trễ hạn, không tạo gap.
    - Negative disposition tiền vận hành (ví dụ: `ABSENCE_NO_REPLACEMENT`) không có minh chứng cũng không biến thành `PROVEN_OPEN_DEBT`.
  - Đối với các cơ hội có `sourceCivilDate >= operationalStartDate`: áp dụng đầy đủ quy tắc hiện hành (`COMPLETED`, `PROVEN_OPEN_DEBT`, `UNCONFIRMED_COMPLETION_GAP`).
- **Bảo toàn bất biến hợp đồng đếm**:
  - `distributedElapsedCount = completedCount + openDebtCount + unconfirmedGapCount`.
  - `lateCount = openDebtCount`.
  - Không làm vỡ downstream reconciliation tại `PersonalReportingProjectionService.count(...)`.

---

## 9. Kế hoạch Tích hợp Lệnh Xác nhận Thực thi (Execution Commands Integration Plan)

- Bảo toàn thứ tự: Idempotent replay (`curricularReplay`) luôn chạy trước tiên. Policy guard chỉ áp dụng cho mutation mới khi không tìm thấy retained execution record.
- **Thẩm quyền thời điểm lệnh (Command-Time Authority):**
  - Khóa `const commandNow = this.clock.now()`.
  - Tính `policyResolutionCivilDate = hcmCivilDate(commandNow)`.
  - Tái sử dụng `commandNow` cho cả giải quyết chính sách và kiểm tra kết thúc tiết (`assertEnded`).
- Trong `TeachingExecutionsService.confirmNormalTx`:
  - Sau replay check, resolve `OPERATIONAL_START` cho `dto.academicYearId` tại `policyResolutionCivilDate` theo transaction `tx`.
  - So sánh ngày nghĩa vụ giảng dạy: nếu `dto.sourceCivilDate < operationalStartDate`: ném `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION')`.
  - Nếu `dto.sourceCivilDate >= operationalStartDate`: cho phép tiếp tục flow phân bổ và tạo execution.
- Trong `TeachingExecutionsService.confirmMakeupTx`:
  - Sau replay check và kiểm tra schedule `m` ACTIVE, resolve `OPERATIONAL_START` cho `m.academicYearId` tại `policyResolutionCivilDate` theo transaction `tx`.
  - Lấy ngày nghĩa vụ gốc: `originalCivilDate = formatCivilDate(m.originalCivilDate)`.
  - So sánh: nếu `originalCivilDate < operationalStartDate`: ném `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION')`.
  - Quy tắc này áp dụng tuyệt đối kể cả khi ngày dạy bù thực tế `targetCivilDate >= operationalStartDate`. Không cho phép dùng ngày bù để lách ranh giới nghĩa vụ tiền vận hành.
- Bảo tồn toàn bộ quyền đọc (`read`) và đảo ngược (`reverse`) đối với các bản ghi thực thi đã tồn tại mà không yêu cầu giải quyết chính sách mốc vận hành.
- Không áp dụng kiểm tra `OPERATIONAL_START` cho `confirmActivity` (phân hệ `P4` sở hữu SpecialActivity).

---

## 10. Kế hoạch Lưu vết Báo cáo Thống kê Bất biến (ReportingStatement Provenance Plan)

- Trong `ReportingStatementsService.submit`:
  - Ghim `asOf = this.clock.now()` trước transaction retry.
  - Tính `policyResolutionCivilDate = hcmCivilDate(asOf)`.
  - Resolve `OPERATIONAL_START` theo transaction `tx`.
  - Truyền `operationalStartPolicyVersionId` và `operationalStartDate` vào hàm đóng băng snapshot.
- Mô hình lưu trữ:
  - Bảng `reporting_statement_revisions` lưu trữ chuỗi JSON chuẩn tắc trong cột `canonical_snapshot_json` (kiểu `Text`), cùng các trường metadata `snapshotProfile`, `serializerVersion`, `semanticHash`, `asOfInstant`.
  - Versioning:
    - Báo cáo cũ tiếp tục giữ profile `REPORTING_STATEMENT_SNAPSHOT_V1`.
    - Báo cáo mới dùng profile `REPORTING_STATEMENT_SNAPSHOT_V2`.
    - `serializerVersion` giữ nguyên `REPORTING_STATEMENT_CANONICAL_JSON_V1` (thuật toán canonical serialize không đổi).
    - `statementProfile` giữ nguyên `PERSONAL_REPORTING_STATEMENT_PROFILE` (`PERSONAL_V1`).
  - Presenter hỗ trợ đọc cả V1 và V2 fail-closed, kiểm tra hash SHA-256 tương ứng.
  - Không cần thêm bất kỳ count hay classification mới nào ở tầng reporting.

---

## 11. Kế hoạch Hợp đồng Lỗi Chuẩn xác (Exact Error Contract Plan)

Không sử dụng các định dạng mã lỗi mơ hồ (như 409/400). Mỗi trường hợp nghiệp vụ được gắn với một Exception và HTTP Status Code cụ thể:

| Mã lỗi / Error Code | Exception Class | HTTP Status | Mục đích nghiệp vụ |
|---|---|---|---|
| `OPERATIONAL_START_DIRECT_PUBLISH_AFTER_AUTHORITY_FORBIDDEN` | `BadRequestException` | 400 | Từ chối lệnh direct publish khi luồng chính sách đã từng có thẩm quyền (phải dùng replace hoặc correct) |
| `OPERATIONAL_START_RETIRE_FORBIDDEN` | `BadRequestException` | 400 | Từ chối lệnh retire đối với chính sách mốc vận hành |
| `OPERATIONAL_START_REPLACE_AFTER_BOUNDARY_FORBIDDEN` | `BadRequestException` | 400 | Từ chối lệnh replace khi mốc vận hành đã diễn ra (phải dùng correct) |
| `OPERATIONAL_START_CORRECTION_EFFECTIVITY_CHANGE_FORBIDDEN` | `BadRequestException` | 400 | Từ chối lệnh correct khi thay đổi khoảng hiệu lực so với phiên bản gốc |
| `OPERATIONAL_START_INITIAL_PUBLICATION_INVALID` | `BadRequestException` | 400 | Từ chối xuất bản khi `effectiveFrom > operationalStartDate` |
| `OPERATIONAL_START_DATE_OUTSIDE_CALENDAR` | `BadRequestException` | 400 | Ngày vận hành nằm ngoài khoảng thời gian năm học active |
| `ACADEMIC_CALENDAR_VERSION_INVALID` | `BadRequestException` | 400 | Năm học không có lịch active duy nhất |
| `CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION` | `ConflictException` | 409 | Từ chối xác nhận tiết dạy thường trước mốc vận hành (được xác định theo chính sách có hiệu lực tại thời điểm lệnh command-time) |
| `CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION` | `ConflictException` | 409 | Từ chối xác nhận dạy bù khi nghĩa vụ gốc trước mốc vận hành (dù ngày bù diễn ra sau mốc, theo chính sách command-time) |
| `POLICY_NOT_CONFIGURED` | `ConflictException` | 409 | Năm học chưa cấu hình chính sách bắt đầu vận hành |
| `POLICY_AMBIGUOUS` | `ConflictException` | 409 | Tồn tại nhiều phiên bản chính sách xung đột hiệu lực |
| `POLICY_CORRUPT` | `ConflictException` | 409 | Dữ liệu chính sách hoặc lineage bị sai hỏng |

Tuyệt đối không dùng generic 500 cho các trường hợp từ chối nghiệp vụ đã được dự liệu trước.

---

## 12. Ma trận Kiểm thử Thực tế (Test Matrix)

### A. Các tệp kiểm thử hiện hữu cần mở rộng (Existing Test Files to Extend)
1. `apps/api/test/business-configuration/business-configuration.service.spec.ts`:
   - Thêm test case kiểm thử kiểm soát vòng đời của `OPERATIONAL_START`: cấm `retire`, quy tắc `replace` trước mốc, từ chối `replace` sau mốc, quy trình `correct`, kiểm tra ràng buộc lịch năm học.
2. `apps/api/test/progress-debt/progress-debt-policy.spec.ts`:
   - Kiểm tra hàm `hcmCivilDate` dùng chung và các trường hợp biên thời gian đầu ngày/cuối ngày.
3. `apps/api/test/progress-debt/progress-debt-v2.service.spec.ts` & `apps/api/test/progress-debt/progress-debt.service.spec.ts`:
   - Kiểm tra replay của allocator bảo toàn toàn bộ pre-op opportunities để giữ nguyên tiến trình PPCT kỳ vọng.
   - Kiểm tra pre-op opportunity + no execution: không emit item operational, không tăng debt, không tăng late, không tăng unconfirmed gap.
   - Kiểm tra pre-op negative disposition + no execution: không tạo `PROVEN_OPEN_DEBT`.
   - Kiểm tra pre-op opportunity + valid historical execution: `COMPLETED` vẫn được emit, reconcile PPCT/provenance đúng.
   - Kiểm tra pre-op duplicated/corrupt execution evidence: fail-closed với finding như hiện hành.
   - Kiểm tra post-op opportunities: toàn bộ ngữ nghĩa phân loại và đếm giữ nguyên.
4. `apps/api/test/teaching-executions/teaching-executions.service.spec.ts` & `apps/api/test/teaching-executions/teaching-executions.runtime.spec.ts`:
   - Thêm test case kiểm thử chặn `confirmNormal` khi `sourceCivilDate < operationalStartDate`.
   - Thêm test case kiểm thử chặn `confirmMakeup` khi nghĩa vụ gốc `originalCivilDate < operationalStartDate`.
   - Kiểm tra xác nhận thành công khi `>= operationalStartDate`.
5. `apps/api/test/reporting-statement-internal/reporting-statement-canonicalizer.spec.ts`:
   - Kiểm tra sinh và xác thực toàn vẹn snapshot `REPORTING_STATEMENT_SNAPSHOT_V2` với các trường provenance.
   - Kiểm tra tính tương thích ngược với dữ liệu snapshot V1.
6. `apps/api/test/reporting-statements/reporting-statement.presenter.spec.ts`:
   - Kiểm tra presenter decode thành công cả V1 và V2 snapshot.
7. `apps/api/test/reporting-statements/reporting-statements.submit.spec.ts`:
   - Kiểm tra việc ghim `operationalStartPolicyVersionId` và `operationalStartDate` vào snapshot khi submit.
   - Kiểm tra `ReportingProjection` và `PersonalReportingProjection` không xuất classification mới, contract đếm giữ nguyên.

### B. Các tệp kiểm thử mới đề xuất (Exact New Test Files Proposed)
8. `apps/api/test/business-configuration/operational-start-policy.spec.ts`:
   - Kiểm thử độc lập việc đăng ký `OPERATIONAL_START_FAMILY_DEFINITION`, pure payload validator v1 (strict object, civil date format, reject extra fields, reject timestamp/offset).
9. `apps/api/test/business-configuration/operational-start-policy.integration.spec.ts`:
   - Kiểm thử tích hợp từ controller/service đến database Serializable transaction cho toàn bộ vòng đời của `OPERATIONAL_START`.

---

## 13. Kết luận về Thay đổi Schema Cơ sở Dữ liệu (Schema Change Verdict)

- **KẾT LUẬN: HOÀN TOÀN KHÔNG CẦN THAY ĐỔI SCHEMA (NO SCHEMA CHANGE REQUIRED).**
- Bằng chứng kỹ thuật:
  1. Các bảng `BusinessPolicyStream`, `BusinessPolicyVersion`, `BusinessPolicyCommand` đã hỗ trợ trường `payload Json` và cấu trúc phả hệ đầy đủ, chứa trọn vẹn `{ operationalStartDate: string }`.
  2. Bảng `ReportingStatementRevision` lưu trữ toàn bộ dữ liệu snapshot trong cột `canonical_snapshot_json` (kiểu `Text`), đi kèm các trường metadata `snapshotProfile` (chuỗi), `serializerVersion` (chuỗi), `semanticHash` (chuỗi) và `asOfInstant` (timestamp). Việc nâng cấp snapshot sang `REPORTING_STATEMENT_SNAPSHOT_V2` chứa thêm các trường provenance được lưu trọn vẹn trong cột JSON text hiện có mà không đòi hỏi thêm cột DB.
  3. Bảng `CurricularTeachingExecution` được giữ nguyên cấu trúc theo quyết định kiến trúc ADR-049 §2.13.
  4. Trạng thái `PRE_OPERATIONAL_UNCONFIRMED` là đánh giá nội bộ trong `ProgressDebtService`, không emit item, không thêm enum hay trường mới, hoàn toàn không có bảng lưu trữ nợ tĩnh trong cơ sở dữ liệu.

---

## 14. Phạm vi Ngoài Lề Được Loại trừ Minh thị (Explicit Out-of-Scope)

1. **Giao diện Người dùng Quản trị:** Thuộc phạm vi của `P1-032` (Operational-start admin UI integration).
2. **Nạp và Đối soát Dữ liệu Lịch sử Tiền vận hành:** Thuộc phạm vi của `P3-010` và `P3-020`.
3. **Quy tắc và Định mức Hoạt động Đặc biệt (GDĐP, HĐTN-HN):** Thuộc phạm vi phân hệ `P4`.
4. **Triển khai Môi trường Sản xuất / VPS:** Không có bất kỳ hoạt động deploy hay can thiệp VPS nào trong task này.

---

## 15. Thứ tự Các Checkpoint Triển khai (Ordered Implementation Checkpoints)

1. **Checkpoint 0 (Đã hoàn thành):** Khởi động task, audit code seams, đồng bộ tài liệu quản trị khởi động.
2. **Checkpoint 0A (Đã hoàn thành):** Sửa chữa toàn diện các sai lệch sự thật kỹ thuật trong Implementation Plan.
3. **Checkpoint 0B (Hiện tại):** Khóa ranh giới hợp đồng chiếu tiến độ và nợ tiết tiền vận hành, giữ nguyên các hợp đồng public/internal downstream.
4. **Checkpoint 1 (Registry, Validator & Shared Time Authority):**
   - Tạo helper `hcmCivilDate` dùng chung tại `apps/api/src/common/validation/civil-date.ts`.
   - Đăng ký `OPERATIONAL_START` trong `business-policy-registry.ts` với pure validator v1.
   - Thêm unit test tại `apps/api/test/business-configuration/operational-start-policy.spec.ts`.
5. **Checkpoint 2 (Business Configuration Lifecycle Rules & Typed Resolver):**
   - Hiện thực hóa ràng buộc lịch active và các quy tắc vòng đời (`retire`, `publish`, `replace`, `correct`) trong `business-configuration.service.ts`.
   - Cung cấp typed helper `resolveOperationalStartPolicy(...)`.
   - Cập nhật test suite cho lifecycle và resolver.
6. **Checkpoint 3 (Teaching Executions Execution Guards):**
   - Tích hợp kiểm tra ranh giới vào `confirmNormalTx` và `confirmMakeupTx`.
   - Cập nhật unit test và runtime test cho `teaching-executions`.
7. **Checkpoint 4 (Progress/Debt Integration & Replay Protection):**
   - Tích hợp ranh giới `operationalStartDate` vào `ProgressDebtService`:
     - Giữ nguyên historical allocator replay;
     - Không emit pre-op unconfirmed opportunities vào `items`;
     - Giữ nguyên `COMPLETED` cho pre-op opportunities có minh chứng hợp lệ;
     - Bảo toàn count contract và đẳng thức đếm hiện hữu.
   - Cập nhật test suite cho progress/debt.
8. **Checkpoint 5 (Reporting Statements Provenance & Snapshot V2):**
   - Định nghĩa `REPORTING_STATEMENT_SNAPSHOT_V2` trong canonicalizer.
   - Tích hợp resolver mốc vận hành vào `submit()` và presenter decode.
   - Cập nhật test suite cho reporting-statements.
9. **Checkpoint 6 (Toàn diện Kiểm thử, Đồng bộ Tài liệu Hậu kiểm & Sẵn sàng Đánh giá):**
   - Chạy toàn bộ test suite, lint, typecheck, static verifiers.
   - Đồng bộ trạng thái tài liệu sang `IN_REVIEW`.
