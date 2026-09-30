# P2-010 — Kiểm toán Hợp đồng và An toàn Workbook PPCT Thực tế (PPCT Real-Workbook Contract & Security Audit)

- **Trạng thái nhiệm vụ:** `IN_REVIEW`
- **Nhánh thực thi:** `docs/ppct-real-workbook-contract-security-audit-010`
- **Canonical starting baseline SHA:** `b8b5f9862c2dc160e124a19b863ac547b44ef94b`
- **Tên workbook chuẩn tắc:** `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`
- **Đường dẫn bằng chứng cục bộ:** `D:\baogiang-damsan\.local-evidence\Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`
- **Authoritative SHA-256:** `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`
- **Bằng chứng Git exclusion:** Resolve qua `.git/info/exclude`, không bị track bởi git (`git ls-files` = NO OUTPUT)
- **Điều kiện tiên quyết:** `P2-001` (CLOSED), `P0-900` (CLOSED), `ADR-048` (Accepted)
- **Ma trận truy xuất nguồn gốc (Traceability):** `T24`, `T45`
- **Nhiệm vụ hạ nguồn:** `P2-020` (PPCT native importer implementation) tiếp tục ở trạng thái `PLANNED` (bị khóa cho đến khi P2-010 hoàn tất review, merge, post-merge CI và closure sync).

---

## 1. Danh tính Nhiệm vụ và Trạng thái (Task Identity and Status)

Nhiệm vụ `P2-010` thực hiện kiểm toán gói tệp (package & security audit), kiểm toán cấu trúc vật lý (physical sheets, tables, columns, rows, cell types, formulas) và khóa toàn diện hợp đồng nhập liệu từ workbook PPCT chính thức của trường Đam San sang mô hình nghiệp vụ PPCT chuẩn tắc đã được đóng tại `ADR-048` (`P2-001`), `P2-002`, `P2-003`, `P2-004`.

Nhiệm vụ này là **kiểm toán kiến trúc và hợp đồng nghiệp vụ ràng buộc bằng chứng thực tế (evidence-bound architecture/contract audit)**, tuyệt đối:
- **KHÔNG** triển khai bộ nhập (importer runtime);
- **KHÔNG** sửa đổi schema Prisma;
- **KHÔNG** tạo migration cơ sở dữ liệu;
- **KHÔNG** deploy hoặc thực hiện bất kỳ mutation nào trên môi trường production;
- **KHÔNG** đưa raw workbook vào git repository, fixture hay test code.

Trạng thái đề xuất cuối cùng trên nhánh nhiệm vụ: **`IN_REVIEW`**.

---

## 2. Canonical Starting Baseline

- **Mã SHA khởi đầu chuẩn tắc:** `b8b5f9862c2dc160e124a19b863ac547b44ef94b`
- Đây là commit `origin/main` sau khi hoàn tất `P2-061`, quy trình đồng bộ `SYNC-P2-061`, PR #168 và post-merge CI run #533 SUCCESS.
- Nhánh nhiệm vụ `docs/ppct-real-workbook-contract-security-audit-010` được phân nhánh trực tiếp từ SHA này.

---

## 3. Authoritative Evidence Fingerprint

| Thuộc tính | Giá trị kiểm toán thực tế |
|---|---|
| **Tên tệp** | `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx` |
| **Đường dẫn cục bộ** | `D:\baogiang-damsan\.local-evidence\Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx` |
| **Dung lượng tệp** | 34,897 bytes (~34.1 KB) |
| **SHA-256 (tính trực tiếp từ bytes)** | `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692` |
| **Kích thước giải nén (Uncompressed size)** | 199,762 bytes (~195 KB) |
| **Tỷ lệ nén (Expansion ratio)** | 6.08 (hoàn toàn an toàn, nằm sâu dưới ngưỡng zip bomb 64MB) |
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

| Hạng mục kiểm tra | Kết quả phát hiện | Đánh giá an toàn |
|---|---|---|
| **Macro / VBA (`xl/vbaProject.bin`)** | Hoàn toàn KHÔNG có | **AN TOÀN** |
| **External links (`xl/externalLinks/`)** | Hoàn toàn KHÔNG có | **AN TOÀN** |
| **External relationships / connections** | Hoàn toàn KHÔNG có | **AN TOÀN** |
| **OLE Objects / Embedded binaries** | Hoàn toàn KHÔNG có | **AN TOÀN** |
| **ActiveX controls** | Hoàn toàn KHÔNG có | **AN TOÀN** |
| **External hyperlinks** | Hoàn toàn KHÔNG có liên kết ra ngoài | **AN TOÀN** |
| **Mã hóa / Password Protection** | Tệp không bị mã hóa hay đặt mật khẩu | **AN TOÀN** |
| **ZIP traversal / Malformed paths** | Không có ký tự `..` hay đường dẫn tuyệt đối | **AN TOÀN** |
| **Zip bomb / Compression ratio** | Dung lượng nén 32.8 KB -> giải nén 195 KB (tỷ lệ 6.08) | **AN TOÀN** |
| **Công thức (Formulas)** | Không có công thức trong các cột dữ liệu nghiệp vụ (A..G ở PPCT, A..F ở CHUYEN_DE). Chỉ có công thức số học đơn giản ở các cột tự động (H, I ở PPCT; G, H ở CHUYEN_DE). | **AN TOÀN** (xử lý fail-closed theo quy tắc cột phái sinh) |

**Kết luận an toàn:** Tệp workbook đáp ứng đầy đủ tiêu chuẩn an toàn gói XLSX và có thể sử dụng làm căn cứ kỹ thuật cho P2-020 mà không tiềm ẩn rủi ro bảo mật hệ thống.

---

## 6. Ma trận Thẩm quyền Sheet (Sheet Authority Matrix)

| Tên Sheet | Phân loại Thẩm quyền | Mục đích & Ranh giới Xử lý của Importer P2-020 |
|---|:---:|---|
| `THONG_TIN` | **AUTHORITATIVE_INPUT** | Chứa metadata chuẩn tắc của toàn bộ workbook: Môn học, Năm học, Phiên bản mẫu. Bắt buộc phải có và hợp lệ. |
| `PPCT` | **AUTHORITATIVE_INPUT** | Nguồn dữ liệu bài học cho thành phần cốt lõi (`PpctCurricularComponent.CORE`). Dữ liệu các dòng thuộc khối 10, 11, 12 được phân chia tương ứng vào từng `PpctPlan`. |
| `CHUYEN_DE` | **AUTHORITATIVE_INPUT** | Nguồn dữ liệu chuyên đề cho thành phần chuyên đề học tập (`PpctCurricularComponent.SPECIALIZED_STUDY`). Nếu sheet trống hoặc môn không có chuyên đề, plan tương ứng sẽ có 0 chuyên đề. |
| `HUONG_DAN` | **IGNORED** | Chỉ mang tính hướng dẫn nghiệp vụ cho người biên soạn Excel tại trường. Importer tuyệt đối không đọc dữ liệu từ sheet này để tạo thực thể. |
| `DANH_MUC` | **REFERENCE_ONLY** | Dùng làm nguồn dropdown trong Excel. Hệ thống kiểm tra hợp lệ dữ liệu (validation) đối chiếu với catalog cơ sở dữ liệu thật của hệ thống, không tự động nạp danh mục mới từ sheet này. |
| `VI_DU` | **IGNORED** | Chỉ chứa các dòng ví dụ minh họa trực quan. Importer bỏ qua hoàn toàn, không nhập dữ liệu từ sheet này. |

**Quy tắc xử lý bất thường về Sheet:**
1. **Thiếu sheet bắt buộc (`THONG_TIN`, `PPCT`, `CHUYEN_DE`):** Báo lỗi fail-closed `PPCT_IMPORT_MISSING_REQUIRED_SHEET`.
2. **Sheet bị ẩn:** Nếu bất kỳ sheet thẩm quyền nào (`THONG_TIN`, `PPCT`, `CHUYEN_DE`) ở trạng thái `hidden` hoặc `veryHidden`, báo lỗi fail-closed `PPCT_IMPORT_HIDDEN_AUTHORITATIVE_SHEET`.
3. **Thừa sheet không xác định:** Báo lỗi fail-closed `PPCT_IMPORT_UNEXPECTED_SHEET` (chỉ chấp nhận đúng 6 sheet có tên chuẩn).
4. **Sai tên sheet / phân biệt hoa thường:** Tên sheet chuẩn tắc là `THONG_TIN`, `PPCT`, `CHUYEN_DE`, `HUONG_DAN`, `DANH_MUC`, `VI_DU`. Không hỗ trợ fuzzy matching âm thầm.

---

## 7. Hợp đồng Workbook Vật lý (Physical Workbook Contract)

1. **Một workbook = Một Môn học + Một Năm học:**
   - Một tệp workbook duy nhất chứa toàn bộ kế hoạch PPCT cho một Môn học trong một Năm học.
   - Có thể chứa đồng thời cả 3 khối lớp: 10, 11, 12 (hoặc một/hai khối lớp nếu môn học chỉ giảng dạy ở một số khối).
2. **Tên tệp (Filename) KHÔNG có thẩm quyền nghiệp vụ:**
   - Quy ước đặt tên file tại `THONG_TIN` dòng 11: `PPCT_<MON_HOC>_<NAM_HOC>.xlsx` chỉ mang tính chất quản lý tập tin và cảnh báo trực quan cho người dùng.
   - Tên tệp **KHÔNG ĐƯỢC** sử dụng để nhận diện Môn học hoặc Năm học. Thẩm quyền duy nhất thuộc về ô `B4` (Môn học) và `B5` (Năm học) tại sheet `THONG_TIN`.
3. **Phân vùng Bảng Excel (ListObject / Table):**
   - Sheet `PPCT` chứa bảng `PPCT_Table` vùng `A1:I301`.
   - Sheet `CHUYEN_DE` chứa bảng `CHUYEN_DE_Table` vùng `A1:H121`.
   - Các dòng trống nằm trong vùng bảng đã định dạng sẵn phải được lọc bỏ xác định (deterministic filtering).

---

## 8. Hợp đồng Metadata tại `THONG_TIN` (Metadata Contract)

| Ô | Trường Thông tin | Bắt buộc | Kiểu dữ liệu | Quy tắc Kiểm tra & Chuẩn hóa | Xử lý nếu Lỗi / Trống |
|:---:|---|:---:|:---:|---|---|
| **B4** | **Môn học** | **CÓ** | Chuỗi (String) | Cắt khoảng trắng (trim), chuẩn hóa Unicode NFKC. Khớp với danh mục môn học (`Subject`). | Báo lỗi `PPCT_IMPORT_METADATA_MISSING` hoặc `PPCT_IMPORT_SUBJECT_NOT_FOUND`. |
| **B5** | **Năm học** | **CÓ** | Chuỗi (String) | Cắt khoảng trắng (trim), chuẩn hóa Unicode NFKC, định dạng `YYYY-YYYY` (ví dụ `2026-2027`). Khớp với `AcademicYear.code`. | Báo lỗi `PPCT_IMPORT_METADATA_MISSING` hoặc `PPCT_IMPORT_ACADEMIC_YEAR_NOT_FOUND`. |
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
- Cắt khoảng trắng hai đầu, thay thế chuỗi khoảng trắng và ký tự ngắt dòng `\r`, `\n` bằng một khoảng trắng đơn (` `), chuẩn hóa Unicode NFKC.
- Sai lệch thứ tự cột, thiếu cột, thừa cột hoặc trùng lặp cột: báo lỗi fail-closed `PPCT_IMPORT_INVALID_HEADER`, `PPCT_IMPORT_MISSING_HEADER`, `PPCT_IMPORT_DUPLICATE_HEADER`.

---

## 10. Hợp đồng Trường Dữ liệu Chi tiết (Field Contract)

### A. Sheet `PPCT` (Ánh xạ sang `CORE`):

| Trường | Cột | Kiểu | Bắt buộc | Ràng buộc giá trị & Chuẩn hóa | Ánh xạ Domain PPCT | Mã lỗi nếu vi phạm |
|---|:---:|:---:|:---:|---|---|---|
| **Khối lớp** | A | Số nguyên | **Có** | Thuộc tập `{10, 11, 12}`. | `PpctPlan.gradeLevel` | `PPCT_IMPORT_INVALID_GRADE` |
| **Loại nội dung** | B | Chuỗi | Không | Thuộc danh mục `{Bài học, Thực hành, Ôn tập, Kiểm tra, Trả bài, Khác}`. Nếu trống mặc định là `'Bài học'`. | `PpctItemRevision.lessonType` | `PPCT_IMPORT_INVALID_LESSON_TYPE` |
| **Bài / Chủ đề** | C | Chuỗi | Không | Tối đa 150 ký tự. Có thể trống (ví dụ tiết kiểm tra, ôn tập). | Ghép tiền tố vào `title` hoặc lưu ngữ cảnh tiêu đề. | `PPCT_IMPORT_FIELD_OVER_LIMIT` |
| **Tên bài / Nội dung** | D | Chuỗi | **Có** | Độ dài 1..500 ký tự sau trim. | `PpctItemRevision.title` (kết hợp với Bài/Chủ đề nếu có) | `PPCT_IMPORT_MISSING_TITLE`, `PPCT_IMPORT_TITLE_OVER_LIMIT` |
| **Số tiết** | E | Số nguyên | **Có** | Nguyên dương `1 <= n <= 30`. | Thông tin số tiết bài học phục vụ phân bổ | `PPCT_IMPORT_INVALID_PERIOD_COUNT` |
| **Tuần bắt đầu** | F | Số nguyên | **Có** | Nguyên dương `1 <= weekStart <= 40`. | Kế hoạch tuần phân bổ dự kiến | `PPCT_IMPORT_INVALID_WEEK_RANGE` |
| **Tuần kết thúc** | G | Số nguyên | **Có** | Nguyên dương `1 <= weekEnd <= 40`; `weekStart <= weekEnd`. | Kế hoạch tuần phân bổ dự kiến | `PPCT_IMPORT_INVALID_WEEK_RANGE` |
| **Tiết bắt đầu/kết thúc** | H, I | Số/Formula | Phái sinh | Excel tự động tính; server recompute độc lập, không dùng làm authority. | Bỏ qua khi lưu trữ, dùng để đối soát tùy chọn | `PPCT_IMPORT_DERIVED_NUMBER_MISMATCH` (Advisory) |

### B. Sheet `CHUYEN_DE` (Ánh xạ sang `SPECIALIZED_STUDY`):

| Trường | Cột | Kiểu | Bắt buộc | Ràng buộc giá trị & Chuẩn hóa | Ánh xạ Domain PPCT | Mã lỗi nếu vi phạm |
|---|:---:|:---:|:---:|---|---|---|
| **Khối lớp** | A | Số nguyên | **Có** | Thuộc tập `{10, 11, 12}`. | `PpctPlan.gradeLevel` | `PPCT_IMPORT_INVALID_GRADE` |
| **Chuyên đề số** | B | Số nguyên | **Có** | Nguyên dương `1 <= n <= 20`. Phải là chuỗi liên tục `1, 2, 3...`. | Trực tiếp tương ứng với `sequence` của `SPECIALIZED_STUDY` | `PPCT_IMPORT_INVALID_SPECIALIZED_NUMBER` |
| **Tên chuyên đề** | C | Chuỗi | **Có** | Độ dài 1..500 ký tự sau trim. | `PpctItemRevision.title` | `PPCT_IMPORT_MISSING_TITLE`, `PPCT_IMPORT_TITLE_OVER_LIMIT` |
| **Số tiết** | D | Số nguyên | **Có** | Nguyên dương `1 <= n <= 40`. | Thông tin số tiết chuyên đề phục vụ phân bổ | `PPCT_IMPORT_INVALID_PERIOD_COUNT` |
| **Tuần bắt đầu** | E | Số nguyên | **Có** | Nguyên dương `1 <= weekStart <= 40`. | Kế hoạch tuần phân bổ dự kiến | `PPCT_IMPORT_INVALID_WEEK_RANGE` |
| **Tuần kết thúc** | F | Số nguyên | **Có** | Nguyên dương `1 <= weekEnd <= 40`; `weekStart <= weekEnd`. | Kế hoạch tuần phân bổ dự kiến | `PPCT_IMPORT_INVALID_WEEK_RANGE` |
| **Tiết bắt đầu/kết thúc** | G, H | Số/Formula | Phái sinh | Excel tự động tính; server recompute độc lập, không dùng làm authority. | Bỏ qua khi lưu trữ | `PPCT_IMPORT_DERIVED_NUMBER_MISMATCH` (Advisory) |

---

## 11. Hợp đồng Định danh Môn học (Subject Identity Contract)

1. Giá trị `THONG_TIN.Môn học` được phân giải ở phía máy chủ (server-side resolution):
   - Chuẩn hóa Unicode NFKC và trim khoảng trắng.
   - Đối soát với bảng `Subject` trong cơ sở dữ liệu: tìm kiếm theo `Subject.name` (hoặc `Subject.code`).
2. **Quy tắc fail-closed:**
   - Nếu không tìm thấy môn học: dừng lại và trả về mã lỗi `PPCT_IMPORT_SUBJECT_NOT_FOUND`.
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
   - Nếu định dạng năm học sai quy chuẩn (ví dụ không phải dạng `YYYY-YYYY`): báo lỗi `PPCT_IMPORT_INVALID_ACADEMIC_YEAR_FORMAT`.
3. **Bất biến an toàn:**
   - Hệ thống **TUYỆT ĐỐI KHÔNG** tự động tạo mới `AcademicYear`.
   - Hệ thống **TUYỆT ĐỐI KHÔNG** suy diễn năm học từ đồng hồ hệ thống (system clock).

---

## 13. Hợp đồng Định danh Khối lớp (Grade Identity Contract)

1. Giá trị `Khối lớp *` ở từng dòng trong sheet `PPCT` và `CHUYEN_DE` phải là số nguyên thuộc tập hợp hợp lệ `{10, 11, 12}`.
2. Dữ liệu một workbook có thể bao gồm đồng thời cả 3 khối lớp, hoặc 1 khối, hoặc 2 khối:
   - Các dòng được gom nhóm (group by) theo `gradeLevel`.
   - Mỗi nhóm `gradeLevel` sẽ ánh xạ tới một `PpctPlan` tương ứng với tọa độ duy nhất `(academicYearId, subjectId, gradeLevel)`.
3. Nếu một khối lớp không xuất hiện dòng nào trong file: kế hoạch của khối lớp đó không bị ảnh hưởng.
4. Giá trị khối lớp ngoài khoảng 10..12, dạng văn bản không hợp lệ (ví dụ `"Khối 10"`, `"10A"`, `"9"`): báo lỗi fail-closed `PPCT_IMPORT_INVALID_GRADE`.

---

## 14. Ánh xạ từ Mô hình Vật lý sang Domain PPCT Chuẩn tắc

```text
[Workbook: Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx]
  │
  ├── THONG_TIN
  │     ├── Môn học ───────────► Subject (id, code, name)
  │     ├── Năm học ───────────► AcademicYear (id, code)
  │     └── Phiên bản mẫu ─────► Validate "PPCT_V1"
  │
  ├── Nhóm theo Khối lớp (10, 11, 12)
  │     │
  │     ▼
  │   PpctPlan (academicYearId, subjectId, gradeLevel)
  │     │
  │     ├── Tạo hoặc Cập nhật Bản nháp (DRAFT)
  │     │     ▼
  │     │   PpctVersion (id, ppctPlanId, versionNumber, status=DRAFT)
  │     │
  │     ├── Dòng từ Sheet PPCT (Khối tương ứng)
  │     │     ▼
  │     │   PpctItem (id, ppctPlanId, component=CORE)
  │     │     ▼
  │     │   PpctItemRevision (component=CORE, sequence=1..N, title, lessonType)
  │     │
  │     └── Dòng từ Sheet CHUYEN_DE (Khối tương ứng)
  │           ▼
  │         PpctItem (id, ppctPlanId, component=SPECIALIZED_STUDY)
  │           ▼
  │         PpctItemRevision (component=SPECIALIZED_STUDY, sequence=1..M, title, lessonType='Chuyên đề')
```

---

## 15. Hợp đồng Thành phần Cốt lõi (CORE Contract)

1. **Nguồn dữ liệu:** Các dòng trong sheet `PPCT` có cột `Khối lớp *` khớp với `gradeLevel` của plan.
2. **Quy tắc tiêu đề (`title`):**
   - Nếu cột `Bài / Chủ đề` (C) có giá trị (ví dụ `"Bài 1"`): Tiêu đề chuẩn tắc được định dạng là `"{Bài / Chủ đề}: {Tên bài / Nội dung}"` (ví dụ `"Bài 1: Vị trí địa lí và phạm vi lãnh thổ"`).
   - Nếu cột `Bài / Chủ đề` để trống: Tiêu đề chuẩn tắc lấy chính xác từ cột `Tên bài / Nội dung` (ví dụ `"Ôn tập giữa HK1"`).
3. **Thứ tự sequence:** Bắt đầu từ `1`, tăng liên tục theo thứ tự dòng vật lý xuất hiện trong sheet `PPCT` cho khối lớp đó.
4. **Bắt buộc có nội dung CORE:** Mỗi kế hoạch phiên bản xuất bản bắt buộc phải có ít nhất 1 bài học `CORE` (theo `ADR-048` §2.3).

---

## 16. Hợp đồng Thành phần Chuyên đề Học tập (SPECIALIZED_STUDY Contract)

1. **Nguồn dữ liệu:** Các dòng trong sheet `CHUYEN_DE` có cột `Khối lớp *` khớp với `gradeLevel` của plan.
2. **Quy tắc tiêu đề (`title`):** Lấy trực tiếp từ cột `Tên chuyên đề *` (ví dụ `"Làng nghề"`).
3. **Thứ tự sequence:** Lấy trực tiếp từ cột `Chuyên đề số *` (`1, 2, 3...`), bắt buộc phải là dãy số nguyên liên tục bắt đầu từ `1`.
4. **Loại bài học (`lessonType`):** Được ấn định chuẩn tắc là `'Chuyên đề'` (hoặc `'Chuyên đề học tập'`).
5. **Tính tùy chọn của Chuyên đề:** Nếu môn học không có chuyên đề (sheet `CHUYEN_DE` trống đối với khối lớp đó), `PpctVersion` được tạo với danh sách bài học `SPECIALIZED_STUDY` rỗng (0 bài). Hệ thống không báo lỗi.

---

## 17. Hợp đồng Định danh Ổn định của Bài học (Stable Item Identity)

Theo `ADR-048` (§2.1):
1. Mỗi bài học logic trong `PpctPlan` được đại diện bởi một bản ghi `PpctItem` với UUID bất biến (`id`) gắn liền với thành phần `component`.
2. **Số thứ tự dòng không phải là định danh kỹ thuật:** Dòng vật lý trong Excel có thể thay đổi vị trí, chèn thêm, xóa bớt giữa các lần import.
3. **Quy tắc tạo mới phiên bản đầu tiên (Version 1):**
   - Toàn bộ các dòng hợp lệ được khởi tạo với `identityMode = NEW`.
   - Hệ thống sinh UUID mới cho từng `PpctItem`, lưu cặp `(id, ppctPlanId, component)`.
4. **Quy tắc nhập phiên bản tiếp theo (Version 2+):**
   - Importer thực hiện đối chiếu bài học để duy trì tính liên tục (carry-forward lineage):
     - Trong cùng một `component`, so sánh theo sequence và title chuẩn hóa.
     - Bài học giữ nguyên: `identityMode = CARRY_FORWARD`, gán `predecessors = [{ versionId: prevVersionId, itemId: existingItemId }]`.
     - Bài học mới chèn thêm: `identityMode = NEW`.
     - Nếu phát hiện cấu trúc thay đổi xáo trộn lớn không thể xác định đối ứng rõ ràng: Importer chuyển sang chế độ fail-closed hoặc yêu cầu người dùng xác nhận bản đồ ánh xạ (mapping confirmation) trong giao diện preview, tuyệt đối không tự động đoán phả hệ.

---

## 18. Hợp đồng Phả hệ và Hiệu chỉnh (Revision / Lineage)

1. Cơ sở dữ liệu bắt buộc kiểm chứng composite foreign key:
   ```sql
   FOREIGN KEY (ppct_item_id, ppct_plan_id, component)
     REFERENCES ppct_items(id, ppct_plan_id, component)
   ```
2. Phả hệ qua bảng `PpctItemLineage` yêu cầu:
   - Cùng `component`: không bao giờ tạo liên kết lineage xuyên thành phần (cross-component lineage) giữa `CORE` và `SPECIALIZED_STUDY`.
   - Cùng `ppctPlanId`.
3. Bất biến quan hệ: Khi import nội dung mới vào một Version DRAFT, các bản ghi `PpctItemRevision` cũ của DRAFT đó được thay thế nguyên tử (atomic CAS replace-all) theo cơ chế hiện hành tại `PpctService.replaceContent`.

---

## 19. Hợp đồng Thứ tự Dòng và Dãy Số thứ tự (Row-Order / Sequence Semantics)

1. Thứ tự dòng vật lý trong bảng Excel là thẩm quyền quyết định số thứ tự `sequence`.
2. Dãy số `sequence` cho `CORE` và `SPECIALIZED_STUDY` hoàn toàn độc lập với nhau:
   - `CORE`: `sequence` thuộc tập `{1, 2, ..., N}`.
   - `SPECIALIZED_STUDY`: `sequence` thuộc tập `{1, 2, ..., M}`.
3. Cột `sequence` trong database lưu số nguyên dương thuần túy, tuyệt đối không lưu chuỗi `"CD1"`, `"CD2"`. Chuỗi `"CD"` là quy ước tầng hiển thị theo `ADR-048`.

---

## 20. Hợp đồng Cột Tự động Phái sinh (Auto-Number Derived Columns)

Tại sheet `PPCT`, các cột:
- **H:** `Tiết PPCT bắt đầu (Tự động)`
- **I:** `Tiết PPCT kết thúc (Tự động)`

Tại sheet `CHUYEN_DE`, các cột:
- **G:** `Tiết chuyên đề bắt đầu (Tự động)`
- **H:** `Tiết chuyên đề kết thúc (Tự động)`

### Phát hiện kiểm toán thực tế trên workbook:
- Các ô từ dòng 2 trở đi chứa công thức Excel tính lũy kế theo `SUMIFS`:
  - PPCT: `=IF(OR(A2="",D2="",E2=""),"",SUMIFS($E$2:E2,$A$2:A2,A2)-E2+1)` và `=IF(H2="","",H2+E2-1)`
  - CHUYEN_DE: `=IF(OR(A2="",B2="",C2="",D2=""),"",SUMIFS($D$2:D2,$A$2:A2,A2)-D2+1)` và `=IF(G2="","",G2+D2-1)`
- Giá trị cached trong file mẫu là rỗng (vì chưa có dữ liệu A..E).

### Khóa quy tắc thẩm quyền (Authority Invariant):
**CỘT TÍNH TOÁN TỰ ĐỘNG BẰNG EXCEL TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP TRỞ THÀNH THẨM QUYỀN NGHIỆP VỤ CỦA HỆ THỐNG.**

1. **Server Recomputation:** Phía máy chủ tự động tính toán lại dải tiết chuẩn tắc dựa trên `Số tiết *` và thứ tự phân bổ.
2. **Xử lý khi Import:**
   - Nếu ô rỗng: Máy chủ tự tính, chấp nhận bình thường.
   - Nếu ô chứa công thức hoặc giá trị số: Máy chủ bỏ qua giá trị này khi lưu trữ dữ liệu chính thức.
   - **Kiểm tra sai lệch (Discrepancy Check):** Trong pha `preview`, nếu người dùng nhập số đè lên công thức dẫn đến sai lệch với kết quả tính toán chuẩn tắc của máy chủ, hệ thống hiển thị cảnh báo trực quan (`ADVISORY` warning) cho người dùng biết hệ thống sẽ áp dụng số tiết chuẩn tắc do máy chủ tính toán.

---

## 21. Hợp đồng Cửa sổ Tuần Kế hoạch (Week-Window Semantics)

1. Cột `Tuần bắt đầu dự kiến *` và `Tuần kết thúc dự kiến *` là dữ liệu định hướng kế hoạch sư phạm của tổ chuyên môn.
2. **Bất biến số tiết và tuần:**
   $$\text{weekEnd} - \text{weekStart} + 1 \neq \text{Số tiết}$$
   Khoảng tuần không đồng nghĩa với số tiết. Ví dụ:
   - Bài học 2 tiết học trọn vẹn trong tuần 1: `Số tiết = 2`, `Tuần bắt đầu = 1`, `Tuần kết thúc = 1`.
   - Chuyên đề 15 tiết, học 1 tiết/tuần rải đều trong 15 tuần: `Số tiết = 15`, `Tuần bắt đầu = 1`, `Tuần kết thúc = 15`.
3. **Ranh giới với Bộ phân bổ thời khóa biểu (`P2-003` Allocator):**
   - Dữ liệu tuần bắt đầu/kết thúc trong PPCT là **ý định lập kế hoạch (planning intent)**.
   - Khi vận hành thực tế, bộ định tuyến tuần `P2-003` sẽ căn cứ vào thời khóa biểu thực tế (`TimetableEntry`), lịch học tuần (`AcademicWeek`), ngoại lệ gián đoạn (`CalendarInterruption`) để phân bổ tiết dạy cụ thể theo nguyên tắc độc lập giữa `CORE` và `SPECIALIZED_STUDY`.
   - Importer P2-020 chỉ lưu trữ và xác thực tính hợp lệ của khoảng tuần (`1 <= weekStart <= weekEnd <= 40`), không được phép can thiệp vào logic xếp thời khóa biểu.

---

## 22. Hợp đồng Xử lý Dòng Trống, Trùng lặp và Đổi thứ tự

### A. Dòng trống (Blank Rows):
- **Dòng trống ở cuối bảng (Trailing blanks):** Bỏ qua hoàn toàn.
- **Dòng trống trong bảng định dạng sẵn (Pre-formatted empty table rows):** Các dòng từ 2..301 ở PPCT hoặc 2..121 ở CHUYEN_DE có các cột dữ liệu A..G trống nhưng có công thức ở cột H..I được xác định là dòng trống và bỏ qua.
- **Dòng bán phần (Partially populated rows):** Ví dụ có Khối lớp và Tên bài nhưng thiếu Số tiết: **BÁO LỖI FAIL-CLOSED** `PPCT_IMPORT_PARTIAL_ROW`. Tuyệt đối không âm thầm bỏ qua các dòng nhập dở dang.

### B. Trùng lặp (Duplicates):
- **Trùng lặp toàn bộ dòng (Exact duplicate row):** Báo lỗi fail-closed `PPCT_IMPORT_DUPLICATE_ROW`.
- **Trùng số chuyên đề trong cùng khối lớp:** Báo lỗi fail-closed `PPCT_IMPORT_DUPLICATE_SPECIALIZED_NUMBER`.
- **Trùng tên bài học trong cùng khối lớp:** Chấp nhận nếu có lý do sư phạm (ví dụ nhiều tiết mang tên `"Luyện tập"`), nhưng gắn cảnh báo advisory trong bản preview để giáo viên rà soát.

### C. Đổi thứ tự dòng (Reordering):
- Khi đổi thứ tự các dòng giữa các lần import, hệ thống ghi nhận thứ tự mới theo dãy `sequence` mới của Version tiếp theo.
- Việc đổi thứ tự không làm phá hủy định danh phả hệ của bài học nếu liên kết phả hệ được bảo toàn qua preview.

---

## 23. Dấu vân tay Byte thô (Raw Digest)

- **Mã băm SHA-256 từ byte tệp XLSX tải lên:**
  - Ví dụ: `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`.
- **Mục đích sử dụng:**
  - Tham gia tạo khóa định danh yêu cầu `requestFingerprint` trong quy trình `preview -> confirm`.
  - Phục vụ truy vết kiểm toán (audit trail) và chứng minh nguồn gốc tệp đã tải lên.
  - Phục vụ phát hiện gửi lại nguyên trạng (exact-byte replay).

---

## 24. Tổng kiểm Nội dung Ngữ nghĩa (Semantic Content Checksum)

Khác với Raw Digest (nhạy cảm với từng byte định dạng, thời gian lưu file của Excel), Tổng kiểm ngữ nghĩa đại diện cho **bản chất nội dung sư phạm**:

### Các thành phần tham gia tính Semantic Checksum:
1. Phiên bản hợp đồng mẫu: `"PPCT_V1"`
2. Định danh chuẩn tắc của Năm học: `AcademicYear.code`
3. Định danh chuẩn tắc của Môn học: `Subject.code`
4. Danh sách các khối lớp có trong tệp, sắp xếp tăng dần (`10, 11, 12`).
5. Với mỗi khối lớp, tuần tự theo từng thành phần (`CORE`, sau đó `SPECIALIZED_STUDY`):
   - Danh sách bài học sắp xếp theo `sequence` tăng dần:
     - `component` (`CORE` hoặc `SPECIALIZED_STUDY`)
     - `sequence` (số nguyên)
     - `title` (chuỗi đã trim và chuẩn hóa NFKC)
     - `lessonType` (chuỗi đã trim và chuẩn hóa NFKC)
     - `periodCount` (số tiết)
     - `plannedWeekStart` (tuần bắt đầu)
     - `plannedWeekEnd` (tuần kết thúc)

### Các thành phần BỊ LOẠI TRỪ khỏi Semantic Checksum:
- Tên tệp và đường dẫn tệp tải lên;
- Các thuộc tính hiển thị: màu sắc ô, font chữ, đường viền (borders), độ rộng cột, chiều cao dòng;
- Toàn bộ nội dung các sheet không mang thẩm quyền: `HUONG_DAN`, `DANH_MUC`, `VI_DU`;
- Các cột tính toán tự động: H, I ở PPCT và G, H ở CHUYEN_DE;
- Các dòng trống, khoảng trắng dư thừa trong XML, metadata ngày giờ tạo tệp của Excel.

---

## 25. Cơ chế Phát lại và Tính Bất biến (Replay & Idempotency)

1. **Quy trình 3 pha chuẩn tắc:** `inspect` -> `preview` -> `confirm`.
2. **Khóa vân tay yêu cầu (`requestFingerprint`):**
   - Pha `preview` tính toán `requestFingerprint = SHA256(userId + academicYearId + subjectId + rawDigest + semanticChecksum)`.
   - Pha `confirm` gửi kèm `requestFingerprint` này.
3. **Phát lại cùng yêu cầu (Idempotent Replay):**
   - Nếu client gửi lại cùng một lệnh `confirm` với cùng `requestFingerprint` khi phiên bản DRAFT tương ứng đã được tạo thành công: hệ thống trả về kết quả thành công hiện có kèm cảnh báo trạng thái đã ghi nhận, không tạo thêm phiên bản trùng lặp.
4. **Xung đột phiên bản (Conflict Resolution):**
   - Nếu kế hoạch môn học đã có một bản ghi `DRAFT` đang tồn tại mà client không chỉ định cờ ghi đè/thay thế nội dung của DRAFT đó: hệ thống từ chối với lỗi `PPCT_IMPORT_DRAFT_CONFLICT`.

---

## 26. Vòng đời Nhập liệu (Import Lifecycle)

1. **Khởi tạo Bản nháp (DRAFT Only):**
   - Lệnh nhập liệu từ workbook **CHỈ TẠO HOẶC CẬP NHẬT PHIÊN BẢN Ở TRẠNG THÁI `DRAFT`**.
   - Bộ nhập **TUYỆT ĐỐI KHÔNG TỰ ĐỘNG XUẤT BẢN (`PUBLISHED`)**.
2. **Quyền Xuất bản (Publishing Boundary):**
   - Việc xuất bản kế hoạch PPCT (`POST /api/ppct-versions/:id/publish`) là một hành động quản trị chuyên môn độc lập, đòi hỏi thẩm quyền `PPCT_MANAGE` và xác nhận tường minh từ người dùng.
3. **Kế thừa và Thay thế (Supersession):**
   - Một phiên bản `PUBLISHED` cũ chỉ chuyển sang trạng thái `SUPERSEDED` khi phiên bản `DRAFT` mới được người dùng chính thức xuất bản thành công. Quá trình import file không làm mất hiệu lực phiên bản đang chạy.

---

## 27. Ranh giới Đột biến Dữ liệu (Mutation Boundary)

Để bảo đảm tính toàn vẹn hệ thống, bộ nhập `P2-020` bị giới hạn nghiêm ngặt trong ranh giới sau:

### Các thực thể ĐƯỢC PHÉP tạo hoặc cập nhật:
- `PpctPlan` (tạo mới nếu chưa tồn tại cho bộ ba `AcademicYear + Subject + GradeLevel`);
- `PpctVersion` (tạo mới với trạng thái `DRAFT`);
- `PpctItem` (tạo các bài học mới với UUID ổn định);
- `PpctItemRevision` (tạo các bản ghi nội dung bài học theo phiên bản);
- `PpctItemLineage` (tạo các liên kết phả hệ khi đối chiếu bài học).

### Các thực thể TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỘT BIẾN:
- `Subject` (Môn học);
- `AcademicYear` (Năm học);
- `SchoolClass` (Lớp học);
- `TeachingAssignment` (Phân công giảng dạy);
- `TimetableVersion`, `TimetableEntry` (Thời khóa biểu);
- `PpctClassAssociation` (Hồ sơ áp dụng chuyên đề theo lớp);
- `CurricularTeachingExecution` (Bằng chứng thực hiện giảng dạy);
- `SpecialActivity` (Hoạt động ngoại khóa / chương trình đặc biệt);
- `ReportingStatement` (Báo cáo thống kê).

---

## 28. Ranh giới Hồ sơ Áp dụng Lớp học (Class Applicability Boundary)

1. **Workbook PPCT chỉ quản lý Kế hoạch Khung môn học cấp Khối (Grade-Level Curriculum):**
   - Trong workbook chỉ có trường `Khối lớp *` (10, 11, 12).
   - Workbook hoàn toàn **KHÔNG CHỨA** danh sách lớp cụ thể (ví dụ 10A1, 11B2) hay thông tin lớp nào học chuyên đề, lớp nào không học chuyên đề.
2. **Thẩm quyền Áp dụng theo Lớp thuộc về Workspace Quản trị (`P2-004`):**
   - Việc chỉ định một lớp học theo cấu hình `CORE_ONLY` hay `CORE_PLUS_SPECIALIZED_STUDY` được quản lý độc lập tại bảng `PpctClassAssociation` thông qua giao diện chuyên biệt `/quan-tri/ppct/ap-dung-chuyen-de` do Tổ trưởng chuyên môn / Ban giám hiệu thiết lập.
   - Bộ nhập PPCT **TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ ĐỘNG GÁN** hay thay đổi cấu hình áp dụng của các lớp học khi nạp file PPCT.

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
   - Trả về mã lỗi HTTP 403 Forbidden.
   - Ghi nhật ký kiểm toán hệ thống qua `AuditService` với action `AUTHORIZATION_DENIED`, target `PPCT_MANAGE`.
4. **Bảo toàn nguyên tắc đặc quyền:**
   - Quyền `SYSTEM_ADMIN` thuần túy về mặt kỹ thuật **KHÔNG ĐƯỢC PHÉP** thực hiện import PPCT nếu không được cấp capability `PPCT_MANAGE`.

---

## 30. Phân loại Lỗi Chuẩn tắc (Error Taxonomy)

Toàn bộ các trường hợp vi phạm phải trả về mã lỗi ổn định, không để lộ raw stack trace của trình phân tích Excel:

### Nhóm 1: Lỗi Gói Tệp & An toàn (Package & Security)
- `PPCT_IMPORT_INVALID_XLSX`: Tệp tải lên không phải là tệp ZIP/XLSX hợp lệ hoặc bị hỏng cấu trúc OpenXML.
- `PPCT_IMPORT_FILE_TOO_LARGE`: Dung lượng tệp vượt quá ngưỡng cho phép (tối đa 8MB).
- `PPCT_IMPORT_COMPLEXITY_LIMIT`: Tệp vượt quá ngưỡng phức tạp an toàn (quá 32 sheets, quá 5,000 dòng, hoặc tỷ lệ nén quá lớn).
- `PPCT_IMPORT_MACRO_UNSUPPORTED`: Tệp chứa macro hoặc mã thực thi VBA (`vbaProject.bin`).
- `PPCT_IMPORT_EXTERNAL_LINKS_UNSUPPORTED`: Tệp chứa liên kết ra ngoài (`xl/externalLinks/`).
- `PPCT_IMPORT_ENCRYPTED_UNSUPPORTED`: Tệp bị đặt mật khẩu hoặc mã hóa.

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
- `PPCT_IMPORT_INVALID_ACADEMIC_YEAR_FORMAT`: Định dạng chuỗi năm học sai quy chuẩn.

### Nhóm 4: Lỗi Dòng Dữ liệu Bài học (Data Row Validation)
- `PPCT_IMPORT_INVALID_GRADE`: Giá trị khối lớp không thuộc `{10, 11, 12}`.
- `PPCT_IMPORT_MISSING_TITLE`: Tên bài học / chuyên đề bị để trống.
- `PPCT_IMPORT_TITLE_OVER_LIMIT`: Tên bài học vượt quá 500 ký tự.
- `PPCT_IMPORT_INVALID_LESSON_TYPE`: Loại nội dung không thuộc danh mục cho phép.
- `PPCT_IMPORT_INVALID_PERIOD_COUNT`: Số tiết không phải số nguyên dương hợp lệ hoặc vượt ngưỡng tối đa.
- `PPCT_IMPORT_INVALID_WEEK_RANGE`: Tuần bắt đầu / tuần kết thúc không hợp lệ (`weekStart > weekEnd` hoặc ngoài khoảng 1..40).
- `PPCT_IMPORT_PARTIAL_ROW`: Dòng dữ liệu bị điền thiếu các trường bắt buộc.
- `PPCT_IMPORT_DUPLICATE_ROW`: Dòng bài học bị trùng lặp hoàn toàn.
- `PPCT_IMPORT_DUPLICATE_SPECIALIZED_NUMBER`: Trùng lặp `Chuyên đề số` trong cùng một khối lớp.
- `PPCT_IMPORT_SEQUENCE_DISORDER`: Dãy số chuyên đề không liên tục bắt đầu từ 1.
- `PPCT_IMPORT_PROHIBITED_FORMULA`: Phát hiện công thức Excel nằm trong các cột dữ liệu nhập liệu nghiệp vụ.

### Nhóm 5: Lỗi Vòng đời & Xung đột Đồng thời (Lifecycle & Concurrency)
- `PPCT_IMPORT_FINGERPRINT_MISMATCH`: Khóa `requestFingerprint` gửi lên không khớp với bản preview.
- `PPCT_IMPORT_DRAFT_CONFLICT`: Đã tồn tại một bản ghi `DRAFT` cho kế hoạch môn học này và chưa được xử lý.
- `PPCT_IMPORT_TARGET_NOT_DRAFT`: Yêu cầu cập nhật nội dung nhắm vào phiên bản không phải `DRAFT`.

---

## 31. Nghĩa vụ Triển khai Cụ thể cho P2-020 (Obligations for P2-020)

Khi thực hiện nhiệm vụ `P2-020` (Native PPCT Importer Implementation), kỹ sư phải tuân thủ nghiêm ngặt các nghĩa vụ sau:
1. **Tái sử dụng hạ tầng phân tích an toàn hiện có:** Sử dụng cơ chế preflight chống zip bomb, kiểm tra macro, external links và worker luồng riêng (`worker_threads`) tương tự kiến trúc của `timetable-import` (`workbook-parser.worker.ts`).
2. **Triển khai đúng luồng 3 pha:** `POST /api/ppct-import/inspect`, `POST /api/ppct-import/preview`, `POST /api/ppct-import/confirm`.
3. **Phân tách hoàn toàn hai thành phần:** Nạp độc lập các dòng `PPCT` vào `CORE` và các dòng `CHUYEN_DE` vào `SPECIALIZED_STUDY`.
4. **Không tin tưởng các cột phái sinh:** Tự tính toán lại toàn bộ dải tiết máy chủ; coi cột H, I ở PPCT và G, H ở CHUYEN_DE là dữ liệu đối soát hiển thị.
5. **Đảm bảo tính nguyên tử (Atomic Draft Package):** Toàn bộ các bài học của cả hai thành phần phải được nạp vào cùng một bản ghi `PpctVersion` duy nhất ở trạng thái `DRAFT`.
6. **Tuân thủ Capability:** Áp dụng `PpctAccessService` để kiểm tra quyền `PPCT_MANAGE` theo đúng phạm vi `SCHOOL_WIDE` hoặc `SUBJECT`.

---

## 32. Ranh giới Ngoài Phạm vi Rõ ràng (Explicit Non-Scope)

Nhiệm vụ `P2-010` này tuyệt đối **KHÔNG BAO GỒM**:
- Viết mã nguồn bộ nhập runtime cho PPCT (thuộc phạm vi `P2-020`);
- Thêm cột `contentChecksum` hay bất kỳ cột mới nào vào bảng `PpctVersion` hoặc schema Prisma;
- Tạo bất kỳ file migration nào;
- Đụng chạm tới logic phân bổ thời khóa biểu hoặc báo cáo thực hiện giảng dạy;
- Sửa đổi các file thuộc `apps/`, `packages/`, `prisma/`, `scripts/`, `.github/`;
- Tự động thay đổi tài liệu `PRE-PILOT-PRODUCT-BASELINE.md` hoặc tạo mới ADR khi không có mâu thuẫn kiến trúc;
- Mở Pull Request, merge, deploy hoặc tương tác với cơ sở dữ liệu production.

---

## 33. Danh mục Kiểm tra Nghiệm thu (Acceptance Checklist)

- [x] Đã xác minh file workbook tồn tại tại đúng đường dẫn cục bộ `.local-evidence/Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`.
- [x] Đã xác minh mã băm SHA-256 khớp tuyệt đối `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`.
- [x] Đã xác minh file được Git exclude an toàn qua `.git/info/exclude` và không bị theo dõi bởi Git.
- [x] Đã kiểm toán an toàn toàn diện gói tệp XLSX (không macro, không external links, không đối tượng nhúng, không zip bomb).
- [x] Đã kiểm toán chi tiết 6 sheets và xác lập ma trận thẩm quyền từng sheet.
- [x] Đã kiểm toán và khóa hợp đồng metadata tại `THONG_TIN` (Môn học, Năm học, Phiên bản mẫu `PPCT_V1`).
- [x] Đã kiểm toán tiêu đề và các trường dữ liệu ở cả hai sheet `PPCT` và `CHUYEN_DE`.
- [x] Đã xác định cơ chế giải quyết định danh Môn học, Năm học, Khối lớp ở máy chủ.
- [x] Đã khóa hợp đồng cho các cột tự động phái sinh (H, I ở PPCT; G, H ở CHUYEN_DE) đảm bảo an toàn tuyệt đối, máy chủ tự tính toán.
- [x] Đã xác lập hợp đồng cửa sổ tuần và ranh giới với bộ phân bổ `P2-003`.
- [x] Đã định nghĩa đầy đủ các quy tắc dòng trống, trùng lặp, đổi thứ tự dòng.
- [x] Đã phân định rõ Raw Digest và Semantic Checksum.
- [x] Đã khóa ranh giới vòng đời nhập liệu (chỉ tạo DRAFT, không tự xuất bản) và ranh giới không can thiệp áp dụng lớp (`P2-004`).
- [x] Đã khóa cơ chế phân quyền dựa trên `PPCT_MANAGE`.
- [x] Đã xây dựng bảng mã lỗi chuẩn tắc fail-closed hoàn chỉnh.
- [x] Xác nhận không có mâu thuẫn kiến trúc với `ADR-048`, `P0-900`, `P2-001`, `T24`, `T45`.

---

## 34. Tóm tắt Bằng chứng Kiểm toán (Evidence Summary)

Kiểm toán xác nhận workbook chính thức của trường Đam San (`Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`) hoàn toàn tương thích và khớp tuyệt đối với kiến trúc phân định thành phần chương trình đã được duyệt tại `ADR-048`:
- Workbook tổ chức 2 sheet nội dung nghiệp vụ độc lập: `PPCT` (cho thành phần cốt lõi `CORE`) và `CHUYEN_DE` (cho chuyên đề học tập `SPECIALIZED_STUDY`).
- Metadata tại `THONG_TIN` xác lập thẩm quyền theo Môn học và Năm học, cho phép bao quát cả 3 khối lớp 10, 11, 12 trong cùng một tệp.
- Các cột tự động chỉ mang tính chất hỗ trợ tính toán trong Excel và được máy chủ tính toán lại độc lập, không gây trôi lệch dữ liệu.
- Ranh giới áp dụng lớp học được bảo vệ toàn vẹn: workbook không chứa thông tin lớp, bảo toàn quyền cấu hình của Ban giám hiệu và Tổ trưởng tại `P2-004`.

Nhiệm vụ `P2-010` hoàn thành xuất sắc toàn bộ mục tiêu kiểm toán và chuyển sang trạng thái **`IN_REVIEW`**. Nhiệm vụ `P2-020` tiếp tục ở trạng thái **`PLANNED`** cho đến khi `P2-010` được merge và hoàn tất quy trình đóng đồng bộ `SYNC-P2-010`.
