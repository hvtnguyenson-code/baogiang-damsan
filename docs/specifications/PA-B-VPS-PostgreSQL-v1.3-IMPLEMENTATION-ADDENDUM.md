# Phương án B v1.3 — Implementation Addendum

**Trạng thái:** Có hiệu lực
**Phạm vi:** Hạ tầng chính thức, delivery, database, agent workflow và UI/UX gate
**Bổ sung cho:** `PA-B-VPS-PostgreSQL-v1.2-AI-governance.docx`

## 1. Thứ tự ưu tiên

Addendum v1.3 này thay thế các nội dung tương ứng hoặc mâu thuẫn trong Phương án B v1.2 và tài liệu cũ. Thứ tự áp dụng là:

1. addendum v1.3 này;
2. ADR hiện hành, trong đó có `ADR-005-OFFICIAL-VPS-CI-CD.md`;
3. Phương án B v1.2;
4. đặc tả phase và tài liệu governance khác;
5. prototype chỉ dùng tham khảo UI/UX.

Tài liệu Phase 00 vẫn là bằng chứng lịch sử tại thời điểm Phase 00; chúng không đảo ngược hướng có hiệu lực từ v1.3.

## A. Môi trường chính thức

- VPS Windows Server, PostgreSQL và tên miền là hạ tầng chính thức ngay từ giai đoạn phát triển.
- Database trên VPS là database chính thức nhưng đang ở trạng thái **pre-operational**, chưa chứa dữ liệu vận hành thực tế.
- Chỉ dùng tài khoản giả và dữ liệu giả cho đến khi có quyết định riêng đưa hệ thống vào vận hành.
- Domain chính thức là `baogiang.dtnt-damsan.edu.vn`.
- Việc dùng hạ tầng chính thức không cho phép thao tác tùy tiện: mọi truy cập, migration và deploy vẫn cần task/phê duyệt tương ứng.

### Phân tách local, CI và VPS

- Máy local không bắt buộc cài/chạy PostgreSQL; local chủ yếu dùng editor, Codex/Antigravity, lint, typecheck và targeted unit tests.
- Integration, migration và E2E có database dùng PostgreSQL cô lập do CI/test environment cấp.
- Database VPS chính thức không dùng cho automated test suite hoặc test phá hủy.
- Local không kết nối database VPS theo mặc định. Ngoại lệ cần phương thức an toàn và phê duyệt riêng; không mở PostgreSQL công khai chỉ để local truy cập.
- Kiểm thử ứng dụng trên môi trường thật diễn ra sau CD qua domain chính thức.

## B. Luồng phát triển và delivery

```text
Local viết code
→ branch riêng
→ commit/push GitHub
→ CI
→ review
→ merge main khi được phép
→ CD sang VPS
→ migration có kiểm soát
→ restart riêng ứng dụng Báo giảng
→ health check trên URL chính thức
```

- Source trên VPS chỉ được lấy từ commit GitHub xác định; không copy working tree local trực tiếp lên VPS.
- CI chạy trên branch/pull request.
- CD mặc định chỉ chạy từ `main` sau khi CI xanh. `workflow_dispatch` chỉ dùng trong quy trình có kiểm soát và phê duyệt rõ ràng.
- Push tạo đầu vào cho CI và có thể dẫn đến CD sau các gate; push tự nó không phải là deploy.
- Task recovery/spec alignment này không tạo workflow deploy.

## C. Cô lập hệ thống

Báo giảng phải có riêng: thư mục VPS, port, Scheduled Task hoặc service, entry point, database, PostgreSQL role, Nginx server block, domain, workflow, log và backup.

Deploy Báo giảng không được:

- reboot VPS;
- restart PostgreSQL;
- restart toàn bộ Nginx nếu không cần;
- dừng DamSanV5;
- giết toàn bộ `node.exe`;
- sửa thư mục, service hoặc database của hệ thống Quản lí nội trú.

Chỉ dừng/restart tiến trình có command line hoặc entry point khớp chính xác với Báo giảng. Mọi bước phải có kiểm tra nhận dạng trước và health check sau.

## D. Database

- Prisma Migrate là nguồn thay đổi schema.
- Migration phải được commit và test trên PostgreSQL cô lập trong CI.
- VPS chỉ chạy `prisma migrate deploy` trong một đợt deploy được phê duyệt.
- Không dùng `prisma db push` làm migration chính thức; không dùng `prisma migrate reset` trên database chính thức.
- Migration có khả năng phá hủy dữ liệu cần backup, review và xác nhận riêng.
- SQL/PowerShell thủ công do ChatGPT soạn phải được người dùng chạy trực tiếp trên VPS, kèm kiểm tra trước/sau; agent không tự chạy thay.
- Không đưa secret hoặc database dump lên GitHub.

## E. Agent workflow

### ChatGPT

- audit;
- thiết kế task/prompt;
- review GitHub độc lập;
- chỉ xác nhận PASS sau khi kiểm tra bằng chứng trực tiếp.

### Codex

- khởi tạo bộ khung và kiến trúc;
- schema/migration;
- auth/session/authorization;
- capability/scope và audit;
- CI/CD;
- refactor rộng;
- security, integration, E2E và lỗi phức tạp.

### Antigravity IDE

- task hẹp, đơn giản, dễ review;
- UI component độc lập và CSS theo design system đã khóa;
- nội dung tiếng Việt;
- loading/empty/error state;
- fixture/test cơ học và tài liệu nhỏ.

Antigravity không được đụng schema, migration, auth, authorization, deploy hoặc refactor rộng nếu prompt không cho phép rõ ràng.

Mọi prompt bắt đầu bằng đúng một trong hai dòng:

```text
CÔNG CỤ THỰC THI: CODEX
CÔNG CỤ THỰC THI: ANTIGRAVITY IDE
```

Một task dùng một branch. Không merge hoặc deploy nếu chưa có chỉ thị riêng.

## F. UI/UX gate

Trước khi triển khai frontend, agent phải:

1. kiểm kê skill UI/UX có trong project;
2. đọc đầy đủ skill phù hợp;
3. chọn đúng một principal UI/UX skill;
4. ghi lý do chọn và design direction riêng cho Đam San.

Cấm dashboard SaaS/AI đại trà, sidebar khuôn mẫu vô hồn, lạm dụng card, gradient/glassmorphism trang trí, typography hoặc spacing mặc định thiếu chủ đích.

Giao diện phải phù hợp giáo viên Việt Nam, có dấu ấn Trường Đam San, dùng tiếng Việt rõ ràng, responsive và keyboard-accessible; đồng thời có đủ loading, empty, error, disabled, unauthorized và expired-session states.

Task recovery/spec alignment này không tải hoặc tạo skill UI/UX và không triển khai frontend.
