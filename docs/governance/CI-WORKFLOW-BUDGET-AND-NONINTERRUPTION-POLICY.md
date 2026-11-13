# Quy định bắt buộc — Kỷ luật commit/push và bảo toàn workflow CI của Báo giảng Đam San

**Trạng thái:** PRODUCT OWNER MANDATORY / áp dụng ngay từ 12/11/2026.
**Phạm vi:** mọi nhánh, PR, agent, người điều phối và tác vụ P0–P6 của `hvtnguyenson-code/baogiang-damsan`, kể cả tài liệu, test, hotfix và CI/CD.
**Thứ tự ưu tiên:** bổ sung, **siết chặt** §4 và §6 của `P5-050-EXECUTION-PROTOCOL-ANTIGRAVITY-CODEX.md`; không thay đổi workflow GitHub Actions hiện hành, quy trình bảo mật hoặc thẩm quyền merge/deploy.

## 1. Lệnh cấm tuyệt đối

1. **KHÔNG PUSH (kể cả amend, force-push, push tài liệu hoặc commit sửa lỗi)** lên nhánh PR trong lúc **bất kỳ** workflow/check nào của chính PR hoặc HEAD tương ứng đang `queued`, `pending`, `waiting` hoặc `in_progress`. Dù CI chính đã `failure`, vẫn phải đợi PostgreSQL compatibility, Windows fixtures, review checks và mọi workflow còn lại đến trạng thái kết thúc (`completed`). Không suy từ một dấu đỏ/xanh rằng toàn bộ tập workflow đã dừng.
2. **CẤM** tạo các commit/push nhỏ nối tiếp, sửa từng lỗi vặt và kích hoạt CI liên tục. Không dùng GitHub Actions làm IDE/debugger hoặc thay cho kiểm thử local. Không push chỉ để thăm dò lỗi TypeScript, lint, schema hoặc test mà có thể phát hiện trước.
3. **CẤM** manual cancel, rerun, dispatch hay chỉnh `concurrency.cancel-in-progress`, vô hiệu hóa checks/branch protection, hoặc mở PR/nhánh mới để né workflow đỏ khi chưa có phê duyệt phạm vi riêng. Một `cancelled` không được coi là PASS và không được coi là tối ưu tiết kiệm phút.
4. **Không force-push/rewrite published history** để làm PR trông chỉ có một commit trong khi thực tế đã kích hoạt nhiều lần CI. Nếu có yêu cầu sửa, gộp và chỉ push khi toàn bộ workflow trước đã kết thúc; giữ lịch sử minh bạch. Cơ chế "một commit hiện ra trong PR" không thay thế bằng chứng chỉ có một lượt push.
5. Không tự động merge khi còn check đang chạy, chưa có review độc lập hoặc chưa đạt gate nghiệp vụ/bảo mật. CI xanh chỉ xác nhận nội dung được kiểm thử ở **exact HEAD**, không thay thế chứng minh an toàn của các mutation.

## 2. Tiêu chí trước **push đầu tiên**

- Chốt scope/task, soát toàn bộ đường ảnh hưởng và các trường hợp biên; một task → một nhánh → một PR; tránh phát sinh thêm nhánh sửa chữa.
- Hoàn tất **toàn bộ mã + test + tài liệu cần thiết** thành một checkpoint có ý nghĩa. Tự đọc diff, kiểm tra file thừa, bí mật, format và tính tương thích phiên bản.
- Phải chạy local trong phạm vi phù hợp và có exit code 0: TypeScript strict/typecheck, lint, targeted Jest/unit, negative/security tests; với schema/authorization/concurrency phải có DB cô lập hoặc giải pháp kiểm chứng được phê duyệt, không dùng DB production. Local test mock không thay thế PostgreSQL integration thực.
- Nếu laptop/tool thiếu RAM, timeout, thiếu môi trường hoặc review agent lỗi, ghi `BLOCKED/INCONCLUSIVE`, xử lý môi trường/thiết kế kiểm thử tương đương **trước push**. Không lấy CI làm giải pháp mặc định để phát hiện các lỗi local bị bỏ qua.
- Chỉ khi checkpoint có bằng chứng phù hợp, mới thực hiện một commit/push chính thức và tạo PR; ghi exact commit SHA, danh sách workflow dự kiến và mức tiêu hao CI dự kiến. Những trường hợp ngoại lệ cần PO chấp thuận riêng trước khi tạo CI.

## 3. Khi CI/compatibility đang chạy

1. Ngay sau push, kiểm kê tất cả workflows gắn với PR, bao gồm CI chính, `P6-021 off-host compatibility`, Windows safety và các check khác có liên quan. Theo dõi đến khi **tất cả** không còn ở trạng thái đang chạy/chờ.
2. Có thể điều tra log, sửa mã ở **local chưa push** và gom issue; **tuyệt đối không cập nhật remote HEAD** giữa chừng. Không cần gọi lại workflow đã PASS.
3. Khi có failure, ghi nhận toàn bộ lỗi từ mọi job (không dừng phân tích ở lỗi đầu tiên). Gom các sửa có chung nguyên nhân, chạy lại local đầy đủ, xem lại tất cả tác động và review trước khi có **một** push sửa tổng hợp. Trước lệnh push phải kiểm tra GitHub trực tiếp lần nữa để chắc chắn không còn workflow sống.
4. Nếu một workflow kéo dài/treo, không push để ép GitHub hủy; báo tình trạng và điều tra trong chế độ read-only. Muốn xử lý bất thường phải có chỉ thị rõ của PO; không tự hủy hoặc thay cơ chế concurrency.
5. Chỉ chấp nhận một lần correction push khi thực sự cần thiết và toàn bộ gate ở trên đã hoàn tất; nếu tiếp tục đỏ, ngừng để đánh giá căn nguyên thay vì lặp các lượt push. **Không có quy tắc cho phép N lượt push tùy ý.**

## 4. Trước merge / sau merge

- Merge chỉ khi exact-head checks bắt buộc **đều thành công**, no-conflict, review độc lập đạt và các gate nghiệp vụ/mutation đã được đáp ứng; có phê duyệt merge của PO. PR Draft không tự được coi là sẵn sàng.
- Mọi chính sách về legacy data, source/provenance, migration, PostgreSQL thực và API âm tính vẫn là gate riêng; không được hạ gate để "cho CI xanh".
- Sau merge, chỉ dùng pipeline **GitHub → main CI → auto-deploy hiện có**. Không sửa/khởi tạo pipeline phụ, không restart hệ thống Nội trú. Chờ đầy đủ main CI/deploy và thông báo Telegram exact SHA trước khi báo đã phát hành.

## 5. Sự cố tham chiếu, hậu quả và bài học bắt buộc

Ngày **12/11/2026**, PR [#285](https://github.com/hvtnguyenson-code/baogiang-damsan/pull/285) ghi nhận:
- Commit đầu `4881a5a`: CI [#938](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/43235919624) `failure` ở TypeScript; PostgreSQL compatibility [#116](https://github.com/hvtnguyenson-code/baogiang-damsan/actions/runs/43235919188) **vẫn chạy**, đã hoàn thành migration và capability catalog, đang ở API integration.
- Push sửa lên `5f9b747` lúc **21:24:52 (GMT+7)** đã kích hoạt CI #939 và P6-021 #117; bởi nhóm concurrency của PR #285 có `cancel-in-progress: true`, **#116 bị cancelled** lúc **21:25:09** (GMT+7), sau khoảng 6 phút chạy. CI #939 và #117 về sau SUCCESS, nhưng không lấy lại được tài nguyên/phút đã dùng ở #116.
- **Root cause:** điều phối đã push khi workflow khác của cùng PR vẫn đang chạy, sau khi bỏ sót TypeScript local preflight. Sử dụng `git commit --amend`/force-with-lease khiến PR nhìn như một commit không xóa được hai lượt CI thực tế.
- **Quy tắc xử lý vĩnh viễn:** trước mọi push mới, phải có bằng chứng **all workflows settled** và preflight local PASS. Nếu không có, **STOP; NO PUSH**.

## 6. Checklist thao tác bắt buộc

- [ ] Exact main/task branch và PR đã kiểm chứng.
- [ ] Local preflight TypeScript + lint + unit/integration trong phạm vi đạt (hoặc có ngoại lệ PO chính thức; không tự chọn).
- [ ] Toàn bộ các lỗi phát hiện đã gom thành một checkpoint.
- [ ] GitHub hiện có **0 workflow sống** liên quan PR/nhánh/HEAD; gồm CI, P6-021 và các workflow bổ sung.
- [ ] Không force-push, không manual cancel/rerun, không pipeline thay thế; phương án release/rollback không thay đổi.
- [ ] Chỉ một push có mục đích sau khi qua toàn bộ gate; chờ **tất cả** workflow kết thúc trước bất kỳ push tiếp theo.
- [ ] Độc lập review + exact-head green + user merge authorization trước khi merge.

**Quy tắc ưu tiên khi bất định:** dừng push, giữ nhánh local, báo rõ blocker. Phút CI/GitHub Actions của chủ dự án là tài nguyên hữu hạn; tối ưu lượt CI là điều kiện chất lượng của quá trình phát triển.
