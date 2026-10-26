# SYNC-P5-054 — Hồ sơ đóng P5-054/T53

**Loại tác vụ:** Closure-sync hành chính, chỉ sửa tài liệu, theo `MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md` §7. Không sửa mã runtime, schema/migration, giao diện, quyền, CI/CD hoặc VPS trong nhánh này.

**Ngày đối soát:** 26/10/2026 (giờ Việt Nam). **Trạng thái đề xuất:** P5-054 `CLOSED` khi PR `SYNC-P5-054` được review và merge; trước merge, `main` vẫn là nguồn trạng thái hiện hành.

## 1. Đối soát danh tính Git và CI

| Bằng chứng | Kết quả |
|---|---|
| Parent implementation PR | [#252](https://github.com/hvtnguyenson-code/baogiang-damsan/pull/252), MERGED |
| Parent reviewed head | `200f38d9fdf753310e7fc892bc3919defc1d38d8` |
| Parent merge/main SHA | `fe6e4b367dc6dbc9746394353b07851f3ff2dbf2` |
| Parent PR CI | CI #842 + P6-021 off-host compatibility #75, SUCCESS tại head `200f38d` |
| Authoritative post-merge CI | [CI #843](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/40354422393), SUCCESS trên `fe6e4b3` |
| Auto deploy | [#27](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/40356330143), SUCCESS |
| Deploy Báo giảng VPS | [#24](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/40356346940), SUCCESS |
| Deploy exact SHA | `BAOGIANG_DEPLOY_VERIFIED sha=fe6e4b367dc6dbc9746394353b07851f3ff2dbf2` |
| Review kỹ thuật độc lập | ChatGPT đã đọc diff thật của PR #252 (45 tệp), ghi đánh giá kỹ thuật PASS trong GitHub review `COMMENTED` ID `5655583109`. **Không phải** phê duyệt `APPROVED` từ một tài khoản GitHub độc lập. |

## 2. Kiểm chứng production do operator cung cấp

PowerShell read-only trên VPS **WIN-EPSNSCS4PM2**, **26/10/2026 23:27:40 +07:00**, ghi nhận:

- `C:\baogiang\current` → `C:\baogiang\releases\fe6e4b367dc6dbc9746394353b07851f3ff2dbf2` (đúng SHA).
- `C:\baogiang\previous` → bản rollback `a15ddb194c2aac8f6e9d3c7ec35461702532fff8`.
- Release folder tồn tại; `/api/health/live` HTTP 200/`ok`; `/api/health/ready` HTTP 200/`ok`, PostgreSQL `ok`, độ trễ **52 ms**.
- Node PID **2804** đang LISTEN ở `127.0.0.1:3100`; tiến trình bắt đầu **23:17:49 +07:00**.
- **6/6 hạng mục PASS**. Không cần deploy lại hoặc restart Báo giảng.

## 3. Giới hạn nghiệm thu kỹ thuật P5-054

- T53-B/C/D đưa các thao tác ngoại lệ lịch học CLASS/GRADE/SCHOOL_WIDE, dạy thay cùng môn, giám sát khác môn, dạy bù và hoàn tác vào UI tiếng Việt; hiển thị PPCT V2, Progress/Debt V2 và workload thực tế theo teacher/date/định mức có hiệu lực.
- Preview `RepeatableRead`/`READ ONLY` không cấp quyền ghi; lệnh ghi tái kiểm tra `SERIALIZABLE`, stale/race trả 409; retained thiếu lineage/authority phải `BLOCKED` hoặc `NOT_ASSESSED`, không tạo credit/fulfillment giả.
- Kiểm thử: **API 2.069/2.069 PASS**, **Web 744/744 PASS**; PostgreSQL cô lập 13 suite **184 PASS, 1 SKIP** (Playwright được chạy độc lập **1/1 PASS**); regression P5-010 sau correction 12/12 PASS.
- Không sửa schema/migration, auth/role, CI/CD, hoặc hệ thống Nội trú trong parent PR.

## 4. Giới hạn sản phẩm và công việc tiếp theo

- Kết luận **CLOSED là phạm vi kỹ thuật của P5-054**, không phải UAT toàn sản phẩm. Kiểm thử persona nhiều tài khoản, Android thực, màn hình mật độ cao và điều kiện sử dụng thực tế thuộc **P5-057/T56**, với teacher pilot còn bị chặn bởi **P6-050** và các dependency của nó.
- Parent không phát sinh correction task T53 mới đã xác định qua review/CI. Các ứng viên không đủ nguồn retained vẫn bị từ chối theo thiết kế.
- Script `auto-deploy-code-only.ps1` **gọi** `prune-releases.ps1 -Execute` sau `BAOGIANG_DEPLOY_VERIFIED` nhưng là `best-effort`; lỗi dọn có thể bị bắt và chỉ ghi warning. Không có bằng chứng dung lượng giải phóng thực tế từ VPS, **không tuyên bố** đã dọn sạch toàn bộ `C:\baogiang`; không tự xóa backup, nhật ký và dữ liệu đang được bảo vệ.

## 5. Phạm vi SYNC và cổng hoàn tất

Closure-sync cập nhật đúng bốn tệp tài liệu:

1. `docs/governance/PRE-PILOT-TASK-REGISTER.md` — trạng thái P5-054 `CLOSED` với parent SHA/CI/deploy/review.
2. `docs/governance/CURRENT-PROJECT-STATUS.md` — last closed major task và giới hạn pilot.
3. `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md` — đóng disposition T53, không thay đổi source authority.
4. Chính báo cáo này.

**Không** tạo `SYNC-SYNC-P5-054`; không tự nhúng SHA tương lai của merge sync vào chính tài liệu sync. Review diff tài liệu exact-head + CI thành công và merge PR là cổng kết thúc. Lưu ý workflow `main` hiện tại tự kích hoạt **code-only deploy kể cả với commit chỉ sửa tài liệu**; cần giám sát phát hành sau merge theo đúng SHA, không tự kích hoạt deploy thủ công.
