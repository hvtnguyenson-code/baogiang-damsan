# P2-002 — PPCT component persistence + control-plane realignment

## Trạng thái

**CLOSED** bởi closure-sync hành chính `SYNC-P2-002` sau khi implementation PR và post-merge main CI đều thành công.

- Canonical baseline: `main@0594bbab58bf49a058ab4a744499366f3acbaf78` (baseline CI: CI #408 SUCCESS).
- Dedicated implementation branch: `feat/ppct-component-persistence-control-plane-002`.
- Final independently reviewed implementation head: `3d00ebc2bc5b3600104c3889b41c7e1432ae74d6`.
- Parent PR: #124 (`feat(ppct): add curricular component persistence control plane`).
- Exact-head PR CI: CI #409 (run `34468164396`) — SUCCESS.
- Merge/main commit: `a3151b049d02f6cae9677d7b93b7df2086d421b3`.
- Authoritative post-merge main CI: CI #410 (run `34468753060`) — SUCCESS.
- Independent GitHub review: PASS; không có review thread/request-changes blocker và không phát sinh correction/re-entry task riêng.
- Authority: ADR-048 Accepted; P2-001 CLOSED bởi SYNC-P2-001; P0-900 CLOSED.
- Traceability: T45, T46.
- Closure consequence: `P2-003` được mở khóa thành `READY`; `P2-004` vẫn `PLANNED`; `P2-010` vẫn `BLOCKED_EVIDENCE`, vì vậy `P2-020` vẫn chưa startable.
- Không có deployment hoặc production mutation trong P2-002.

## Phạm vi thực hiện

1. **Enums**:
   - `PpctCurricularComponent` (`CORE`, `SPECIALIZED_STUDY`).
   - `PpctClassCurricularProfile` (`CORE_ONLY`, `CORE_PLUS_SPECIALIZED_STUDY`).

2. **Schema & Database Persistence**:
   - `PpctItem`: thêm NOT NULL `component PpctCurricularComponent` (bất biến với stable UUID), composite unique `@@unique([id, ppctPlanId, component], map: "ppct_items_identity_component_key")`.
   - `PpctItemRevision`: thêm NOT NULL `component PpctCurricularComponent`, composite FK `ppct_item_revisions_item_plan_component_fkey` trỏ tới `PpctItem(id, ppctPlanId, component)` với `ON DELETE RESTRICT ON UPDATE RESTRICT`, composite unique `@@unique([ppctVersionId, ppctItemId, ppctPlanId, component], map: "ppct_item_revisions_provenance_component_key")`. Thay thế index sequence version-wide cũ bằng `@@unique([ppctVersionId, component, sequence], map: "ppct_item_revisions_version_component_sequence_key")`.
   - `PpctItemLineage`: thêm NOT NULL `component PpctCurricularComponent`, composite FKs `ppct_item_lineage_predecessor_revision_fkey` và `ppct_item_lineage_successor_revision_fkey` trỏ tới `PpctItemRevision(ppctVersionId, ppctItemId, ppctPlanId, component)` với `ON DELETE RESTRICT ON UPDATE RESTRICT`.
   - `PpctClassAssociation`: thêm NOT NULL `curricularProfile PpctClassCurricularProfile`, giữ nguyên `effectiveFrom`, `effectiveUntil` và PostgreSQL GiST exclusion constraint chống overlap khoảng thời gian.
   - Duy trì đúng topology 6 model PPCT (`PpctPlan`, `PpctVersion`, `PpctItem`, `PpctItemRevision`, `PpctItemLineage`, `PpctClassAssociation`), không tạo model thứ 7.
   - **Boundary cấm**: `TimetableEntry`, `TeachingAssignment`, `CurricularTeachingExecution`, `MakeupTeachingSchedule` hoàn toàn không có trường component.

3. **Staged Migration (`20260910010000_ppct_component_persistence_foundation`)**:
   - Step 1: Tạo types enum `PpctCurricularComponent` và `PpctClassCurricularProfile`.
   - Step 2: Thêm nullable `component` vào `ppct_items`, `ppct_item_revisions`, `ppct_item_lineage`.
   - Step 3: Backfill toàn bộ lịch sử sang `CORE`.
   - Step 4: Thêm nullable `curricular_profile` vào `ppct_class_associations` và backfill toàn bộ sang `CORE_ONLY`.
   - Step 5: Đổi tất cả cột mới sang `NOT NULL`.
   - Step 6: Thiết lập composite unique `ppct_items_identity_component_key`.
   - Step 7: Xóa FK cũ `ppct_item_revisions_item_plan_fkey` và thiết lập composite FK `ppct_item_revisions_item_plan_component_fkey` (`ON DELETE RESTRICT ON UPDATE RESTRICT`).
   - Step 8: Thiết lập composite unique `ppct_item_revisions_provenance_component_key`.
   - Step 9: Xóa các FK cũ `ppct_item_lineage_predecessor_revision_fkey` và `ppct_item_lineage_successor_revision_fkey`, thiết lập lại 2 composite FKs mang thành phần với `ON DELETE RESTRICT ON UPDATE RESTRICT`.
   - Step 10: Xóa unique index sequence cũ `ppct_item_revisions_version_sequence_key` (DROP INDEX chuẩn tắc) và tạo unique index `ppct_item_revisions_version_component_sequence_key`.
   - Bảo toàn 100% UUIDs, ppctPlanId, version/item identity, sequence, title, lessonType, lineage, associations, khoảng thời gian effective và provenance lịch sử.

4. **Control-Plane Realignment**:
   - `createVersion`: Sao chép `component` từ version nguồn sang draft mới, giữ nguyên stable UUIDs.
   - `replaceContent`:
     - Validate sequence độc lập theo `(component, sequence)`.
     - Bảo vệ tính bất biến của component trên stable `PpctItem` UUID (báo lỗi nếu client cố thay đổi component của UUID đã tồn tại).
     - Kiểm tra và từ chối lineage cross-component với mã lỗi semantic `PPCT_COMPONENT_LINEAGE_CROSS_COMPONENT`.
     - Persist `component` đồng bộ trên item, revision, lineage.
   - `publish`:
     - Bắt buộc bản phát hành phải có ít nhất 1 bài học `CORE` (draft 0 bài học hoặc draft chỉ toàn `SPECIALIZED_STUDY` bị từ chối).
     - Xuất bản nguyên khối nguyên tử cho cả gói phiên bản.
   - `switchAssociation`:
     - Nhận `curricularProfile: CORE_ONLY | CORE_PLUS_SPECIALIZED_STUDY`.
     - Nếu chọn `CORE_PLUS_SPECIALIZED_STUDY`: bắt buộc phiên bản đích đã phát hành phải có ít nhất 1 bài học `SPECIALIZED_STUDY` (ngược lại reject fail-closed).
     - **Server-side week-split prevention**: Khi `curricularProfile` thay đổi, xác định envelope của `AcademicWeek` tương ứng `[week.segments[0].startDate, week.segments[week.segments.length - 1].endDate]`. Nếu `effectiveFrom` rơi vào giữa tuần hoặc trong khoảng gap `CalendarInterruption` nội bộ của tuần đó (`effectiveFrom > envelopeStart && effectiveFrom <= envelopeEnd`), từ chối fail-closed với mã lỗi semantic `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`.
     - Cho phép chuyển đổi phiên bản PPCT giữa tuần nếu giữ nguyên `curricularProfile`.

5. **Read Contracts & Mappers**:
   - `PpctItemRevisionRecord` trả về `component`, `sequence`, `displaySequence` ("1" cho CORE 1, "CD1" cho SPECIALIZED_STUDY 1).
   - `PpctLineageEdgeRecord` trả về `component`.
   - `PpctClassAssociationRecord` trả về `curricularProfile`.
   - DTOs và API responses tích hợp đầy đủ các trường trên.

## Bằng chứng kiểm thử & Verifiers

1. **Canonical Fresh-Database Migration Replay Test**:
   - Script: `scripts/ci/test-canonical-ppct-migration-replay.cjs`: PASS hoàn toàn 10/10 bước:
     1. Khởi tạo disposable database trống `baogiang_migration_replay_ppct`.
     2. Áp dụng 15 migrations chuẩn tắc trước `20260910010000_ppct_component_persistence_foundation`.
     3. Insert dữ liệu legacy pre-P2-002 PPCT (không có cột component/profile).
     4. Ghi nhận exact UUIDs, sequences, titles, lesson types, timestamps, dates.
     5. Áp dụng `20260910010000_ppct_component_persistence_foundation`.
     6. Migration thành công không cần can thiệp thủ công.
     7. Toàn bộ dòng cũ được backfill chính xác sang `CORE` và `CORE_ONLY`.
     8. 100% UUIDs, sequences, titles, lesson types, timestamps, dates được bảo toàn nguyên vẹn.
     9. Truy vấn PostgreSQL catalogs xác nhận: index sequence cũ vắng mặt, index mới tồn tại; các FK mang thành phần tồn tại với RESTRICT/NO ACTION; index provenance và exclusion GiST bảo toàn.
     10. Prisma schema validation và `verify-ppct-schema.sql` PASS trên cơ sở dữ liệu sau migration.

2. **Static Schema & SQL Runtime Verifiers**:
   - `npm run test:schema:static`: PASS (`verify-schema-foundation.cjs`, `verify-academic-structure-schema.cjs`, `verify-business-configuration-schema.cjs`).
   - `verify-ppct-schema.sql`: PASS trên isolated test database (xác thực enums, NOT NULL, unique constraints, composite foreign keys `ON UPDATE RESTRICT`, xóa bỏ sequence unique cũ, và boundary entities không có component).

3. **Typecheck & Lint**:
   - `npm run typecheck`: PASS cả 4 workspace (`@baogiang/contracts`, `@baogiang/config`, `@baogiang/api`, `@baogiang/web`).
   - `npm run lint`: PASS cả 4 workspace với 0 warnings, 0 errors.

4. **Unit Tests**:
   - `npm run test:unit`: 87 suites passed, 1342 tests passed (Web: 17 suites / 236 tests, API: 70 suites / 1106 tests).

5. **Integration Tests**:
   - `test/ppct/ppct.integration.spec.ts`: 10/10 tests PASS (bao gồm persistence, sequence independence, immutability, lineage cross-component rejection, publication validation, class association curricular profile, server-side calendar week-split prevention, boundary preservation).

6. **Production Build**:
   - `npm run build`: PASS cả 4 workspace.

7. **Deployment & Security Gates**:
   - `npm run test:secrets`, `npm run test:deploy:static`, `npm run test:deploy:behavior`, `npm run test:workflow:contract`, `npm run test:deploy:powershell`, `npm run test:ui:static`: tất cả PASS.

8. **GitHub closure evidence**:
   - Independent final diff review: PASS.
   - PR #124 exact-head CI #409 (run `34468164396`): SUCCESS trên head `3d00ebc2bc5b3600104c3889b41c7e1432ae74d6`.
   - PR #124 merged bằng regular merge thành `main@a3151b049d02f6cae9677d7b93b7df2086d421b3`.
   - Authoritative post-merge main CI #410 (run `34468753060`): SUCCESS.
   - Closure được ghi nhận bởi non-recursive administrative microtask `SYNC-P2-002`; không có correction/re-entry task mới phát sinh.
