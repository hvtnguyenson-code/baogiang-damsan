# ADR-003: Prototype Chỉ Là Tham Khảo

**Ngày:** 2026-07-28  
**Trạng thái:** ĐƯỢC CHẤP NHẬN  
**Giai đoạn:** Phase 00 — Foundation (áp dụng cho mọi phase)

---

## Bối cảnh

File `docs/prototypes/ui-reference-phuong-an-b.html` được tạo ra như một công cụ thảo luận về bố cục và phong cách UI. Tuy nhiên, prototype này chứa một số vấn đề nghiêm trọng về logic nghiệp vụ và không thể được dùng trực tiếp làm source production.

---

## Các vấn đề trong Prototype cần tránh

### 1. Role Selector giả lập

Prototype có:
```html
<select id="role-selector" onchange="switchRole()">
  <option value="Level_1">Giáo Viên</option>
  <option value="Level_2">Tổ Trưởng</option>
  <option value="Level_Max">Ban Giám Hiệu (Admin)</option>
</select>
```

**Vấn đề:**
- Mô hình cứng `Level_1`, `Level_2`, `Level_Max` mâu thuẫn với đặc tả
- Không có vai trò "Level_Max" trong hệ thống thực
- Capabilities phải được cộng dồn, không thay thế
- Không có role selector trong production

**Quyết định:** KHÔNG sao chép role selector này.

### 2. Logic PPCT không đúng

Prototype có thể đề xuất "đóng băng PPCT" — điều này vi phạm đặc tả:
- Khi giáo viên vắng và người khác chỉ quản lớp, PPCT không bị đóng băng
- Nợ tiết được theo dõi riêng, PPCT tiếp tục
- Xem ràng buộc nghiệp vụ trong master prompt

**Quyết định:** Logic PPCT phải theo đặc tả, không theo prototype.

### 3. Phê duyệt sai thẩm quyền

Prototype có thể cho phép pattern tự duyệt — vi phạm nguyên tắc:
- Tổ trưởng không tự duyệt bảng kê của mình
- Không có phê duyệt chéo sai thẩm quyền

---

## Những gì CÓ THỂ tham khảo từ Prototype

| Yếu tố | Có thể tham khảo |
|--------|-----------------|
| Bố cục header | ✅ |
| Cách phân nhóm tab điều hướng | ✅ |
| Cách trình bày card, bảng, badge | ✅ |
| Màu sắc chủ đạo (blue-700, gray palette) | ✅ |
| Notification panel layout | ✅ (không sao chép logic) |
| JavaScript logic | ❌ |
| Role selector | ❌ |
| Bất kỳ data mẫu nào | ❌ |
| Logic phân quyền | ❌ |
| Logic PPCT | ❌ |

---

## Thứ tự ưu tiên nguồn tài liệu

```
1. Master prompt (cao nhất)
2. Đặc tả PA-B-VPS-PostgreSQL-v1.1-AI-ready.docx
3. Các quyết định kiến trúc (ADR)
4. Prototype HTML (thấp nhất — chỉ bố cục/màu sắc)
```

---

## Hệ quả

- File prototype không bao giờ được sửa
- Frontend production phải được xây từ đặc tả, không từ prototype
- Mọi component UI phải được review về logic nghiệp vụ độc lập với prototype
- `docs/prototypes/README.md` đã ghi rõ nguyên tắc này
