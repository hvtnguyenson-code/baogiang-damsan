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

Hạ tầng và topology production:

- Windows Server 2022 là OS authority chính thức cho môi trường production trong mọi trường hợp.
- Quyết định topology host cuối cùng được Product Owner chủ động hoãn lại để chốt chính thức tại decision gate `P6-005`: lựa chọn giữa `SHARED_VPS` (dùng chung Windows Server 2022 VPS hiện hữu với DamSanV5 / Quản lí nội trú, duy trì triệt để cách ly láng giềng) và `DEDICATED_VPS` (thuê một Windows Server 2022 VPS riêng biệt dành hoàn toàn cho Báo giảng).
- Ứng dụng, kiến trúc lưu trữ PostgreSQL và domain chính thức `baogiang.dtnt-damsan.edu.vn` phải luôn sẵn sàng deploy được trên cả hai topology này.
- Các công việc bảo đảm cách ly shared-host và runbook hiện có không phải là thẩm quyền ép buộc Product Owner phải dùng chung VPS Nội trú hiện hữu.
- Không có bất kỳ task production/TLS nào được ngầm định trước topology khi `P6-005` chưa được `CLOSED`.

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
- HomeroomAssignment retained history, control plane và administration workspace đã hoàn tất pre-pilot re-entry;
- exact TimeSlotDefinition revisions và real-time collision;
- retained TimetableVersion/TimetableEntry + lifecycle/historical resolution;
- timetable import profile/alias/canonical preview infrastructure;
- accepted ADR-047 Đam San native timetable workbook architecture, implemented P2-040 native adapter runtime (`DamSanNativeTimetableAdapter`) và bidirectional peer reconciliation, và implemented P2-050 selective session authoring + explicit carry-forward: exact four-sheet/boundary contract, class-view/teacher-view peer reconciliation, structural `TeacherSourceRowRef`, exact derived teacher-code identity, fail-closed mismatch taxonomy, 455 normal teacher-linked curricular rows persisted as canonical `TimetableEntry`, 120 special non-peer slots recognized/validated without fake assignments, transient raw XLSX SHA-256 participating in confirm request fingerprinting without schema modifications, privacy-sanitized deterministic fixture, selective morning/afternoon mode (`BOTH` / `MORNING` / `AFTERNOON`), ADR-020 date-effective canonical baseline lookup, exact unauthored-session carry-forward preserving canonical provenance IDs, full composed canonical validation và semantic checksum;
- PPCT shared plan/version/item/revision/lineage/class association retained-history foundation (lưu ý: implementation PPCT occurrence allocation hiện có xử lý một thành phần / luồng đơn và đang trong diện re-entry phân định thành phần chương trình đã đăng ký P0-900 -> P2-001..P2-004; trong khi đó TeachingAssignment, TimetableEntry và native TKB được bảo toàn tuyệt đối không mang thuộc tính component);
- operational overlays;
- SpecialActivity exact-slot/frozen-class/staffing/collision runtime primitive;
- PPCT occurrence allocation (đang re-entry theo chuỗi P2-001..P2-004);
- CurricularTeachingExecution và SpecialActivityParticipationExecution;
- progress/debt/late projection;
- reporting projection, Personal Reporting Projection và Reporting Statement;
- accepted ADR-046 architecture, implemented P1-021 retained Business Configuration persistence/control plane, and implemented P1-022 capability-gated administration workspace: typed allowlisted families, versioned validator registry, retained version/effectivity history, command idempotency, same-transaction audit, typed/version-aware code-defined UI adapters with triple identity, exact `BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE` capability gate, strict separation from `SystemSetting`, environment/secrets and technical/deployment configuration (no raw JSON, no generic key/value editor), with production backend family registry and production UI adapter registry intentionally empty;
- Windows production deployment control plane and operator-evidence tooling.

Chi tiết KEEP/REALIGN/RESTORE nằm trong `docs/governance/PRE-PILOT-TRACEABILITY-MATRIX.md`.

## Pre-pilot realignment

Project hiện đang realign vì một số minimum-core/deferred quyết định chưa đại diện đầy đủ sản phẩm thực tế. Các miền phải re-enter trước pilot tùy exact scope gồm:

- phân định thành phần chương trình PPCT (CORE vs SPECIALIZED_STUDY), áp dụng theo lớp-môn và định tuyến cơ hội dạy học tuần (P0-900 -> P2-001..P2-004);
- GDĐP annual/grade programme planning;
- HĐTN CLASS/GRADE/SCHOOL programme planning;
- exact per-slot special-program staffing;
- coordinator authority;
- delayed go-live + historical pre-operational execution;
- PPCT authoritative workbook import;
- SpecialActivity workload/reporting;
- deferred WorkloadAdjustmentRule when official adjusted workload is in scope;
- PWA/Telegram pilot integration;
- first-cert HTTP-01/TLS authority and actual VPS evidence.

Không suy ra rằng một area đã hoàn chỉnh chỉ vì minimum-core implementation hiện có PASS CI. Với Đam San native timetable, ADR-047 architecture, P2-040 native adapter runtime, và P2-050 selective session authoring + explicit carry-forward đã hoàn tất và đóng bằng `SYNC-P2-050`.

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