# P2-010 — Kiểm toán Hợp đồng và An toàn Workbook PPCT Thực tế (PPCT Real-Workbook Contract & Security Audit)

- **Trạng thái nhiệm vụ:** `IN_PROGRESS`
- **Nhánh thực thi:** `docs/ppct-real-workbook-contract-security-audit-010`
- **Canonical starting baseline SHA:** `b8b5f9862c2dc160e124a19b863ac547b44ef94b`
- **Authoritative workbook name:** `Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`
- **Đường dẫn bằng chứng cục bộ:** `D:\baogiang-damsan\.local-evidence\Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx`
- **Authoritative SHA-256:** `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`
- **Bằng chứng Git exclusion:** Resolve qua `.git/info/exclude`, không bị track bởi git (`git ls-files` = NO OUTPUT)
- **Bằng chứng điều kiện tiên quyết:** `P2-001` (CLOSED), `P0-900` (CLOSED), `ADR-048` (Accepted)
- **Ma trận truy xuất nguồn gốc (Traceability):** `T24`, `T45`
- **Nhiệm vụ hạ nguồn:** `P2-020` (Native PPCT importer implementation) tiếp tục ở trạng thái `PLANNED` (bị khóa cho đến khi P2-010 hoàn tất review, merge, post-merge CI và closure sync).

---

## 1. Khởi động Kiểm toán (Audit Initialization)

Điều kiện kích hoạt (evidence trigger) của nhiệm vụ `P2-010` đã chính thức được thỏa mãn:
Người dùng đã cung cấp workbook mẫu PPCT chuẩn của hệ thống trường Đam San tại `.local-evidence/Mau_PPCT_Chuan_He_Thong_Dam_San_V1.xlsx` với đúng mã hash SHA-256 chuẩn tắc `9a8cc9b62b02cae5c81163bf7afca12be5f0ee66eb5316fd236294adb1b56692`.

Nhiệm vụ này là bước kiểm toán kiến trúc, an toàn gói file XLSX và khóa hợp đồng nhập liệu chi tiết (physical-to-logical mapping) để P2-020 có thể triển khai bộ nhập (native importer) một cách an toàn, chính xác và không phải suy đoán.
