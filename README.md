# Hệ thống Báo giảng và thống kê tiết dạy tự động

## Đơn vị sử dụng

Trường PTDTNT THPT Đam San.

## Phương án kiến trúc ưu tiên

- Frontend: React, Vite, TypeScript
- Backend: Node.js, TypeScript
- Database: PostgreSQL 17
- Reverse proxy: Nginx
- Production domain: baogiang.dtnt-damsan.edu.vn
- Backend production: 127.0.0.1:3100

## Nguyên tắc phát triển

- Phát triển và kiểm thử trên máy local.
- Không dùng database production để phát triển.
- Push GitHub không đồng nghĩa deploy.
- Production chỉ deploy khi đã kiểm tra và xác nhận.
- Không tác động hệ thống quản lý nội trú hiện có.
