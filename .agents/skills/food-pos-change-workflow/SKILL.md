---
name: food-pos-change-workflow
description: Quy trình chuẩn cho mọi thay đổi mã nguồn thuộc hệ thống Food POS Multi-Tenant. Đảm bảo tenant isolation, kiểm thử đầy đủ và cập nhật tài liệu.
---

# Food POS Change Workflow Skill

Skill này định hướng và bắt buộc quy trình làm việc chuẩn cho bất kỳ thay đổi mã nguồn nào trong hệ thống `food-order-bridge` từ Phase 0 trở đi.

## Các bước bắt buộc (Mandatory Execution Workflow)

1. **Đọc Quy chuẩn & Kiểm tra Tài liệu**:
   - Đọc `AGENTS.md` tại gốc project.
   - Đọc `docs/README.md` và các tài liệu liên quan đến module cần sửa.

2. **Phân tích Tác động Tenant (Tenant Impact Analysis)**:
   - Xác định câu lệnh database / repository làm việc ở scope nào:
     - `SYSTEM` (Super Admin)
     - `STORE` (`storeId`)
     - `BRANCH` (`storeId` + `branchId`)
   - Kiểm tra đảm bảo không có query repository nào thiếu `storeId` hoặc `branchId`.

3. **Thực thi Mã nguồn**:
   - Tuân thủ nguyên tắc **Fail-Fast Tenant Context**: truyền `tenantContext` vào tham số đầu tiên của repository methods.
   - Cập nhật DTO, Validation Schema (Zod) phù hợp.

4. **Kiểm thử (Verification & Testing)**:
   - Chạy lệnh `npm test` để xác minh không gây suy giảm hoặc làm lỗi tính năng cũ (zero regressions).
   - Thêm các test case cô lập dữ liệu (Tenant Isolation Tests) nếu tạo mới API/Repository.

5. **Cập nhật Tài liệu (Doc Synchronization)**:
   - Nếu có sự thay đổi về endpoint API, DTO, Schema Mongo hoặc Business Rules, bắt buộc cập nhật file Markdown tương ứng trong thư mục `docs/`.
