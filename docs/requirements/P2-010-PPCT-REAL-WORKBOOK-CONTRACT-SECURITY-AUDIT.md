# P2-010 — Kiểm toán Hợp đồng và An toàn Workbook PPCT Thực tế (PPCT Real-Workbook Contract & Security Audit)

- **Trạng thái nhiệm vụ:** `CLOSED` by `SYNC-P2-010`
- **Nhánh thực thi:** `docs/ppct-real-workbook-contract-security-audit-010`
- **Canonical starting baseline SHA:** `b8b5f9862c2dc160e124a19b863ac547b44ef94b`
- **Tên workbook chuẩn tắc:** `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`
- **Đường dẫn bằng chứng cục bộ:** `D:\baogiang-damsan\.local-evidence\Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`
- **Authoritative SHA-256:** `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`
- **Bằng chứng Git exclusion:** Resolve qua `.git/info/exclude:8:.local-evidence/`, không bị track bởi git (`git ls-files` = NO OUTPUT)
- **Điều kiện tiên quyết:** `P2-001` (CLOSED), `P0-900` (CLOSED), `ADR-048` (Accepted), `P2-002` (CLOSED), `P2-003` (CLOSED), `P2-004` (CLOSED)
- **Ma trận truy xuất nguồn gốc (Traceability):** `T24`, `T45`
- **Bằng chứng đóng nhiệm vụ (Closure evidence):**
  - PR: #169 (`docs(ppct): define authoritative workbook import contract`)
  - Final reviewed semantic head: `5a3329780d20d6f2272c7978e1469b81de4d3264`
  - Final PR head: `611edb2aa62cf053af20cf6bb32429bd210c9a43`
  - Merge/main commit: `7c48971d32840764c7274e544438ba1bf7aa983e`
  - Exact-head PR CI: CI #537 (run ID `36734577185`) SUCCESS
  - Authoritative post-merge main CI: CI #538 (run ID `36739503269`) SUCCESS
  - Independent review: PASS (hấp thụ đầy đủ Corrections 001–004 trước merge)
  - Không có task correction hoặc re-entry tồn đọng
  - Không deploy hoặc thực hiện mutation trên production
  - Đóng hành chính qua `SYNC-P2-010`
- **Nhiệm vụ hạ nguồn:** `P2-020` (PPCT native importer implementation) chuyển sang trạng thái `READY`.

---

## 1. Danh tính Nhiệm vụ và Trạng thái (Task Identity and Status)

Nhiệm vụ `P2-010` thực hiện kiểm toán gói tệp (package & security audit), cấu trúc vật lý workbook (sheets, tables, columns, rows, cell types, formulas) và khóa toàn diện hợp đồng nhập liệu từ workbook PPCT chính thức của trường Đam San sang mô hình nghiệp vụ PPCT chuẩn tắc đã được đóng tại `ADR-048`, `P2-002`, `P2-003`, `P2-004`.

Nhiệm vụ này là **kiểm toán kiến trúc và hợp đồng nghiệp vụ ràng buộc bằng chứng thực tế (evidence-bound architecture/contract audit)**, tuân thủ nghiêm ngặt các ranh giới:
- **KHÔNG** triển khai bộ nhập (importer runtime);
- **KHÔNG** sửa đổi schema Prisma;
- **KHÔNG** tạo migration cơ sở dữ liệu;
- **KHÔNG** deploy hoặc thực hiện bất kỳ mutation nào trên môi trường production;
- **KHÔNG** đưa raw workbook vào git repository, fixture hay test code.

Trạng thái nhiệm vụ: **`CLOSED` by `SYNC-P2-010`** (hạ nguồn `P2-020` chuyển sang **`READY`**).

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
- **Tổng số ô gộp (Merged Cells):** 9 vùng trong toàn bộ workbook (nằm sâu dưới ngưỡng giới hạn kỹ thuật `MAX_MERGED_RANGES = 256`).

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
| **ZIP traversal / Malformed paths** | Không có ký tự traversal `..`, `\`, hay đường dẫn tuyệt đối | Đạt yêu cầu |
| **Zip bomb / Compression ratio** | Nén 34.1 KB -> giải nén 195 KB (tỷ lệ 6.08:1) | Đạt yêu cầu |
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
| `DANH_MUC` | **REFERENCE_ONLY** | Cung cấp danh mục dropdown mẫu trong Excel. **Nội dung sheet DANH_MUC tải lên KHÔNG PHẢI LÀ THẨM QUYỀN MÁY CHỦ.** Máy chủ kiểm tra hợp lệ dựa trên allowlist đóng băng của hợp đồng `PPCT_V1`. Nội dung ẩn trong sheet tham khảo không được phép trở thành thẩm quyền nghiệp vụ. |
| `VI_DU` | **IGNORED** | Chỉ chứa các dòng ví dụ minh họa. Importer bỏ qua hoàn toàn. |

**Quy tắc xử lý cấu trúc Sheet:**
1. **Thiếu sheet bắt buộc (`THONG_TIN`, `PPCT`, `CHUYEN_DE`):** Báo lỗi fail-closed `PPCT_IMPORT_MISSING_REQUIRED_SHEET`.
2. **Sheet thẩm quyền bị ẩn:** Nếu `THONG_TIN`, `PPCT`, hoặc `CHUYEN_DE` ở trạng thái `hidden` hoặc `veryHidden`, báo lỗi fail-closed `PPCT_IMPORT_HIDDEN_AUTHORITATIVE_SHEET`.
3. **Thừa sheet không xác định:** Báo lỗi fail-closed `PPCT_IMPORT_UNEXPECTED_SHEET` (chỉ chấp nhận đúng danh mục 6 sheet chuẩn).
4. **Sai tên sheet / phân biệt hoa thường:** Tên sheet chuẩn tắc là `THONG_TIN`, `PPCT`, `CHUYEN_DE`, `HUONG_DAN`, `DANH_MUC`, `VI_DU`. Không hỗ trợ fuzzy matching âm thầm.

---

## 7. Hợp đồng Workbook Vật lý và Gói Tệp Được Chấp nhận (Physical Workbook & Package Contract)

### A. Định dạng Gói Tệp Được Chấp nhận (Accepted Package Contract):
1. **Phần mở rộng tệp logic:** Bắt buộc là `.xlsx` (không phân biệt hoa thường, e.g. `.xlsx`, `.XLSX`).
   - Các định dạng khác như `.xls` (BIFF8 nhị phân), `.xlsm` (Macro-enabled), `.xlsb` (Binary workbook), `.ods` (OpenDocument Spreadsheet) bị từ chối dứt khoát.
2. **Header MIME chỉ là siêu dữ liệu truyền tải (Transport Metadata Only):**
   - Header MIME (như `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) **TUYỆT ĐỐI KHÔNG ĐƯỢC TIN TƯỞNG LÀM THẨM QUYỀN GÓI TỆP**.
   - Máy chủ phải thẩm định trực tiếp chuỗi bytes vật lý (magic bytes `PK\x03\x04`).
3. **Kiểm tra Preflight ZIP / OpenXML bắt buộc:**
   - Tệp phải phân tích được dưới dạng gói ZIP hợp lệ.
   - Bắt buộc phải chứa `[Content_Types].xml` và `xl/workbook.xml`.
   - Gói tệp chứa macro (`vbaProject.bin`) bị từ chối với lỗi fail-closed `PPCT_IMPORT_MACRO_UNSUPPORTED` bất kể tên tệp hay MIME header.
   - Gói tệp bị mã hóa hoặc đặt mật khẩu bảo vệ bị từ chối với lỗi fail-closed `PPCT_IMPORT_ENCRYPTED_UNSUPPORTED`.
   - Gói tệp không đúng cấu trúc OpenXML XLSX bị từ chối với lỗi fail-closed `PPCT_IMPORT_INVALID_FILE_TYPE`.

### B. Chính sách Nội dung Ẩn (Authoritative Hidden Content Policy):
1. **Trạng thái Sheet Thẩm quyền:**
   - Các sheet thẩm quyền `THONG_TIN`, `PPCT`, `CHUYEN_DE` bắt buộc phải ở trạng thái hiển thị (`visible`).
   - Nếu bất kỳ sheet thẩm quyền nào bị ẩn (`hidden` hoặc `veryHidden`), máy chủ báo lỗi fail-closed `PPCT_IMPORT_HIDDEN_AUTHORITATIVE_SHEET`.
2. **Dòng ẩn và Cột ẩn (Hidden Rows & Columns):**
   - **Cấm tuyệt đối** dòng ẩn hoặc cột ẩn giao cắt với vùng nhập liệu nghiệp vụ thẩm quyền:
     - Sheet `THONG_TIN`: Vùng các ô cần thiết cho B4, B5, B6 (cột A:B, dòng 4:6).
     - Sheet `PPCT`: Toàn bộ vùng bảng nhập liệu nghiệp vụ từ dòng tiêu đề đến hết dòng dữ liệu (cột A:I).
     - Sheet `CHUYEN_DE`: Toàn bộ vùng bảng nhập liệu nghiệp vụ từ dòng tiêu đề đến hết dòng dữ liệu (cột A:H).
   - **Nguyên tắc an toàn:** Không có bất kỳ dòng nghiệp vụ ẩn nào được phép âm thầm bỏ qua (no hidden business row may be silently ignored). Nếu phát hiện dòng/cột ẩn giao cắt với vùng nhập liệu thẩm quyền: báo lỗi fail-closed `PPCT_IMPORT_HIDDEN_INPUT_INTERSECTION`.
3. **Sheet tham khảo:** Nội dung ẩn trong `HUONG_DAN`, `DANH_MUC`, `VI_DU` không mang thẩm quyền nghiệp vụ và không tham gia phân tích.

### C. Chính sách Ô Gộp (Merged-Cell Policy):
1. **Giới hạn Độ phức tạp Gói Tệp:**
   - Tái sử dụng giới hạn kỹ thuật `MAX_MERGED_RANGES = 256` trên toàn bộ workbook như một rào chắn chống tấn công độ phức tạp phân tích (complexity bound).
2. **Cấm Ô Gộp Giao cắt Vùng Nhập liệu Nghiệp vụ:**
   - **Cấm tuyệt đối** ô gộp (merged cell) giao cắt với vùng nhập liệu thẩm quyền:
     - Bảng `PPCT`: Vùng dữ liệu cột A..I.
     - Bảng `CHUYEN_DE`: Vùng dữ liệu cột A..H.
     - Sheet `THONG_TIN`: Các ô metadata bắt buộc B4, B5, B6.
   - Nếu phát hiện ô gộp giao cắt vùng nhập liệu thẩm quyền: báo lỗi fail-closed `PPCT_IMPORT_MERGED_AUTHORITATIVE_CELL`.
3. **Cho phép Ô Gộp Trang trí Ngoài Vùng Nhập liệu:**
   - Các ô gộp mang tính trang trí tiêu đề bảng bên ngoài vùng nhập liệu (như `A1:D1`, `A8:D8`, `A10:D10` ở `THONG_TIN`, hoặc các ô gộp trong `HUONG_DAN`, `VI_DU`) là hợp lệ như trong workbook chuẩn đã kiểm toán. Hệ thống không từ chối các ô gộp trang trí chuẩn tắc này.

### D. Nguyên tắc Phạm vi Workbook:
1. **Một workbook = Một Môn học + Một Năm học:**
   - Một tệp workbook duy nhất đại diện cho kế hoạch PPCT của một Môn học trong một Năm học.
   - Có thể chứa đồng thời cả 3 khối lớp: 10, 11, 12 (hoặc tập con các khối lớp nếu môn học chỉ giảng dạy ở một số khối).
2. **Tên tệp (Filename) KHÔNG có thẩm quyền nghiệp vụ:**
   - Quy ước đặt tên file tại `THONG_TIN` dòng 11 (`PPCT_<MON_HOC>_<NAM_HOC>.xlsx`) chỉ là gợi ý tổ chức tệp cho người dùng.
   - Thẩm quyền duy nhất xác định Môn học và Năm học thuộc về ô `B4` (Môn học) và `B5` (Năm học) tại sheet `THONG_TIN`.
3. **Phân vùng Bảng Excel (ListObject / Table):**
   - Sheet `PPCT` chứa bảng `PPCT_Table` vùng `A1:I301`.
   - Sheet `CHUYEN_DE` chứa bảng `CHUYEN_DE_Table` vùng `A1:H121`.
   - Các dòng trống nằm trong vùng bảng đã định dạng sẵn phải được lọc bỏ xác định (deterministic filtering).

---

## 8. Hợp đồng Metadata tại `THONG_TIN` (Metadata Contract)

| Ô | Trường Thông tin | Bắt buộc | Kiểu dữ liệu | Quy tắc Kiểm tra & Chuẩn hóa | Xử lý nếu Lỗi / Trống |
|:---:|---|:---:|:---:|---|---|
| **B4** | **Môn học** | **CÓ** | Chuỗi (String) | Tên hiển thị môn học (Subject Display Name). Áp dụng thuật toán phân giải danh tính môn học tất định duy nhất (§11). | Báo lỗi `PPCT_IMPORT_METADATA_MISSING`, `PPCT_IMPORT_SUBJECT_NOT_FOUND`, `PPCT_IMPORT_SUBJECT_INACTIVE`, hoặc `PPCT_IMPORT_SUBJECT_AMBIGUOUS`. |
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

## 10. Hợp đồng Trường Dữ liệu Chi tiết, Độ Mịn Lưu trữ và Kiểu Ô (Field Contract, Storage Granularity & Cell Types)

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

### Chính sách Kiểu Ô trong Vùng Nhập liệu Thẩm quyền (Cell Type Policy):
Đối với các ô trong vùng nhập liệu thẩm quyền:
1. **Kiểu dữ liệu được chấp nhận:**
   - `TEXT`: Tại các cột văn bản (Môn học, Năm học, Loại nội dung, Bài/Chủ đề, Tên bài, Tên chuyên đề).
   - `NUMBER`: Tại các cột số nguyên (Khối lớp, Số tiết, Tuần bắt đầu, Tuần kết thúc, Chuyên đề số). Bắt buộc là số nguyên hợp lệ (không chứa phần thập phân).
   - `BLANK`: Chỉ tại các ô mà hợp đồng cho phép để trống (cột `Loại nội dung`, cột `Bài / Chủ đề`).
2. **Kiểu dữ liệu bị từ chối (Fail-Closed):**
   - Các ô chứa mã lỗi Excel (`ERROR` cells: `#N/A`, `#VALUE!`, `#REF!`, `#DIV/0!`, `#NAME?`, `#NUM!`, v.v.).
   - Các ô chứa hyperlink ngoài (external hyperlink cells).
   - Các đối tượng nhúng hoặc đối tượng không được hỗ trợ (unsupported object values).
   - Công thức nằm trong các cột nhập liệu nghiệp vụ (cột A..G ở `PPCT`, cột A..F ở `CHUYEN_DE`).
   - Kiểu ngày tháng (`Date`) hoặc luận lý (`Boolean`) tại các vị trí kỳ vọng văn bản hoặc số nguyên, trừ khi có quy tắc chuyển đổi tường minh được định nghĩa.
   - Bất kỳ vi phạm nào về kiểu ô nêu trên đều bị từ chối với mã lỗi `PPCT_IMPORT_UNSUPPORTED_CELL_TYPE`.
3. **Chuẩn hóa Rich Text:**
   - Nếu ô chứa văn bản có định dạng rich text (thẻ `<r>` trong OpenXML), chuỗi văn bản được làm phẳng thuần túy (flattened) thông qua hàm chuẩn hóa văn bản có giới hạn, sau đó được kiểm tra độ dài và chuẩn hóa bình thường. Tuyệt đối không tự động ép kiểu (coercion) âm thầm đối với các kiểu dữ liệu không được hỗ trợ.

### A. Hợp đồng Trường Sheet `PPCT`:

| Trường | Cột | Kiểu | Bắt buộc | Ràng buộc giá trị & Chuẩn hóa | Xử lý Lưu trữ & Phân rã | Mã lỗi nếu vi phạm |
|---|:---:|:---:|:---:|---|---|---|
| **Khối lớp** | A | Số nguyên | **Có** | Thuộc tập `{10, 11, 12}`. | Phân nhóm theo `gradeLevel` vào `PpctPlan`. | `PPCT_IMPORT_INVALID_GRADE` |
| **Loại nội dung** | B | Chuỗi | Không | Thuộc allowlist đóng băng máy chủ. Trống mặc định là `'Bài học'`. Chuẩn hóa thành token chuẩn tắc (§22). | Lưu vào `PpctItemRevision.lessonType`. | `PPCT_IMPORT_INVALID_LESSON_TYPE` |
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

## 11. Hợp đồng Định danh Môn học Chuẩn tắc (Exact Subject Identity Contract)

### Hiện trạng Schema Cơ sở Dữ liệu Thực tế:
Bảng `Subject` trong Prisma schema:
- `id: UUID` (khóa chính)
- `code: String` (**UNIQUE**)
- `name: String` (**NOT UNIQUE** - tên hiển thị tiếng Việt)
- `status: CatalogStatus` (`ACTIVE` | `INACTIVE`)

### Thẩm quyền của Ô `THONG_TIN.B4`:
1. Ô `THONG_TIN.B4` mang tiêu đề `"Môn học"`. Workbook chuẩn của trường Đam San **KHÔNG CÓ CỘT HOẶC Ô DÀNH CHO MÃ MÔN HỌC (`Subject.code`)**.
2. **Khóa thẩm quyền duy nhất:** `THONG_TIN.B4` là **TÊN HIỂN THỊ MÔN HỌC (SUBJECT DISPLAY NAME)**, tuyệt đối **KHÔNG PHẢI LÀ `Subject.code`**.
3. **Cấm mơ hồ hai chiều:** Hệ thống **TUYỆT ĐỐI KHÔNG ĐƯỢC** sử dụng quy tắc kép `"Subject.name OR Subject.code"`. Không được tự động đoán hoặc fall back âm thầm sang `Subject.code`. Không diễn giải một giá trị ngẫu nhiên trùng với mã môn là mã môn học trừ khi có phiên bản mẫu tương lai bổ sung thẩm quyền mã môn rõ ràng.

### Thuật toán Phân giải Định danh Môn học Tất định (Deterministic Resolution Algorithm):
Máy chủ phân giải danh tính môn học theo đúng 6 bước tuần tự:
1. Đọc giá trị ô `THONG_TIN.B4` dưới dạng chuỗi ký tự (`string`).
2. Trim khoảng trắng ở hai đầu chuỗi.
3. Chuẩn hóa Unicode theo định dạng chuẩn **NFKC** (`normalize('NFKC')`).
4. Thu gọn các chuỗi khoảng trắng nội bộ liên tiếp thành đúng một dấu cách đơn (`replace(/\s+/g, ' ')`).
5. So sánh chuỗi đã chuẩn hóa với trường `Subject.name` (được áp dụng cùng hàm chuẩn hóa trim/NFKC/collapse whitespace).
6. **Chỉ các môn học có trạng thái `status === ACTIVE` mới được xem xét để phân giải thành công.**

### Kết quả Phân giải và Xử lý Lỗi (Fail-Closed Outcomes):
- **Khớp chính xác đúng 1 bản ghi `ACTIVE`:** Phân giải thành công về `Subject.id` của bản ghi đó.
- **Có 0 bản ghi `ACTIVE` nhưng tồn tại bản ghi `INACTIVE` trùng tên chuẩn hóa:** Dừng lại lập tức và trả về mã lỗi fail-closed `PPCT_IMPORT_SUBJECT_INACTIVE`.
- **Có 0 bản ghi khớp (cả `ACTIVE` lẫn `INACTIVE`):** Dừng lại lập tức và trả về mã lỗi fail-closed `PPCT_IMPORT_SUBJECT_NOT_FOUND`.
- **Có nhiều hơn 1 bản ghi `ACTIVE` cùng thỏa mãn tên chuẩn hóa:** Dừng lại lập tức và trả về mã lỗi fail-closed `PPCT_IMPORT_SUBJECT_AMBIGUOUS`.

### Bất biến An toàn Bắt buộc:
- **TUYỆT ĐỐI KHÔNG TỰ ĐỘNG TẠO MÔN HỌC (No auto-create Subject):** Dữ liệu workbook không được phép tự động chèn bản ghi mới vào bảng `Subject`.
- **TUYỆT ĐỐI KHÔNG SINH UUID GIẢ LẬP:** Không được sinh UUID ngẫu nhiên cho môn học.

---

## 12. Hợp đồng Định danh Năm học (AcademicYear Identity Contract)

1. Giá trị `THONG_TIN.Năm học` (ô `B5`) phải khớp với mã năm học chính thức (`AcademicYear.code`, ví dụ `"2026-2027"`):
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
4. **Loại bài học (`lessonType`):** Lấy từ cột `Loại nội dung`. Áp dụng chuẩn hóa token chuẩn tắc (§22). Mặc định nếu để trống là `'Bài học'`. Giá trị phải thuộc allowlist đóng băng của hệ thống.
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

## 18. Khóa Quy tắc Phả hệ ở Độ Mịn Tiết học và Ràng buộc Preview (Lineage Preview Binding)

Khi nhập phiên bản tiếp theo (Version 2+) từ workbook, việc đối soát phả hệ được thực hiện theo 6 trường hợp rõ ràng:

1. **Trường hợp 1 — Dòng bài học giữ nguyên, số tiết không đổi ($N \to N$):**
   - Từng tiết thứ $i$ ($1 \le i \le N$) giữ nguyên định danh UUID của tiết tương ứng ở phiên bản trước.
   - Sử dụng `identityMode = CARRY_FORWARD`, `predecessors = []`. Không sinh bản ghi lineage.
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

### Ràng buộc Bắt buộc giữa Preview và Confirm (Lineage Preview Binding Contract):
- **Phả hệ tự động giải quyết trong Preview:** Danh sách ánh xạ phả hệ chính xác (`predecessors: [{ versionId, itemId }]`) phải được đóng băng vào gói xác nhận (`confirm package`).
- **Phả hệ do người dùng chọn thủ công:** Nếu giao diện Preview cho phép người dùng lựa chọn ánh xạ phả hệ, danh sách được người dùng chỉ định rõ ràng phải nằm trong gói xác nhận.
- **Cấm tính toán lại âm thầm:** Phía máy chủ khi thực hiện Confirm **TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP** tự động tính toán lại một bản đồ phả hệ khác rồi âm thầm áp dụng mà không thông qua một chu trình preview/fingerprint mới.
- **Bảo vệ tính toàn vẹn trạng thái nguồn:** Nếu trạng thái cơ sở dữ liệu nguồn bị thay đổi giữa lúc Preview và Confirm khiến bản đồ phả hệ không còn hợp lệ (ví dụ revision tiền nhiệm bị xóa hoặc bị thay đổi trạng thái), lệnh Confirm phải **FAIL-CLOSED** với lỗi `PPCT_IMPORT_LINEAGE_AMBIGUOUS` hoặc `PPCT_IMPORT_DRAFT_CONFLICT`.

---

## 19. Hợp đồng Thứ tự Dòng và Dãy Số thứ tự

1. Thứ tự dòng vật lý trong bảng Excel và vị trí tiết phân rã quyết định số thứ tự `sequence`.
2. Dãy số `sequence` cho `CORE` và `SPECIALIZED_STUDY` độc lập tuyệt đối:
   - `CORE`: `sequence` thuộc tập `{1, 2, ..., N}`.
   - `SPECIALIZED_STUDY`: `sequence` thuộc tập `{1, 2, ..., M}`.
3. Cột `sequence` trong database lưu số nguyên dương thuần túy, tuyệt đối không lưu chuỗi `"CD1"`, `"CD2"`. Chuỗi `"CD"` là quy ước tầng hiển thị theo `ADR-048`.

---

## 20. Hợp đồng Cột Tự động Phái sinh và Công thức (Derived Formula Columns)

Tại sheet `PPCT`, các cột H, I (`Tiết PPCT bắt đầu / kết thúc`) và sheet `CHUYEN_DE`, các cột G, H (`Tiết chuyên đề bắt đầu / kết thúc`) chứa công thức Excel:
- PPCT: `=IF(OR(A2="",D2="",E2=""),"",SUMIFS($E$2:E2,$A$2:A2,A2)-E2+1)` và `=IF(H2="","",H2+E2-1)`
- CHUYEN_DE: `=IF(OR(A2="",B2="",C2="",D2=""),"",SUMIFS($D$2:D2,$A$2:A2,A2)-D2+1)` và `=IF(G2="","",G2+D2-1)`

### Khóa quy tắc thẩm quyền:
1. **Chỉ cho phép công thức tại các cột phái sinh đã biết:** Công thức Excel **CHỈ ĐƯỢC PHÉP XUẤT HIỆN** tại các cột H, I của sheet `PPCT` và cột G, H của sheet `CHUYEN_DE`. Công thức tại bất kỳ cột nào khác đều bị cấm tuyệt đối (`PPCT_IMPORT_PROHIBITED_FORMULA`).
2. **Cột phái sinh KHÔNG mang thẩm quyền nghiệp vụ:** Công thức trong Excel chỉ phục vụ hiển thị trực quan cho người biên soạn. Máy chủ **KHÔNG BAO GIỜ THỰC THI** các công thức này làm căn cứ nghiệp vụ.
3. **Máy chủ tự tính toán dải tiết độc lập:** Phía máy chủ tự động tính toán lại toàn bộ dải tiết xuất phát và dải tiết kết thúc từ cột `Số tiết *` và thứ tự phân rã để gán `sequence` liên tục.
4. **Không lưu trữ và không tính vào Checksum:** Không có cột nào trong CSDL lưu dải tiết này. Cả chuỗi công thức lẫn giá trị cached của công thức **TUYỆT ĐỐI KHÔNG ĐƯỢC THAM GIA** vào `semanticChecksum` hoặc nội dung PPCT được lưu giữ.
5. **Kiểm tra sai lệch trong Preview:** Trong pha `preview`, trình phân tích có thể đọc các giá trị số do người dùng gõ đè (nếu có) để đối soát cảnh báo (`ADVISORY`), thông báo rõ hệ thống sẽ áp dụng dải tiết chuẩn tắc do máy chủ tính toán.

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

## 22. Hợp đồng Thẩm quyền Danh mục và Chuẩn hóa Loại Nội dung (Lesson Type Authority & Canonical Normalization)

### A. Danh mục Allowlist Đóng băng của Máy chủ (`PPCT_V1`):
Danh mục loại nội dung hợp lệ được đóng băng cứng trên máy chủ gồm 6 giá trị:
- `Bài học`
- `Thực hành`
- `Ôn tập`
- `Kiểm tra`
- `Trả bài`
- `Khác`

### B. Chuẩn hóa Đầu vào và Bắt buộc Đầu ra Chuẩn tắc (Canonical Normalization):
1. **Khớp đầu vào linh hoạt:** Quá trình đối soát đầu vào cho phép:
   - Trim khoảng trắng ở hai đầu;
   - Chuẩn hóa Unicode NFKC;
   - Không phân biệt chữ hoa, chữ thường (case-insensitive).
2. **Bắt buộc đầu ra chuẩn tắc (Canonical Output):**
   - Cho dù giá trị trong workbook là `"bài học"`, `"BÀI HỌC"`, hay `" Bài học "`, khi phân giải thành công **BẮT BUỘC PHẢI LƯU TRỮ VÀ XUẤT RA TOKEN CHUẨN TẮC**:
     - `"Bài học"`
     - `"Thực hành"`
     - `"Ôn tập"`
     - `"Kiểm tra"`
     - `"Trả bài"`
     - `"Khác"`
   - Tương tự đối với mọi giá trị trong allowlist.
3. **Tổng kiểm Ngữ nghĩa dùng Token Chuẩn tắc:**
   - Giá trị tham gia tính `semanticChecksum` **BẮT BUỘC PHẢI LÀ TOKEN ĐÃ CHUẨN HÓA CHUẨN TẮC**, không dùng cách viết hoa thường thô của workbook.
4. **Loại nội dung Chuyên đề Học tập (`SPECIALIZED_STUDY`):**
   - Giá trị chuẩn tắc duy nhất và bắt buộc là: `"Chuyên đề"`.
5. **Giá trị không hợp lệ:**
   - Bất kỳ giá trị nào ngoài allowlist đóng băng máy chủ đều bị từ chối với mã lỗi fail-closed `PPCT_IMPORT_INVALID_LESSON_TYPE`.
6. **Nội dung sheet `DANH_MUC` tải lên không có thẩm quyền:**
   - Sheet `DANH_MUC` chỉ mang tính tham khảo (`REFERENCE_ONLY`). Người dùng thêm/sửa dòng trong sheet `DANH_MUC` không được phép mở rộng allowlist của máy chủ.

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

## 24. Khóa Gói Preview -> Confirm, Dấu vân tay Yêu cầu và Tổng kiểm Ngữ nghĩa (Confirm Package, Request Fingerprint & Semantic Checksum)

Chỉ riêng dấu vân tay của workbook thô (`rawDigest`) là không đủ, bởi vì lệnh Confirm còn mang theo các quyết định nghiệp vụ cụ thể cho từng khối lớp (chế độ nhắm mục tiêu, draft ID mục tiêu, và các ánh xạ phả hệ cấp tiết). Do đó, hệ thống khóa toàn diện hợp đồng Gói Xác nhận Chuẩn tắc và Dấu vân tay Yêu cầu.

### A. Gói Xác nhận Chuẩn tắc Cấp Khối lớp (Per-Grade Canonical Confirm Package):
Đối với mỗi khối lớp được tác động trong workbook, gói xác nhận chuẩn tắc bao gồm tối thiểu các trường sau:
1. `academicYearId: UUID`
2. `subjectId: UUID`
3. `gradeLevel: Int` (`10 | 11 | 12`)
4. `canonicalSemanticDigest: String` (mã băm SHA-256 nội dung ngữ nghĩa cấp khối lớp)
5. `targetMode: 'CREATE_NEW_DRAFT' | 'UPDATE_EXACT_DRAFT'`
6. `targetDraftId: UUID | null` (bắt buộc khi `targetMode === 'UPDATE_EXACT_DRAFT'`)
7. `expectedUpdatedAt: ISO-8601 string | null` (bắt buộc khi `targetMode === 'UPDATE_EXACT_DRAFT'`, dùng làm CAS token)
8. `items: Array<CanonicalConfirmItem>` sắp xếp liên tục theo `component` rồi `sequence`, trong đó mỗi phần tử chứa:
   - `sequence: Int`
   - `component: 'CORE' | 'SPECIALIZED_STUDY'`
   - `title: String` (tiêu đề chuẩn tắc $\le 500$ ký tự)
   - `lessonType: String` (token chuẩn tắc thuộc allowlist)
   - `identityDecision`:
     - Nếu `CARRY_FORWARD`: `{ mode: 'CARRY_FORWARD', itemId: UUID }`
     - Nếu `NEW`: `{ mode: 'NEW', itemId: UUID, predecessors: Array<{ versionId: UUID, itemId: UUID }> }`

### B. Gói Xác nhận Chuẩn tắc Cấp Workbook (Workbook-Level Canonical Confirm Package):
- Chứa danh sách gói của tất cả các khối lớp có trong workbook, **được sắp xếp tất định theo thứ tự tăng dần của `gradeLevel` (`10, 11, 12`)**.

### C. Hợp đồng Dấu vân tay Yêu cầu (`requestFingerprint` Contract):
1. **Bản chất của `requestFingerprint`:**
   - Là một **token toàn vẹn kiểm tra tính lỗi thời của bản preview (stale-preview integrity token)**.
   - **KHÔNG PHẢI LÀ TOKEN XÁC THỰC (NOT authentication):** Không thay thế việc kiểm tra quyền hạn `PPCT_MANAGE` trên từng request.
   - **KHÔNG PHẢI LÀ BIÊN NHẬN IDEMPOTENCY VĨNH VIỄN (NOT a durable idempotency receipt):** Không thay thế cơ chế kiểm tra trạng thái DB và replay transaction.
2. **Dữ liệu được bao phủ trong `requestFingerprint`:**
   - `authenticatedUserId`: UUID của người dùng đang thực hiện request;
   - `workbookRawDigest`: Mã SHA-256 tính từ bytes thô của tệp XLSX tải lên;
   - `academicYearId`: UUID năm học đã phân giải;
   - `subjectId`: UUID môn học đã phân giải;
   - `canonicalSemanticDigest`: Mã SHA-256 của toàn bộ nội dung ngữ nghĩa workbook sau phân rã;
   - `canonicalConfirmPackage`: Gói xác nhận chuẩn tắc cấp workbook như đã định nghĩa ở phần B.
3. **Quy tắc Tuần tự hóa Tất định (Deterministic Serialization):**
   - Sử dụng chuẩn JSON chuẩn tắc (Canonical JSON với các khóa được sắp xếp theo thứ tự bảng chữ cái, không có khoảng trắng thừa) hoặc cơ chế mã hóa độ dài tiền tố (length-prefix serialization).
   - **CẤM TUYỆT ĐỐI** việc ghép chuỗi ngây thơ (naive concatenation) không có ký tự phân tách hoặc không cố định thứ tự khóa.
4. **Quy trình Thực thi và Xác minh tại Lệnh Confirm:**
   Phía máy chủ khi nhận lệnh `POST /api/ppct-import/confirm` bắt buộc phải:
   1. Phân tích lại tệp workbook đã tải lên (hoặc tiêu thụ bản biểu diễn preview giới hạn do máy chủ kiểm soát);
   2. Tính toán lại nội dung chuẩn tắc;
   3. Tính toán lại và kiểm tra tính hợp lệ của toàn bộ gói xác nhận;
   4. Tính lại `requestFingerprint` và so sánh với giá trị gửi lên trong request payload;
   5. Tái xác thực CAS token (`expectedUpdatedAt`) và trạng thái DB hiện tại;
   6. Nếu có bất kỳ sự sai lệch nào về dấu vân tay: từ chối fail-closed với mã lỗi `PPCT_IMPORT_FINGERPRINT_MISMATCH` (hoặc lỗi CAS cụ thể tương ứng).

### D. Tổng kiểm Nội dung Ngữ nghĩa (Semantic Content Checksum):
Tổng kiểm nội dung ngữ nghĩa đại diện cho bản chất nội dung sư phạm được phân rã và lưu trữ vào CSDL:
1. Phiên bản hợp đồng mẫu: `"PPCT_V1"`
2. Định danh chuẩn tắc của Năm học: `AcademicYear.code`
3. Định danh chuẩn tắc của Môn học: `Subject.code`
4. Danh sách các khối lớp có trong tệp, sắp xếp tăng dần (`10, 11, 12`).
5. Với mỗi khối lớp, tuần tự theo từng thành phần (`CORE`, sau đó `SPECIALIZED_STUDY`):
   - Danh sách bài học **sau khi phân rã cấp tiết**, sắp xếp theo `sequence` tăng dần:
     - `component` (`CORE` hoặc `SPECIALIZED_STUDY`)
     - `sequence` (số nguyên liên tục từ 1)
     - canonical `title` (tiêu đề chuẩn tắc sau khi ghép và chuẩn hóa NFKC)
     - canonical `lessonType` (token chuẩn tắc thuộc allowlist, e.g. `"Bài học"`)

**Các thành phần BỊ LOẠI TRỪ khỏi Semantic Checksum:**
- Tên tệp và đường dẫn tệp tải lên;
- Thuộc tính hiển thị: màu sắc ô, font chữ, đường viền, độ rộng cột, chiều cao dòng;
- Toàn bộ nội dung các sheet không mang thẩm quyền: `HUONG_DAN`, `DANH_MUC`, `VI_DU`;
- Các cột tính toán tự động: H, I ở PPCT và G, H ở CHUYEN_DE;
- Các cột metadata tuần dự kiến (`Tuần bắt đầu dự kiến`, `Tuần kết thúc dự kiến`);
- Dòng trống, khoảng trắng dư thừa trong XML, timestamp metadata của Excel.

---

## 25. Hợp đồng Nhiều Bản nháp, Cơ chế Nhắm mục tiêu và Ngữ nghĩa Đua tranh Đồng thời (Target-Draft & Concurrent Replay Contract)

### A. Rà soát Số lượng Bản nháp (Draft Cardinality):
Kiểm toán kiến trúc tại `schema.prisma` và `PpctService.createVersion` xác nhận:
- Một kế hoạch môn học `PpctPlan` **HOÀN TOÀN CÓ THỂ CÓ NHIỀU BẢN GHI `DRAFT`** đồng thời (chỉ có duy nhất ràng buộc một phiên bản `PUBLISHED`).
- Do đó, bộ nhập **TUYỆT ĐỐI KHÔNG ĐƯỢC GIẢ ĐỊNH** rằng mỗi plan chỉ có một draft duy nhất, và **KHÔNG ĐƯỢC TỰ ĐỘNG GHI ĐÈ** lên một bản draft tùy ý.

### B. Hai Chế độ Nhắm mục tiêu khi Confirm:
Pha Preview trả về thông tin các draft hiện có cho từng khối lớp. Khi gọi lệnh Confirm, client bắt buộc phải chỉ định rõ một trong hai chế độ cho từng khối lớp:

1. **Chế độ Tạo Bản nháp Mới (`CREATE_NEW_DRAFT`):**
   - Tạo mới một `PpctVersion(status = DRAFT)` với `versionNumber = max(versionNumber) + 1`.
   - Phải xử lý đua tranh đồng thời và phát lại ngữ nghĩa theo mục C dưới đây.
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

### C. Ngữ nghĩa Đua tranh Đồng thời khi `CREATE_NEW_DRAFT` (Concurrent Races vs Sequential Replay):
Hợp đồng phân biệt rạch ròi giữa phát lại tuần tự (sequential replay) và các cuộc đua tranh đồng thời (concurrent races):

1. **Thực thi bên trong Giao dịch `SERIALIZABLE`:**
   Mỗi thao tác tạo nháp phải được thực hiện trong transaction với mức cô lập `SERIALIZABLE`:
   - **Bước 1 — Tìm kiếm bản nháp tương đương ngữ nghĩa cùng tác giả:**
     Tìm kiếm các bản ghi `DRAFT` của plan do chính người dùng đó tạo (`createdByUserId == currentUserId`).
   - **Bước 2 — Xử lý kết quả tìm kiếm:**
     - Nếu tìm thấy **CHÍNH XÁC MỘT** draft có nội dung ngữ nghĩa sau phân rã khớp 100% với nội dung tải lên: hệ thống thực hiện **phát lại idempotent (semantic replay)**, trả về bản ghi DRAFT hiện có này mà không tạo bản ghi mới.
     - Nếu tìm thấy **NHIỀU HƠN MỘT** draft có nội dung trùng khớp: báo lỗi fail-closed `PPCT_IMPORT_REPLAY_AMBIGUOUS` để người dùng chủ động chọn bản ghi mục tiêu.
     - Nếu có **0** draft trùng khớp: tính toán `versionNumber = max(versionNumber) + 1` và tiến hành tạo mới bản nháp (`PpctVersion`).
2. **Trừu tượng hóa Xung đột Cấp Kho Lưu trữ và Quy tắc Thử lại có Giới hạn (Bounded Retry):**
   - **Các lớp xung đột cấp kho lưu trữ (Repository-level Conflict Classes):**
     - Các xung đột tuần tự hóa `SERIALIZABLE` của PostgreSQL được Prisma Client phản ánh qua mã lỗi `PrismaClientKnownRequestError` **`P2034`** (được nhận diện qua hàm `isSerializationConflict` trong `ppct.service.ts`).
     - Việc tính toán và chèn `versionNumber = max(versionNumber) + 1` đồng thời giữa hai transaction có thể va chạm với ràng buộc duy nhất `ppct_versions_ppct_plan_id_version_number_key` và được Prisma Client phản ánh qua mã lỗi **`P2002`**.
     - Bộ nhập `P2-020` **KHÔNG ĐƯỢC PHỤ THUỘC** vào việc bắt trực tiếp mã SQLSTATE thô `40001` của PostgreSQL tại ranh giới service contract, mà phải bắt đúng các lớp lỗi Prisma `P2034` và `P2002`.
   - **Quy tắc Thử lại có Giới hạn (Bounded Retry Rule):**
     Đối với thao tác `CREATE_NEW_DRAFT`, P2-020 được phép áp dụng cơ chế thử lại có giới hạn (**tối đa 3 lần thử**) theo mẫu xử lý đồng thời đã được chấp nhận của repository. Trong mỗi lượt thử lại, hệ thống **BẮT BUỘC** phải lặp lại đầy đủ các bước bên trong một transaction `SERIALIZABLE` hoàn toàn mới:
     1. Phân giải lại trạng thái hiện tại của `PpctPlan`;
     2. Tìm kiếm lại các bản ghi `DRAFT` tương đương ngữ nghĩa cùng tác giả (`createdByUserId == currentUserId`);
     3. Nếu hiện tại đã tồn tại chính xác 1 draft tương đương (do transaction cạnh tranh vừa tạo xong): trả về bản ghi này dưới dạng **phát lại ngữ nghĩa (semantic replay)**;
     4. Nếu tồn tại nhiều hơn 1 draft: báo lỗi fail-closed `PPCT_IMPORT_REPLAY_AMBIGUOUS`;
     5. Nếu vẫn chưa có draft nào: tính toán lại `max(versionNumber)`;
     6. Thử tạo mới bản ghi `PpctVersion`.
   - **Xử lý mã lỗi Prisma khi thử lại:**
     - `P2034`: Thử lại nếu còn ngân sách retry; nếu hết ngân sách: báo lỗi fail-closed `PPCT_IMPORT_DRAFT_CONFLICT`.
     - `P2002` do đua tranh cấp phát `versionNumber`: Thử lại từ transaction mới nếu còn ngân sách retry; nếu hết ngân sách: báo lỗi fail-closed `PPCT_IMPORT_DRAFT_CONFLICT`. Tuyệt đối không thử lại mù quáng đối với các lỗi `P2002` không liên quan đến xung đột phiên bản.
3. **Bất biến Khử trùng lặp theo Phạm vi Tác giả (Actor-Scoped Deduplication Invariant):**
   - Kiến trúc hiện hành cho phép tồn tại nhiều bản ghi `DRAFT` đồng thời trên cùng một `PpctPlan`.
   - Cơ chế phát lại ngữ nghĩa chỉ tìm kiếm trong phạm vi bản nháp do chính tác giả đó tạo (`createdByUserId == currentUserId`).
   - Do đó, **BẤT BIẾN DUY NHẤT ĐƯỢC KHÓA LÀ**: Đối với cùng một bộ ba tọa độ:
     $$\mathbf{(\text{PpctPlan},\ \text{actorUserId},\ \text{canonical semantic content})}$$
     một thao tác `CREATE_NEW_DRAFT` đồng thời hoặc phát lại **tuyệt đối không được tạo thêm một bản nháp trùng lặp ngữ nghĩa chỉ vì lý do đua tranh hoặc retry**.
   - Các bản nháp thuộc về **NHỮNG TÁC GIẢ KHÁC NHAU (DIFFERENT ACTORS) KHÔNG BỊ KHỬ TRÙNG LẶP TOÀN CỤC** trong P2-010. Tuyệt đối không tái sử dụng bản nháp của tác giả khác làm semantic replay cho người dùng hiện tại. (Nếu hệ thống cần khử trùng lặp toàn cục xuyên tác giả, đó là một quyết định kiến trúc/lưu trữ độc lập và không thuộc phạm vi P2-010).
   - Tuyệt đối không tuyên bố cung cấp chính xác một lần bền vững (durable exactly-once) chỉ dựa vào `requestFingerprint`. Dấu vân tay chỉ là kiểm tra tính lỗi thời của preview, tính toàn vẹn được bảo đảm bởi transaction cơ sở dữ liệu.
4. **Hợp đồng Lỗi Công khai ra Ngoài Web (Public Error Contract):**
   - Mã lỗi công khai ổn định duy nhất trả về client khi xảy ra xung đột đồng thời không thể giải quyết là **`PPCT_IMPORT_DRAFT_CONFLICT`** (HTTP 409).
   - Tuyệt đối **KHÔNG ĐƯỢC ĐỂ LỘ** các mã nội bộ `P2034`, `P2002`, `40001`, raw Prisma exception hay raw PostgreSQL exception ra ngoài Web client. Đây thuần túy là nguyên nhân kỹ thuật ở tầng triển khai nội bộ.

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

## 28. Hợp đồng An toàn, Bảng Giới hạn Kỹ thuật Triển khai và Chính sách Gói Tệp (Complete Security Limits, ZIP Path & Cell Type Policy)

### A. Bảng Giới hạn An toàn Toàn diện (Complete Security Limits Table):

Hệ thống phân định rạch ròi giữa các giới hạn kỹ thuật được tái sử dụng từ module thời khóa biểu và các giới hạn tăng cường an toàn mới được thiết lập riêng cho PPCT:

| Hạng mục An toàn | Giá trị Khóa | Phân loại Nguồn gốc | Hành vi nếu Vi phạm |
|---|:---:|---|---|
| **Dung lượng tệp nén tối đa** | 8 MB (`8 * 1024 * 1024` bytes) | Tái sử dụng `MAX_XLSX_BYTES` từ Timetable | Báo lỗi `PPCT_IMPORT_FILE_TOO_LARGE` |
| **Dung lượng giải nén tối đa** | 64 MB (`64 * 1024 * 1024` bytes) | Tái sử dụng `MAX_XLSX_EXPANDED_BYTES` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Số lượng worksheets tối đa** | 32 sheets | Tái sử dụng `MAX_WORKSHEETS` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Số dòng tối đa trên sheet** | 5,000 dòng | Tái sử dụng `MAX_SHEET_ROWS` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Số cột tối đa trên sheet** | 64 cột | Tái sử dụng `MAX_SHEET_COLUMNS` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Tổng số ô theo dimension** | 250,000 ô | Tái sử dụng `MAX_TOTAL_DIMENSION_CELLS` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Số vùng ô gộp tối đa (Merged Ranges)** | 256 vùng | Tái sử dụng `MAX_MERGED_RANGES` từ Timetable | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Thời gian phân tích tối đa** | 8,000 ms | Tái sử dụng `WORKBOOK_PARSE_TIMEOUT_MS` từ Timetable | Báo lỗi `PPCT_IMPORT_TIMEOUT` |
| **Giới hạn bộ nhớ Worker** | OldGen 128MB, YoungGen 32MB | Tái sử dụng `WORKER_RESOURCE_LIMITS` từ Timetable | Ngăn chặn cạn kiệt tài nguyên node |
| **Tỷ lệ nén tối đa (Expansion Ratio)** | 20 : 1 | **Tăng cường riêng cho PPCT (New Hardening)** | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Số lượng ZIP entries tối đa** | 100 entries | **Tăng cường riêng cho PPCT (New Hardening)** | Báo lỗi `PPCT_IMPORT_COMPLEXITY_LIMIT` |
| **Độ dài chuỗi ô Tiêu đề bài học** | 500 ký tự | **Profile riêng cho PPCT (New Parser Profile)** | Báo lỗi `PPCT_IMPORT_TITLE_OVER_LIMIT` |
| **Độ dài chuỗi ô khác** | 100 ký tự (Type), 200 ký tự (Khác) | Khớp giới hạn CSDL VarChar | Báo lỗi `PPCT_IMPORT_FIELD_OVER_LIMIT` |

*(Lưu ý kiểm toán: Ba giới hạn gồm tỷ lệ nén 20:1, giới hạn 100 ZIP entries, và độ dài ô tiêu đề 500 ký tự là các quy định tăng cường mới riêng cho PPCT, không tồn tại trong parser thời khóa biểu trước đây).*

### B. Chính sách Đường dẫn ZIP và Nội dung Ngoài (ZIP Path & External Content Policy):
Giai đoạn preflight của trình phân tích PPCT bắt buộc phải từ chối fail-closed đối với các tệp chứa:
1. **Đường dẫn mục ZIP tuyệt đối:** Bắt đầu bằng `/` hoặc `\` hoặc ký tự ổ đĩa (ví dụ `C:\`).
2. **Ký tự duyệt thư mục (Directory Traversal):** Chứa chuỗi `../` hoặc chuỗi chuẩn hóa dấu gạch chéo ngược `..\`.
3. **Mối quan hệ gói tệp bất thường:** Tệp quan hệ gói (`.rels`) không đúng chuẩn hoặc trỏ ra ngoài gói tệp.
4. **Liên kết ngoài (External Relationships / Targets):** Bất kỳ quan hệ nào có `TargetMode="External"`.
5. **Thư mục liên kết ngoài (`xl/externalLinks/`):** Liên kết workbook ngoài.
6. **Kết nối dữ liệu ngoài:** Các tệp `xl/connections.xml`, `xl/queryTables/`.
7. **Đối tượng nhúng:** Các đối tượng OLE (`oleObject`), tệp nhị phân nhúng (`.bin`).
8. **Điều khiển ActiveX:** Bất kỳ phần tử ActiveX nào.
9. **Siêu liên kết ngoài (External Hyperlinks):** Các liên kết URL bên ngoài trong ô tính.
- **Ngoại lệ hợp lệ:** Chỉ các mối quan hệ nội bộ phi thực thi cần thiết cho bảng (`xl/tables/`) và kiểu dáng (`xl/styles.xml`) chuẩn OpenXML mới được chấp nhận.
- **Không truy xuất mạng:** Máy chủ tuyệt đối không tải về bất kỳ tài nguyên bên ngoài nào khi phân tích tệp.
- **Xử lý vi phạm:** Bất kỳ vi phạm nào về đường dẫn ZIP độc hại hoặc nội dung ngoài đều bị từ chối fail-closed với mã lỗi `PPCT_IMPORT_INVALID_FILE_TYPE` (nếu hỏng/traversal gói tệp) hoặc `PPCT_IMPORT_EXTERNAL_LINKS_UNSUPPORTED` (nếu chứa liên kết/kết nối/đối tượng ngoài).

### C. Giải quyết Độ dài Chuỗi Parser (200 ký tự vs 500 ký tự):
- Parser thời khóa biểu hiện hành giới hạn `MAX_PARSER_CELL_TEXT_LENGTH = 200`.
- Miền nghiệp vụ PPCT cho phép tiêu đề bài học lên tới 500 ký tự (`PpctItemRevision.title VARCHAR(500)`).
- **Nghĩa vụ triển khai cho `P2-020`:**
  - P2-020 **KHÔNG ĐƯỢC** tái sử dụng nguyên trạng giới hạn 200 ký tự của timetable parser (vì sẽ làm cắt cụt bài học PPCT hợp lệ).
  - P2-020 **KHÔNG ĐƯỢC** nới lỏng giới hạn 200 ký tự của timetable một cách toàn cục (để tránh ảnh hưởng phân hệ thời khóa biểu).
  - P2-020 phải kế thừa kiến trúc worker cách ly luồng và thiết lập **PPCT Parser Profile** riêng, cho phép đọc chuỗi ô tiêu đề lên tới 500 ký tự trước khi kiểm tra độ dài tổng thể.

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

| Mã lỗi chuẩn tắc | Ý nghĩa / Điều kiện kích hoạt | HTTP Code |
|---|---|:---:|
| `PPCT_IMPORT_INVALID_FILE_TYPE` | Tệp không phải là ZIP/OpenXML XLSX hợp lệ, sai magic bytes, hỏng cấu trúc gói, thiếu `[Content_Types].xml`/`xl/workbook.xml`, hoặc chứa đường dẫn ZIP traversal `..` / đường dẫn tuyệt đối. | 400 |
| `PPCT_IMPORT_FILE_TOO_LARGE` | Dung lượng tệp nén vượt quá giới hạn 8MB (`MAX_XLSX_BYTES`). | 413 |
| `PPCT_IMPORT_COMPLEXITY_LIMIT` | Tệp vi phạm các ngưỡng độ phức tạp: giải nén vượt 64MB, tỷ lệ nén > 20:1, quá 100 ZIP entries, quá 32 sheets, quá 5,000 dòng, quá 64 cột, quá 250,000 ô dimension, hoặc quá 256 vùng ô gộp toàn gói. | 400 |
| `PPCT_IMPORT_MACRO_UNSUPPORTED` | Gói tệp chứa macro hoặc mã thực thi VBA (`xl/vbaProject.bin`). | 400 |
| `PPCT_IMPORT_EXTERNAL_LINKS_UNSUPPORTED` | Tệp chứa liên kết ra ngoài (`xl/externalLinks/`), external connections, OLE/ActiveX, hoặc external hyperlinks. | 400 |
| `PPCT_IMPORT_ENCRYPTED_UNSUPPORTED` | Tệp bị đặt mật khẩu hoặc mã hóa OpenXML không thể phân tích trực tiếp. | 400 |
| `PPCT_IMPORT_TIMEOUT` | Thời gian phân tích an toàn tệp trong worker vượt quá 8,000 ms. | 408 |

### Nhóm 2: Cấu trúc Sheet, Vùng Nhập liệu & Header (Sheet Structure & Input Regions)

| Mã lỗi chuẩn tắc | Ý nghĩa / Điều kiện kích hoạt | HTTP Code |
|---|---|:---:|
| `PPCT_IMPORT_MISSING_REQUIRED_SHEET` | Thiếu một trong các sheet thẩm quyền bắt buộc (`THONG_TIN`, `PPCT`, `CHUYEN_DE`). | 400 |
| `PPCT_IMPORT_UNEXPECTED_SHEET` | Tệp chứa các sheet thừa nằm ngoài danh mục 6 sheet chuẩn tắc. | 400 |
| `PPCT_IMPORT_HIDDEN_AUTHORITATIVE_SHEET` | Sheet thẩm quyền `THONG_TIN`, `PPCT`, hoặc `CHUYEN_DE` bị đặt ở trạng thái ẩn (`hidden` hoặc `veryHidden`). | 400 |
| `PPCT_IMPORT_HIDDEN_INPUT_INTERSECTION` | Phát hiện dòng ẩn hoặc cột ẩn giao cắt với vùng nhập liệu nghiệp vụ (B4..B6 ở `THONG_TIN`, A..I ở `PPCT`, A..H ở `CHUYEN_DE`). | 400 |
| `PPCT_IMPORT_MERGED_AUTHORITATIVE_CELL` | Phát hiện ô gộp (merged cell) giao cắt với vùng nhập liệu nghiệp vụ thẩm quyền (bảng `PPCT`, bảng `CHUYEN_DE`, hoặc metadata B4..B6). | 400 |
| `PPCT_IMPORT_INVALID_HEADER` | Dòng tiêu đề tại dòng 1 của sheet `PPCT` hoặc `CHUYEN_DE` không khớp chính xác với mẫu chuẩn sau khi trim và chuẩn hóa. | 400 |
| `PPCT_IMPORT_MISSING_HEADER` | Thiếu một hoặc nhiều cột tiêu đề bắt buộc trong bảng. | 400 |
| `PPCT_IMPORT_DUPLICATE_HEADER` | Xuất hiện hai hoặc nhiều cột có cùng tên tiêu đề trong bảng. | 400 |

### Nhóm 3: Metadata & Danh tính (Metadata & Identity)

| Mã lỗi chuẩn tắc | Ý nghĩa / Điều kiện kích hoạt | HTTP Code |
|---|---|:---:|
| `PPCT_IMPORT_TEMPLATE_VERSION_MISMATCH` | Giá trị tại ô `THONG_TIN.Phiên bản mẫu` (B6) khác chuỗi chuẩn tắc `PPCT_V1`. | 400 |
| `PPCT_IMPORT_METADATA_MISSING` | Thiếu thông tin Môn học (B4) hoặc Năm học (B5) tại sheet `THONG_TIN`. | 400 |
| `PPCT_IMPORT_SUBJECT_NOT_FOUND` | Tên môn học chuẩn hóa không khớp với bất kỳ môn học nào trong CSDL. | 404 |
| `PPCT_IMPORT_SUBJECT_INACTIVE` | Tìm thấy môn học khớp tên chuẩn hóa nhưng đang ở trạng thái ngừng hoạt động (`INACTIVE`). | 422 |
| `PPCT_IMPORT_SUBJECT_AMBIGUOUS` | Tìm thấy nhiều hơn 1 môn học có trạng thái `ACTIVE` cùng thỏa mãn tên chuẩn hóa. | 422 |
| `PPCT_IMPORT_ACADEMIC_YEAR_NOT_FOUND` | Năm học tại ô B5 không tồn tại trong bảng `AcademicYear` của hệ thống. | 404 |
| `PPCT_IMPORT_INVALID_ACADEMIC_YEAR_FORMAT` | Chuỗi năm học không đúng quy chuẩn `YYYY-YYYY` (ví dụ `2026-2027`). | 400 |

### Nhóm 4: Dữ liệu Dòng Bài học & Kiểu Ô (Data Row & Cell Type Validation)

| Mã lỗi chuẩn tắc | Ý nghĩa / Điều kiện kích hoạt | HTTP Code |
|---|---|:---:|
| `PPCT_IMPORT_INVALID_GRADE` | Giá trị khối lớp không thuộc tập hợp hợp lệ `{10, 11, 12}`. | 400 |
| `PPCT_IMPORT_MISSING_TITLE` | Cột tên bài học (cột D ở `PPCT`) hoặc tên chuyên đề (cột C ở `CHUYEN_DE`) bị để trống. | 400 |
| `PPCT_IMPORT_TITLE_OVER_LIMIT` | Tiêu đề chuẩn tắc sau khi ghép tiền tố vượt quá giới hạn 500 ký tự (`PpctItemRevision.title`). | 400 |
| `PPCT_IMPORT_FIELD_OVER_LIMIT` | Trường văn bản phụ vượt quá giới hạn (ví dụ `Bài / Chủ đề` vượt 150 ký tự). | 400 |
| `PPCT_IMPORT_INVALID_LESSON_TYPE` | Loại nội dung không thuộc allowlist đóng băng của máy chủ. | 400 |
| `PPCT_IMPORT_INVALID_PERIOD_COUNT` | Số tiết không phải số nguyên dương hợp lệ hoặc vượt ngưỡng tối đa (1..30 ở PPCT, 1..40 ở CHUYEN_DE). | 400 |
| `PPCT_IMPORT_INVALID_WEEK_RANGE` | Tuần bắt đầu / tuần kết thúc không hợp lệ (`weekStart > weekEnd` hoặc ngoài khoảng 1..40). | 400 |
| `PPCT_IMPORT_PARTIAL_ROW` | Dòng dữ liệu bị điền dở dang, thiếu các trường bắt buộc. | 400 |
| `PPCT_IMPORT_DUPLICATE_ROW` | Dòng bài học bị trùng lặp toàn bộ nội dung trong cùng khối lớp. | 400 |
| `PPCT_IMPORT_SEQUENCE_DISORDER` | Dãy số chuyên đề (`Chuyên đề số *`) không liên tục từ 1 hoặc bị trùng trong cùng khối lớp. | 400 |
| `PPCT_IMPORT_PROHIBITED_FORMULA` | Phát hiện công thức Excel nằm trong các cột nhập liệu nghiệp vụ (A..G ở PPCT, A..F ở CHUYEN_DE). | 400 |
| `PPCT_IMPORT_UNSUPPORTED_CELL_TYPE` | Ô trong vùng nhập liệu thẩm quyền chứa kiểu không được hỗ trợ: ô lỗi `#VALUE!`, `#REF!`, hyperlink ngoài, hoặc kiểu ngày/boolean không được phép. | 400 |

### Nhóm 5: Mục tiêu Bản nháp, Đồng thời, Fingerprint & Phả hệ (Target, Concurrency & Lineage)

| Mã lỗi chuẩn tắc | Ý nghĩa / Điều kiện kích hoạt | HTTP Code |
|---|---|:---:|
| `PPCT_IMPORT_TARGET_DRAFT_NOT_FOUND` | Không tìm thấy bản ghi draft mục tiêu được chỉ định khi chọn chế độ `UPDATE_EXACT_DRAFT`. | 404 |
| `PPCT_IMPORT_TARGET_DRAFT_PLAN_MISMATCH` | Bản ghi draft mục tiêu không thuộc đúng kế hoạch môn học của khối lớp đó. | 422 |
| `PPCT_IMPORT_TARGET_NOT_DRAFT` | Bản ghi mục tiêu được chỉ định không ở trạng thái `DRAFT` (ví dụ đã được xuất bản). | 422 |
| `PPCT_IMPORT_DRAFT_CONFLICT` | Xung đột đồng thời: CAS token `expectedUpdatedAt` không khớp với CSDL hiện tại, hoặc xung đột tuần tự hóa / cấp phát phiên bản (Prisma P2034 / P2002) đã vượt quá số lần retry cho phép. | 409 |
| `PPCT_IMPORT_FINGERPRINT_MISMATCH` | Khóa `requestFingerprint` gửi lên trong Confirm không khớp với tính toán lại từ tệp hoặc trạng thái preview đã đóng băng. | 409 |
| `PPCT_IMPORT_REPLAY_AMBIGUOUS` | Tìm thấy nhiều hơn một bản ghi DRAFT trùng khớp nội dung ngữ nghĩa khi phát lại ở chế độ `CREATE_NEW_DRAFT`. | 409 |
| `PPCT_IMPORT_LINEAGE_AMBIGUOUS` | Cấu trúc bài học xáo trộn phức tạp không thể tự động căn chỉnh phả hệ một cách an toàn, hoặc ánh xạ phả hệ đã preview bị vô hiệu do thay đổi DB. | 422 |

*(Lưu ý: Sự không thống nhất giữa công thức Excel phái sinh ở cột H, I và tính toán của máy chủ, hoặc độ lệch nội dung sheet `DANH_MUC` tải lên, được xếp loại cảnh báo `ADVISORY`, không dùng làm mã lỗi chặn).*

---

## 31. Nghĩa vụ Triển khai Cụ thể cho P2-020 (Obligations for P2-020)

Khi thực hiện nhiệm vụ `P2-020` (Native PPCT Importer Implementation), kỹ sư phải tuân thủ nghiêm ngặt các nghĩa vụ sau:
1. **Phân giải định danh môn học tất định duy nhất:** Triển khai thuật toán 6 bước phân giải Môn học từ `THONG_TIN.B4` (Subject display name), so sánh chuỗi chuẩn hóa NFKC và collapse khoảng trắng với các môn học `ACTIVE`. Không tự động tạo môn học, không fallback code, fail-closed rõ ràng.
2. **Chuẩn hóa token `lessonType` chuẩn tắc:** Đối soát đầu vào linh hoạt (trim, NFKC, case-insensitive), nhưng bắt buộc lưu trữ và tính checksum bằng đúng token chuẩn tắc viết hoa chuẩn (e.g. `"Bài học"`, `"Thực hành"`).
3. **Triển khai phân rã tiết học tất định:** Mở rộng mỗi dòng bài học có `Số tiết = N` thành $N$ nghĩa vụ bài học cấp tiết (`PpctItem` + `PpctItemRevision`) có `sequence` liên tục và dùng chung tiêu đề chuẩn tắc.
4. **Khóa tiêu đề chuẩn tắc $\le 500$ ký tự:** Không lưu chuỗi `(Tiết i/N)` vào CSDL; kiểm tra độ dài sau khi ghép tiền tố $\le 500$ ký tự, nếu vượt quá báo lỗi fail-closed `PPCT_IMPORT_TITLE_OVER_LIMIT`.
5. **Ràng buộc gói Preview -> Confirm và Khóa `requestFingerprint`:**
   - Xây dựng Gói xác nhận chuẩn tắc (`Canonical Confirm Package`) cho từng khối lớp sắp xếp tăng dần theo `gradeLevel`.
   - Tạo khóa `requestFingerprint` bao phủ userId, rawDigest, academicYearId, subjectId, semanticDigest và confirm package bằng Canonical JSON.
   - Pha Confirm phải phân tích lại tệp/preview, tính lại toàn bộ gói, đối soát fingerprint trước khi ghi nhận DB.
6. **Cố định ánh xạ phả hệ (Lineage Preview Binding):** Ánh xạ phả hệ được chọn hoặc tự động xác định trong preview phải được đóng băng trong confirm package; không được tính lại âm thầm.
7. **Xử lý đua tranh đồng thời `CREATE_NEW_DRAFT`:** Vận hành bên trong transaction `SERIALIZABLE` độc lập cho từng lượt thử (tối đa 3 lượt thử), nhận diện xung đột mức kho lưu trữ qua lỗi Prisma `P2034` (xung đột tuần tự hóa) và `P2002` (đua tranh cấp phát `versionNumber`), lặp lại quy trình đối soát cùng tác giả để phát lại ngữ nghĩa idempotent, khóa chặt bất biến chống tạo thêm bản nháp trùng lặp cho cùng bộ ba `(PpctPlan, actorUserId, canonical semantic content)`, và luôn chuyển đổi lỗi xung đột kiệt sức thành `PPCT_IMPORT_DRAFT_CONFLICT` trước khi trả về Web client.
8. **Tuân thủ đúng hợp đồng phả hệ runtime:**
   - Bài học giữ nguyên: `identityMode = CARRY_FORWARD`, `predecessors = []` (không sinh lineage).
   - Bài học kế thừa/thay thế mới: `identityMode = NEW`, khai báo `predecessors` hợp lệ (sinh lineage cùng component).
9. **Giao dịch nguyên tử cấp workbook:** Toàn bộ các khối lớp có trong tệp phải được lưu trữ trong một database transaction duy nhất (all-or-nothing), sử dụng chung một `Prisma.TransactionClient` nội bộ.
10. **Xây dựng PPCT Parser Profile & Kiểm tra Gói Tệp:**
    - Profile parser riêng cho PPCT cho phép đọc chuỗi ô tiêu đề lên tới 500 ký tự;
    - Áp dụng các giới hạn an toàn tái sử dụng (8MB, 64MB, 32 sheets, 5000 rows, 64 cols, 250k cells, 256 merged ranges, 8000ms timeout) và các giới hạn tăng cường mới (20:1 ratio, 100 ZIP entries);
    - Chấp nhận công thức dải tiết tại cột phái sinh H, I và G, H; từ chối công thức ở các cột nhập liệu nghiệp vụ (`PPCT_IMPORT_PROHIBITED_FORMULA`);
    - Kiểm tra và từ chối dòng/cột ẩn giao cắt vùng nhập liệu nghiệp vụ (`PPCT_IMPORT_HIDDEN_INPUT_INTERSECTION`);
    - Kiểm tra và từ chối ô gộp giao cắt vùng nhập liệu nghiệp vụ (`PPCT_IMPORT_MERGED_AUTHORITATIVE_CELL`);
    - Kiểm tra kiểu ô hợp lệ, từ chối ô lỗi, hyperlink ngoài, kiểu không được phép (`PPCT_IMPORT_UNSUPPORTED_CELL_TYPE`);
    - Kiểm tra an toàn ZIP: từ chối đường dẫn tuyệt đối, traversal `..` / `\`, external links, OLE, ActiveX, macro, encryption.
11. **Bảo toàn thẩm quyền allowlist của máy chủ:** Áp dụng allowlist đóng băng của hợp đồng `PPCT_V1` cho `lessonType`, không tin tưởng nội dung sheet `DANH_MUC` tải lên.

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
- [x] Đã khóa chính xác thuật toán phân giải danh tính Môn học chuẩn tắc duy nhất (Subject display name, NFKC, collapse whitespace, ACTIVE only, fail-closed khi inactive/not found/ambiguous, không fallback code).
- [x] Đã khóa chuẩn hóa token loại bài học `lessonType` chuẩn tắc (đầu vào case-insensitive, đầu ra lưu trữ và checksum bắt buộc là token chuẩn tắc viết hoa).
- [x] Đã khóa hợp đồng gói Preview -> Confirm (Canonical Confirm Package cho từng khối lớp sắp xếp theo gradeLevel tăng dần).
- [x] Đã khóa hợp đồng dấu vân tay `requestFingerprint` chuẩn tắc (stale-preview integrity token, serialized canonical JSON, kiểm tra đối soát toàn diện).
- [x] Đã khóa ràng buộc phả hệ từ Preview (lineage mapping cố định vào confirm package, không tự ý tính lại).
- [x] Đã khóa ngữ nghĩa đua tranh đồng thời khi `CREATE_NEW_DRAFT` (SERIALIZABLE transaction, bounded retry tối đa 3 lần với Prisma P2034/P2002, semantic replay theo actor, bất biến chống trùng lặp theo `(plan, actor, content)`).
- [x] Đã khóa chính sách dòng/cột ẩn (các sheet thẩm quyền phải visible, cấm dòng/cột ẩn giao cắt vùng nhập liệu nghiệp vụ `PPCT_IMPORT_HIDDEN_INPUT_INTERSECTION`).
- [x] Đã khóa chính sách ô gộp (Merged Cells) (tái sử dụng giới hạn 256, cấm ô gộp giao cắt vùng nhập liệu nghiệp vụ `PPCT_IMPORT_MERGED_AUTHORITATIVE_CELL`, cho phép ô gộp trang trí ngoài vùng nhập).
- [x] Đã hoàn thiện bảng giới hạn an toàn toàn diện (phân loại rõ giới hạn tái sử dụng từ timetable parser và 3 giới hạn tăng cường mới riêng cho PPCT: 20:1 ratio, 100 entries, 500 title bound).
- [x] Đã xác lập cơ chế phân rã tiết học tất định tương thích với độ mịn lưu trữ và bộ phân bổ của hệ thống hiện hành.
- [x] Đã khóa quy tắc tiêu đề chuẩn tắc (không lưu hậu tố `Tiết i/N` vào CSDL, kiểm tra giới hạn $\le 500$ ký tự).
- [x] Đã khóa chuẩn tắc ngữ nghĩa `CARRY_FORWARD` (không có predecessor, không tạo lineage) và `NEW` (có predecessor, tạo lineage).
- [x] Đã loại bỏ giả định đơn draft, thiết lập hợp đồng mục tiêu rõ ràng (`CREATE_NEW_DRAFT` và `UPDATE_EXACT_DRAFT`).
- [x] Đã khóa ranh giới giao dịch nguyên tử cấp workbook sử dụng chung một transaction client cho toàn bộ các khối lớp.
- [x] Đã khóa thẩm quyền danh mục `Loại nội dung` thuộc về allowlist đóng băng của máy chủ.
- [x] Đã chuẩn hóa danh mục mã lỗi fail-closed thống nhất 100% trong toàn bộ tài liệu.

---

## 34. Tóm tắt Bằng chứng Kiểm toán (Evidence Summary)

Kiểm toán xác nhận workbook chính thức của trường Đam San (`Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`) hoàn toàn có thể tích hợp an toàn vào kiến trúc PPCT đã được chuẩn hóa tại `ADR-048` thông qua cơ chế phân rã tiết học tất định:
- Dòng sư phạm có `Số tiết = N` phân rã thành $N$ nghĩa vụ bài học cấp tiết, hoàn toàn tương thích với mô hình phân bổ 1 tiết = 1 `PpctItemRevision` của `P2-003`.
- `CHUYEN_DE` ánh xạ sang `SPECIALIZED_STUDY` với không gian `sequence` tiết độc lập bắt đầu từ 1.
- Danh tính Môn học được phân giải tất định duy nhất từ tên hiển thị với các quy tắc fail-closed chặt chẽ.
- Loại bài học `lessonType` được chuẩn hóa thành các token chuẩn tắc bất biến trong CSDL và semantic checksum.
- Gói xác nhận `Confirm Package` và dấu vân tay `requestFingerprint` ràng buộc chặt chẽ các quyết định mục tiêu và phả hệ từ pha Preview, ngăn ngừa tình trạng stale preview và đua tranh đồng thời.
- Chính sách an toàn gói tệp khóa chặt chẽ dòng/cột ẩn, ô gộp, kiểu ô, các mối nguy ZIP và nội dung ngoài.
- Quá trình nạp bảo đảm tính nguyên tử trên toàn bộ workbook và bảo toàn nguyên vẹn ranh giới cấu hình áp dụng theo lớp của Ban giám hiệu và Tổ trưởng tại `P2-004`.

Nhiệm vụ `P2-010` đạt trạng thái **`CLOSED` by `SYNC-P2-010`**. Nhiệm vụ `P2-020` chuyển sang trạng thái **`READY`** để triển khai pipeline nhập liệu chuẩn tắc.
