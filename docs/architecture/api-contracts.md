# API Contracts — Food POS Multi-Tenant Platform

Tài liệu đặc tả toàn bộ các chuẩn giao tiếp RESTful API trong hệ thống.

---

## 1. Authentication & Session Management (`/api/auth`)

- `POST /api/auth/phone-login`: Nhận `{ phone, password }`. `phone` hỗ trợ:
  - Số điện thoại di động Việt Nam E.164 (Chủ cửa hàng).
  - Tên đăng nhập có gắn Store Key: `MÃ_QUÁN/username`, `MÃ_QUÁN:username`, hoặc `username@MÃ_QUÁN` (Nhân viên).
  - Tên đăng nhập đơn thuần (tự động phân giải nếu duy nhất).
- `POST /api/auth/select-branch`: Nhận `{ branchId }`, tạo `admin_session` HttpOnly cookie.
- `POST /api/auth/switch-branch`: Yêu cầu `admin_session`, chuyển đổi chi nhánh đang làm việc trong cùng Cửa hàng.
- `GET /api/auth/bootstrap`: Yêu cầu `admin_session`; trả về `user`, `store`, `branches`, `activeBranch`, `permissions`, `catalog`.
- `POST /api/auth/staff`: Yêu cầu `staff.manage`. Tạo tài khoản nhân viên mới trong phạm vi Cửa hàng hiện tại.
  - Thành công: HTTP `201 Created` `{ user: { id, username, role, storeId, ... } }`
  - Trùng username trong cùng Store: HTTP `409 Conflict` `{ code: "STAFF_USERNAME_EXISTS", message: "Tên đăng nhập này đã tồn tại trong cửa hàng hiện tại." }`
- `GET /api/auth/staff`: Yêu cầu `staff.manage` hoặc `staff.rules.manage`. Trả về danh sách nhân viên của cửa hàng.
- `GET /api/auth/permissions/catalog`: Yêu cầu `staff.rules.manage`. Trả về danh mục permission được phép gán cho staff.
- `PUT /api/auth/staff/:id/permissions`: Yêu cầu `staff.rules.manage`. Nhận `{ permissionMode: 'DEFAULT'|'CUSTOM', permissions: [...] }`.
- `PATCH /api/auth/staff/:id/status`: Yêu cầu `staff.manage` hoặc `staff.rules.manage`. Khóa/Mở tài khoản nhân viên `{ active: boolean }`.
- `POST /api/auth/logout`: Xóa toàn bộ session cookies.

---

## 2. Super Admin Dedicated APIs (`/api/super-admin`)

*Bảo vệ bởi `SUPER_ADMIN_AUTH_SECRET` và header `x-super-admin-token`.*

- `POST /api/super-admin/login`: Nhận `{ phone, password }`, trả về Super Admin JWT token.
- `GET /api/super-admin/stores`: Danh sách toàn bộ các Cửa hàng trên nền tảng.
- `POST /api/super-admin/stores`: Tạo Cửa hàng mới `{ code, name, slug, ownerPhone, ownerPassword, maxBranches, plan }`.
- `PUT /api/super-admin/stores/:id/status`: Chuyển đổi trạng thái Cửa hàng `{ status: 'ACTIVE' | 'SUSPENDED' }`.
- `DELETE /api/super-admin/stores/:id`: **Xóa vĩnh viễn Cửa hàng (Cascade Delete)** và toàn bộ dữ liệu phụ thuộc (Chi nhánh, Nhân viên, Thực đơn, Đơn hàng, Tồn kho, Cài đặt).
- `POST /api/super-admin/stores/:storeId/branches`: Thêm Chi nhánh mới cho Cửa hàng `{ code, name, slug, address, phone }`.
- `PUT /api/super-admin/branches/:branchId/status`: Khóa/Mở chi nhánh `{ status: 'ACTIVE' | 'INACTIVE' }`.
- `GET /api/super-admin/audit-logs`: Lấy lịch sử Audit Log hệ thống.
- `GET /api/super-admin/stores/:storeId/telegram-settings?branchId=...`: Lấy cấu hình Telegram hiệu lực của Store/Branch.
- `PUT /api/super-admin/stores/:storeId/telegram-settings`: Lưu cấu hình Telegram, cảnh báo pending order và lịch report. `branchId` trong body là tùy chọn.
- `DELETE /api/super-admin/stores/:storeId/telegram-settings?branchId=...`: Xóa override của Branch để quay về Store default.
- `GET|PUT /api/super-admin/stores/:storeId/telegram-settings/access`: Quản lý nhiều Telegram User ID được xem report theo Store/Branch.
- `POST /api/super-admin/stores/:storeId/telegram-settings/test`: Gửi tin nhắn test bằng credential của scope đã chọn.
- `GET /api/super-admin/stores/:storeId/telegram-settings/webhook-status`: Kiểm tra webhook của bot scope.
- `POST /api/super-admin/stores/:storeId/telegram-settings/register-webhook`: Đăng ký webhook tenant-scoped.

---

## 3. Catalog & Menu Management (`/api/menu`, `/api/categories`)

- `GET /api/categories`: Lấy danh sách danh mục món ăn (lọc theo `storeId`).
- `POST /api/categories`: Yêu cầu `categories.write`. Tạo danh mục mới `{ id, name, description, sortOrder, active }`.
- `PUT /api/categories/:id`: Yêu cầu `categories.write`. Cập nhật thông tin danh mục.
- `PUT /api/categories/:id/status`: Yêu cầu `categories.write`. Bật/Tắt hiển thị danh mục `{ active: boolean }`.
- `GET /api/menu`: Lấy danh sách món ăn (hỗ trợ `?includeDeleted=true` cho admin).
- `POST /api/menu`: Yêu cầu `catalog.write`. Tạo hoặc cập nhật thông tin món ăn master.
- `PATCH /api/menu/:id/inventory`: Yêu cầu `inventory.write`. Cập nhật số lượng tồn kho theo chi nhánh `{ stockQuantity: number }`.
- `PUT /api/menu/:id/status`: Yêu cầu `menu.status.write`. Bật/Tắt trạng thái bán hôm nay `{ active: boolean }`.
- `DELETE /api/menu/:id`: Yêu cầu `catalog.delete`. Soft-delete món ăn.
- `POST /api/menu/:id/restore`: Yêu cầu `catalog.delete`. Khôi phục món đã soft-delete.

---

## 4. Orders & Reports (`/api/orders`, `/api/reports`)

- `GET /api/orders`: Yêu cầu `orders.read`. Lấy danh sách đơn hàng có phân trang `?page=1&limit=10`.
- `POST /api/orders`: Công khai (Khách hàng đặt món). Nhận `{ requestId, fulfillmentType, paymentMethod, customer, items }`.
- `PATCH /api/orders/:id/status`: Yêu cầu `orders.write`. Cập nhật trạng thái đơn `{ orderStatus: 'PAID'|'CANCELLED' }`.
- `PATCH /api/orders/:id/payment`: Yêu cầu `orders.write`. Cập nhật trạng thái thanh toán `{ isPaid: boolean }`.
- `GET /api/reports/sales`: Yêu cầu `reports.read.store` hoặc `reports.read.branch`. Lấy thống kê doanh thu `?period=today|week|month`.
- `GET /api/reports/sales.pdf`: Xuất báo cáo bán hàng ra file PDF.

---

## 5. Settings & Telegram Integration (`/api/settings`, `/api/telegram`)

- `GET /api/settings`: Yêu cầu `settings.manage`. Lấy cấu hình cửa hàng & Telegram.
- `POST /api/settings`: Yêu cầu `settings.manage`. Lưu cấu hình `{ telegramBotToken, telegramChatId }`.
- `POST /api/settings/test`: Yêu cầu `settings.manage`. Bắn tin nhắn thử nghiệm vào Telegram.
- `POST /api/telegram/webhook`: Webhook tiếp nhận tương tác lệnh (Commands, Callback Queries) từ Telegram Bot.
- `POST /api/telegram/webhook/:storeId`: Webhook tenant-scoped; bắt buộc secret của Store nếu đã cấu hình và mọi report phải truyền `storeId + branchId`.

---

## 6. Error & Status Codes Standard

| HTTP Code | Ý nghĩa | Xử lý UI |
|---|---|---|
| `200` / `201` | Thành công | Hiển thị Toast / cập nhật view |
| `400` | Dữ liệu không hợp lệ | Hiển thị lỗi form / thông báo hướng dẫn |
| `401` | Chưa xác thực / Hết hạn phiên | Chuyển hướng về `/login.html` |
| `403` | Thiếu quyền hạn hoặc bị khóa | Hiển thị thông báo cấm truy cập |
| `404` | Không tìm thấy tài nguyên | Hiển thị thông báo không tìm thấy |
| `409` | Xung đột dữ liệu / Hết tồn kho | Thông báo giỏ hàng thay đổi tồn kho |
