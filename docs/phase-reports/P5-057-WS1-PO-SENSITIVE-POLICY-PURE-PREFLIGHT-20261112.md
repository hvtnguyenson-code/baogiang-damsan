# P5-057 / WS1 — Bản kiểm chứng chính sách nhạy cảm chỉ đọc (12/11/2026)

**Baseline** `main@6a42ee4083c6031e406f69b03bf295ec32c996d9`, sau PR #282. **Nguồn quyết định:** PO đã phê duyệt gộp 3 phương án vào ngày 12/11/2026, có dấu vết trong trao đổi và comment PR #283. **Phạm vi code:** một pure module, unit tests và hồ sơ quyết định, không wiring API/service/route/DI/module/Prisma/production database.

## Kết quả được hiện thực ở dạng advisory

- `sensitive-capability-policy.ts` chốt danh mục 9 key, kiểm tra `SCHOOL_WIDE`, source kind, actor và target khác nhau, định danh UUID, cấm generic grant/revoke, command lạ, nguồn thiếu hoặc sourceId giả khi thu hồi.
- Hiệu trưởng: Admin kỹ thuật có thể là ứng viên ghi nhận / chấm dứt nguồn role `PRINCIPAL` cho người khác; không hardcode principal ID, không bắt buộc ngày hết hạn. Kết quả thu hồi chỉ là ứng viên có `exactSourceId`; không biến thành xóa grant.
- PHT: Admin ghi nhận/chấm dứt nguồn `VICE_PRINCIPAL_ACADEMIC`. Nguồn cùng role này có thể bảo trợ cho `ADDITIONAL_DUTY_CATALOG_MANAGE` của PHT theo chính sách đã chốt. PHT không được generic grant hay tự bổ nhiệm.
- `AUDIT_VIEW`: ứng viên từ nguồn `PRINCIPAL` riêng, nguồn `TECHNICAL_ACCOUNT_ADMIN` hiện hữu được **giữ trong production** nhưng pure check không tạo hoặc thu hồi mới ở tuyến này. Chưa kiểm chứng union thực tế hay nguồn legacy.
- Năm key `AI_CONFIGURE_POLICY`, `AI_VIEW_USAGE`, `AI_VIEW_COST`, `AI_VIEW_AUDIT`, `AI_DISABLE_SYSTEM` đều bị chặn trước Phase 11.
- Mọi trả về có `canConfirm=false`, `provenanceVerified=false`, `writerEnabled=false`, `requiresServerAuthorityProof=true`. Không có đường kết quả `AUTHORIZED`.

## Bằng chứng kiểm thử

- Jest mục tiêu 26/26 PASS với transformer TypeScript cô lập, không thay đổi config production.
- TypeScript scoped PASS.
- ESLint phạm vi hẹp không type-aware (chạy riêng trước khi bổ sung UUID/command và phải chạy lại cuối phiên). Full lint/typecheck/integration/PG16 còn là gate CI PR.
- Không dùng server production hay dữ liệu thật. Các testcase phủ 9 generic grants, 5 AI policy, Principal/VP source, 2 nguồn audit (technical giữ nguyên), invalid command/UUID, self, scope, legacy và exact source remove.

## Gate tiếp theo (KHÔNG ĐƯỢC BỎ QUA)

1. Đây chỉ là **candidate policy**: actorRole/sourceRole hiện là đầu vào của bộ kiểm chứng, **chưa chứng minh** họ sở hữu seat. Tuyệt đối không gọi function này trực tiếp từ body API hoặc coi output là authorization.
2. Writer B1 phải xác minh actor seat và source B1 từ database trong transaction có CAS, source revision, access command, effective time, multi-source union, idempotency/audit, replay/race/rollback.
3. Không làm hỏng `CapabilitiesService.create/revoke`, `AccessBaselineService.applyTemplate` và bootstrap đang chạy. Generic writer bypass hiện **vẫn tồn tại trong production**, chưa thể coi đã khắc phục. Muốn chặn phải có plan cutover + negative direct API tests + kiểm kê legacy read-only và phê duyệt rollout.
4. Cần reviewer độc lập, CI exact-head, 7-persona UAT rồi lệnh merge/triển khai riêng. P5-057/T56 IN_PROGRESS, P6-050 BLOCKED.

**Thay đổi production:** không. **Tự kích hoạt nguồn nhạy cảm hoặc thu hồi cấp phát cũ:** không.
