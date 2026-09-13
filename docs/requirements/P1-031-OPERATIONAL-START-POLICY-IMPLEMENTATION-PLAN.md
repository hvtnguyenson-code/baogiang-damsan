# Kế hoạch Triển khai P1-031 — Chính sách Bắt đầu Vận hành (Operational-Start Policy Implementation Plan)

## 1. Thẩm quyền và Nhiệm vụ Phụ thuộc (Authority & Dependencies)

- **Mã task:** `P1-031`
- **Tên task:** Operational-start policy implementation
- **Trạng thái:** `IN_PROGRESS`
- **Nhánh làm việc chuyên biệt (Dedicated Branch):** `feat/operational-start-policy-implementation-031`
- **Commit xuất phát chuẩn tắc (Starting Canonical Base):** `13a87538b38312a2dfb482c358b17ac23f4b2ee8`
- **authoritative Baseline CI:** CI #438 (run id: `34730231091`) — SUCCESS
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

## 2. Điểm Nối Mã Nguồn Hiện Hữu (Exact Current Code Seams)

1. **Đăng ký Policy Family:**
   - File: `apps/api/src/business-configuration/business-policy-registry.ts`
   - `PRODUCTION_BUSINESS_POLICY_FAMILIES`: Hiện tại là mảng rỗng `[]`. Sẽ đăng ký `OPERATIONAL_START` với `validatorVersion = 'v1'`, `resourceKind = 'ACADEMIC_YEAR'`.
2. **Xác thực và Quản lý Vòng đời Chính sách:**
   - File: `apps/api/src/business-configuration/business-configuration.service.ts`
   - Các phương thức: `createDraft`, `editDraft`, `publish`, `replace`, `retire`, `correct`.
   - Seam kiểm soát vòng đời đặc thù cho `OPERATIONAL_START`: cấm `retire`, ràng buộc `replace` chỉ trước mốc vận hành, bắt buộc `correct` khi mốc đã qua, cấm khoảng trống hiệu lực (no gap), kiểm tra `effectiveFrom <= operationalStartDate`.
3. **Thẩm quyền Lịch Năm học Chuẩn tắc:**
   - File: `prisma/schema.prisma` (`AcademicCalendarVersion`), `apps/api/src/homeroom-assignments/homeroom-assignment-policy.ts` (`requireHomeroomActiveCalendar`), `apps/api/src/teaching-assignments/teaching-assignment-policy.ts` (`requireActiveCalendar`).
   - Seam: Truy vấn `academicCalendarVersion` với `where: { academicYearId, isActive: true }`, yêu cầu đúng 1 phiên bản lịch active, kiểm tra `startDate <= operationalStartDate <= endDate`.
4. **Thẩm quyền Ngày Dân sự Máy chủ Sở hữu:**
   - File: `apps/api/src/progress-debt/progress-debt.policy.ts` (`hcmCivilDate`), `apps/api/src/common/validation/civil-date.ts` (`isCivilDate`, `parseCivilDate`, `formatCivilDate`).
   - Múi giờ chuẩn tắc: `Asia/Ho_Chi_Minh` (UTC+7). Tuyệt đối không dùng `toISOString().slice(0, 10)` cho ngày dân sự giải quyết nghiệp vụ.
5. **Bộ Giải quyết Chính sách (Resolver / Read Authority):**
   - File: `apps/api/src/business-configuration/business-configuration.service.ts` (`resolveEffectiveBusinessPolicy`).
   - Transaction-aware nhận `db: Prisma.TransactionClient | PrismaService`. Cung cấp typed helper `resolveOperationalStartPolicy`.
6. **Tiến trình PPCT và Phân bổ Cơ hội:**
   - File: `apps/api/src/ppct-occurrence-allocation/ppct-occurrence-allocation.service.ts`
   - Bảo toàn 100% thuật toán replay TKB lịch sử. Không can thiệp vào allocator core.
7. **Đánh giá Tiến độ, Nợ tiết và Trễ hạn:**
   - File: `apps/api/src/progress-debt/progress-debt.service.ts` (`resolve`, `resolveV2`, `resolveInTransaction`, `resolveInTransactionV2`)
   - File: `apps/api/src/progress-debt/progress-debt.types.ts` (`ProgressDebtClassification`, `ProgressDebtCounts`)
   - Tích hợp ranh giới `operationalStartDate`: các tiết `occurrence.civilDate < operationalStartDate` không có bản ghi thực thi giảng dạy được phân loại là `PRE_OPERATIONAL_UNCONFIRMED` và bị loại trừ khỏi `openDebtCount` / `lateCount`. Các sự kiện tiêu cực (như `ABSENCE_NO_REPLACEMENT`) trong thời kỳ tiền vận hành cũng bị loại trừ khỏi nợ vận hành chính thức.
8. **Cổng Lệnh Xác nhận Thực thi Giảng dạy:**
   - File: `apps/api/src/teaching-executions/teaching-executions.service.ts` (`confirmNormalTx`, `confirmMakeupTx`)
   - `confirmNormalTx`: Kiểm tra `sourceCivilDate >= operationalStartDate`. Nếu nhỏ hơn, fail-closed từ chối xác nhận thông thường.
   - `confirmMakeupTx`: Kiểm tra ngày nghĩa vụ gốc `originalCivilDate >= operationalStartDate`. Nếu nhỏ hơn, fail-closed từ chối xác nhận thông thường.
9. **Đóng băng Báo cáo Thống kê Tiết dạy:**
   - File: `apps/api/src/reporting-statements/reporting-statements.service.ts` (`submit`)
   - File: `apps/api/src/reporting-statement-internal/reporting-statement-canonicalizer.ts` (`freezeReportingStatementSnapshot`, `ReportingStatementSnapshotV1`)
   - Ghim `operationalStartPolicyVersionId` vào snapshot bất biến tại mốc `asOfInstant` quy đổi theo múi giờ `Asia/Ho_Chi_Minh`.

---

## 3. Kế hoạch Thay đổi Từng Tệp (File-Level Change Plan)

### A. Tầng Hợp đồng và Định nghĩa Family (Contracts & Registry)
1. `apps/api/src/business-configuration/business-policy-registry.ts`:
   - Định nghĩa `OPERATIONAL_START_FAMILY_DEFINITION`:
     - `key = 'OPERATIONAL_START'`
     - `resourceKind = 'ACADEMIC_YEAR'`
     - `currentValidatorVersion = 'v1'`
     - `publicationEnabled = true`
     - `downstreamAuthority = 'ADR-049-DELAYED-GO-LIVE-OPERATIONAL-START-ARCHITECTURE.md'`
     - Validator `v1`: `strictObject(payload)`, đúng duy nhất 1 key `operationalStartDate`, giá trị là chuỗi `isCivilDate`.
   - Đưa `OPERATIONAL_START_FAMILY_DEFINITION` vào `PRODUCTION_BUSINESS_POLICY_FAMILIES`.

### B. Tầng Kiểm soát Vòng đời và Thẩm quyền Lịch (Business Configuration Service)
2. `apps/api/src/business-configuration/business-configuration.service.ts`:
   - Bổ sung helper kiểm tra lịch năm học: `validateOperationalStartCalendar(tx, academicYearId, operationalStartDate)`.
   - Cập nhật `createDraft`: nếu là family `OPERATIONAL_START`, kiểm tra tính hợp lệ của `operationalStartDate` với lịch active của năm học.
   - Cập nhật `editDraft`: nếu là `OPERATIONAL_START`, kiểm tra `operationalStartDate` với lịch active.
   - Cập nhật `publish`: kiểm tra `effectiveFrom <= operationalStartDate` và tính hợp lệ với lịch.
   - Cập nhật `replace`:
     - Kiểm tra nếu `OPERATIONAL_START`: mốc `operationalStartDate` hiện tại chưa trôi qua (so với `businessCivilDate()`).
     - Mốc `operationalStartDate` mới phải nằm ở tương lai so với ngày hiện tại và hợp lệ với lịch.
     - Bảo đảm tính liên tục (no gap).
   - Cập nhật `retire`: Từ chối (`BadRequestException` hoặc `ConflictException`) đối với family `OPERATIONAL_START`.
   - Cập nhật `correct`: Cho phép sửa đổi có lưu vết lý do khi mốc đã qua hoặc cần điều chỉnh sự thật lịch sử, kiểm tra tính hợp lệ với lịch.
   - Bổ sung helper typed: `resolveOperationalStartPolicy(academicYearId, civilDate, db)`.

### C. Tầng Tiến độ và Nợ tiết (Progress & Debt)
3. `apps/api/src/progress-debt/progress-debt.types.ts`:
   - Mở rộng `ProgressDebtClassification`: thêm `'PRE_OPERATIONAL_UNCONFIRMED'`.
   - Cập nhật `ProgressDebtCounts`: thêm trường `preOperationalUnconfirmedCount: number`.
4. `apps/api/src/progress-debt/progress-debt.service.ts`:
   - Inject `BusinessConfigurationService`.
   - Trong `resolveInTransaction` và `resolveInTransactionV2`:
     - Resolve `OPERATIONAL_START` của `academicYearId` tại ngày `throughCivilDate`. Nếu không có hoặc lỗi -> fail-closed.
     - Với mỗi allocation: nếu `occurrence.civilDate < operationalStartDate`:
       - Nếu có execution hợp lệ: phân loại `COMPLETED`.
       - Nếu không có execution: phân loại `PRE_OPERATIONAL_UNCONFIRMED`.
     - Cập nhật việc tính `openDebtCount` và `lateCount` chỉ đếm `PROVEN_OPEN_DEBT` (thuộc thời kỳ vận hành).
     - Đảm bảo bất biến tổng: `distributedElapsedCount = completedCount + openDebtCount + unconfirmedGapCount + preOperationalUnconfirmedCount`.

### D. Tầng Xác nhận Thực thi (Teaching Executions)
5. `apps/api/src/teaching-executions/teaching-executions.service.ts`:
   - Inject `BusinessConfigurationService`.
   - Trong `confirmNormalTx`:
     - Resolve `OPERATIONAL_START` của `dto.academicYearId` tại `dto.sourceCivilDate`.
     - Nếu `dto.sourceCivilDate < operationalStartDate`: ném `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION')`.
   - Trong `confirmMakeupTx`:
     - Resolve `OPERATIONAL_START` của `m.academicYearId` tại `formatCivilDate(m.originalCivilDate)`.
     - Nếu `formatCivilDate(m.originalCivilDate) < operationalStartDate`: ném `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION')`.

### E. Tầng Đóng băng Báo cáo (Reporting Statements)
6. `apps/api/src/reporting-statement-internal/reporting-statement-canonicalizer.ts`:
   - Thêm trường `operationalStartPolicyVersionId: string` vào `ReportingStatementSnapshotV1` và `FreezeReportingStatementInput`.
7. `apps/api/src/reporting-statements/reporting-statements.service.ts`:
   - Trong `submit`:
     - Chuyển đổi mốc `asOf` sang ngày dân sự `Asia/Ho_Chi_Minh`: `hcmCivilDate(asOf)`.
     - Resolve `OPERATIONAL_START` theo giao dịch `tx`.
     - Truyền `operationalStartPolicyVersionId` vào `freezeReportingStatementSnapshot`.

---

## 4. Ranh giới Giao dịch (Transaction Boundaries)

- Tất cả các thao tác ghi dữ liệu (`createDraft`, `editDraft`, `publish`, `replace`, `retire`, `correct`, `confirmNormal`, `confirmMakeup`, `submit`) đều thực thi trong giao dịch cô lập cấp cao nhất của PostgreSQL (`Serializable`).
- Việc đọc và giải quyết chính sách (`resolveEffectiveBusinessPolicy`) nhận trực tiếp client giao dịch `tx` để bảo đảm dữ liệu đọc được không bị chênh lệch hoặc trôi dạt trong cùng chu trình xử lý.
- Mốc thời gian `asOfInstant` được khóa cố định trước vòng lặp thử lại giao dịch, đảm bảo mọi lần retry đều sử dụng cùng một mốc thời gian và cùng ngày dân sự giải quyết chính sách.

---

## 5. Phân tách Xác thực Payload và Kiểm tra Lịch Năm học (Policy Validator / Calendar Validation Split)

- **Pure Payload Validator (Đồng bộ, không phụ thuộc DB):**
  - Thực thi trong `BusinessPolicyPayloadValidator.validate(payload)`.
  - Kiểm tra tính nguyên vẹn về mặt cú pháp: đối tượng nghiêm ngặt (strict object), chỉ chứa duy nhất trường `operationalStartDate`, chuỗi ngày dân sự ISO hợp lệ (`YYYY-MM-DD`).
- **Calendar-Dependent Validation (Bất đồng bộ, phụ thuộc DB):**
  - Thực thi trong `BusinessConfigurationService` tại các lệnh thay đổi trạng thái hoặc tạo mới phiên bản.
  - Sử dụng `tx` để kiểm tra:
    1. Phiên bản lịch `AcademicCalendarVersion` đang `isActive = true` của năm học.
    2. Nếu không có hoặc có nhiều hơn 1 phiên bản lịch: fail-closed với lỗi xung đột.
    3. Kiểm tra `startDate <= operationalStartDate <= endDate`.

---

## 6. Kế hoạch Kiểm soát Vòng đời Đặc thù (Lifecycle Enforcement Plan)

Áp dụng cho family `OPERATIONAL_START` tại `BusinessConfigurationService`:
1. **Lệnh `RETIRE`:** Bị từ chối triệt để. Ném lỗi `BadRequestException('OPERATIONAL_START_RETIRE_FORBIDDEN')`.
2. **Lệnh `PUBLISH` lần đầu:**
   - Bắt buộc kiểm tra `effectiveFrom <= operationalStartDate`.
   - Không cho phép khoảng trống hiệu lực sau khi luồng đã được xuất bản.
3. **Lệnh `REPLACE` (Thay thế tương lai):**
   - Chỉ được phép khi `businessCivilDate() < currentOperationalStartDate`.
   - Mốc `operationalStartDate` mới phải lớn hơn ngày dân sự máy chủ hiện tại (`newOperationalStartDate > businessCivilDate()`).
   - Ngày hiệu lực thay thế phải liên tục với ngày kết thúc của phiên bản trước (không tạo gap).
4. **Lệnh `CORRECTION` (Điều chỉnh có lưu vết):**
   - Bắt buộc khi mốc `operationalStartDate` đã trôi qua trong quá khứ hoặc cần sửa sai dữ liệu.
   - Bắt buộc nhập `reason`, lưu trữ `correctsVersionId`, chuyển trạng thái phiên bản cũ sang `REVERSED`.

---

## 7. Kế hoạch Tích hợp Resolver và Thẩm quyền Đọc (Resolver Plan)

- Bổ sung helper trong `BusinessConfigurationService`:
  ```typescript
  async resolveOperationalStartPolicy(
    academicYearId: string,
    civilDate: string,
    db: Db = this.prisma,
  ): Promise<OperationalStartPolicyResult>
  ```
- Kết quả trả về gồm:
  - `operationalStartDate: CivilDateString`
  - `policyVersionId: string`
  - `validatorVersion: string`
  - `academicYearId: string`
  - `effectiveFrom: CivilDateString`
  - `effectiveUntil: CivilDateString | null`
- Nếu kết quả `resolveEffectiveBusinessPolicy` trả về `POLICY_NOT_CONFIGURED`, `POLICY_AMBIGUOUS`, `POLICY_CORRUPT`, `INVALID_POLICY_RESOURCE` hoặc `INVALID_EFFECTIVE_DATE`: Helper ném ngoại lệ nghiệp vụ tương ứng (fail-closed), ngăn chặn hoàn toàn việc suy diễn mặc định.

---

## 8. Kế hoạch Tích hợp Đánh giá Nợ tiết và Tiến trình PPCT (Progress/Debt Integration Plan)

- Giữ nguyên toàn bộ tiến trình replay của `PpctOccurrenceAllocationService`.
- Trong `ProgressDebtService.resolveInTransaction` và `resolveInTransactionV2`:
  - Giải quyết chính sách `OPERATIONAL_START` cho năm học.
  - Phân loại các cơ hội giảng dạy trực tiếp:
    - Nếu `occurrence.civilDate < operationalStartDate`:
      - Nếu có bản ghi thực thi hợp lệ (đã đối soát qua P3): `COMPLETED`.
      - Nếu không có bản ghi thực thi: `PRE_OPERATIONAL_UNCONFIRMED`.
    - Nếu `occurrence.civilDate >= operationalStartDate`: Áp dụng quy tắc hiện hành (`COMPLETED`, `PROVEN_OPEN_DEBT`, `UNCONFIRMED_COMPLETION_GAP`).
  - Đảm bảo `openDebtCount` và `lateCount` chỉ tính các tiết `PROVEN_OPEN_DEBT` chính thức, loại trừ hoàn toàn các tiết `PRE_OPERATIONAL_UNCONFIRMED`.

---

## 9. Kế hoạch Tích hợp Lệnh Xác nhận Thực thi (Execution Commands Integration Plan)

- Trong `TeachingExecutionsService.confirmNormalTx`:
  - Lấy `sourceCivilDate = dto.sourceCivilDate`.
  - Resolve `OPERATIONAL_START` cho `dto.academicYearId` theo `tx`.
  - Nếu `sourceCivilDate < operationalStartDate`: Ném `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION')`.
- Trong `TeachingExecutionsService.confirmMakeupTx`:
  - Lấy `originalCivilDate = formatCivilDate(m.originalCivilDate)`.
  - Resolve `OPERATIONAL_START` cho `m.academicYearId` theo `tx`.
  - Nếu `originalCivilDate < operationalStartDate`: Ném `ConflictException('CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION')`.

---

## 10. Kế hoạch Lưu vết Báo cáo Thống kê Bất biến (ReportingStatement Provenance Plan)

- Trong `ReportingStatementsService.submit`:
  - Chuyển `asOf` sang chuỗi ngày dân sự `Asia/Ho_Chi_Minh` bằng `hcmCivilDate(asOf)`.
  - Gọi `resolveEffectiveBusinessPolicy` cho `OPERATIONAL_START` theo `tx`.
  - Ghim `operationalStartPolicyVersionId` vào snapshot báo cáo.
- Cột lưu trữ snapshot trong database là `canonical_snapshot_json` (kiểu `Text`), do đó việc bổ sung trường `operationalStartPolicyVersionId` hoàn toàn không yêu cầu thay đổi cấu trúc bảng hay chạy migration.

---

## 11. Kế hoạch Hợp đồng Lỗi (Error Contract Plan)

Các mã lỗi và ngoại lệ chuẩn tắc được áp dụng:
1. `POLICY_NOT_CONFIGURED`: Khi năm học chưa xuất bản chính sách bắt đầu vận hành.
2. `POLICY_AMBIGUOUS`: Khi có nhiều hơn một chính sách có hiệu lực đồng thời.
3. `POLICY_CORRUPT`: Khi payload hoặc phả hệ chính sách bị sai hỏng.
4. `OPERATIONAL_START_RETIRE_FORBIDDEN`: Khi cố tình thực hiện thao tác `RETIRE` với chính sách bắt đầu vận hành.
5. `OPERATIONAL_START_REPLACE_AFTER_BOUNDARY_FORBIDDEN`: Khi cố tình dùng `REPLACE` sau khi ngày bắt đầu vận hành đã diễn ra.
6. `OPERATIONAL_START_DATE_OUTSIDE_CALENDAR`: Khi `operationalStartDate` nằm ngoài khoảng thời gian của năm học.
7. `OPERATIONAL_START_INITIAL_PUBLICATION_INVALID`: Khi `effectiveFrom > operationalStartDate`.
8. `CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION`: Khi cố tình xác nhận tiết dạy bình thường trước ngày vận hành.
9. `CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION`: Khi cố tình xác nhận dạy bù cho tiết gốc tiền vận hành.

---

## 12. Ma trận Kiểm thử (Test Matrix)

Các bộ kiểm thử cần bổ sung hoặc mở rộng:
1. **Kiểm thử Registry và Validator:**
   - File: `apps/api/src/business-configuration/business-policy-registry.spec.ts`
   - Đăng ký `OPERATIONAL_START`, validator `v1`, strict object, từ chối trường thừa, từ chối timestamp/offset, kiểm tra `isCivilDate`.
2. **Kiểm thử Vòng đời Chính sách OPERATIONAL_START:**
   - File: `apps/api/src/business-configuration/business-configuration.service.spec.ts`
   - Kiểm tra cấm `RETIRE`, kiểm tra `REPLACE` hợp lệ ở tương lai, từ chối `REPLACE` sau mốc, kiểm tra quy trình `CORRECTION`, kiểm tra ràng buộc với lịch năm học.
3. **Kiểm thử Resolver và Múi giờ:**
   - File: `apps/api/src/business-configuration/business-configuration.service.spec.ts`
   - Kiểm tra giải quyết chính sách theo ngày dân sự `Asia/Ho_Chi_Minh` ở các thời điểm giao mùa/đầu ngày.
4. **Kiểm thử Progress/Debt với Ranh giới Tiền vận hành:**
   - File: `apps/api/src/progress-debt/progress-debt.service.spec.ts`
   - Kiểm tra các tiết tiền vận hành không sinh nợ/trễ hạn (`PRE_OPERATIONAL_UNCONFIRMED`), kiểm tra replay TKB vẫn giữ nguyên số thứ tự bài học PPCT, kiểm tra các tiết sau mốc vận hành vẫn tính nợ bình thường.
5. **Kiểm thử Chặn Xác nhận Tiết tiền vận hành:**
   - File: `apps/api/src/teaching-executions/teaching-executions.service.spec.ts`
   - Kiểm tra `confirmNormal` bị chặn khi `sourceCivilDate < operationalStartDate`.
   - Kiểm tra `confirmMakeup` bị chặn khi `originalCivilDate < operationalStartDate`.
   - Kiểm tra xác nhận bình thường được chấp thuận khi `>= operationalStartDate`.
6. **Kiểm thử Đóng băng Báo cáo Thống kê:**
   - File: `apps/api/src/reporting-statements/reporting-statements.service.spec.ts`
   - Kiểm tra việc ghim `operationalStartPolicyVersionId` vào snapshot bất biến và tính bất biến khi chính sách thay đổi về sau.
7. **Kiểm thử Tích hợp Đầu cuối (Integration Test):**
   - File: `apps/api/test/business-configuration/operational-start-policy.integration.spec.ts`

---

## 13. Kết luận về Thay đổi Schema Cơ sở Dữ liệu (Schema Change Verdict)

- **KẾT LUẬN: HOÀN TOÀN KHÔNG CẦN THAY ĐỔI SCHEMA (NO SCHEMA CHANGE REQUIRED).**
- Bằng chứng:
  1. Cấu trúc lưu trữ chính sách `BusinessPolicyStream`, `BusinessPolicyVersion`, `BusinessPolicyCommand` đã được thiết kế tổng quát tại `P1-021` với trường `payload Json`, hoàn toàn đáp ứng cấu trúc `{ operationalStartDate: string }`.
  2. Bảng `ReportingStatementRevision` lưu trữ snapshot dưới dạng chuỗi JSON chuẩn tắc trong cột `canonical_snapshot_json` (kiểu `Text`), hỗ trợ mở rộng thêm trường `operationalStartPolicyVersionId` mà không cần thêm cột DB.
  3. Bảng `CurricularTeachingExecution` đã được kiến trúc tại ADR-049 §2.13 giữ nguyên cấu trúc, không cần ghim phiên bản chính sách.
  4. Các phân loại tiến độ `PRE_OPERATIONAL_UNCONFIRMED` là cấu trúc chiếu động trong bộ nhớ (`ProgressDebtProjection`), không có bảng lưu trữ nợ tĩnh.

---

## 14. Phạm vi Ngoài Lề Được Loại trừ Minh thị (Explicit Out-of-Scope)

1. **Giao diện Người dùng Quản trị:** Thuộc phạm vi của `P1-032` (Operational-start admin UI integration).
2. **Nạp và Đối soát Dữ liệu Lịch sử Tiền vận hành:** Thuộc phạm vi của `P3-010` và `P3-020`.
3. **Quy tắc và Định mức Hoạt động Đặc biệt (GDĐP, HĐTN-HN):** Thuộc phạm vi phân hệ `P4`.
4. **Triển khai Môi trường Sản xuất / VPS:** Không có bất kỳ hoạt động deploy hay can thiệp VPS nào trong task này.

---

## 15. Thứ tự Các Checkpoint Triển khai (Ordered Implementation Checkpoints)

1. **Checkpoint 0 (Hiện tại):** Xác lập nhánh làm việc, audit các seam mã nguồn, khóa kế hoạch triển khai, đồng bộ tài liệu quản trị khởi động task.
2. **Checkpoint 1 (Đăng ký Family & Kiểm soát Vòng đời):**
   - Đăng ký `OPERATIONAL_START` trong `business-policy-registry.ts`.
   - Hiện thực hóa kiểm tra lịch năm học và ràng buộc vòng đời trong `business-configuration.service.ts`.
   - Viết unit test cho registry và lifecycle enforcement.
3. **Checkpoint 2 (Tích hợp Đánh giá Nợ tiết & Tiến trình PPCT):**
   - Mở rộng kiểu dữ liệu `ProgressDebtClassification`.
   - Tích hợp bộ lọc ranh giới vận hành vào `ProgressDebtService`.
   - Viết unit test kiểm chứng nguyên tắc không tự động sinh nợ (no-auto-debt).
4. **Checkpoint 3 (Tích hợp Cổng Lệnh Xác nhận Thực thi & Đóng băng Báo cáo):**
   - Tích hợp kiểm tra ranh giới vào `confirmNormal` và `confirmMakeup`.
   - Tích hợp ghim `operationalStartPolicyVersionId` vào `ReportingStatement`.
   - Viết unit test và integration test hoàn chỉnh.
5. **Checkpoint 4 (Hậu kiểm, Đồng bộ Tài liệu & Sẵn sàng Đánh giá):**
   - Chạy toàn bộ test suite, lint, typecheck, static verifiers.
   - Đồng bộ trạng thái tài liệu sang `IN_REVIEW`.
   - Chuẩn bị báo cáo hoàn tất task.
