# P5-057 / WS1 — Kiểm kê B1 production chỉ đọc (08/11/2026)

**Loại bằng chứng:** PostgreSQL production Báo giảng, truy vấn tổng hợp ở transaction `BEGIN TRANSACTION READ ONLY` qua `psql`, kết thúc `COMMIT`; không xuất dữ liệu cá nhân, tên tài khoản, URL kết nối hoặc mật khẩu. Không chạy UPDATE/DELETE/INSERT/migration. Không truy cập database Nội trú.

## Kết quả tại thời điểm kiểm tra

| Chỉ số | Kết quả |
|---|---:|
| Tài khoản ACTIVE | 1 |
| CapabilityGrant tổng | 9 |
| CapabilityGrant đang hiệu lực | 9 |
| Grant đang hiệu lực có `coordinate_id IS NULL` | **9/9** |
| `access_commands` | 0 |
| `access_coordinates` | 0 |
| `authority_seats` | 0 |
| `role_appointments` | 0 |
| `grant_sources` | 0 |
| `grant_source_revisions` | 0 |
| `grant_projection_revisions` | 0 |
| `grant_projection_slices` | 0 |
| `grant_supports` | 0 |

Nhóm key nhạy cảm, chỉ đếm số grant đang hiệu lực: `SYSTEM_ADMIN` = 1, `USER_MANAGE` = 1, `CAPABILITY_GRANT` = 1. Không có grant đang hiệu lực `APPROVAL_PRINCIPAL`, `APPROVAL_VICE_PRINCIPAL`, `SUBJECT_GROUP_LEAD` trong kết quả đếm.

**Kết luận:** Production mới có grant bootstrap legacy; B1 mới là schema, chưa được dùng làm provenance writer. Đặc biệt, `coordinateId=null` cho cả 9 grant có nghĩa không được tự suy diễn nguồn grant hiện hành. Không backfill, không tự thu hồi, không thực hiện role transfer trên production. Những dữ liệu này là snapshot tại thời điểm kiểm tra, không phải cam kết luôn đúng ở các ngày sau.

## Gate kỹ thuật tiếp theo

1. Kiểm thử thuật toán union coverage của nhiều `GrantSourceRevision` theo khoảng nửa mở `[from, until)` trên dữ liệu giả.
2. Mọi quyết định chấm dứt nguồn phải có provenance/server-side verified; dữ liệu unknown legacy fail closed.
3. Không gắn algorithm thuần với endpoint ghi hay evaluator cho đến khi chứng minh B1 writer có transaction/lock/idempotency/audit và hoàn thành ma trận thẩm quyền theo capability.
4. Để khởi động dữ liệu nhân sự thực, cần kế hoạch cutover và đối soát bootstrap riêng; không tự sửa các grant kỹ thuật đang tồn tại.

**Trạng thái:** INV-READONLY-COMPLETE; B2 writer, bổ nhiệm, miễn nhiệm, chuyển giao và UAT vẫn **OPEN**.
