# P5-054 / T53-B — Triển khai replay candidate có giới hạn

Ngày: 26/10/2026. **Chưa hoàn tất T53-B; consequence công khai vẫn `NOT_ASSESSED`.**

## Cơ sở

- Đọc `.git/HEAD` và ref nhánh trực tiếp: `feat/p5-054-consequence-closure`, HEAD `9fd4573fbf232e207edc07ed900276def3cab88f`.
- Đã đọc AGENTS, protocol P5-050, requirement P5-054, ma trận T53-A/B, audit closure, các current-state authorities và ADR liên quan. P5-054/T53 đã đăng ký; dependencies P5-050, P2-050, P3-031 và predecessor P5-053 đều CLOSED trong register.
- Theo giới hạn lần này, không chạy lệnh Git, không xác minh lại canonical GitHub main/divergence/diff/staging, không commit/push/PR. Register vẫn ghi READY trong khi audit ghi bản nền đã merge; chưa tuyên bố IN_REVIEW/CLOSED hoặc nghiệm thu sản phẩm.

## Mã đã triển khai

- `apps/api/src/resolved-occurrences/calendar-exception-replay.ts`: adapter nội bộ, candidate bất biến, ràng buộc đúng transaction/năm/ngày/phiên lịch; hết hiệu lực khi callback kết thúc hoặc lỗi. Marker `PREVIEW:CALENDAR_EXCEPTION` chỉ là giả định trong bộ nhớ, không phải ID bản ghi retained.
- `apps/api/src/operational-overlays/operational-overlays.service.ts`: `withCalendarPreviewReplay` tự mở một transaction RepeatableRead cho validation và cả BEFORE/AFTER, gọi validator create hiện hữu rồi dùng lại predicate scope/selector. Chỉ hỗ trợ cơ hội BASE; nguồn BLOCKED hoặc đã suppress/disposition bị từ chối.
- `apps/api/src/ppct-occurrence-allocation/ppct-occurrence-allocation.service.ts`: seam BEFORE/AFTER dùng **toàn bộ allocator V2 hiện hữu**, truyền candidate vào cả replay lịch sử và weekly look-ahead. Không tự tính cursor, lineage, item hay component. API đọc retained giữ nguyên chữ ký/hành vi.
- `apps/api/src/progress-debt/progress-debt.service.ts`: seam BEFORE/AFTER dùng progress V2, cùng as-of và cùng operational-start authority được resolve trong transaction. Không cho as-of tương lai, không giả lập nợ tương lai.
- `apps/api/test/operational-overlays/calendar-candidate-replay.spec.ts`: validator, structural resolver, allocator V2 và progress V2 thật; persistence/association reads là fixture. Spy chặn persistence/raw SQL và kiểm tra không có success audit.

Mỗi cặp chỉ chứng minh **một stream lớp-môn và horizon ghi trong scope**. Wrapper `CALENDAR_CANDIDATE_REPLAY_PARTIAL_V1` luôn NOT_ASSESSED hoặc BLOCKED, kèm candidate, projection BEFORE/AFTER và giới hạn rõ ràng; coverage PPCT/debt/workload đều NOT_ASSESSED. Trạng thái PASS bên trong chỉ thuộc resolver và phạm vi tương ứng.

## Bằng chứng và giới hạn

- Hồi quy targeted qua `npm.cmd run test:unit -w apps/api -- --runInBand --runTestsByPath` với các unit spec trong `test/{operational-overlays,resolved-occurrences,ppct-occurrence-allocation,progress-debt,official-workload,teaching-executions,helpers}` (loại integration): **25/25 suite, 500/500 test đạt trên mã cuối**, gồm test DB safety guard.
- Suite mới: **17 ca**; chứng minh dời item sang hai cơ hội sau, giữ planned component khi hủy tiết chuyên đề, candidate đi vào look-ahead qua các segment không liên tục, không tự sinh debt/completion, pre-operational exclusion, sai transaction/năm, hết lifetime, snapshot failure, selector không khớp, nguồn lỗi và public preview/authorization không bị nới.
- `npm.cmd run typecheck` và `npm.cmd run lint`: đạt toàn workspace. Sau thay đổi entry point cuối, đã chạy lại typecheck/lint API và toàn bộ 25 suite trên: đều đạt. Suite mới **17/17 đạt** trong lượt hồi quy cuối.
- Quét whitespace cuối dòng và conflict marker trên sáu tệp thuộc lần sửa này: không có phát hiện. Không chạy `git diff --check` vì giới hạn không dùng Git.
- Không có `TEST_DATABASE_URL` trong environment. Không đọc `.env`, không kết nối/bootstrap PostgreSQL, không thay/bỏ guard. Fixture không chứng minh isolation/race trên PostgreSQL hoặc E2E.

## Phần còn chặn trong parent P5-054/T53-B/D

1. Progress hiện reconcile theo các direct obligation còn được phân phối. Suppression có thể làm obligation biến mất khỏi tập đó; chưa đủ proof cho execution retained. Seam **chặn mọi execution hoặc make-up ACTIVE trong stream**, kể cả chưa kết thúc, tương lai hoặc ngoài horizon; không tự bỏ execution khỏi workload hoặc viết lại provenance.
2. Official workload hiện không nhận candidate overlay. Không gọi retained workload hai lần rồi trình bày như delta candidate, không dựng bộ tính workload khác. Chưa có consequence BEFORE/AFTER đủ cả ba miền.
3. Chưa có orchestration công khai bao phủ toàn bộ stream/horizon, replay disposition/reversal, hoặc revalidation đủ consequence tại mutation transaction. Entry point nội bộ tự mở snapshot RepeatableRead; authorization vẫn thuộc public boundary hiện hữu, không được suy ra từ adapter hoặc kết quả replay.
4. Public preview, UI, quyền và các command ghi không được nối vào seam này. Disposition vẫn theo coverage fail-closed hiện hữu; T53-C chưa được mở xác nhận. Cần proof reconciliation/workload, PostgreSQL cô lập, E2E và review độc lập trong parent đã đăng ký; không tạo deferral mới.

Không thay schema/migration, CI/CD hay Web; không truy cập VPS, production DB hoặc Nội trú. Đây là checkpoint cục bộ có mã và test, chưa phải bằng chứng đóng task.
