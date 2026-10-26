# P5-054 / T53 — Kiểm kê phần nghiệp vụ còn thiếu và điều kiện thực thi
Ngày: 2026-10-26
Cơ sở: main `a15ddb194c2aac8f6e9d3c7ec35461702532fff8`; nhánh tiếp tục `feat/p5-054-consequence-closure`.
Trạng thái: AUDIT / CHƯA THỰC THI SỬA MÃ. Bản nền P5-054 đã merge qua PR #247; KHÔNG coi T53 đã hoàn tất.

## Nguồn kiểm chứng
- Yêu cầu: `docs/requirements/P5-054-TEACHING-OPERATIONS-WORKSPACE-CLOSURE.md`.
- API: `apps/api/src/operational-overlays/operational-workspace-context.service.ts`, `operational-overlays.service.ts`, `makeup-schedules.service.ts`, ba controller tương ứng.
- UI: `apps/web/src/pages/TeachingOperationsPage.tsx`, `DispositionPreviewPanel.tsx`, `MakeupSchedulingPage.tsx`, `OperationalHistoryPanel.tsx`.
- Các test API hiện hữu: `apps/api/test/operational-overlays/*.spec.ts`, test giao diện trong `apps/web/src/__tests__`.
- Chưa chạy lại test sau khi tạo báo cáo này; kết quả hiện có thuộc PR #247/CI lịch sử.

## Bản đồ trạng thái theo yêu cầu
| Luồng | Hiện có | Chưa đủ điều kiện đóng |
|---|---|---|
| Ngoại lệ lịch địa phương | API create/list/detail/reverse; workspace preview affected occurrences, chọn ngày/phạm vi/buổi/tiết | Preview hiện khai báo `ppctItemAllocation`, `workload`, `debt` là `NOT_ASSESSED`; thiếu nghiệm thu hành vi tác động thực qua read model và dữ liệu PostgreSQL cô lập |
| Vắng/dạy thay/giám sát | API disposition create/list/detail/reverse, lookup occurrence và teacher options, kiểm tra eligibility/availability ở service ghi | `teacher-options` trả `OPTIONS_NOT_COLLISION_CHECKED`; preview disposition `NOT_ASSESSED` cho ba hệ quả; chưa được mở xác nhận từ workspace khi bằng chứng thiếu |
| Dạy bù | P3-031 public makeup controller/service và UI `MakeupSchedulingPage`; API có create, candidates, target-options, list/detail/reverse | Phải chứng minh dạy bù không tạo PPCT consumption mới, đúng debt/workload, collision và reverse trên PostgreSQL; chưa có bằng chứng E2E chấp nhận toàn luồng |
| Lịch sử / hoàn tác | Retained records, audit write trong `Serializable` transaction, idempotency/requestKey, reversal CAS và history panel | Chưa có E2E đa vai trò cho create -> list/detail -> reverse/correct -> lịch sử, lỗi 409/cạnh tranh; không được viết lại bản ghi cũ |

## Phát hiện trọng yếu
1. **HIGH — Hệ quả chưa đánh giá:** `OperationalWorkspaceContextService` chủ động trả `NOT_ASSESSED` cho PPCT/workload/debt; không được nâng thành PASS chỉ vì đã xác định occurrence hoặc collision sơ bộ.
2. **HIGH — Danh sách ứng viên không bảo đảm không trùng:** `OPTIONS_NOT_COLLISION_CHECKED` là nhãn cảnh báo hợp đồng; phải xác minh availability từ nguồn có thẩm quyền, lặp trong transaction xác nhận.
3. **HIGH — Preview có thể cũ:** mọi thao tác ghi phải kiểm tra lại version/context/eligibility/collision/PPCT/workload/debt tại commit, không dựa vào snapshot UI; 409 rõ ràng và không tự ghi lại với requestKey mới.
4. **HIGH — E2E nghiệp vụ còn thiếu:** đặc tả T53 yêu cầu ngoại lệ toàn trường, cùng môn dạy thay, khác môn giám sát, dạy bù, đảo ngược, từ chối quyền và xung đột. Mock UI tests không chứng minh các điều này.
5. **MEDIUM — Ngữ nghĩa nợ tiết/PPCT:** ngoại lệ hủy/suppression không được tự sinh nợ; dạy thay cùng môn, giám sát khác môn và dạy bù phải có bảng hệ quả riêng; tránh bộ tính thứ hai trong Web.
6. **MEDIUM — UX:** chỉ hiển thị nhãn tiếng Việt/ID người dùng hiểu được, không bắt nhập UUID; vô hiệu nút xác nhận khi chưa đủ coverage hoặc nguồn hiệu lực.
7. **MEDIUM — Lưu giữ lịch sử:** reversal/correction cần ghi đúng lineage và audit bất biến; trường hợp hai người thao tác đồng thời phải fail-closed.

## Thứ tự triển khai có giới hạn
1. **T53-A — Contract & consequence audit (backend).** Đọc resolver có thẩm quyền cho PPCT, workload, debt, source occurrence, collision; đối chiếu từng loại ngoại lệ/điều chỉnh/dạy bù. Tạo ma trận loại hành vi × tác động × nguồn tính; kiểm thử readonly trên fixtures, không thêm thuật toán tính song song.
2. **T53-B — Preview backend đáng tin cậy.** Bổ sung hệ quả được tính thật cùng provenance/coverage; giữ `NOT_ASSESSED` khi nguồn chưa đáp ứng. Cấm PASS giả; xác nhận phải kiểm chứng lại ở giao dịch ghi với SERIALIZABLE/CAS/requestKey hiện hữu.
3. **T53-C — Workspace UI hành động.** Nối nút xác nhận khi B thực sự PASS và user có grant phù hợp; hiển thị thay đổi PPCT/workload/debt và collision theo từng loại. Thông báo 401/403/409/500 Việt hóa, không auto-retry mutation; không đổi canonical route hay quyền.
4. **T53-D — PostgreSQL integration & Playwright E2E.** Tối thiểu 7 kịch bản trong requirement trên DB cô lập, gồm hai luồng đồng thời và rollback lịch sử. Test tiêu cực chứng minh không commit khi `NOT_ASSESSED` hoặc conflict. Chạy lint/typecheck/unit/integration/Playwright và review độc lập trước PR.

## No-go và ranh giới
- Không mở nút xác nhận nếu PPCT/workload/debt chưa được đánh giá đủ.
- Không dùng teacher-options như bằng chứng collision PASS.
- Không thêm bảng/ledger/importer/bộ giải PPCT hoặc workload mới nếu authority hiện hữu đã có.
- Không thay RBAC, business authority, audit semantics, API ngoài phạm vi T53, CI/CD hoặc môi trường VPS.
- Không đụng hệ thống Nội trú; không deploy từ bước audit.
- P5-055: PR #248 thực tế MERGED với commit `6f1e83a8f021db1ab23f9902981a6b32f36d65ab`, local head `a5efc02735cdf9101ad14e007c448493bac75bc8` là ancestor của main; Task Register hiện còn `IN_PROGRESS`. Cần SYNC-P5-055 riêng sau xác minh CI/deploy và chứng cứ PostgreSQL; không chỉnh status P5-055 trong nhánh T53.
