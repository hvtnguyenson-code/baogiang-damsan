# Bối cảnh Dự án — Hệ thống Báo giảng Đam San

## Current-state authority

Tài liệu này chỉ giữ **bối cảnh bền vững**. Trạng thái task/PR/CI hiện hành không còn được duy trì thủ công theo từng phase tại đây vì cách đó đã gây stale chronology.

Nguồn current-state bắt buộc:

1. `docs/governance/CURRENT-PROJECT-STATUS.md`
2. `docs/governance/PRE-PILOT-TASK-REGISTER.md`
3. `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`
4. `docs/governance/PRE-PILOT-PRODUCT-BASELINE.md`

Nếu có mâu thuẫn về **trạng thái hiện tại**, các file governance trên thắng tài liệu này. Historical per-slice status vẫn tồn tại trong Git history, ADRs, phase reports và PRs.

## Thông tin dự án

| Mục | Nội dung |
|---|---|
| Tên | Hệ thống Báo giảng và Thống kê Tiết dạy Tự động |
| Đơn vị | Trường PTDTNT THPT Đam San |
| Repository | `hvtnguyenson-code/baogiang-damsan` |
| Local canonical | `D:\baogiang-damsan` |
| Stable branch | `main` |
| Production domain | `baogiang.dtnt-damsan.edu.vn` |
| API loopback | `127.0.0.1:3100` |
| Database | PostgreSQL 17 |
| Production OS | Windows Server 2022 |
| Business timezone | `Asia/Ho_Chi_Minh` |

## Phương án chính thức

Phương án chính thức là Phương án B:

- Windows VPS + PostgreSQL + Nginx;
- domain chính thức `baogiang.dtnt-damsan.edu.vn`;
- source lên VPS phải đi từ exact GitHub commit đã review;
- database production ở trạng thái pre-operational cho tới quyết định pilot/go-live;
- local không dùng database VPS làm automated test database;
- deployment/migration cần task và phê duyệt riêng.

Authority môi trường/delivery cao nhất vẫn là:

- `docs/specifications/PA-B-VPS-PostgreSQL-v1.3-IMPLEMENTATION-ADDENDUM.md`;
- `docs/decisions/ADR-005-OFFICIAL-VPS-CI-CD.md`;
- production runbooks/authority hiện hành.

## Công nghệ

| Tầng | Công nghệ |
|---|---|
| Frontend | React 18 · Vite 5 · TypeScript strict · Tailwind CSS |
| Backend | Node.js 22 · TypeScript strict · NestJS 10 |
| ORM | Prisma 5 |
| Database | PostgreSQL 17 |
| Testing | Vitest · Jest · Playwright |
| Package manager | npm workspaces |
| CI | GitHub Actions |

## Kiến trúc hiện có cần bảo toàn

Repository hiện có các boundary đã được review/version hóa và không được rebuild chỉ vì pre-pilot realignment:

- identity, session, capability/scope default-deny và audit;
- AcademicYear + retained AcademicCalendarVersion + business weeks/segments/interruption/classes;
- TeachingAssignment history theo ngày dân sự;
- exact TimeSlotDefinition revisions và real-time collision;
- retained TimetableVersion/TimetableEntry + lifecycle/historical resolution;
- timetable import profile/alias/canonical preview infrastructure;
- PPCT shared plan/version/item/revision/lineage/class association;
- operational overlays;
- SpecialActivity exact-slot/frozen-class/staffing/collision runtime primitive;
- PPCT occurrence allocation;
- CurricularTeachingExecution và SpecialActivityParticipationExecution;
- progress/debt/late projection;
- reporting projection, Personal Reporting Projection và Reporting Statement;
- Windows production deployment control plane and operator-evidence tooling.

Chi tiết KEEP/REALIGN/RESTORE nằm trong `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`.

## Pre-pilot realignment

Project hiện đang realign vì một số minimum-core/deferred quyết định chưa đại diện đầy đủ sản phẩm thực tế. Các miền phải re-enter trước pilot tùy exact scope gồm:

- HomeroomAssignment;
- GDĐP annual/grade programme planning;
- HĐTN CLASS/GRADE/SCHOOL programme planning;
- exact per-slot special-program staffing;
- coordinator authority;
- Business Configuration Control Plane;
- delayed go-live + historical pre-operational execution;
- PPCT authoritative workbook import;
- native Đam San timetable workbook adapter;
- class-view/teacher-view peer reconciliation;
- morning/afternoon selective timetable update + explicit carry-forward;
- SpecialActivity workload/reporting;
- deferred WorkloadAdjustmentRule when official adjusted workload is in scope;
- PWA/Telegram pilot integration;
- first-cert HTTP-01/TLS authority and actual VPS evidence.

Không suy ra rằng một area đã hoàn chỉnh chỉ vì minimum-core implementation hiện có PASS CI.

## Layering rule

```text
Planning facts
  Calendar • PPCT • Base timetable • Programme plans
        ↓
Operational facts
  Exceptions • Dispositions • Make-up • SpecialActivity runtime
        ↓
Execution evidence
  CurricularTeachingExecution • ActivityParticipationExecution
        ↓
Derived state
  Progress • Debt • Late • Workload
        ↓
Official record
  Reporting Statement snapshot/lifecycle
```

Downstream layer có thể tham chiếu retained upstream identities/evidence nhưng không được rewrite lịch sử upstream để làm reporting tiện hơn.

## Source/authority discipline

Mọi major task phải đọc:

- `AGENTS.md`;
- current governance authority;
- v1.3 addendum;
- applicable accepted ADRs;
- v1.2/source audit liên quan;
- exact current implementation evidence.

Khi traceability đánh dấu `RESTORE`, `REALIGN` hoặc `NEW_PRODUCT_AUTHORITY`, agent không được dùng minimum-core ADR cũ để tự suy ra broader product semantics.

## Task governance

Major task bắt buộc:

- có Task ID trong `PRE-PILOT-TASK-REGISTER.md` trước khi code;
- dependency phải `CLOSED`;
- branch riêng từ exact reviewed main SHA;
- update task/status/traceability docs trước review;
- merge không đồng nghĩa `CLOSED`;
- sau merge phải ghi exact main SHA + authoritative post-merge CI và sync tài liệu;
- task phụ thuộc tiếp theo bị block khi predecessor còn `MERGED_AWAITING_DOC_SYNC`;
- không để `deferred/later/not assessed` orphan ngoài register.

Quy tắc đầy đủ: `docs/governance/MAJOR-TASK-DOCUMENTATION-SYNC-PROTOCOL.md`.

## UI/UX

Trước UI task phải đọc `.codex/skills/damsan-ui/SKILL.md` và `DESIGN.md` đầy đủ. UI không được invent business semantics hay authorization. Backend/current product authority phải đóng trước khi UI chốt workflow tương ứng.

## AI

AI mặc định tắt theo ADR-002/004. AI ports/policy foundation không phải bằng chứng active AI business integration. Bất kỳ activation nào cần task Product Owner riêng sau pilot-stability/security/cost review.

## Protected systems

Không được tác động nếu task không explicit authorize:

- `D:\Quan_li_noi_tru`;
- `D:\Edu_DamSan`;
- DamSanV5 / Quản lí nội trú application/process/database/Scheduled Task/config;
- Nội trú Nginx/TLS/monitoring state;
- production resources ngoài exact task scope.

## Production safety

- Green CI không chứng minh VPS readiness.
- Không dùng destructive test trên production database.
- Không `prisma migrate reset` production.
- Không reboot VPS/restart PostgreSQL/kill all node processes.
- Báo giảng phải có isolated root/port/task/database/role/domain/TLS/bot/log/backup lifecycle theo accepted production design.
