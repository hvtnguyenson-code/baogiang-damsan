# P2-010 — Kiểm toán Hợp đồng và An toàn Workbook PPCT Thực tế (PPCT Real-Workbook Contract & Security Audit)

- **Trạng thái nhiệm vụ:** `IN_REVIEW`
- **Nhánh thực thi:** `docs/ppct-real-workbook-contract-security-audit-010`
- **Canonical starting baseline SHA:** `b8b5f9862c2dc160e124a19b863ac547b44ef94b`
- **Tên workbook chuẩn tắc:** `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`
- **Đường dẫn bằng chứng cục bộ:** `D:\baogiang-damsan\.local-evidence\Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`
- **Authoritative SHA-256:** `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`
- **Bằng chứng Git exclusion:** Resolve qua `.git/info/exclude:8:.local-evidence/`, không bị track bởi git (`git ls-files` = NO OUTPUT)
- **Điều kiện tiên quyết:** `P2-001` (CLOSED), `P0-900` (CLOSED), `ADR-048` (Accepted), `P2-002` (CLOSED), `P2-003` (CLOSED), `P2-004` (CLOSED)
- **Ma trận truy xuất nguồn gốc (Traceability):** `T24`, `T45`
- **Nhiệm vụ hạ nguồn:** `P2-020` (PPCT native importer implementation) tiếp tục ở trạng thái `PLANNED` (bị khóa cho đến khi P2-010 hoàn tất review, merge, post-merge CI và closure sync).

---

## 1. Danh tính Nhiệm vụ và Trạng thái (Task Identity and Status)

Nhiệm vụ `P2-010` thực hiện kiểm toán gói tệp (package & security audit), cấu trúc vật lý workbook (sheets, tables, columns, rows, cell types, formulas) và khóa toàn diện hợp đồng nhập liệu từ workbook PPCT chính thức của trường Đam San sang mô hình nghiệp vụ PPCT chuẩn tắc đã được đóng tại `ADR-048`, `P2-002`, `P2-003`, `P2-004`.

Nhiệm vụ này là **kiểm toán kiến trúc và hợp đồng nghiệp vụ ràng buộc bằng chứng thực tế (evidence-bound architecture/contract audit)**, tuân thủ nghiêm ngặt các ranh giới:
- **KHÔNG** triển khai bộ nhập (importer runtime);
- **KHÔNG** sửa đổi schema Prisma;
- **KHÔNG** tạo migration cơ sở dữ liệu;
- **KHÔNG** deploy hoặc thực hiện bất kỳ mutation nào trên môi trường production;
- **KHÔNG** đưa raw workbook vào git repository, fixture hay test code.

Trạng thái nhiệm vụ trên nhánh: **`IN_REVIEW`**.

---

## 2. Canonical Starting Baseline

- **Mã SHA khởi đầu chuẩn tắc:** `b8b5f9862c2dc160e124a19b863ac547b44ef94b`
- Commit `origin/main` sau khi hoàn tất `P2-061`, quy trình đồng bộ `SYNC-P2-061`, PR #168 và post-merge CI run #533 SUCCESS.
- Nhánh nhiệm vụ `docs/ppct-real-workbook-contract-security-audit-010` được phân nhánh trực tiếp từ SHA này.

---

## 3. Authoritative Evidence Fingerprint

| Thuộc tính | Giá trị kiểm toán thực tế |
|---|---|
| **Tên tệp** | `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx` |
| **Đường dẫn cục bộ** | `D:\baogiang-damsan\.local-evidence\Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx` |
| **Dung lượng tệp nén** | 34,897 bytes (~34.1 KB) |
| **SHA-256 (tính trực tiếp từ bytes)** | `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692` |
| **Kích thước giải nén (Uncompressed size)** | 199,762 bytes (~195 KB) |
| **Tỷ lệ nén (Expansion ratio)** | 6.08 (nằm sâu dưới ngưỡng bảo vệ zip bomb 20:1 và giới hạn 64MB) |
| **Trạng thái Git ignore** | Đã được cấu hình an toàn trong `.git/info/exclude:8:.local-evidence/` |
| **Trạng thái Git tracking** | Không bị theo dõi (`git ls-files -- .local-evidence/*` không có đầu ra) |

---

## 4. Kiểm kê Gói Tệp và Workbook (Workbook/Package Inventory)

Gói ZIP OpenXML chứa tổng cộng 17 entries:

```text
xl/workbook.xml (1,000 bytes)
xl/styles.xml (11,560 bytes)
xl/theme/theme1.xml (3,546 bytes)
xl/sharedStrings.xml (115 bytes - không chứa shared strings, các chuỗi dùng inlineStr)
xl/worksheets/sheet1.xml (3,967 bytes) -> THONG_TIN
xl/worksheets/sheet2.xml (113,411 bytes) -> PPCT
xl/tables/table1.xml (938 bytes) -> PPCT_Table (A1:I301)
xl/worksheets/sheet3.xml (43,848 bytes) -> CHUYEN_DE
xl/tables/table2.xml (915 bytes) -> CHUYEN_DE_Table (A1:H121)
xl/worksheets/sheet4.xml (7,170 bytes) -> HUONG_DAN
xl/worksheets/sheet5.xml (2,621 bytes) -> DANH_MUC
xl/worksheets/sheet6.xml (6,448 bytes) -> VI_DU
_rels/.rels (296 bytes)
xl/_rels/workbook.xml.rels (1,549 bytes)
xl/worksheets/_rels/sheet2.xml.rels (292 bytes)
xl/worksheets/_rels/sheet3.xml.rels (292 bytes)
[Content_Types].xml (1,794 bytes)
```

Kiểm kê thứ tự sheet và thuộc tính:

| STT | Tên Sheet | XML Path | SheetId | RelId | Visibility | Dimensions / Table | Merged Cells | Công thức (Formulas) |
|:---:|---|---|:---:|---|:---:|---|:---:|:---:|
| 1 | `THONG_TIN` | `sheet1.xml` | 1 | `R7480f8d70c8d4d6d` | `visible` | 14 dòng | 3 vùng (`A1:D1`, `A8:D8`, `A10:D10`) | 0 |
| 2 | `PPCT` | `sheet2.xml` | 2 | `Rd185c7843b6e428e` | `visible` | Table `PPCT_Table` (`A1:I301`) | 0 | 600 (chỉ ở cột H và I) |
| 3 | `CHUYEN_DE` | `sheet3.xml` | 3 | `R03ea621d90b64fba` | `visible` | Table `CHUYEN_DE_Table` (`A1:H121`) | 0 | 240 (chỉ ở cột G và H) |
| 4 | `HUONG_DAN` | `sheet4.xml` | 4 | `R2c83840101fe4c29` | `visible` | 22 dòng | 4 vùng (`A1:F1`, `A12:F12`, `A14:F14`, `A16:F16`) | 0 |
| 5 | `DANH_MUC` | `sheet5.xml` | 5 | `R3fec1f221a824114` | `visible` | 17 dòng | 0 | 0 |
| 6 | `VI_DU` | `sheet6.xml` | 6 | `R5396931a583c472e` | `visible` | 14 dòng | 2 vùng (`A1:I1`, `A8:H8`) | 0 |

- **Sheet ẩn (hidden / veryHidden):** 0 (toàn bộ 6 sheets đều `visible`).
- **Dòng ẩn (hidden rows):** 0.
- **Cột ẩn (hidden columns):** 0.
- **Defined names:** Không có (None).
- **External relationships:** Không có (None).
- **Worksheet/Workbook Protection:** Không bật (None).

---

## 5. Kết quả Kiểm toán An toàn (Security Findings)

Kết quả kiểm tra đối với tệp workbook chuẩn tắc đã cung cấp:

| Hạng mục kiểm tra | Kết quả phát hiện | Đánh giá an toàn |
|---|---|---|
| **Macro / VBA (`xl/vbaProject.bin`)** | Không phát hiện | Đạt yêu cầu |
| **External links (`xl/externalLinks/`)** | Không phát hiện | Đạt yêu cầu |
| **External relationships / connections** | Không phát hiện | Đạt yêu cầu |
| **OLE Objects / Embedded binaries** | Không phát hiện | Đạt yêu cầu |
| **ActiveX controls** | Không phát hiện | Đạt yêu cầu |
| **External hyperlinks** | Không phát hiện liên kết ngoài | Đạt yêu cầu |
| **Mã hóa / Password Protection** | Không có mật khẩu, không mã hóa | Đạt yêu cầu |
| **ZIP traversal / Malformed paths** | Không có ký tự traversal `..` hay đường dẫn tuyệt đối | Đạt yêu cầu |
| **Zip bomb / Compression ratio** | Nén 32.8 KB -> giải nén 195 KB (tỷ lệ 6.08) | Đạt yêu cầu |
| **Công thức nhập liệu** | Các cột nhập liệu nghiệp vụ (A..G ở PPCT, A..F ở CHUYEN_DE) không chứa công thức. | Đạt yêu cầu |

**Kết luận an toàn:** Không phát hiện tính năng bị cấm nào trong workbook được kiểm toán theo các kiểm tra đã thực hiện (No prohibited feature was detected in this exact audited workbook under the checks performed).

---

## 6. Ma trận Thẩm quyền Sheet và Bản chất của DANH_MUC

| Tên Sheet | Phân loại Thẩm quyền | Ranh giới Xử lý của Importer P2-020 |
|---|:---:|---|
| `THONG_TIN` | **AUTHORITATIVE_INPUT** | Chứa metadata chuẩn tắc của toàn bộ workbook: Môn học, Năm học, Phiên bản mẫu. Bắt buộc có và hợp lệ. |
| `PPCT` | **AUTHORITATIVE_INPUT** | Nguồn dữ liệu bài học cho thành phần cốt lõi (`PpctCurricularComponent.CORE`). Dữ liệu được phân chia theo khối lớp 10, 11, 12 tương ứng vào từng `PpctPlan`. |
| `CHUYEN_DE` | **AUTHORITATIVE_INPUT** | Nguồn dữ liệu chuyên đề cho thành phần chuyên đề học tập (`PpctCurricularComponent.SPECIALIZED_STUDY`). Nếu sheet trống đối với một khối lớp, plan tương ứng có 0 chuyên đề. |
| `HUONG_DAN` | **IGNORED** | Chỉ mang tính hướng dẫn cho con người khi biên soạn Excel. Importer bỏ qua hoàn toàn. |
| `DANH_MUC` | **REFERENCE_ONLY** | Cung cấp danh mục dropdown mẫu trong Excel. **Nội dung sheet DANH_MUC tải lên KHÔNG PHẢI LÀ THẨM QUYỀN MÁY CHỦ.** Máy chủ kiểm tra hợp lệ dựa trên allowlist đóng băng của hợp đồng `PPCT_V1`. |
| `VI_DU` | **IGNORED** | Chỉ chứa các dòng ví dụ minh họa. Importer bỏ qua hoàn toàn. |

**Quy tắc xử lý cấu trúc Sheet:**
1. **Thiếu sheet bắt buộc (`THONG_TIN`, `PPCT`, `CHUYEN_DE`):** Báo lỗi fail-closed `PPCT_IMPORT_MISSING_REQUIRED_SHEET`.
2. **Sheet thẩm quyền bị ẩn:** Nếu `THONG_TIN`, `PPCT`, hoặc `CHUYEN_DE` ở trạng thái `hidden` hoặc `veryHidden`, báo lỗi fail-closed `PPCT_IMPORT_HIDDEN_AUTHORITATIVE_SHEET`.
3. **Thừa sheet không xác định:** Báo lỗi fail-closed `PPCT_IMPORT_UNEXPECTED_SHEET` (chỉ chấp nhận đúng danh mục 6 sheet chuẩn).
4. **Sai tên sheet / phân biệt hoa thường:** Tên sheet chuẩn tắc là `THONG_TIN`, `PPCT`, `CHUYEN_DE`, `HUONG_DAN`, `DANH_MUC`, `VI_DU`. Không hỗ trợ fuzzy matching âm thầm.

---

## 7. Hợp đồng Workbook Vật lý (Physical Workbook Contract)

1. **Một workbook = Một Môn học + Một Năm học:**
   - Một tệp workbook duy nhất đại diện cho kế hoạch PPCT của một Môn học trong một Năm học.
   - Có thể chứa đồng thời cả 3 khối lớp: 10, 11, 12 (hoặc tập con các khối lớp nếu môn học chỉ giảng dạy ở một số khối).
2. **Tên tệp (Filename) KHÔNG có thẩm quyền nghiệp vụ:**
   - Quy ước đặt tên file tại `THONG_TIN` dòng 11 (`PPCT_<MON_HOC>_<NAM_HOC>.xlsx`) chỉ là gợi ý tổ chức tệp cho người dùng.
   - Tên tệp **KHÔNG ĐƯỢC** sử dụng làm định danh nghiệp vụ. Thẩm quyền duy nhất xác định Môn học và Năm học thuộc về ô `B4` (Môn học) và `B5` (Năm học) tại sheet `THONG_TIN`.
3. **Phân vùng Bảng Excel (ListObject / Table):**
   - Sheet `PPCT` chứa bảng `PPCT_Table` vùng `A1:I301`.
   - Sheet `CHUYEN_DE` chứa bảng `CHUYEN_DE_Table` vùng `A1:H121`.
   - Các dòng trống nằm trong vùng bảng đã định dạng sẵn phải được lọc bỏ xác định (deterministic filtering).

---

## 8. Hợp đồng Metadata tại `THONG_TIN` (Metadata Contract)

| Ô | Trường Thông tin | Bắt buộc | Kiểu dữ liệu | Quy tắc Kiểm tra & Chuẩn hóa | Xử lý nếu Lỗi / Trống |
|:---:|---|:---:|:---:|---|---|
| **B4** | **Môn học** | **CÓ** | Chuỗi (String) | Trim khoảng trắng, chuẩn hóa Unicode NFKC. Khớp với danh mục môn học (`Subject`). | Báo lỗi `PPCT_IMPORT_METADATA_MISSING` hoặc `PPCT_IMPORT_SUBJECT_NOT_FOUND`. |
| **B5** | **Năm học** | **CÓ** | Chuỗi (String) | Trim khoảng trắng, chuẩn hóa Unicode NFKC, định dạng `YYYY-YYYY` (ví dụ `2026-2027`). Khớp với `AcademicYear.code`. | Báo lỗi `PPCT_IMPORT_METADATA_MISSING` hoặc `PPCT_IMPORT_ACADEMIC_YEAR_NOT_FOUND`. |
| **B6** | **Phiên bản mẫu** | **HỆ THỐNG** | Chuỗi (String) | Bắt buộc phải bằng chính xác `PPCT_V1`. | Báo lỗi `PPCT_IMPORT_TEMPLATE_VERSION_MISMATCH`. |

---

## 9. Hợp đồng Tiêu đề Dòng Cột (Header Contract)

Dòng tiêu đề bắt buộc nằm tại **Dòng 1** (Row 1) của cả hai sheet `PPCT` và `CHUYEN_DE`.

### A. Tiêu đề Sheet `PPCT`:

| Cột | Tiêu đề Gốc trong Workbook | Tiêu đề Chuẩn hóa (Sau Trim & Bỏ Newline) | Bắt buộc |
|:---:|---|---|:---:|
| A | `Khối lớp *` | `Khối lớp *` | Có |
| B | `Loại nội dung` | `Loại nội dung` | Có |
| C | `Bài / Chủ đề` | `Bài / Chủ đề` | Có |
| D | `Tên bài / Nội dung *` | `Tên bài / Nội dung *` | Có |
| E | `Số tiết *` | `Số tiết *` | Có |
| F | `Tuần bắt đầu dự kiến *` | `Tuần bắt đầu dự kiến *` | Có |
| G | `Tuần kết thúc dự kiến *` | `Tuần kết thúc dự kiến *` | Có |
| H | `Tiết PPCT bắt đầu\n(Tự động)` | `Tiết PPCT bắt đầu (Tự động)` | Có |
| I | `Tiết PPCT kết thúc\n(Tự động)` | `Tiết PPCT kết thúc (Tự động)` | Có |

### B. Tiêu đề Sheet `CHUYEN_DE`:

| Cột | Tiêu đề Gốc trong Workbook | Tiêu đề Chuẩn hóa (Sau Trim & Bỏ Newline) | Bắt buộc |
|:---:|---|---|:---:|
| A | `Khối lớp *` | `Khối lớp *` | Có |
| B | `Chuyên đề số *` | `Chuyên đề số *` | Có |
| C | `Tên chuyên đề *` | `Tên chuyên đề *` | Có |
| D | `Số tiết *` | `Số tiết *` | Có |
| E | `Tuần bắt đầu dự kiến *` | `Tuần bắt đầu dự kiến *` | Có |
| F | `Tuần kết thúc dự kiến *` | `Tuần kết thúc dự kiến *` | Có |
| G | `Tiết chuyên đề bắt đầu\n(Tự động)` | `Tiết chuyên đề bắt đầu (Tự động)` | Có |
| H | `Tiết chuyên đề kết thúc\n(Tự động)` | `Tiết chuyên đề kết thúc (Tự động)` | Có |

**Quy tắc chuẩn hóa Header:**
- Trim khoảng trắng hai đầu, thay thế chuỗi khoảng trắng và ký tự ngắt dòng `\r`, `\n` bằng một khoảng trắng đơn (` `), chuẩn hóa Unicode NFKC.
- Sai lệch thứ tự cột, thiếu cột, thừa cột hoặc trùng lặp cột: báo lỗi fail-closed `PPCT_IMPORT_INVALID_HEADER`, `PPCT_IMPORT_MISSING_HEADER`, `PPCT_IMPORT_DUPLICATE_HEADER`.

---

## 10. Hợp đồng Trường Dữ liệu Chi tiết và Độ Mịn Lưu trữ (Field Contract & Storage Granularity)

### Rà soát Kiến trúc Lưu trữ Thực tế (`PpctItemRevision`):
Trong cơ sở dữ liệu hiện hành (`schema.prisma` và `PpctService`), bảng `PpctItemRevision` lưu trữ chính xác các trường:
- `id: UUID`
- `ppctVersionId: UUID`
- `ppctPlanId: UUID`
- `ppctItemId: UUID`
- `component: PpctCurricularComponent` (`CORE` | `SPECIALIZED_STUDY`)
- `sequence: Int` (số thứ tự tiết học trong thành phần, nguyên dương từ 1)
- `title: VarChar(500)`
- `lessonType: VarChar(100)`

Bảng `PpctItemRevision` **TUYỆT ĐỐI KHÔNG CHỨA**:
- `periodCount`
- `plannedWeekStart`
- `plannedWeekEnd`
- `specializedTopicNumber`

### Bản chất của Bộ Phân bổ (`P2-003` Allocator Semantics):
Theo kiểm toán mã nguồn `PpctOccurrenceAllocationService.resolveInTransactionV2`:
- Mỗi tiết dạy thông thường (`NormalStructuralOccurrence`) hợp lệ sẽ tiêu thụ **CHÍNH XÁC MỘT** `PpctItemRevision` (`pendingRevisionsV2(...)[0]`).
- Do đó: **1 bản ghi `PpctItemRevision` = 1 nghĩa vụ phân phối PPCT trực tiếp (Direct Distribution Obligation) = 1 tiết dạy trên thời khóa biểu.**
- Không thể lưu trữ một bài học có `Số tiết = N` thành 1 bản ghi `PpctItemRevision` mang trường giả định `periodCount = N`.

### A. Hợp đồng Trường Sheet `PPCT`:

| Trường | Cột | Kiểu | Bắt buộc | Ràng buộc giá trị & Chuẩn hóa | Xử lý Lưu trữ & Phân rã | Mã lỗi nếu vi phạm |
|---|:---:|:---:|:---:|---|---|---|
| **Khối lớp** | A | Số nguyên | **Có** | Thuộc tập `{10, 11, 12}`. | Phân nhóm theo `gradeLevel` vào `PpctPlan`. | `PPCT_IMPORT_INVALID_GRADE` |
| **Loại nội dung** | B | Chuỗi | Không | Thuộc allowlist đóng băng máy chủ `{Bài học, Thực hành, Ôn tập, Kiểm tra, Trả bài, Khác}`. Trống mặc định là `'Bài học'`. | Lưu vào `PpctItemRevision.lessonType`. | `PPCT_IMPORT_INVALID_LESSON_TYPE` |
| **Bài / Chủ đề** | C | Chuỗi | Không | Tối đa 150 ký tự sau trim. | Tham gia tạo tiền tố tiêu đề bài học chuẩn tắc. | `PPCT_IMPORT_FIELD_OVER_LIMIT` |
| **Tên bài / Nội dung** | D | Chuỗi | **Có** | Cắt khoảng trắng, chuẩn hóa Unicode NFKC. | Tham gia tạo `PpctItemRevision.title`. | `PPCT_IMPORT_MISSING_TITLE` |
| **Số tiết** | E | Số nguyên | **Có** | Nguyên dương `1 <= N <= 30`. | **Hệ số phân rã:** Mở rộng thành $N$ nghĩa vụ cấp tiết (`CORE`) liên tục. | `PPCT_IMPORT_INVALID_PERIOD_COUNT` |
| **Tuần bắt đầu** | F | Số nguyên | **Có** | Nguyên dương `1 <= weekStart <= 40`. | **Metadata định hướng (Advisory only):** Kiểm tra trong preview; KHÔNG lưu CSDL; KHÔNG đưa vào checksum. | `PPCT_IMPORT_INVALID_WEEK_RANGE` |
| **Tuần kết thúc** | G | Số nguyên | **Có** | Nguyên dương `1 <= weekEnd <= 40`; `weekStart <= weekEnd`. | **Metadata định hướng (Advisory only):** Kiểm tra trong preview; KHÔNG lưu CSDL; KHÔNG đưa vào checksum. | `PPCT_IMPORT_INVALID_WEEK_RANGE` |
| **Tiết bắt đầu/kết thúc** | H, I | Số/Formula | Phái sinh | Công thức Excel; máy chủ tự tính dải tiết để đối soát mở rộng, không lưu trữ. | Bỏ qua khi lưu trữ; cảnh báo preview nếu người dùng sửa sai. | Cảnh báo `ADVISORY` (không phải mã lỗi chặn) |

### B. Hợp đồng Trường Sheet `CHUYEN_DE`:

| Trường | Cột | Kiểu | Bắt buộc | Ràng buộc giá trị & Chuẩn hóa | Xử lý Lưu trữ & Phân rã | Mã lỗi nếu vi phạm |
|---|:---:|:---:|:---:|---|---|---|
| **Khối lớp** | A | Số nguyên | **Có** | Thuộc tập `{10, 11, 12}`. | Phân nhóm theo `gradeLevel` vào `PpctPlan`. | `PPCT_IMPORT_INVALID_GRADE` |
| **Chuyên đề số** | B | Số nguyên | **Có** | Nguyên dương `1 <= K <= 20`. Phải liên tục `1, 2, 3...`. | **Số hiệu chuyên đề sư phạm:** Tham gia tiền tố tiêu đề, KHÔNG phải `sequence`. | `PPCT_IMPORT_SEQUENCE_DISORDER` |
| **Tên chuyên đề** | C | Chuỗi | **Có** | Cắt khoảng trắng, chuẩn hóa Unicode NFKC. | Tham gia tạo `PpctItemRevision.title`. | `PPCT_IMPORT_MISSING_TITLE` |
| **Số tiết** | D | Số nguyên | **Có** | Nguyên dương `1 <= N <= 40`. | **Hệ số phân rã:** Chuyên đề mở rộng thành $N$ nghĩa vụ cấp tiết (`SPECIALIZED_STUDY`). | `PPCT_IMPORT_INVALID_PERIOD_COUNT` |
| **Tuần bắt đầu** | E | Số nguyên | **Có** | Nguyên dương `1 <= weekStart <= 40`. | **Metadata định hướng (Advisory only):** Kiểm tra trong preview; KHÔNG lưu CSDL. | `PPCT_IMPORT_INVALID_WEEK_RANGE` |
| **Tuần kết thúc** | F | Số nguyên | **Có** | Nguyên dương `1 <= weekEnd <= 40`; `weekStart <= weekEnd`. | **Metadata định hướng (Advisory only):** Kiểm tra trong preview; KHÔNG lưu CSDL. | `PPCT_IMPORT_INVALID_WEEK_RANGE` |
| **Tiết bắt đầu/kết thúc** | G, H | Số/Formula | Phái sinh | Công thức Excel; máy chủ tự tính để đối soát mở rộng, không lưu trữ. | Bỏ qua khi lưu trữ; cảnh báo preview nếu người dùng sửa sai. | Cảnh báo `ADVISORY` (không phải mã lỗi chặn) |

---

## 11. Hợp đồng Định danh Môn học (Subject Identity Contract)

1. Giá trị `THONG_TIN.Môn học` được phân giải phía máy chủ (server-side resolution):
   - Chuẩn hóa Unicode NFKC và trim khoảng trắng.
   - Đối soát với bảng `Subject` trong cơ sở dữ liệu: tìm kiếm theo `Subject.name` (hoặc `Subject.code`).
2. **Quy tắc fail-closed:**
   - Nếu không tìm thấy môn học: dừng lại và trả về lỗi `PPCT_IMPORT_SUBJECT_NOT_FOUND`.
   - Nếu môn học tìm thấy có trạng thái `INACTIVE`: dừng lại và trả về `PPCT_IMPORT_SUBJECT_INACTIVE`.
   - Nếu có nhiều hơn 1 môn học thỏa mãn (trùng tên/mơ hồ): dừng lại và trả về `PPCT_IMPORT_SUBJECT_AMBIGUOUS`.
3. **Bất biến an toàn:**
   - Hệ thống **TUYỆT ĐỐI KHÔNG** tự động tạo mới `Subject` từ dữ liệu workbook.
   - Không được sinh UUID ngẫu nhiên cho Môn học.

---

## 12. Hợp đồng Định danh Năm học (AcademicYear Identity Contract)

1. Giá trị `THONG_TIN.Năm học` phải khớp với mã năm học chính thức (`AcademicYear.code`, ví dụ `"2026-2027"`):
   - Chuẩn hóa chuỗi (trim, uppercase).
   - Truy vấn bản ghi `AcademicYear` có `code == value`.
2. **Quy tắc fail-closed:**
   - Nếu năm học không tồn tại trong hệ thống: dừng lại và trả về lỗi `PPCT_IMPORT_ACADEMIC_YEAR_NOT_FOUND`.
   - Nếu định dạng năm học sai quy chuẩn (không phải dạng `YYYY-YYYY`): báo lỗi `PPCT_IMPORT_INVALID_ACADEMIC_YEAR_FORMAT`.
3. **Bất biến an toàn:**
   - Hệ thống **TUYỆT ĐỐI KHÔNG** tự động tạo mới `AcademicYear`.
   - Hệ thống **TUYỆT ĐỐI KHÔNG** suy diễn năm học từ đồng hồ hệ thống (system clock).

---

## 13. Hợp đồng Định danh Khối lớp (Grade Identity Contract)

1. Giá trị `Khối lớp *` ở từng dòng trong sheet `PPCT` và `CHUYEN_DE` phải là số nguyên thuộc tập hợp hợp lệ `{10, 11, 12}`.
2. Dữ liệu một workbook có thể bao gồm đồng thời cả 3 khối lớp, hoặc 1 khối, hoặc 2 khối:
   - Các dòng được gom nhóm theo `gradeLevel`.
   - Mỗi nhóm `gradeLevel` sẽ ánh xạ tới một `PpctPlan` tương ứng với tọa độ duy nhất `(academicYearId, subjectId, gradeLevel)`.
3. Nếu một khối lớp không xuất hiện dòng nào trong file: kế hoạch của khối lớp đó giữ nguyên, không bị ảnh hưởng.
4. Giá trị khối lớp ngoài khoảng 10..12, dạng văn bản không hợp lệ: báo lỗi fail-closed `PPCT_IMPORT_INVALID_GRADE`.

---

## 14. Hợp đồng Tiêu đề Chuẩn tắc và Phân rã Tiết học (Canonical Title & Period Expansion)

Do mô hình lưu trữ PPCT và bộ phân bổ vận hành theo độ mịn từng tiết học (`1 PpctItemRevision = 1 tiết`), quá trình nhập liệu thực hiện phân rã tất định (deterministic period expansion):

### A. Quy tắc Xác định Tiêu đề Chuẩn tắc Lưu trữ:
Để bảo đảm tính ổn định phả hệ và tránh vượt quá giới hạn `VARCHAR(500)` của `PpctItemRevision.title`:
- **KHÔNG LƯU TRỮ HẬU TỐ `(Tiết i/N)` VÀO TRƯỜNG `title` CƠ SỞ DỮ LIỆU.**
- Cụm từ `" — Tiết i/N"` chỉ là ngữ cảnh trình diễn / hiển thị trong giao diện Preview (derived preview/display context).
- Toàn bộ $N$ nghĩa vụ cấp tiết được phân rã từ một dòng sư phạm sẽ **dùng chung một tiêu đề chuẩn tắc (canonical persisted title)**.
- Các tiết trong cùng một dòng sư phạm được phân biệt rõ ràng bằng:
  1. `PpctItem.id` (UUID riêng biệt, ổn định);
  2. `component` (`CORE` hoặc `SPECIALIZED_STUDY`);
  3. `sequence` (dãy số nguyên liên tục).

### B. Công thức Tiêu đề Chuẩn tắc:
1. **Đối với `CORE`:**
   - Nếu cột `Bài / Chủ đề` (C) có giá trị: $\text{Title} = \text{`"{Bài / Chủ đề}: {Tên bài / Nội dung}"`}$ (ví dụ: `"Bài 1: Vị trí địa lí và phạm vi lãnh thổ"`).
   - Nếu cột `Bài / Chủ đề` trống: $\text{Title} = \text{`"{Tên bài / Nội dung}"`}$ (ví dụ: `"Ôn tập giữa HK1"`).
2. **Đối với `SPECIALIZED_STUDY`:**
   - $\text{Title} = \text{`"Chuyên đề {Chuyên đề số}: {Tên chuyên đề}"`}$ (ví dụ: `"Chuyên đề 1: Làng nghề"`).
3. **Ràng buộc Chiều dài Tuyệt đối:**
   - Sau khi ghép tiền tố và chuẩn hóa Unicode NFKC, độ dài chuỗi tiêu đề cuối cùng bắt buộc phải $\le 500$ ký tự:
     $$\text{Length}(\text{Title}_{\text{canonical}}) \le 500$$
   - Nếu tiêu đề sau khi ghép vượt quá 500 ký tự: **BÁO LỖI FAIL-CLOSED** `PPCT_IMPORT_TITLE_OVER_LIMIT`. Tuyệt đối không cắt cụt (truncate) âm thầm.

---

## 15. Hợp đồng Thành phần Cốt lõi (CORE Contract)

1. **Nguồn dữ liệu:** Các dòng trong sheet `PPCT` có cột `Khối lớp *` khớp với `gradeLevel` của plan.
2. **Phân rã cấp tiết:** Mỗi dòng có `Số tiết = N` sẽ phân rã thành $N$ nghĩa vụ bài học cấp tiết liên tục.
3. **Thứ tự sequence:** Dãy số nguyên liên tục `1, 2, ..., TotalCorePeriods` tăng dần theo thứ tự dòng và thứ tự tiết trong dòng.
4. **Loại bài học (`lessonType`):** Lấy từ cột `Loại nội dung`. Nếu để trống, mặc định là `'Bài học'`. Giá trị phải thuộc allowlist đóng băng của hệ thống.
5. **Bắt buộc có nội dung CORE:** Mỗi kế hoạch phiên bản xuất bản bắt buộc phải có ít nhất 1 bài học `CORE` (theo `ADR-048` §2.3).

---

## 16. Hợp đồng Thành phần Chuyên đề Học tập (SPECIALIZED_STUDY Contract)

1. **Nguồn dữ liệu:** Các dòng trong sheet `CHUYEN_DE` có cột `Khối lớp *` khớp với `gradeLevel` của plan.
2. **Phân biệt Chuyên đề số Sư phạm và Sequence Tiết học:**
   - **`Chuyên đề số *` (Cột B):** Là số hiệu chuyên đề sư phạm ($K = 1, 2, 3...$). Trường này tham gia cấu thành tiêu đề chuẩn tắc `"Chuyên đề {K}: ..."` và dùng để đối soát tính liên tục, **KHÔNG PHẢI LÀ `sequence`**.
   - **`PpctItemRevision.sequence`:** Là số thứ tự tiết học của thành phần `SPECIALIZED_STUDY`, đánh số liên tục từ `1, 2, ..., TotalSpecializedPeriods` (ví dụ từ 1 đến 35).
3. **Loại bài học (`lessonType`):** Được ấn định duy nhất và chuẩn tắc là chuỗi `'Chuyên đề'`. Không sử dụng biến thể khác.
4. **Tính tùy chọn của Chuyên đề:** Nếu sheet `CHUYEN_DE` trống đối với khối lớp đó, `PpctVersion` được tạo với danh sách bài học `SPECIALIZED_STUDY` rỗng (0 bài). Điều này hoàn toàn hợp lệ theo `ADR-048`.

---

## 17. Hợp đồng Kế thừa và Phả hệ theo Chuẩn Runtime Hiện hành (Carry Forward vs Lineage Semantics)

Theo kiểm toán mã nguồn chuẩn tắc tại `apps/api/src/ppct/ppct.service.ts` (phương thức `replaceContent` lines 220–275):

### A. Quy tắc `CARRY_FORWARD`:
- Áp dụng khi một nghĩa vụ học tập giữ nguyên định danh bài học logic qua các phiên bản:
  - Tái sử dụng chính xác UUID `PpctItem.id` hiện có.
  - Thiết lập `identityMode = PpctItemIdentityMode.CARRY_FORWARD`.
  - **Bắt buộc: `predecessors` PHẢI LÀ rỗng hoặc `undefined`.** (Nếu truyền `predecessors`, runtime ném lỗi `ConflictException('CARRY_FORWARD không được khai báo predecessor.')`).
  - **Không có bất kỳ bản ghi `PpctItemLineage` nào được tạo ra.**
- Sự thay đổi biên tập nhỏ về `title` (ví dụ sửa chính tả) hoặc `lessonType` giữa các phiên bản không làm thay đổi định danh `PpctItem`; tiết học vẫn dùng `CARRY_FORWARD` và bản ghi `PpctItemRevision` mới sẽ lưu tiêu đề mới.

### B. Quy tắc `NEW` với Phả hệ (`Lineage`):
- Áp dụng khi một nghĩa vụ học tập logic mới thay thế hoặc phân rã từ một hoặc nhiều nghĩa vụ học tập lịch sử:
  - Bản ghi kế thừa nhận một UUID mới (`PpctItem.id` mới).
  - Thiết lập `identityMode = PpctItemIdentityMode.NEW`.
  - Khai báo danh sách `predecessors = [{ versionId, itemId }]` trỏ tới các revision lịch sử đã công bố (`status !== DRAFT`).
  - Runtime tạo các bản ghi `PpctItemLineage` trỏ từ predecessor sang successor.
  - Bắt buộc cùng thành phần: predecessor và successor phải có cùng `component`, không được tạo phả hệ chéo thành phần (`PPCT_COMPONENT_LINEAGE_CROSS_COMPONENT`).

### C. Nghĩa vụ Bị Hủy bỏ (Removed Obligation):
- Khi một bài học trong phiên bản cũ bị lược bỏ ở phiên bản mới:
  - Không cần tạo successor cho bài học đó.
  - Bản ghi lịch sử cũ vẫn được lưu giữ bất biến trong các phiên bản trước đó.

---

## 18. Khóa Quy tắc Phả hệ ở Độ Mịn Tiết học sau Phân rã

Khi nhập phiên bản tiếp theo (Version 2+) từ workbook, việc đối soát phả hệ được thực hiện theo 6 trường hợp rõ ràng:

1. **Trường hợp 1 — Dòng bài học giữ nguyên, số tiết không đổi ($N \to N$):**
   - Từng tiết thứ $i$ ($1 \le i \le N$) giữ nguyên định danh UUID của tiết tương ứng ở phiên bản trước.
   - Sử dụng `identityMode = CARRY_FORWARD`, `predecessors = []`.
   - Không sinh bản ghi lineage.
2. **Trường hợp 2 — Số tiết của bài học tăng lên ($N \to N + k$):**
   - $N$ tiết đầu tiên giữ nguyên UUID cũ, dùng `CARRY_FORWARD` (không có predecessor).
   - $k$ tiết bổ sung mới ($N+1 \dots N+k$) được cấp UUID mới với `identityMode = NEW`. Các tiết mới này không cần tạo predecessor giả mạo chỉ vì thuộc cùng bài học.
3. **Trường hợp 3 — Số tiết của bài học giảm đi ($N \to N - k$):**
   - $N - k$ tiết được giữ lại tiếp tục dùng `CARRY_FORWARD`.
   - $k$ tiết dôi dư bị lược bỏ (không có successor trong phiên bản mới). Các tiết lịch sử trong version trước vẫn được bảo toàn.
4. **Trường hợp 4 — Thay đổi tiêu đề bài học mang tính biên tập:**
   - Các tiết học vẫn dùng `CARRY_FORWARD` với UUID cũ; bản ghi `PpctItemRevision` của phiên bản mới sẽ lưu tiêu đề biên tập mới. Không tạo lineage chỉ vì đổi tiêu đề.
5. **Trường hợp 5 — Bài học mới thay thế một bài học cũ đã hủy:**
   - Các tiết của bài học mới nhận UUID mới với `identityMode = NEW`, khai báo `predecessors` trỏ tới các tiết tương ứng của bài học cũ để ghi nhận phả hệ thay thế qua `PpctItemLineage`.
6. **Trường hợp 6 — Cấu trúc xáo trộn mơ hồ (Ambiguous Mapping):**
   - Nếu vị trí hoặc số lượng bài học thay đổi phức tạp không thể tự động căn chỉnh an toàn: hệ thống **FAIL-CLOSED** hoặc yêu cầu người dùng xác nhận bản đồ ánh xạ phả hệ tường minh trong giao diện Preview với mã lỗi `PPCT_IMPORT_LINEAGE_AMBIGUOUS`. Tuyệt đối không tự động đoán phả hệ.

---

## 19. Hợp đồng Thứ tự Dòng và Dãy Số thứ tự

1. Thứ tự dòng vật lý trong bảng Excel và vị trí tiết phân rã quyết định số thứ tự `sequence`.
2. Dãy số `sequence` cho `CORE` và `SPECIALIZED_STUDY` độc lập tuyệt đối:
   - `CORE`: `sequence` thuộc tập `{1, 2, ..., N}`.
   - `SPECIALIZED_STUDY`: `sequence` thuộc tập `{1, 2, ..., M}`.
3. Cột `sequence` trong database lưu số nguyên dương thuần túy, tuyệt đối không lưu chuỗi `"CD1"`, `"CD2"`. Chuỗi `"CD"` là quy ước tầng hiển thị theo `ADR-048`.

---

## 20. Hợp đồng Cột Tự động Phái sinh (Auto-Number Derived Columns)

Tại sheet `PPCT`, các cột H, I (`Tiết PPCT bắt đầu / kết thúc`) và sheet `CHUYEN_DE`, các cột G, H (`Tiết chuyên đề bắt đầu / kết thúc`) chứa công thức Excel:
- PPCT: `=IF(OR(A2="",D2="",E2=""),"",SUMIFS($E$2:E2,$A$2:A2,A2)-E2+1)` và `=IF(H2="","",H2+E2-1)`
- CHUYEN_DE: `=IF(OR(A2="",B2="",C2="",D2=""),"",SUMIFS($D$2:D2,$A$2:A2,A2)-D2+1)` và `=IF(G2="","",G2+D2-1)`

### Khóa quy tắc thẩm quyền:
1. **Cột phái sinh trên Excel KHÔNG mang thẩm quyền nghiệp vụ:** Công thức trong Excel chỉ nhằm mục đích hiển thị trực quan cho giáo viên soạn file.
2. **Máy chủ tự tính dải tiết mở rộng:** Phía máy chủ tự động tính toán lại dải tiết xuất phát và dải tiết kết thúc từ cột `Số tiết *` và thứ tự phân rã để gán `sequence` liên tục.
3. **Không lưu trữ giá trị công thức Excel:** Không có cột nào trong cơ sở dữ liệu lưu dải tiết này.
4. **Kiểm tra sai lệch trong Preview:** Trong pha `preview`, nếu người dùng gõ đè số thủ công vào cột công thức dẫn đến lệch so với dải tiết chuẩn tắc do máy chủ tính toán, hệ thống ghi nhận cảnh báo hiển thị (`ADVISORY`), thông báo rõ hệ thống sẽ áp dụng dải tiết chuẩn tắc của máy chủ.

---

## 21. Hợp đồng Cửa sổ Tuần Kế hoạch (Week-Window Semantics)

1. Cột `Tuần bắt đầu dự kiến *` và `Tuần kết thúc dự kiến *` trong workbook là **metadata định hướng kế hoạch sư phạm (Advisory/Import-Validation Metadata Only)**.
2. **Không lưu trữ và Không tham gia Runtime:**
   - Các trường này **KHÔNG ĐƯỢC LƯU TRỮ** vào bảng `PpctItemRevision` (không có cột `plannedWeekStart`/`plannedWeekEnd`).
   - Bộ phân bổ thời khóa biểu `P2-003` (`PpctOccurrenceAllocationService`) **KHÔNG TIÊU THỤ** các trường này; bộ phân bổ làm việc dựa trên cấu trúc lịch tuần (`AcademicWeek`), thời khóa biểu thực tế và nguyên tắc phân bổ thành phần.
   - Các trường tuần dự kiến **KHÔNG THAM GIA** vào `semanticChecksum` của kế hoạch PPCT. Việc thay đổi tuần dự kiến đơn thuần không tạo ra phiên bản PPCT mới trong CSDL.
3. **Kiểm tra Hợp lệ trong Pha Inspect / Preview:**
   - Kiểm tra tính hợp lệ cơ bản: `1 <= weekStart <= weekEnd <= 40`.
   - Nếu `weekStart > weekEnd` hoặc nằm ngoài phạm vi 1..40: báo lỗi fail-closed `PPCT_IMPORT_INVALID_WEEK_RANGE`.
4. **Bất biến số tiết và tuần:** $\text{weekEnd} - \text{weekStart} + 1 \neq \text{Số tiết}$. Khoảng tuần không đồng nghĩa với số tiết.

---

## 22. Hợp đồng Thẩm quyền Danh mục Loại Nội dung (Lesson Type Authority)

1. **Thẩm quyền Thuộc về Máy chủ (Server-Owned Frozen Allowlist):**
   - Bảng `PpctItemRevision` trong CSDL lưu chuỗi tự do `lessonType VARCHAR(100)` và không có bảng danh mục loại bài học động trong CSDL.
   - Nội dung sheet `DANH_MUC` tải lên chỉ mang tính tham khảo (`REFERENCE_ONLY`). **Người dùng sửa đổi sheet DANH_MUC trong file tải lên KHÔNG ĐƯỢC PHÉP mở rộng danh mục loại bài học hợp lệ của hệ thống.**
   - Bộ nhập `P2-020` áp dụng danh mục allowlist đóng băng chuẩn tắc của hợp đồng `PPCT_V1`:
     - Đối với `CORE`: Bắt buộc thuộc `{Bài học, Thực hành, Ôn tập, Kiểm tra, Trả bài, Khác}` (không phân biệt hoa thường, sau trim). Mặc định nếu trống là `'Bài học'`. Giá trị ngoài allowlist bị từ chối với lỗi `PPCT_IMPORT_INVALID_LESSON_TYPE`.
     - Đối với `SPECIALIZED_STUDY`: Giá trị chuẩn tắc duy nhất là `'Chuyên đề'`.
2. **Kiểm tra độ lệch mẫu (Template Drift):**
   - Nếu sheet `DANH_MUC` trong tệp tải lên có các giá trị khác biệt với allowlist đóng băng của máy chủ, hệ thống ghi nhận cảnh báo `ADVISORY` trong bản preview, không cho phép ghi đè thẩm quyền của máy chủ.

---

## 23. Hợp đồng Xử lý Dòng Trống và Trùng lặp

### A. Dòng trống (Blank Rows):
- **Dòng trống cuối bảng (Trailing blanks):** Bỏ qua hoàn toàn.
- **Dòng trống trong bảng định dạng sẵn (Pre-formatted empty table rows):** Các dòng từ 2..301 ở PPCT hoặc 2..121 ở CHUYEN_DE có các cột dữ liệu A..G trống nhưng có công thức ở cột H..I được xác định là dòng trống và bỏ qua.
- **Dòng bán phần (Partially populated rows):** Ví dụ có Khối lớp và Tên bài nhưng thiếu Số tiết: **BÁO LỖI FAIL-CLOSED** `PPCT_IMPORT_PARTIAL_ROW`. Tuyệt đối không âm thầm bỏ qua các dòng nhập dở dang.

### B. Trùng lặp (Duplicates):
- **Trùng lặp toàn bộ dòng (Exact duplicate row):** Báo lỗi fail-closed `PPCT_IMPORT_DUPLICATE_ROW`.
- **Trùng số chuyên đề trong cùng khối lớp:** Báo lỗi fail-closed `PPCT_IMPORT_SEQUENCE_DISORDER`.
- **Trùng tên bài học trong cùng khối lớp:** Chấp nhận nếu có lý do sư phạm (ví dụ nhiều tiết mang tên `"Luyện tập"`), nhưng gắn cảnh báo advisory trong bản preview để giáo viên rà soát.

---

## 24. Dấu vân tay Byte thô và Tổng kiểm Nội dung Ngữ nghĩa (Raw Digest & Semantic Checksum)

### A. Raw Digest:
- Mã băm SHA-256 tính trực tiếp từ toàn bộ bytes của tệp XLSX tải lên.
- Phục vụ truy vết kiểm toán và tham gia tính toán khóa `requestFingerprint`.

### B. Semantic Content Checksum:
Tổng kiểm nội dung ngữ nghĩa đại diện cho **bản chất nội dung sư phạm được phân rã và lưu trữ vào CSDL**, bảo đảm tính tái lập (reproducible) độc lập với định dạng Excel:

**Các trường tham gia tính Semantic Checksum:**
1. Phiên bản hợp đồng mẫu: `"PPCT_V1"`
2. Định danh chuẩn tắc của Năm học: `AcademicYear.code`
3. Định danh chuẩn tắc của Môn học: `Subject.code`
4. Danh sách các khối lớp có trong tệp, sắp xếp tăng dần (`10, 11, 12`).
5. Với mỗi khối lớp, tuần tự theo từng thành phần (`CORE`, sau đó `SPECIALIZED_STUDY`):
   - Danh sách bài học **sau khi phân rã cấp tiết**, sắp xếp theo `sequence` tăng dần:
     - `component` (`CORE` hoặc `SPECIALIZED_STUDY`)
     - `sequence` (số nguyên liên tục từ 1)
     - normalized `title` (chuỗi tiêu đề tiết đã chuẩn hóa NFKC)
     - normalized `lessonType` (chuỗi loại bài học đã chuẩn hóa NFKC)

**Các thành phần BỊ LOẠI TRỪ khỏi Semantic Checksum:**
- Tên tệp và đường dẫn tệp tải lên;
- Thuộc tính hiển thị: màu sắc ô, font chữ, đường viền, độ rộng cột, chiều cao dòng;
- Toàn bộ nội dung các sheet không mang thẩm quyền: `HUONG_DAN`, `DANH_MUC`, `VI_DU`;
- Các cột tính toán tự động: H, I ở PPCT và G, H ở CHUYEN_DE;
- Các cột metadata tuần dự kiến (`Tuần bắt đầu dự kiến`, `Tuần kết thúc dự kiến`);
- Dòng trống, khoảng trắng dư thừa trong XML, timestamp metadata của Excel.

---

## 25. Hợp đồng Nhiều Bản nháp, Cơ chế Nhắm mục tiêu và Phát lại Idempotent (Target-Draft & Replay Contract)

### A. Rà soát Số lượng Bản nháp (Draft Cardinality):
Kiểm toán kiến trúc tại `schema.prisma` và `PpctService.createVersion` xác nhận:
- Một kế hoạch môn học `PpctPlan` **HOÀN TOÀN CÓ THỂ CÓ NHIỀU BẢN GHI `DRAFT`** đồng thời (chỉ có duy nhất ràng buộc một phiên bản `PUBLISHED`).
- Do đó, bộ nhập **TUYỆT ĐỐI KHÔNG ĐƯỢC GIẢ ĐỊNH** rằng mỗi plan chỉ có một draft duy nhất, và **KHÔNG ĐƯỢC TỰ ĐỘNG GHI ĐÈ** lên một bản draft tùy ý.

### B. Hai Chế độ Nhắm mục tiêu khi Confirm:
Pha Preview trả về thông tin các draft hiện có cho từng khối lớp. Khi gọi lệnh Confirm, client bắt buộc phải chỉ định rõ một trong hai chế độ cho từng khối lớp:

1. **Chế độ Tạo Bản nháp Mới (`CREATE_NEW_DRAFT`):**
   - Không ghi đè lên bất kỳ draft nào đang có.
   - Tạo mới một `PpctVersion(status = DRAFT)` với `versionNumber = max(versionNumber) + 1`.
   - **Xử lý Phát lại Idempotent (Semantic Replay):**
     - Bên trong transaction `SERIALIZABLE`, máy chủ tìm kiếm các bản ghi `DRAFT` của plan do chính người dùng đó tạo.
     - Nếu phát hiện **CHÍNH XÁC MỘT** bản ghi `DRAFT` có nội dung ngữ nghĩa sau phân rã trùng khớp 100% với nội dung tải lên: hệ thống trả về bản ghi `DRAFT` hiện có này (idempotent replay), không tạo version mới.
     - Nếu không có draft nào trùng: tạo draft mới.
     - Nếu có **NHIỀU HƠN MỘT** draft có nội dung trùng khớp: báo lỗi fail-closed `PPCT_IMPORT_REPLAY_AMBIGUOUS` để người dùng chủ động chọn draft mục tiêu.
2. **Chế độ Cập nhật Bản nháp Chỉ định (`UPDATE_EXACT_DRAFT`):**
   - Áp dụng khi người dùng muốn cập nhật nội dung cho một draft cụ thể đang chỉnh sửa.
   - Client bắt buộc phải truyền lên:
     - `targetDraftId: UUID`
     - `expectedUpdatedAt: ISO-8601 string` (CAS token)
   - Máy chủ xác minh nghiêm ngặt:
     - `targetDraftId` phải tồn tại; nếu không tìm thấy: báo lỗi `PPCT_IMPORT_TARGET_DRAFT_NOT_FOUND`.
     - Phải thuộc đúng `PpctPlan` của khối lớp đó; nếu sai: báo lỗi `PPCT_IMPORT_TARGET_DRAFT_PLAN_MISMATCH`.
     - Phải có trạng thái `status === DRAFT`; nếu không: báo lỗi `PPCT_IMPORT_TARGET_NOT_DRAFT`.
     - Khớp chính xác `expectedUpdatedAt` để chống ghi đè đồng thời; nếu lệch: báo lỗi `PPCT_IMPORT_DRAFT_CONFLICT`.
   - Sau khi xác thực hợp lệ, máy chủ thực hiện thay thế toàn bộ nội dung của draft đó một cách nguyên tử.

---

## 26. Ranh giới Giao dịch Cấp Workbook (Workbook-Level Atomicity Implementation Boundary)

Một workbook có thể chứa đồng thời cả 3 khối lớp 10, 11, 12:
- Lệnh xác nhận nạp (`POST /api/ppct-import/confirm`) thực thi bên trong **MỘT TRANSACTION CƠ SỞ DỮ LIỆU `SERIALIZABLE` DUY NHẤT** cho toàn bộ gói workbook.
- **Nghĩa vụ Triển khai Kỹ thuật cho `P2-020`:**
  - Hiện tại, các phương thức công khai của `PpctService` (`createVersion`, `replaceContent`) tự mở transaction riêng rẽ.
  - Bộ nhập `P2-020` **TUYỆT ĐỐI KHÔNG ĐƯỢC** gọi tuần tự các phương thức công khai này cho từng khối lớp, vì điều đó sẽ phá vỡ tính nguyên tử toàn workbook (nếu khối 10 tạo xong mà khối 11 lỗi thì khối 10 đã bị commit).
  - P2-020 bắt buộc phải tái cấu trúc/sử dụng các phương thức xử lý nội bộ dùng chung một thể hiện `Prisma.TransactionClient` (`tx`) xuyên suốt toàn bộ quá trình nạp dữ liệu của tất cả các khối lớp.
- **Nguyên tắc Tất cả hoặc Không có gì (All-or-Nothing):**
  - Bất kỳ lỗi nào xảy ra ở bất kỳ khối lớp nào đều khiến **TOÀN BỘ TRANSACTION BỊ ROLLBACK**.
  - Không tồn tại trạng thái nạp dở dang một phần khối lớp.
  - Trong mỗi khối lớp, các tiết `CORE` và `SPECIALIZED_STUDY` được lưu trữ nguyên tử trong cùng một phiên bản `PpctVersion`.

---

## 27. Ranh giới Vòng đời và Đột biến Dữ liệu (Lifecycle & Mutation Boundary)

1. **Chỉ tạo hoặc Cập nhật Bản nháp (`DRAFT` Only):**
   - Bộ nhập liệu PPCT **CHỈ TẠO HOẶC CẬP NHẬT PHIÊN BẢN Ở TRẠNG THÁI `DRAFT`**.
   - Tuyệt đối không tự động xuất bản (`PUBLISHED`). Lệnh xuất bản là hành động quản trị chuyên môn độc lập của giáo viên/tổ trưởng.
2. **Ranh giới Áp dụng theo Lớp học (`PpctClassAssociation`):**
   - Workbook chỉ chứa kế hoạch môn học cấp khối (Grade-level).
   - Việc chỉ định lớp nào áp dụng chuyên đề (`CORE_PLUS_SPECIALIZED_STUDY` hay `CORE_ONLY`) được quản lý độc lập tại workspace `/quan-tri/ppct/ap-dung-chuyen-de` (`P2-004`).
   - Bộ nhập PPCT tuyệt đối không được phép tự động gán hoặc làm thay đổi hồ sơ áp dụng của các lớp.
3. **Ranh giới Thực thể Đột biến:**
   - **Được phép tạo/cập nhật:** `PpctPlan`, `PpctVersion` (`DRAFT`), `PpctItem`, `PpctItemRevision`, `PpctItemLineage`.
   - **Tuyệt đối KHÔNG đột biến:** `Subject`, `AcademicYear`, `SchoolClass`, `TeachingAssignment`, `TimetableVersion`, `TimetableEntry`, `PpctClassAssociation`, `CurricularTeachingExecution`, `SpecialActivity`, `ReportingStatement`.

---

## 28. Hợp đồng An toàn và Bảng Giới hạn Kỹ thuật Triển khai (Security Limits & Parser Profile)

### A. Phân định Giới hạn Tái sử dụng và Giới hạn Tăng cường Riêng cho PPCT:

| Hạng mục An toàn | Giá trị Khóa | Phân loại Nguồn gốc | Hành vi nếu Vi phạm |
|---|:---:|---|---|
| **Dung lượng tệp nén tối đa** | 8 MB (`8 * 1024 * 1024` bytes) | Tái sử dụng `MAX_XLSX_BYTES` từ Timetable | Báo lỗi `PPCT_IMPORT_FILE_TOO_LARGE` |
| **Dung lượng giải nén tối đa** | 64 MB (`64 * 1024 * 1024` bytes) | Tái sử dụng `MAX_XLSX_EXPANDED_BYTES` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Số lượng worksheets tối đa** | 32 sheets | Tái sử dụng `MAX_WORKSHEETS` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Số dòng tối đa trên sheet** | 5,000 dòng | Tái sử dụng `MAX_SHEET_ROWS` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Số cột tối đa trên sheet** | 64 cột | Tái sử dụng `MAX_SHEET_COLUMNS` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Tổng số ô theo dimension** | 250,000 ô | Tái sử dụng `MAX_TOTAL_DIMENSION_CELLS` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Thời gian phân tích tối đa** | 8,000 ms | Tái sử dụng `WORKBOOK_PARSE_TIMEOUT_MS` từ Timetable | Báo lỗi `PPCT_IMPORT_TIMEOUT` |
| **Giới hạn bộ nhớ Worker** | OldGen 128MB, YoungGen 32MB | Tái sử dụng `WORKER_RESOURCE_LIMITS` từ Timetable | Ngăn chặn cạn kiệt tài nguyên |
| **Tỷ lệ nén tối đa (Expansion)** | 20 : 1 | **Tăng cường riêng cho PPCT (New Hardening)** | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Số lượng ZIP entries tối đa** | 100 entries | **Tăng cường riêng cho PPCT (New Hardening)** | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Độ dài chuỗi ô Tên bài học** | 500 ký tự | **Profile riêng cho PPCT (New Parser Profile)** | Báo lỗi `PPCT_IMPORT_TITLE_OVER_LIMIT` |
| **Độ dài chuỗi ô khác** | 100 ký tự (Type), 200 ký tự (Khác) | Khớp giới hạn CSDL VarChar | Báo lỗi `PPCT_IMPORT_FIELD_OVER_LIMIT` |

### B. Giải quyết Độ dài Chuỗi Parser (200 ký tự vs 500 ký tự):
- Parser thời khóa biểu hiện hành giới hạn `MAX_PARSER_CELL_TEXT_LENGTH = 200`.
- Miền nghiệp vụ PPCT cho phép tiêu đề bài học lên tới 500 ký tự (`PpctItemRevision.title VARCHAR(500)`).
- **Nghĩa vụ triển khai cho `P2-020`:**
  - P2-020 **KHÔNG ĐƯỢC** tái sử dụng nguyên trạng giới hạn 200 ký tự của timetable parser (vì sẽ làm cắt cụt bài học PPCT hợp lệ).
  - P2-020 **KHÔNG ĐƯỢC** nới lỏng giới hạn 200 ký tự của timetable một cách toàn cục (để tránh ảnh hưởng phân hệ thời khóa biểu).
  - P2-020 phải kế thừa kiến trúc worker cách ly luồng và thiết lập **PPCT Parser Profile** riêng, cho phép đọc chuỗi ô tiêu đề lên tới 500 ký tự trước khi kiểm tra độ dài tổng thể.

### C. Chính sách Công thức và Kiểm tra Gói Mở rộng:
- **Công thức trong ô nhập liệu (A..G ở PPCT, A..F ở CHUYEN_DE):** Cấm tuyệt đối. Nếu phát hiện công thức trong ô nhập liệu: báo lỗi `PPCT_IMPORT_PROHIBITED_FORMULA`.
- **Công thức trong ô phái sinh (H..I ở PPCT, G..H ở CHUYEN_DE):** Parser thời khóa biểu hiện hành đánh dấu toàn bộ ô công thức là `UNSUPPORTED`. Parser PPCT phải phân biệt theo vị trí cột: chỉ chấp nhận công thức dải tiết mẫu tại các cột phái sinh H, I và G, H, coi chúng là dữ liệu tham khảo hiển thị và không ném lỗi `UNSUPPORTED` đối với workbook mẫu chuẩn.
- **Kiểm tra Gói Mở rộng:** Worker preflight của P2-020 bắt buộc phải kiểm tra và từ chối fail-closed đối với:
  - Macro/VBA (`vbaProject.bin`);
  - External links (`xl/externalLinks/`);
  - External relationships / connections ra ngoài;
  - Đối tượng nhúng OLE / ActiveX;
  - Tệp mã hóa hoặc đặt mật khẩu.

---

## 29. Hợp đồng Thẩm quyền và Bảo mật (Authorization Contract)

1. **Xác thực (Authentication):**
   - Đòi hỏi phiên đăng nhập hợp lệ (`SessionAuthGuard`, `CsrfOriginGuard`).
   - Kiểm tra đổi mật khẩu bắt buộc: nếu `mustChangePassword == true`, lập tức từ chối với lý do `PASSWORD_CHANGE_REQUIRED`.
2. **Capability Thẩm quyền:**
   - Bắt buộc phải có quyền **`PPCT_MANAGE`**.
   - **Phạm vi thẩm quyền (Scope):**
     - `SCHOOL_WIDE`: Được phép import PPCT cho tất cả các môn học trong toàn trường.
     - `SUBJECT`: Chỉ được phép import PPCT cho môn học có `id` trùng khớp với `resourceId` của grant.
3. **Xử lý khi bị từ chối:**
   - Trả về HTTP 403 Forbidden.
   - Ghi nhật ký kiểm toán hệ thống qua `AuditService` với action `AUTHORIZATION_DENIED`, target `PPCT_MANAGE`.
4. **Bảo toàn nguyên tắc đặc quyền:**
   - Quyền `SYSTEM_ADMIN` thuần túy về mặt kỹ thuật **KHÔNG ĐƯỢC PHÉP** thực hiện import PPCT nếu không được cấp capability `PPCT_MANAGE`.

---

## 30. Phân loại Lỗi Chuẩn tắc (Reconciled Error Taxonomy)

Toàn bộ các trường hợp vi phạm phải trả về mã lỗi ổn định, không để lộ raw stack trace của trình phân tích Excel:

### Nhóm 1: Lỗi Gói Tệp & An toàn (Package & Security)
- `PPCT_IMPORT_INVALID_XLSX`: Tệp tải lên không phải là tệp ZIP/XLSX hợp lệ, hỏng cấu trúc OpenXML hoặc chứa đối tượng nhúng/ActiveX bị cấm.
- `PPCT_IMPORT_FILE_TOO_LARGE`: Dung lượng tệp nén vượt quá 8MB.
- `PPCT_IMPORT_COMPLEXITY_LIMIT`: Tệp vượt quá ngưỡng giải nén 64MB, tỷ lệ nén > 20:1, quá 100 entries, quá 32 sheets hoặc quá 5,000 dòng.
- `PPCT_IMPORT_MACRO_UNSUPPORTED`: Tệp chứa macro hoặc mã thực thi VBA (`vbaProject.bin`).
- `PPCT_IMPORT_EXTERNAL_LINKS_UNSUPPORTED`: Tệp chứa liên kết hoặc kết nối dữ liệu ra ngoài (`xl/externalLinks/`).
- `PPCT_IMPORT_ENCRYPTED_UNSUPPORTED`: Tệp bị đặt mật khẩu hoặc mã hóa OpenXML.
- `PPCT_IMPORT_TIMEOUT`: Quá thời gian phân tích an toàn tệp (8,000 ms).

### Nhóm 2: Lỗi Cấu trúc Sheet & Header (Sheet & Header Structure)
- `PPCT_IMPORT_MISSING_REQUIRED_SHEET`: Thiếu một trong các sheet bắt buộc (`THONG_TIN`, `PPCT`, `CHUYEN_DE`).
- `PPCT_IMPORT_UNEXPECTED_SHEET`: Tệp chứa sheet không nằm trong danh mục chuẩn 6 sheet.
- `PPCT_IMPORT_HIDDEN_AUTHORITATIVE_SHEET`: Một trong các sheet thẩm quyền bị ẩn (`hidden` hoặc `veryHidden`).
- `PPCT_IMPORT_INVALID_HEADER`: Dòng tiêu đề không khớp chính xác với mẫu chuẩn tắc.
- `PPCT_IMPORT_MISSING_HEADER`: Thiếu cột tiêu đề bắt buộc.
- `PPCT_IMPORT_DUPLICATE_HEADER`: Trùng lặp cột tiêu đề.

### Nhóm 3: Lỗi Metadata & Danh tính (Metadata & Identity)
- `PPCT_IMPORT_TEMPLATE_VERSION_MISMATCH`: Giá trị `THONG_TIN.Phiên bản mẫu` không phải là `PPCT_V1`.
- `PPCT_IMPORT_METADATA_MISSING`: Thiếu Môn học hoặc Năm học trong sheet `THONG_TIN`.
- `PPCT_IMPORT_SUBJECT_NOT_FOUND`: Môn học không tồn tại trong danh mục môn học của hệ thống.
- `PPCT_IMPORT_SUBJECT_INACTIVE`: Môn học đang ở trạng thái ngừng hoạt động (`INACTIVE`).
- `PPCT_IMPORT_SUBJECT_AMBIGUOUS`: Tên môn học không định danh được duy nhất môn học trong hệ thống.
- `PPCT_IMPORT_ACADEMIC_YEAR_NOT_FOUND`: Năm học không tồn tại trong cơ sở dữ liệu.
- `PPCT_IMPORT_INVALID_ACADEMIC_YEAR_FORMAT`: Định dạng chuỗi năm học sai quy chuẩn (không phải `YYYY-YYYY`).

### Nhóm 4: Lỗi Dữ liệu Dòng Bài học (Data Row Validation)
- `PPCT_IMPORT_INVALID_GRADE`: Giá trị khối lớp không thuộc `{10, 11, 12}`.
- `PPCT_IMPORT_MISSING_TITLE`: Tên bài học / chuyên đề bị để trống.
- `PPCT_IMPORT_TITLE_OVER_LIMIT`: Tiêu đề bài học chuẩn tắc sau khi ghép tiền tố vượt quá 500 ký tự.
- `PPCT_IMPORT_FIELD_OVER_LIMIT`: Trường văn bản phụ vượt quá giới hạn ký tự (ví dụ `Bài / Chủ đề` quá 150 ký tự).
- `PPCT_IMPORT_INVALID_LESSON_TYPE`: Loại nội dung không thuộc allowlist đóng băng của máy chủ.
- `PPCT_IMPORT_INVALID_PERIOD_COUNT`: Số tiết không phải số nguyên dương hợp lệ hoặc vượt ngưỡng tối đa (1..30 ở PPCT, 1..40 ở CHUYEN_DE).
- `PPCT_IMPORT_INVALID_WEEK_RANGE`: Tuần bắt đầu / tuần kết thúc không hợp lệ (`weekStart > weekEnd` hoặc ngoài khoảng 1..40).
- `PPCT_IMPORT_PARTIAL_ROW`: Dòng dữ liệu bị điền dở dang, thiếu các trường bắt buộc.
- `PPCT_IMPORT_DUPLICATE_ROW`: Dòng bài học bị trùng lặp hoàn toàn.
- `PPCT_IMPORT_SEQUENCE_DISORDER`: Dãy số chuyên đề (`Chuyên đề số *`) không liên tục bắt đầu từ 1 hoặc bị trùng lặp trong cùng khối lớp.
- `PPCT_IMPORT_PROHIBITED_FORMULA`: Phát hiện công thức Excel nằm trong các cột dữ liệu nhập liệu nghiệp vụ (A..G ở PPCT, A..F ở CHUYEN_DE).

### Nhóm 5: Lỗi Mục tiêu Bản nháp, Đồng thời & Phả hệ (Target, Concurrency & Lineage)
- `PPCT_IMPORT_TARGET_DRAFT_NOT_FOUND`: Không tìm thấy bản ghi draft mục tiêu được chỉ định khi chọn chế độ `UPDATE_EXACT_DRAFT`.
- `PPCT_IMPORT_TARGET_DRAFT_PLAN_MISMATCH`: Bản ghi draft mục tiêu không thuộc đúng kế hoạch môn học của khối lớp đó.
- `PPCT_IMPORT_TARGET_NOT_DRAFT`: Bản ghi mục tiêu được chỉ định không ở trạng thái `DRAFT`.
- `PPCT_IMPORT_DRAFT_CONFLICT`: Xung đột đồng thời (CAS token `expectedUpdatedAt` không khớp với CSDL hiện tại).
- `PPCT_IMPORT_FINGERPRINT_MISMATCH`: Khóa `requestFingerprint` gửi lên không khớp với bản preview.
- `PPCT_IMPORT_REPLAY_AMBIGUOUS`: Tìm thấy nhiều hơn một bản ghi DRAFT trùng khớp nội dung ngữ nghĩa khi phát lại ở chế độ `CREATE_NEW_DRAFT`.
- `PPCT_IMPORT_LINEAGE_AMBIGUOUS`: Cấu trúc bài học xáo trộn phức tạp không thể tự động căn chỉnh phả hệ một cách an toàn.

*(Lưu ý: Sự không thống nhất giữa công thức Excel phái sinh ở cột H, I và tính toán của máy chủ, hoặc độ lệch nội dung sheet `DANH_MUC` tải lên, được xếp loại cảnh báo `ADVISORY`, không dùng làm mã lỗi chặn).*

---

## 31. Nghĩa vụ Triển khai Cụ thể cho P2-020 (Obligations for P2-020)

Khi thực hiện nhiệm vụ `P2-020` (Native PPCT Importer Implementation), kỹ sư phải tuân thủ nghiêm ngặt các nghĩa vụ sau:
1. **Triển khai phân rã tiết học tất định:** Mở rộng mỗi dòng bài học có `Số tiết = N` thành $N$ nghĩa vụ bài học cấp tiết (`PpctItem` + `PpctItemRevision`) có `sequence` liên tục và dùng chung tiêu đề chuẩn tắc.
2. **Khóa tiêu đề chuẩn tắc $\le 500$ ký tự:** Không lưu chuỗi `(Tiết i/N)` vào CSDL; kiểm tra độ dài sau khi ghép tiền tố $\le 500$ ký tự, nếu vượt quá báo lỗi fail-closed `PPCT_IMPORT_TITLE_OVER_LIMIT`.
3. **Tuân thủ đúng hợp đồng phả hệ runtime:**
   - Bài học giữ nguyên: `identityMode = CARRY_FORWARD`, `predecessors = []` (không sinh lineage).
   - Bài học kế thừa/thay thế mới: `identityMode = NEW`, khai báo `predecessors` hợp lệ (sinh lineage cùng component).
4. **Hỗ trợ đầy đủ hai chế độ mục tiêu bản nháp:** `CREATE_NEW_DRAFT` (với semantic replay idempotent) và `UPDATE_EXACT_DRAFT` (với CAS `expectedUpdatedAt` và kiểm tra quyền sở hữu plan).
5. **Giao dịch nguyên tử cấp workbook:** Toàn bộ các khối lớp có trong tệp phải được lưu trữ trong một database transaction duy nhất (all-or-nothing), sử dụng chung một `Prisma.TransactionClient` nội bộ.
6. **Xây dựng PPCT Parser Profile:** Bổ sung profile parser riêng cho PPCT cho phép đọc chuỗi ô tiêu đề lên tới 500 ký tự, chấp nhận công thức dải tiết tại cột phái sinh H, I và G, H, áp dụng giới hạn 20:1 expansion và 100 ZIP entries.
7. **Bảo toàn thẩm quyền allowlist của máy chủ:** Áp dụng allowlist đóng băng của hợp đồng `PPCT_V1` cho `lessonType`, không tin tưởng nội dung sheet `DANH_MUC` tải lên.

---

## 32. Ranh giới Ngoài Phạm vi Rõ ràng (Explicit Non-Scope)

Nhiệm vụ `P2-010` này tuyệt đối **KHÔNG BAO GỒM**:
- Viết mã nguồn bộ nhập runtime cho PPCT (thuộc phạm vi `P2-020`);
- Thêm cột mới vào bảng `PpctVersion` hoặc schema Prisma;
- Tạo file migration CSDL;
- Đụng chạm tới logic phân bổ thời khóa biểu hoặc báo cáo thực hiện giảng dạy;
- Sửa đổi các file thuộc `apps/`, `packages/`, `prisma/`, `scripts/`, `.github/`;
- Tự động thay đổi `PRE-PILOT-PRODUCT-BASELINE.md` hoặc tạo mới ADR khi không có mâu thuẫn kiến trúc;
- Mở Pull Request, merge, deploy hoặc tương tác với cơ sở dữ liệu production.

---

## 33. Danh mục Kiểm tra Nghiệm thu (Acceptance Checklist)

- [x] Đã xác minh file workbook tồn tại tại đúng đường dẫn cục bộ `.local-evidence/Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`.
- [x] Đã xác minh mã băm SHA-256 khớp tuyệt đối `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`.
- [x] Đã xác minh file được Git exclude an toàn qua `.git/info/exclude` và không bị theo dõi bởi Git.
- [x] Đã kiểm toán an toàn toàn diện gói tệp XLSX với kết luận chuẩn mực.
- [x] Đã xác lập cơ chế phân rã tiết học tất định tương thích với độ mịn lưu trữ và bộ phân bổ của hệ thống hiện hành.
- [x] Đã khóa quy tắc tiêu đề chuẩn tắc (không lưu hậu tố `Tiết i/N` vào CSDL, kiểm tra giới hạn $\le 500$ ký tự).
- [x] Đã khóa chuẩn tắc ngữ nghĩa `CARRY_FORWARD` (không có predecessor, không tạo lineage) và `NEW` (có predecessor, tạo lineage).
- [x] Đã loại bỏ giả định đơn draft, thiết lập hợp đồng mục tiêu rõ ràng (`CREATE_NEW_DRAFT` và `UPDATE_EXACT_DRAFT`).
- [x] Đã định nghĩa cơ chế phát lại ngữ nghĩa idempotent không cần schema biên nhận mới.
- [x] Đã khóa ranh giới giao dịch nguyên tử cấp workbook sử dụng chung một transaction client cho toàn bộ các khối lớp.
- [x] Đã khóa thẩm quyền danh mục `Loại nội dung` thuộc về allowlist đóng băng của máy chủ.
- [x] Đã phân định rạch ròi giữa giới hạn tái sử dụng từ timetable parser và các giới hạn/profile mới riêng cho PPCT.
- [x] Đã chuẩn hóa danh mục mã lỗi fail-closed thống nhất 100%.

---

## 34. Tóm tắt Bằng chứng Kiểm toán (Evidence Summary)

Kiểm toán xác nhận workbook chính thức của trường Đam San (`Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`) hoàn toàn có thể tích hợp an toàn vào kiến trúc PPCT đã được chuẩn hóa tại `ADR-048` thông qua cơ chế phân rã tiết học tất định:
- Dòng sư phạm có `Số tiết = N` phân rã thành $N$ nghĩa vụ bài học cấp tiết, hoàn toàn tương thích với mô hình phân bổ 1 tiết = 1 `PpctItemRevision` của `P2-003`.
- `CHUYEN_DE` ánh xạ sang `SPECIALIZED_STUDY` với không gian `sequence` tiết độc lập bắt đầu từ 1.
- Hợp đồng mục tiêu bản nháp và phả hệ cấp tiết tuân thủ chặt chẽ hành vi runtime hiện tại của `PpctService`.
- Quá trình nạp bảo đảm tính nguyên tử trên toàn bộ workbook và bảo toàn nguyên vẹn ranh giới cấu hình áp dụng theo lớp của Ban giám hiệu và Tổ trưởng tại `P2-004`.

Nhiệm vụ `P2-010` duy trì trạng thái **`IN_REVIEW`**. Nhiệm vụ `P2-020` tiếp tục ở trạng thái **`PLANNED`** cho đến khi `P2-010` hoàn tất quy trình review, merge và đóng tài liệu `SYNC-P2-010`.
