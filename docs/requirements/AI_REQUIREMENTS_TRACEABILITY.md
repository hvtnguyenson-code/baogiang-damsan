# Ma trận truy vết yêu cầu AI

| ID | Yêu cầu | Thành phần thực thi | Bằng chứng kiểm thử |
|---|---|---|---|
| AI-R01 | AI triển khai sau Phase 0-10 | Roadmap, feature flags | AI disabled trong regression core |
| AI-R02 | Giáo viên không có prompt tự do | UI policy, API guard | endpoint active trả 403 cho giáo viên |
| AI-R03 | BGH dùng active theo scope trường | capability/scope guard | test allow/deny school scope |
| AI-R04 | Tổ trưởng dùng active theo scope tổ | capability/scope guard | test tổ đúng/sai và hiệu lực |
| AI-R05 | Điều phối dùng active theo phạm vi | capability/scope guard | test activity scope |
| AI-R06 | Giáo viên nhận passive suggestion | passive trigger/delivery | test event/schedule/dedup |
| AI-R07 | AI không ghi trực tiếp | ports + business commands | provider adapter không có write tool |
| AI-R08 | Human-in-the-loop | suggestion workflow | xem nguồn/chỉnh sửa/xác nhận/bỏ qua |
| AI-R09 | Quota và ngân sách | quota/budget guard | test ngưỡng và từ chối |
| AI-R10 | Đo usage và chi phí | usage/cost ledger | đối soát request và báo cáo |
| AI-R11 | Model routing/cache/batch | task catalog/cache/jobs | test cache key, TTL, batch dedup |
| AI-R12 | Tắt độc lập | 3 kill switches | core vẫn hoạt động khi tắt |
| AI-R13 | Không vượt scope | context query + backend guard | leakage/scope bypass test |
| AI-R14 | Provider thay thế được | provider adapter | contract test với fake provider |
| AI-R15 | Không mặc định cấp cho admin | capability model | test SYSTEM_ADMIN không có active access |
