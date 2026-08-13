# AGENTS.md — Quy tắc làm việc & Hướng dẫn dành cho AI Agents / Developers

Tài liệu này là cổng thông tin bắt buộc dành cho bất kỳ Agent nào (bao gồm Antigravity, Codex, Copilot, v.v.) hoặc Lập trình viên trước khi đọc hoặc thay đổi mã nguồn trong dự án **food-order-bridge**.

---

## 1. Yêu cầu Bắt buộc trước khi Sửa Mã Nguồn

> [!IMPORTANT]
> 1. **Đọc tài liệu theo sơ đồ**: Luôn đọc [docs/README.md](file:///d:/VisualStudioCode/food-order-bridge/docs/README.md) để xác định danh mục tài liệu liên quan tới tính năng cần sửa đổi.
> 2. **Xác định Tenant Scope**: Trước khi viết bất kỳ query database hoặc API handler nào, phải xác định rõ scope dữ liệu:
>    - Dữ liệu ở cấp **Toàn hệ thống (Super Admin)**.
>    - Dữ liệu ở cấp **Cửa hàng (`storeId`)**.
>    - Dữ liệu ở cấp **Chi nhánh (`branchId`)**.
> 3. **Không bao giờ loại bỏ Tenant Context**: Tuyệt đối không viết query repository thiếu `storeId` hoặc `branchId`. 

---

## 2. Quy tắc Phân vùng Dữ liệu (Tenant Isolation Rules) - P0 Security

1. **Fail-Fast Tenant Context**:
   - Mọi hàm trong `repository` bắt buộc nhận `tenantContext = { storeId, branchId }` làm tham số đầu tiên.
   - Nếu `tenantContext` rỗng hoặc không có `storeId`, repository phải ném ra ngoại lệ `TenantContextMissingError` lập tức.

2. **Session Trust Only**:
   - `storeId` và `branchId` của người dùng đăng nhập **PHẢI** được trích xuất từ JWT Session Cookie/Header đã ký HMAC.
   - **KHÔNG BAO GIỜ** tin tưởng `storeId` hay `branchId` truyền lên từ `req.body` hoặc `req.query` trong các API thay đổi dữ liệu (POST, PUT, DELETE, PATCH).

3. **Compound Unique Indexes**:
   - Tất cả các ràng buộc `unique` (Category ID, MenuItem ID, Slug, Counter, Order ID) phải được kết hợp với `storeId` hoặc `branchId`.

---

## 3. Quy trình Kiểm thử & Phòng ngừa Bug (Zero-Bug Policy)

1. **Chạy Test Suite đầy đủ**: 
   - Sau khi thực hiện bất kỳ chỉnh sửa mã nguồn nào, phải chạy lệnh `npm test` và đảm bảo 100% test suite vượt qua.
2. **Viết Test cho Tính năng mới**:
   - Mọi thay đổi logic backend hoặc API mới phải đi kèm file unit/integration test tương ứng trong thư mục `test/`.
3. **Cập nhật Tài liệu đồng thời**:
   - Nếu thay đổi behavior, API contract hoặc schema, phải cập nhật file markdown tương ứng trong thư mục `docs/` trong cùng commit/edit context.

---

## 4. Danh mục Skill Bắt buộc

Đối với các tác vụ sửa đổi liên quan đến luồng cửa hàng & chi nhánh, hãy tham khảo Skill quy trình tại:
[.agents/skills/food-pos-change-workflow/SKILL.md](file:///d:/VisualStudioCode/food-order-bridge/.agents/skills/food-pos-change-workflow/SKILL.md)
