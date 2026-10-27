# SYNC-P5-055 — Đối soát và đóng hồ sơ Trung tâm sẵn sàng dữ liệu

**Ngày đối soát:** 27/10/2026. **Định danh:** P5-055 / T54. **Loại:** một microtask SYNC chỉ cập nhật tài liệu sau khi parent đã merge. **Trạng thái:** đề xuất `CLOSED` khi PR SYNC này được review, có CI xanh và merge vào `main`; trước đó canonical `main` vẫn ghi `IN_PROGRESS`.

## 1. Phát hiện sai lệch giữa hồ sơ và GitHub

Task register, traceability và requirement đang ghi `P5-055 IN_PROGRESS`, nhưng **PR #248 đã thực sự merge ngày 23/10/2026**, bao gồm cả bản correction `READY`. Không tạo lại tính năng, không hồi sinh PR hoặc nhánh cũ. Mã nền P5-055 tồn tại trong `main` mới nhất.

| Bằng chứng | Kết quả |
|---|---|
| Parent PR | [#248](https://github.com/hvtnguyenson-code/baogiang-damsan/pull/248), **MERGED** |
| Parent final reviewed HEAD | `a5efc02735cdf9101ad14e007c448493bac75bc8` |
| Correction fail-closed READY | `006d1e23a06e0a5764bc7087f6e13aa4465ce3e7` (thuộc parent PR) |
| Parent merged SHA | `6f1e83a8f021db1ab23f9902981a6b32f36d65ab` |
| Exact-head PR CI | CI #824 `39969087899` — **SUCCESS** |
| P6-021 compatibility | #71 `39969087920` — **SUCCESS**, ephemeral PG16 + Nginx fixtures |
| Post-merge main CI | CI #825 `39971195093` — **SUCCESS** |
| Auto-deploy | #23 `39972403934` — **SUCCESS** |
| Deploy Báo giảng VPS | #20 `39972416299` — **SUCCESS**, log `BAOGIANG_DEPLOY_VERIFIED sha=6f1e83a8f021db1ab23f9902981a6b32f36d65ab` (23/10/2026 14:56 UTC) |
| Review kỹ thuật sau merge | ChatGPT kiểm tra GitHub PR diff 24 tệp, readiness backend và test; kết quả không phát hiện blocker HIGH/CRITICAL mới, ghi comment GitHub review `5661587622` trên #248. **Đây là COMMENT, không phải formal third-party APPROVE.** |

Bản P5-055 được duy trì qua các merge main về sau. Parent P5-054 đã được operator xác nhận deploy production (6/6 checks PASS); bản `SYNC-P5-054` sau đó đã triển khai tại `1e5d77f6fb4c5caaee3ac53e730c38bdf13a91b3`. Điều này **không thay thế** E2E thao tác readiness bằng người dùng/thiết bị thật.

## 2. Phạm vi kỹ thuật đã triển khai

- Trung tâm sẵn sàng dữ liệu cho BGH/Admin tại `/quan-tri/san-sang-du-lieu`, với năm lĩnh vực **TKB, PPCT, lịch sử giảng dạy, GDĐP, HĐTN-HN**; chọn năm học, cảnh báo/rào cản, phiên bản gần nhất, hướng dẫn sáu bước và liên kết đến importer hiện có.
- Backend read-only `GET /api/data-readiness/summary`; quyền `SCHOOL_WIDE` theo capability thực tế, session guard và tài khoản hợp lệ; năm học ID tường minh không tồn tại trả **404**.
- Correction `READY` fail-closed: TKB ACTIVE chỉ `NOT_ASSESSED` nếu chưa được evaluator theo ngày xác nhận; PPCT kiểm tra phân công môn–khối, phiên bản PUBLISHED, liên kết đúng lớp/ngày; lịch sử cần policy OPERATIONAL_START có hiệu lực và calendar phù hợp, biên nhận nhập chưa chứng minh đủ nghĩa vụ; GDĐP cả ba khối và HĐTN-HN cần bản kế hoạch ban hành cho từng master.
- Tài liệu/điều phối không tạo parser, sổ chứng cứ, công thức readiness khác, không ghi DB trong read API, không sửa schema/migration/auth/role.
- **Phạm vi phải ghi trung thực:** PR #248 thay đổi `.github/workflows/ci.yml` timeout của job CI từ **20 lên 35 phút** cho Playwright installation. Không được ghi rằng parent không thay đổi CI; không có thay đổi workflow deploy production.

## 3. Kiểm thử và review

- Báo cáo correction 23/10/2026 ghi local: API unit **104 suites / 1.968 tests PASS**, Web **38 files / 588 tests PASS**; targeted service/controller/HTTP **57/57 PASS**; PostgreSQL 17.10 test cô lập **11/11 PASS**, 29/29 Prisma migrations, không dùng database production.
- Đây là bằng chứng của checkpoint khi parent đang phát triển. **Kết luận phát hành** dựa exact PR HEAD CI #824, P6-021 #71 và post-merge main CI #825 SUCCESS, cùng deploy #20 VERIFIED; không cộng test skip/mock thành E2E thật.
- Review hậu kiểm GitHub #248 không ghi nhận issue HIGH/CRITICAL mới. Việc không có formal peer `APPROVED` được lưu là hạn chế minh bạch, không suy diễn có người duyệt độc lập.

## 4. Giới hạn giữ nguyên và các cổng kế tiếp

- Trung tâm này là **lớp hiển thị/điều phối**; TKB theo khoảng ngày vẫn trả `NOT_ASSESSED` khi chưa có bằng chứng từ evaluator chuyên trách. Biên nhận lịch sử dù có số dòng không tự biến thành `READY`; incomplete/unverifiable sẽ chặn hoặc chỉ dẫn đến workflow authority.
- Không được nâng danh hiệu `READY` toàn trường khi chưa đầy đủ minh chứng thực tế. Các kiểm thử người dùng theo vai trò, Android thật, mật độ dữ liệu thực và quy trình nghiệp vụ có thao tác ghi thuộc **P5-057 / T56**. **P6-050 teacher pilot** chưa được mở.
- Nhiệm vụ kiến trúc thông báo tiếp theo **P5-056A / T55** có thể bắt đầu theo các dependency chính thức. Sau đó P5-056 implementation, rồi P5-057 trước P6-050.
- Bản sync này chỉ sửa tài liệu trạng thái và báo cáo, không thay đổi runtime, migration, dữ liệu hoặc VPS. Merge docs-only cũng có thể kích hoạt CI và **code-only deploy** theo workflow hiện tại; phải giám sát bằng SHA sau merge, không tự chạy deploy thủ công.
- Không tạo `SYNC-SYNC-P5-055`.

## 5. Hồ sơ được đồng bộ

- `docs/governance/PRE-PILOT-TASK-REGISTER.md` — P5-055 `CLOSED`, bằng chứng parent và ranh giới.
- `docs/governance/CURRENT-PROJECT-STATUS.md` — ghi nhận chính xác major-task P5-055 đã merge trước, đồng bộ bổ sung sau.
- `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md` — disposition T54 và điều kiện `NOT_ASSESSED`.
- `docs/requirements/P5-055-DATA-READINESS-IMPORT-CENTER.md` — status `CLOSED`, thêm closure evidence; không đổi requirement.
- `docs/phase-reports/P5-055-READY-CORRECTION-REPORT.md` — phụ lục hậu merge, bảo toàn lịch sử IN_PROGRESS trước đó.
- Báo cáo này.

**Quyết định:** đạt bằng chứng để mở PR `SYNC-P5-055`. Parent chỉ chuyển thành `CLOSED` một cách chính thức sau khi PR tài liệu này có CI/review đạt và merge.
