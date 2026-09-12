# P2-004 — Specialized-Study Class-Subject Administration Workspace

## 1. Metadata & Trạng thái nhiệm vụ (Metadata & Task Status)

- **Mã nhiệm vụ:** `P2-004`
- **Tên nhiệm vụ:** Specialized-study class-subject administration workspace
- **Nhánh làm việc (Branch):** `feat/ppct-specialized-study-admin-workspace-004`
- **Canonical Main Base SHA:** `b5ccfb2b563ea0633aae97a03ac62076a102bb98`
- **Trạng thái (Task Status):** `IN_PROGRESS` (trên nhánh chuyên biệt `feat/ppct-specialized-study-admin-workspace-004`)
- **Cơ sở thẩm quyền kiến trúc (Architectural Authority):**
  - `docs/decisions/ADR-048-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE.md` (chấp thuận kiến trúc thành phần chương trình CORE vs SPECIALIZED_STUDY, PpctClassCurricularProfile, và cơ chế chuyển đổi liên kết bất biến).
  - `docs/requirements/P2-001-PPCT-CURRICULAR-COMPONENT-ARCHITECTURE-AUDIT.md` & `docs/requirements/P2-001D-PPCT-CURRICULAR-COMPONENT-DECISION-CLOSURE.md` (đóng 15 quyết định kiến trúc thành phần PPCT).
  - `docs/requirements/P2-002-PPCT-COMPONENT-PERSISTENCE-CONTROL-PLANE.md` (`CLOSED` — triển khai schema, service, CAS/Serializable concurrency, ngăn chặn chia cắt tuần học mid-week, kiểm toán và hợp đồng backend).
  - `docs/requirements/P2-003-PPCT-COMPONENT-AWARE-ALLOCATION-PROJECTIONS.md` (`CLOSED` — bộ phân bổ định tuyến tuần `PPCT_OCCURRENCE_ALLOCATION_V2`, dự báo tiến độ `TEACHING_PROGRESS_DEBT_V2`, kiểm chứng readiness TKB `NORMAL_BASE_PPCT_COMPONENT_V2`).
- **Liên kết ma trận truy vết (Traceability):** `T45` (PPCT Curricular Component Lineage & Ingestion), `T46` (Curricular Component Class-Subject Applicability & Routing Projection).
- **Mục tiêu chính:** Cung cấp giao diện quản trị web (administrative UI workspace) có kiểm soát capability nghiêm ngặt, cho phép người dùng được phân quyền quản lý hồ sơ áp dụng chương trình (`curricularProfile`: `CORE_ONLY` hoặc `CORE_PLUS_SPECIALIZED_STUDY`) và phiên bản PPCT theo từng cặp Lớp - Môn học, với đầy đủ lịch sử liên kết được bảo toàn (retained association history), kiểm soát đồng thời lạc quan (optimistic concurrency / CAS), bắt lỗi ranh giới tuần học chuẩn tắc từ server, cùng read model tùy chọn chuyên biệt (`ppct-options`) đảm bảo phân quyền chính xác và chống rò rỉ dữ liệu ngoài phạm vi grant.

---

## 2. Tuyến đường & Nhãn điều hướng (Exact Route & Navigation)

- **Tuyến đường giao diện (Exact Route):** `/quan-tri/ppct/ap-dung-chuyen-de`
- **Nhãn hiển thị điều hướng (Exact Navigation Label):** `Áp dụng chuyên đề`
- **Phân định ranh giới chức năng:**
  - Route này là không gian làm việc hành chính - cấu hình nghiệp vụ (applicability administration workspace) nhằm thiết lập và chuyển đổi hồ sơ áp dụng (`PpctClassCurricularProfile`) và phiên bản PPCT công bố cho từng lớp học.
  - Tuyệt đối **KHÔNG** phải là trình biên tập nội dung bài học PPCT (PPCT content editor) hay công cụ nhập liệu kế hoạch bài dạy.

---

## 3. Hợp đồng thẩm quyền & Phân quyền (Authorization Contract)

### 3.1. Capability chi phối & Phạm vi hợp lệ
- Quyền quản trị duy nhất: `PPCT_MANAGE`.
- Hai phạm vi ngữ nghĩa hợp lệ (semantic scopes):
  1. `SCHOOL_WIDE`: Cho phép quản lý toàn trường, có thể xem và chọn toàn bộ danh mục môn học hợp lệ.
  2. `SUBJECT`: Cho phép quản lý chuyên môn trong phạm vi môn học cụ thể được cấp quyền (`resourceId` là `subjectId` hợp lệ).
- **Quy tắc hiển thị và cấp quyền vào Workspace (Client UX gating):**
  - Workspace hiển thị trên menu điều hướng (`managementRoutes`) và cho phép truy cập tuyến đường khi và chỉ khi:
    ```ts
    canManagePpct(capabilities) =
      hasSchoolCapability(capabilities, 'PPCT_MANAGE') ||
      subjectResources(capabilities, 'PPCT_MANAGE').length > 0;
    ```
  - Nếu người dùng chỉ có `PPCT_MANAGE` với phạm vi `SUBJECT`:
    - Bộ lọc môn học (`Subject Select`) chỉ hiển thị và chỉ cho phép người dùng chọn các môn học có `subjectId` trùng với `resourceId` trong danh sách grant của họ.
    - Người dùng bị cấm chọn hoặc gửi thao tác cho các môn học nằm ngoài phạm vi được cấp.
  - Tuyệt đối **KHÔNG** suy diễn quyền từ:
    - Vai trò hệ thống (`SYSTEM_ADMIN` đứng một mình không có `PPCT_MANAGE` thì không có quyền).
    - Chức danh / vị trí công tác (`positionTitle`, giáo viên chủ nhiệm, tổ trưởng bộ môn).
    - Quyền quản lý tổ chuyên môn (`SUBJECT_GROUP_MANAGE` hay `SUBJECT_GROUP` scope không mang thẩm quyền ngầm định sang `PPCT_MANAGE`).
    - Quyền quản lý danh mục môn học (`SUBJECT_MANAGE`) hay quyền quản lý cấu trúc học vụ (`ACADEMIC_STRUCTURE_MANAGE`).
    - Phân công giảng dạy hiện tại (`TeachingAssignment`).
- **Thẩm quyền máy chủ là tối thượng:**
  Client-side route guard (`CapabilityRoute`) chỉ đóng vai trò bảo vệ tầng trải nghiệm (UX protection). Máy chủ backend (`apps/api/src/ppct/ppct-access.service.ts` và `PpctOptionsController`) luôn độc lập kiểm tra và ghi nhận nhật ký vi phạm (`AUTHORIZATION_DENIED`) nếu có yêu cầu trái phép.

---

## 4. Mục đích & Luồng nghiệp vụ của Workspace (Workspace Purpose & Flow)

Người dùng quản trị thực hiện quy trình thiết lập/chuyển đổi liên kết PPCT theo các bước:

1. **Chọn Năm học (`AcademicYear`):** Danh sách năm học tải từ endpoint read model chuyên biệt của PPCT (`GET /ppct-options/academic-years`).
2. **Chọn Lớp học (`SchoolClass`):** Danh sách lớp thuộc năm học đã chọn tải từ `GET /ppct-options/academic-years/:academicYearId`, cung cấp thuộc tính khối lớp (`gradeLevel`: 10, 11, 12).
3. **Chọn Môn học (`Subject`):** Danh mục môn học tải từ `GET /ppct-options/academic-years/:academicYearId`, được lọc thẩm quyền từ máy chủ (chỉ trả về môn actor được cấp quyền).
4. **Hiển thị Lịch sử Liên kết được bảo toàn (`Retained Association History`):**
   - Tải từ API `GET /academic-years/:academicYearId/classes/:schoolClassId/subjects/:subjectId/ppct-associations`.
   - Hiển thị bảng lịch sử với: ngày hiệu lực bắt đầu (`effectiveFrom`), ngày kết thúc (`effectiveUntil`), phiên bản PPCT (`versionNumber`), hồ sơ áp dụng (`curricularProfile`), thời điểm tạo và định danh bản ghi liên kết mới nhất (`latest`).
5. **Phân biệt Bản ghi Mới nhất và Hiệu lực Hiện hành (`Latest vs Currently-Effective Association`):**
   - Lịch sử liên kết được bảo toàn (`retained association history`) phải phân biệt rõ bản ghi mới nhất (`latest`, xác định theo thứ tự chuẩn tắc: `effectiveFrom DESC`, `createdAt DESC`, `id DESC`) với trạng thái hiệu lực hiện hành.
   - Bản ghi mở (`effectiveUntil === null`) biểu thị thời hạn hiệu lực không giới hạn về sau ("Không giới hạn"), tuyệt đối không đồng nghĩa với việc đang áp dụng tại thời điểm hiện tại (bản ghi có thể có `effectiveFrom` trong tương lai).
   - Nhãn hiệu lực hiện hành ("Đang áp dụng") chỉ được phép hiển thị khi có ngày phân giải chuẩn tắc (`authoritative as-of date`) được máy chủ xác nhận. Không gian làm việc P2-004 hiện tại không tự suy diễn thẩm quyền thời gian từ máy khách (no client-side date authority).
6. **Chọn Phiên bản PPCT Đích (`Target PPCT Version`):**
   - Tải danh sách phiên bản thuộc kế hoạch của đúng Năm học - Môn học - Khối lớp (`gradeLevel`).
   - Chỉ cho phép chọn các phiên bản ở trạng thái đã công bố (`PpctVersionStatus.PUBLISHED`).
7. **Chọn Hồ sơ Áp dụng (`Curricular Profile`):**
   - `CORE_ONLY`: Chỉ học phần kiến thức cốt lõi.
   - `CORE_PLUS_SPECIALIZED_STUDY`: Học cốt lõi kết hợp chuyên đề học tập lựa chọn.
8. **Chọn Ngày Bắt đầu Hiệu lực (`effectiveFrom`):**
   - Nhập ngày dân sự hợp lệ dạng `YYYY-MM-DD`.
   - Phải kèm thông báo hướng dẫn: ngày hiệu lực phải bắt đầu tại ranh giới tuần học nghiệp vụ hợp lệ và sau ngày bắt đầu của liên kết mới nhất.
9. **Gửi lệnh Chuyển đổi (`Submit Switch`):**
   - Gửi yêu cầu `POST .../ppct-associations/switch` kèm `expectedLatestAssociationId` để kiểm soát tương tranh lạc quan.
10. **Tự động Làm mới Dữ liệu (`Refetch Authoritative State`):**
    - Làm mới lịch sử liên kết và trạng thái phân giải sau khi chuyển đổi thành công.

---

## 5. Xác nhận Lỗ hổng Kiến trúc Read-Model Backend & Giải pháp (Backend Read-Model Gap Confirmed)

### 5.1. Bằng chứng kiểm toán lỗ hổng (The Proven Gap)
Qua kiểm toán mã nguồn backend hiện hữu:
1. `GET /subjects` tại `apps/api/src/catalogs/subjects.controller.ts` yêu cầu chặt chẽ:
   `@RequireCapability('SUBJECT_MANAGE', { scope: 'SCHOOL_WIDE' })`
2. `GET /academic-years` và `GET /academic-years/:academicYearId/classes` tại `apps/api/src/academic-structure/academic-years.controller.ts` yêu cầu:
   `@RequireCapability('ACADEMIC_STRUCTURE_MANAGE', { scope: 'SCHOOL_WIDE' })`
3. Thẩm quyền quản trị PPCT quy định tại ADR-048 và P2-001/P2-002 là:
   `PPCT_MANAGE / SUBJECT` (hoặc `PPCT_MANAGE / SCHOOL_WIDE`).

Một người dùng được giao quản lý PPCT môn Toán (`PPCT_MANAGE` phạm vi `SUBJECT` môn Toán) **KHÔNG THỂ VÀ KHÔNG ĐƯỢC PHÉP** yêu cầu phải có quyền `SUBJECT_MANAGE` (quản trị danh mục môn học toàn trường) hay `ACADEMIC_STRUCTURE_MANAGE` (quản trị cấu trúc năm học và lớp toàn trường). Nếu UI gọi trực tiếp các generic endpoint trên, máy chủ sẽ lập tức trả về lỗi HTTP 403 Forbidden (`AUTHORIZATION_DENIED`).

**Kết luận bắt buộc: BACKEND READ-MODEL GAP CONFIRMED.**

### 5.2. Không nới lỏng quyền hạn của Generic Endpoints
Tuyệt đối **KHÔNG** hạ cấp, mở rộng hay nới lỏng `@RequireCapability` của:
- `GET /subjects`
- `GET /academic-years`
- `GET /academic-years/:academicYearId/classes`
Các generic endpoint này quản trị cấu trúc nền tảng và không được phép bị suy giảm tính an toàn chỉ để phục vụ màn hình chọn dữ liệu của một phân hệ nghiệp vụ.

### 5.3. Hợp đồng Read-Model Tùy chọn chuyên biệt cho PPCT (`ppct-options`)
Theo đúng tiền lệ kiến trúc đã áp dụng thành công tại `teaching-assignment-options` (`apps/api/src/teaching-assignments/teaching-assignment-options.controller.ts`), P2-004 bổ sung bộ endpoint read-model chuyên biệt được bảo vệ bởi đúng thẩm quyền `PPCT_MANAGE`:

#### A. Tuyến đường danh sách năm học:
`GET /ppct-options/academic-years`
- **Thẩm quyền:** Yêu cầu người dùng có `PPCT_MANAGE` (ít nhất một grant hợp lệ `SCHOOL_WIDE` hoặc `SUBJECT`).
- **Phản hồi:** Danh sách rút gọn các năm học cần thiết cho workspace:
  ```ts
  export interface PpctWorkspaceAcademicYearOptionRecord {
    id: string;
    code: string;
    name: string;
  }
  export interface PpctWorkspaceAcademicYearOptionListResponse {
    items: PpctWorkspaceAcademicYearOptionRecord[];
  }
  ```

#### B. Tuyến đường tùy chọn Lớp và Môn theo năm học:
`GET /ppct-options/academic-years/:academicYearId`
- **Thẩm quyền:** Yêu cầu `PPCT_MANAGE`.
- **Quy tắc lọc dữ liệu phía máy chủ (Authoritative Server-side Filtering):**
  - **Năm học (`academicYear`):** Tóm tắt thông tin năm học được chọn (`id, code, name`).
  - **Lớp học (`classes`):** Toàn bộ các lớp học hợp lệ thuộc năm học đã chọn (`id, code, name, gradeLevel, status`).
  - **Môn học (`subjects`):**
    - Nếu actor có `PPCT_MANAGE / SCHOOL_WIDE`: Trả về tất cả các môn học đang hoạt động (`ACTIVE`) trong trường.
    - Nếu actor có `PPCT_MANAGE / SUBJECT`: **CHỈ** trả về các môn học có `id` trùng khớp chính xác với `resourceId` được cấp trong grant hợp lệ của actor.
- **Phản hồi:**
  ```ts
  export interface PpctWorkspaceClassOptionRecord {
    id: string;
    code: string;
    name: string;
    gradeLevel: 10 | 11 | 12;
    status: string;
  }
  export interface PpctWorkspaceSubjectOptionRecord {
    id: string;
    code: string;
    name: string;
    status: string;
  }
  export interface PpctWorkspaceOptionsResponse {
    academicYear: PpctWorkspaceAcademicYearOptionRecord;
    classes: PpctWorkspaceClassOptionRecord[];
    subjects: PpctWorkspaceSubjectOptionRecord[];
  }
  ```

### 5.4. Ranh giới Chống Rò rỉ Dữ liệu (Data-Leakage Boundary)
- **Không rò rỉ môn học ngoài grant:** Actor có phạm vi `SUBJECT` tuyệt đối không nhận được metadata (id, mã môn, tên môn) của bất kỳ môn học nào ngoài danh sách grant của mình.
- **Không bypass CapabilityGuard:** Không dùng thủ thuật bypass bảo vệ để tái sử dụng generic endpoint; read-model `ppct-options` phải được phân quyền độc lập và kiểm tra chặt chẽ.
- **Dữ liệu cấu trúc chỉ trả trong ngữ cảnh PPCT:** Metadata năm học và lớp học chỉ được trả về khi người dùng đã xác thực ít nhất một quyền `PPCT_MANAGE` hợp lệ.
- **Không tạo capability key mới:** Tận dụng triệt để `PPCT_MANAGE` hiện có với hai scope chuẩn tắc `SCHOOL_WIDE` và `SUBJECT`.

### 5.5. Tổng hợp các API phục vụ Workspace P2-004

| Mục đích nghiệp vụ | Phương thức & Tuyến đường API | Trách nhiệm & Thẩm quyền |
|---|---|---|
| Lấy danh sách năm học khả dụng | `GET /ppct-options/academic-years` | Read model mới — `PPCT_MANAGE` |
| Lấy danh sách Lớp & Môn được phép | `GET /ppct-options/academic-years/:academicYearId` | Read model mới — `PPCT_MANAGE` (Server-filtered) |
| Lấy kế hoạch PPCT khối-môn | `GET /academic-years/:academicYearId/ppct-plans?subjectId=...&gradeLevel=...` | API hiện hữu — `AcademicYearPpctPlansController` |
| Lấy các phiên bản của kế hoạch | `GET /ppct-plans/:planId/versions` | API hiện hữu — `PpctPlansController` |
| Kiểm tra nội dung phiên bản | `GET /ppct-versions/:versionId/content` | API hiện hữu — `PpctVersionsController` |
| Lịch sử liên kết Lớp - Môn | `GET /academic-years/:academicYearId/classes/:schoolClassId/subjects/:subjectId/ppct-associations` | API hiện hữu — `PpctClassAssociationsController.history` |
| Chuyển đổi liên kết Lớp - Môn | `POST /academic-years/:academicYearId/classes/:schoolClassId/subjects/:subjectId/ppct-associations/switch` | API hiện hữu — `PpctClassAssociationsController.switch` |
| Chẩn đoán phân giải ngày | `GET /academic-years/:academicYearId/classes/:schoolClassId/subjects/:subjectId/ppct-resolution?date=...` | API hiện hữu — `PpctClassAssociationsController.resolve` |

---

## 6. Ngữ nghĩa Hồ sơ Áp dụng (Curricular Profile Semantics)

1. **`CORE_ONLY`:**
   - Chỉ áp dụng các bài học thuộc thành phần `CORE`.
   - Các bài học chuyên đề (`SPECIALIZED_STUDY`) thuộc phiên bản PPCT được gán trạng thái `NOT_APPLICABLE` trong các phép tính toán downstream (bộ phân bổ định tuyến tuần, dự báo tiến độ, nợ tiết).
   - Giao diện người dùng tuyệt đối **KHÔNG** gọi thao tác này là *"xóa chuyên đề"* hay *"hủy bỏ chuyên đề"*, mà gọi chuẩn xác là *"Chỉ áp dụng chương trình cốt lõi"*.
2. **`CORE_PLUS_SPECIALIZED_STUDY`:**
   - Áp dụng đồng thời cả chương trình cốt lõi và chuyên đề học tập.
   - Phiên bản PPCT công bố được chọn **BẮT BUỘC** phải chứa ít nhất một bài học chuyên đề (`SPECIALIZED_STUDY`).
   - Giao diện hỗ trợ kiểm tra trước (preflight check) bằng cách đọc `PpctVersionContent` để cảnh báo nếu phiên bản không có bài chuyên đề nào, nhưng quyết định xác thực cuối cùng vẫn thuộc về server.
3. **Cấm suy diễn ngầm định:**
   Tuyệt đối không suy diễn hồ sơ áp dụng từ số tiết trên thời khóa biểu, tên lớp học, mã môn học, giáo viên phụ trách hay loại tiết học (`lessonType`). Hồ sơ áp dụng hoàn toàn là quyết định hành chính có thẩm quyền được lưu trong `PpctClassAssociation`.

---

## 7. Quy tắc Ranh giới Tuần học & Ngày Hiệu lực (Effective Date & Week Boundary)

1. **Trợ giúp trên giao diện (Helper Guidance):**
   - Form chuyển đổi bắt buộc có chỉ dẫn rõ ràng:
     > *"Thay đổi hồ sơ áp dụng phải bắt đầu tại ranh giới tuần học hợp lệ."*
2. **Không tự phán quyết ranh giới tuần bằng ISO Week trên Client:**
   - Client không được sử dụng thuật toán số tuần ISO (ISO-8601 calendar week) hay phép tính ngày cục bộ để coi là thẩm quyền xác định ranh giới tuần học.
   - Ranh giới tuần học thuộc thẩm quyền của phiên bản lịch năm học đang hoạt động (`AcademicCalendarVersion` với các `AcademicWeekSegment`).
3. **Bắt lỗi chia cắt tuần học từ Server (`PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`):**
   - Khi thay đổi `curricularProfile` mà `effectiveFrom` rơi vào giữa tuần học nghiệp vụ (từ sau ngày bắt đầu phân đoạn đầu tiên đến hết ngày kết thúc phân đoạn cuối cùng của tuần), server sẽ ném lỗi 409:
     ```json
     {
       "statusCode": 409,
       "error": "PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT",
       "message": "Thay đổi hồ sơ áp dụng chương trình không được chia cắt tuần học nghiệp vụ."
     }
     ```
   - Giao diện phải bắt chính xác mã lỗi này, hiển thị thông báo nghiệp vụ rõ ràng, và **GIỮ NGUYÊN NỘI DUNG FORM** để người dùng điều chỉnh lại ngày `effectiveFrom` mà không làm mất dữ liệu đã nhập.

---

## 8. Cơ chế Kiểm soát Tương tranh Lạc quan (Optimistic Concurrency Control)

1. **Gửi mốc kỳ vọng mới nhất (`expectedLatestAssociationId`):**
   - Mỗi lệnh chuyển đổi `POST .../switch` phải gửi kèm trường `expectedLatestAssociationId`:
     - Nếu lớp - môn đã có lịch sử liên kết: truyền ID của bản ghi liên kết mới nhất hiện tại (`latestAssociation.id`).
     - Nếu lớp - môn chưa từng có liên kết nào: truyền `null`.
2. **Xử lý xung đột dữ liệu cũ (Stale Conflict - HTTP 409):**
   - Nếu bản ghi mới nhất trên cơ sở dữ liệu không khớp với `expectedLatestAssociationId` (do người dùng khác hoặc phiên làm việc khác đã thực hiện chuyển đổi trước đó):
     - Tuyệt đối **KHÔNG** tự động thử lại (no automatic retry).
     - Hiển thị cảnh báo trực quan: *"Dữ liệu liên kết đã thay đổi bởi phiên làm việc khác."*
     - Tự động kích hoạt làm mới lại danh sách lịch sử (`refetch history`).
     - Yêu cầu người dùng xem xét lại trạng thái mới nhất trước khi đưa ra quyết định chuyển đổi lại.

---

## 9. Hiển thị Lịch sử & Ranh giới Nhật ký Kiểm toán (History & Audit Boundary)

1. **Bảng Lịch sử Liên kết được bảo toàn (`Retained Association History Table`):**
   - Mỗi lần chuyển đổi tạo một bản ghi `PpctClassAssociation` mới và cập nhật `effectiveUntil` của bản ghi trước đó. Không bao giờ xóa bản ghi cũ.
   - Bảng lịch sử bắt buộc hiển thị:
     - Ngày bắt đầu (`effectiveFrom`) và Ngày kết thúc (`effectiveUntil` hoặc *"Hiện hành"* / *"Mở"*).
     - Phiên bản PPCT (Số phiên bản, trạng thái `PUBLISHED`).
     - Hồ sơ áp dụng (`CORE_ONLY` hoặc `CORE_PLUS_SPECIALIZED_STUDY`).
     - Nhãn định danh bản ghi liên kết hiện hành (`current`) và liên kết mới nhất (`latest`).
     - Người tạo và thời điểm tạo.
2. **Ranh giới Kiểm toán Backend (Backend Audit Trail):**
   - Backend service tại `P2-002` đã ghi nhận sự kiện `PPCT_CLASS_ASSOCIATION_SWITCHED` trong cùng một giao dịch Serializable.
   - Nhiệm vụ `P2-004` **KHÔNG** tích hợp thêm hệ thống ghi nhật ký kiểm toán kỹ thuật độc lập nào khác và không ghi đè/duplicate cơ chế lưu audit đã có.

---

## 10. Mô hình Trạng thái Giao diện & Xử lý Lỗi (State & Error Model)

Giao diện người dùng phải xử lý đầy đủ và thanh lịch các trạng thái sau:

- **Đang tải (`Loading`):** Hiển thị loading indicator thống nhất khi tải options, năm học, lớp, môn, kế hoạch hoặc lịch sử.
- **Trống dữ liệu ban đầu (`Empty Filters`):** Chỉ dẫn người dùng lần lượt chọn Năm học -> Lớp học -> Môn học.
- **Chưa có kế hoạch PPCT (`No PPCT Plan`):** Lớp và Môn được chọn nhưng khối lớp đó chưa được khởi tạo kế hoạch PPCT trong năm học.
- **Chưa có phiên bản công bố (`No Published Version`):** Kế hoạch PPCT đã tạo nhưng chưa có phiên bản nào ở trạng thái `PUBLISHED`.
- **Chưa có liên kết trước đó (`No Prior Association`):** Trạng thái khởi đầu hợp lệ; cho phép thực hiện liên kết đầu tiên với `expectedLatestAssociationId = null`.
- **Môn học ngoài quyền hạn (`Unauthorized Subject`):** Người dùng có quyền `SUBJECT` bị hạn chế không được xem/chọn môn học ngoài danh sách grant (đã được server loại bỏ khỏi options).
- **Phiên bản thiếu bài chuyên đề (`Target Lacks Specialized Content`):** Người dùng chọn hồ sơ `CORE_PLUS_SPECIALIZED_STUDY` nhưng phiên bản đã chọn chỉ có bài `CORE`.
- **Chia cắt tuần học (`PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`):** Lỗi nghiệp vụ từ chối ngày hiệu lực rơi vào giữa tuần học; form được giữ nguyên để sửa ngày.
- **Xung đột tương tranh (`Stale Latest Association`):** Cảnh báo dữ liệu đã thay đổi, tự động tải lại lịch sử.
- **Lỗi hệ thống chuẩn hóa (`Sanitized Error`):** Không bao giờ làm lộ stack trace, SQL query hay cấu trúc nội bộ máy chủ; hiển thị thông báo tiếng Việt thân thiện, rõ ràng.
- **Thành công (`Mutation Success`):** Thông báo chuyển đổi thành công, reset trạng thái form và tự động làm mới lịch sử liên kết.

---

## 11. Kiến trúc Thành phần Giao diện (UI Architecture)

Tuân thủ nguyên tắc thiết kế thống nhất của hệ thống (`DESIGN.md` và `.codex/skills/damsan-ui/SKILL.md`):

1. **Trang chuyên biệt (Dedicated Page):**
   - Tạo `apps/web/src/pages/PpctSpecializedStudyPage.tsx`.
   - Kết nối vào `apps/web/src/App.tsx` dưới tuyến đường `/quan-tri/ppct/ap-dung-chuyen-de` với route guard `canManagePpct`.
2. **Khối API Client & Hooks chuyên biệt (Dedicated API Client):**
   - Tạo `apps/web/src/lib/ppct-api.ts` cung cấp các hàm gọi API có định kiểu đầy đủ từ `@baogiang/contracts`:
     - `fetchPpctWorkspaceAcademicYears`
     - `fetchPpctWorkspaceOptions(academicYearId)`
     - `fetchPpctAssociationHistory`
     - `switchPpctAssociation`
     - `fetchPpctPlans`
     - `fetchPpctVersions`
     - `fetchPpctVersionContent`
   - Quản lý trạng thái bằng React Query với query keys có cấu trúc rõ ràng:
     - `['ppct-options', 'academic-years']`
     - `['ppct-options', 'workspace', academicYearId]`
     - `['ppct-associations', academicYearId, schoolClassId, subjectId]`
     - `['ppct-plans', academicYearId, subjectId, gradeLevel]`
     - `['ppct-versions', planId]`
     - `['ppct-version-content', versionId]`
3. **Phân rã thành phần con (Modular Components):**
   - Phân chia module rõ ràng: Bộ chọn ngữ cảnh (Context Selectors), Bảng lịch sử liên kết (Association History Table), Form chuyển đổi liên kết (Association Switch Form), Bảng chi tiết phiên bản (Target Version Details).
   - Tuyệt đối tránh một file component khổng lồ (giant monolithic component).
4. **Bảo toàn Ngày Dân sự (Civil Date Preservation):**
   - Ngày tháng lưu trữ và gửi lên máy chủ luôn ở định dạng chuẩn `YYYY-MM-DD`.
   - Không chuyển đổi qua đối tượng `Date` của JavaScript gây lệch múi giờ cục bộ.
   - Định dạng hiển thị tiếng Việt dạng `DD/MM/YYYY` qua hàm tiện ích `formatCivilDate`.

---

## 12. Ma trận Kiểm thử Tối thiểu (Expanded Test Matrix)

Bộ kiểm thử tự động của P2-004 bắt buộc bao quát tối thiểu 28 kịch bản sau:

### A. Kiểm thử Giao diện & Phân quyền Client (UI & Client Authorization)
1. Menu quản trị ẩn mục "Áp dụng chuyên đề" khi người dùng hoàn toàn không có quyền `PPCT_MANAGE`.
2. Menu hiển thị mục "Áp dụng chuyên đề" khi người dùng có quyền `PPCT_MANAGE` phạm vi `SCHOOL_WIDE`.
3. Menu hiển thị mục "Áp dụng chuyên đề" khi người dùng có ít nhất một quyền `PPCT_MANAGE` phạm vi `SUBJECT`.
4. Người dùng có quyền `SUBJECT` chỉ thấy và chỉ chọn được các môn học trong phạm vi grant của mình.
5. Người dùng có quyền `SUBJECT` ở môn A bị chặn hoàn toàn khi cố tình truy cập hoặc gửi yêu cầu cho môn B.
6. Vai trò `SYSTEM_ADMIN` đứng một mình (không có `PPCT_MANAGE`) không được cấp quyền vào trang.
7. Tuyến đường trực tiếp `/quan-tri/ppct/ap-dung-chuyen-de` bị chặn bởi route guard và chuyển hướng hợp lệ khi thiếu quyền.
8. Bảng lịch sử liên kết hiển thị chính xác các bản ghi liên kết đã lưu trong cơ sở dữ liệu.
9. Xử lý chính xác trạng thái ban đầu khi lớp - môn chưa từng có liên kết nào (`No prior association`, `expectedLatestAssociationId = null`).
10. Lệnh chuyển đổi hồ sơ `CORE_ONLY` gửi chính xác payload lên máy chủ.
11. Lệnh chuyển đổi hồ sơ `CORE_PLUS_SPECIALIZED_STUDY` gửi chính xác payload lên máy chủ.
12. Hiển thị thông tin kiểm tra trước (preflight) về số lượng bài chuyên đề của phiên bản PPCT được chọn.
13. Xử lý và hiển thị cảnh báo khi chọn hồ sơ chuyên đề nhưng phiên bản đích không chứa bài chuyên đề nào.
14. Xử lý và hiển thị thông báo lỗi nghiệp vụ rõ ràng khi máy chủ trả mã lỗi `PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT`, form được giữ nguyên.
15. Xử lý và hiển thị cảnh báo xung đột dữ liệu cũ khi `expectedLatestAssociationId` không khớp, kích hoạt tự động refetch.
16. Sau khi chuyển đổi thành công, hệ thống tự động vô hiệu hóa cache React Query và tải lại lịch sử mới nhất.
17. Hiển thị đầy đủ và thẩm mỹ các trạng thái loading, error, empty filters, và không tìm thấy kế hoạch PPCT.
18. Giá trị ngày dân sự `effectiveFrom` được giữ nguyên vẹn `YYYY-MM-DD`, không bị lệch do múi giờ client.
19. Không có bất kỳ sự suy diễn quyền hạn hay hồ sơ áp dụng nào từ role, title, hay dữ liệu thời khóa biểu.
20. Kiểm thử tích hợp / smoke test luồng đăng nhập và điều hướng đến không gian làm việc áp dụng chuyên đề.

### B. Kiểm thử Backend Read Model & Ranh giới Thẩm quyền (Backend Read-Model & Authority Boundary Tests)
21. Người dùng có `PPCT_MANAGE / SUBJECT` tải thành công PPCT workspace options dù hoàn toàn không có quyền `SUBJECT_MANAGE`.
22. Người dùng có `PPCT_MANAGE / SUBJECT` tải thành công năm học và lớp học trong PPCT workspace options mà không cần quyền `ACADEMIC_STRUCTURE_MANAGE`.
23. Máy chủ lọc chặt chẽ và chỉ trả về các môn học được cấp quyền tường minh trong danh sách `subjects` của options response cho actor có scope `SUBJECT`.
24. Người dùng có `PPCT_MANAGE / SCHOOL_WIDE` nhận được toàn bộ danh sách các môn học hợp lệ trong trường.
25. Ranh giới chống rò rỉ: Metadata của các môn học ngoài grant tuyệt đối không xuất hiện trong phản hồi trả về cho actor phạm vi `SUBJECT` (no cross-subject leakage).
26. Vai trò `SYSTEM_ADMIN` đơn lẻ (không có grant `PPCT_MANAGE`) bị từ chối với HTTP 403 khi gọi `GET /ppct-options/...`.
27. Đảm bảo endpoint danh mục chung `GET /subjects` vẫn yêu cầu nghiêm ngặt `SUBJECT_MANAGE / SCHOOL_WIDE` và từ chối `PPCT_MANAGE / SUBJECT`.
28. Đảm bảo endpoint học vụ chung `GET /academic-years` và `GET /academic-years/:id/classes` vẫn yêu cầu nghiêm ngặt `ACADEMIC_STRUCTURE_MANAGE / SCHOOL_WIDE` và từ chối `PPCT_MANAGE / SUBJECT`.

---

## 13. Các mục Nằm ngoài Phạm vi (Explicit Non-Goals)

Để duy trì tính tập trung và an toàn kiến trúc, các nội dung sau tuyệt đối **KHÔNG** thuộc phạm vi của P2-004:

- **Không thay đổi Prisma schema hay thêm migration:** Mô hình dữ liệu đã được chốt và di trú hoàn tất tại `P2-002`.
- **Không nới lỏng quyền hạn của generic endpoints:** Giữ nguyên 100% `@RequireCapability` của `SubjectsController` và `AcademicYearsController`.
- **Không xây dựng hay thay đổi bộ nhập liệu PPCT (Importer):** Thuộc phạm vi của `P2-010` và `P2-020`.
- **Không xây dựng trình soạn thảo bài học PPCT (PPCT Item Editor):** Việc tạo/sửa bài học PPCT là chức năng độc lập khác.
- **Không thay đổi bộ phân bổ thời khóa biểu hay phép chiếu tiến độ/nợ tiết:** Đã hoàn thành và đóng tại `P2-003`.
- **Không thay đổi báo cáo hay giao diện kê khai của giáo viên:** Đã hoàn thành tại các pha trước.
- **Không can thiệp vào các thực thể thời khóa biểu (`TeachingAssignment`, `TimetableEntry`):** Vẫn được giữ nguyên vẹn tính độc lập với thành phần chuyên đề theo đúng ADR-048.
- **Không tạo capability key mới hay cấp quyền tự động:** Giữ nguyên thẩm quyền `PPCT_MANAGE`.
- **Không triển khai (deployment), không chạy migration production.**

---

## 14. Danh sách Tệp tin Dự kiến Triển khai (Updated Planned Implementation Files)

Dự kiến các tệp tin sẽ được tạo/chỉnh sửa trong pha thực thi tiếp theo (tuyệt đối không chỉnh sửa code/test trong Checkpoint 0 và 0.1 này):

### Backend & Contracts Scope:
- `packages/contracts/src/index.ts`: Bổ sung kiểu dữ liệu cho read model tùy chọn workspace (`PpctWorkspaceAcademicYearOptionRecord`, `PpctWorkspaceAcademicYearOptionListResponse`, `PpctWorkspaceClassOptionRecord`, `PpctWorkspaceSubjectOptionRecord`, `PpctWorkspaceOptionsResponse`).
- `apps/api/src/ppct/ppct-options.controller.ts`: Controller phục vụ các endpoint `GET /ppct-options/academic-years` và `GET /ppct-options/academic-years/:academicYearId`.
- `apps/api/src/ppct/ppct-options.service.ts`: Service truy vấn năm học, lớp học và lọc môn học theo thẩm quyền `PPCT_MANAGE`.
- `apps/api/src/ppct/ppct.module.ts`: Đăng ký controller và service tùy chọn mới vào module PPCT.
- `apps/api/test/ppct/ppct-options.integration.spec.ts`: Bộ API integration test kiểm tra thẩm quyền `SCHOOL_WIDE`, `SUBJECT`, chống rò rỉ dữ liệu, từ chối `SYSTEM_ADMIN` đơn lẻ, và bảo toàn generic endpoints.

### Web Frontend Scope:
- `apps/web/src/App.tsx`: Đăng ký tuyến đường `/quan-tri/ppct/ap-dung-chuyen-de` và bảo vệ route guard.
- `apps/web/src/lib/capabilities.ts`: Bổ sung hàm tiện ích `canManagePpct`, `subjectResources`, và nhãn điều hướng `managementRoutes`.
- `apps/web/src/lib/ppct-api.ts`: Module API client gọi các endpoint `ppct-options` và các endpoint PPCT hiện hữu.
- `apps/web/src/pages/PpctSpecializedStudyPage.tsx`: Trang giao diện chính của không gian làm việc quản trị chuyên đề.
- `apps/web/src/__tests__/ppct-specialized-study-page.test.tsx`: Bộ unit & integration test chuyên biệt cho trang.
- `apps/web/src/__tests__/capability-navigation.test.tsx`: Bổ sung test case kiểm tra điều hướng menu với quyền `PPCT_MANAGE`.
- `apps/web/playwright/ppct-specialized-study.spec.ts`: (Tùy chọn) End-to-end smoke test nếu cần thiết.

---

## 15. Tiêu chuẩn Vượt qua Cổng Kiểm soát (Quality Gates)

Trước khi gửi Pull Request và yêu cầu đánh giá độc lập, mã nguồn triển khai phải vượt qua toàn bộ các cổng kiểm soát:

1. **Targeted Backend Integration Tests:** Toàn bộ API test của `ppct-options` đạt 100% PASS (bao gồm các test case 21-28).
2. **Targeted Web Tests:** Toàn bộ test của P2-004 (`ppct-specialized-study-page.test.tsx`, `capability-navigation.test.tsx`) đạt 100% PASS.
3. **Full Web & API Unit Tests:** Bộ kiểm thử đơn vị của toàn bộ repo chạy hoàn tất không có lỗi.
4. **Lint:** `pnpm lint` sạch sẽ trên toàn bộ packages (`contracts`, `api`, `web`).
5. **Typecheck:** `pnpm typecheck` hoàn toàn sạch lỗi kiểu TypeScript.
6. **Build:** `pnpm build` hoàn tất thành công.
7. **Playwright Smoke:** Các kịch bản e2e smoke liên quan đến điều hướng và quản trị đạt kết quả PASS.
8. **Full Canonical CI:** Toàn bộ pipeline CI của kho mã nguồn đạt trạng thái xanh trên GitHub Actions.
