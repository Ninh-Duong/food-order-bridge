# Ma trận Phân quyền (Permission Matrix)

Tài liệu quy định chi tiết quyền hạn giữa các vai trò trong hệ thống và cơ chế Phân quyền Nhân viên Tùy chỉnh (Granular Employee Permissions).

## 👥 Các Vai trò trong Hệ thống

1. **SUPER_ADMIN**: Quản trị viên hệ thống (Nền tảng).
2. **STORE_OWNER / ADMIN**: Chủ cửa hàng (Thương hiệu).
3. **STAFF**: Nhân viên vận hành Chi nhánh.
4. **CUSTOMER**: Khách hàng storefront.

---

## 📊 Ma trận Phân quyền Mặc định & Tùy chỉnh

| Chức năng / Hành động | Permission Key | STORE_OWNER | STAFF (Mặc định) | STAFF (Cấp tùy chỉnh) |
| :--- | :--- | :---: | :---: | :---: |
| **Truy cập Giao diện POS** | `admin.access` | ✅ | ✅ | ✅ |
| **Xem Đơn hàng** | `orders.read` | ✅ | ✅ | ✅ |
| **Xử lý Đơn hàng (Xác nhận, Hủy, Đổi trạng thái)** | `orders.write` | ✅ | ✅ | ✅ |
| **Xem Danh sách Món ăn trong Admin** | `catalog.read` | ✅ | ✅ | ✅ |
| **Sửa Thông tin Master Món ăn (Tên, Giá, Mô tả, Tùy chọn)** | `catalog.write` | ✅ | ❌ | ⚙️ Tùy chọn |
| **Cập nhật Tồn kho Chi nhánh** | `inventory.read` / `inventory.write` | ✅ | ✅ | ✅ |
| **Khóa / Mở bán Món ăn Hôm nay** | `menu.status.write` | ✅ | ❌ | ⚙️ Tùy chọn |
| **Xóa Món ăn (Soft Delete) & Khôi phục** | `catalog.delete` | ✅ | ❌ | ⚙️ Tùy chọn (Cảnh báo) |
| **Xem & Sửa Danh mục Món ăn** | `categories.read` / `categories.write` | ✅ | ❌ (Chỉ xem) | ⚙️ Tùy chọn |
| **Xem Báo cáo Chi nhánh được gán** | `reports.read.branch` | ✅ | ✅ | ✅ |
| **Xem Báo cáo Toàn Cửa hàng** | `reports.read.store` | ✅ | ❌ | ⛔ Cấm cấp |
| **Tạo Tài khoản Nhân viên** | `staff.manage` | ✅ | ❌ | ⚙️ Tùy chọn |
| **Phân quyền Nhân viên Khác** | `staff.rules.manage` | ✅ | ❌ | ⛔ Cấm cấp |
| **Cấu hình Cửa hàng & Telegram** | `settings.manage` | ✅ | ❌ | ⛔ Cấm cấp |
| **Reset Dữ liệu Hệ thống** | `system.reset` | ✅ | ❌ | ⛔ Cấm cấp |

---

## 🔒 Quy tắc Phân quyền & Bảo mật P0

1. **Cơ chế Chế độ Quyền (permissionMode)**:
   - `DEFAULT`: Sử dụng tập quyền mặc định theo Role.
   - `CUSTOM`: Sử dụng tập quyền `assignedPermissions` riêng đã được Admin cấu hình.
2. **Whitelist Guard (Ngăn chặn Cấp quyền Nhạy cảm)**:
   - Các quyền `staff.rules.manage`, `settings.manage`, `system.reset`, `reports.read.store`, `owner.admin` thuộc danh sách **Cấm cấp cho Nhân viên**. Backend API và Frontend Drawer sẽ chặn tuyệt đối việc chọn các quyền này cho role `STAFF`.
3. **Mở rộng Phụ thuộc Tự động (Dependency Expansion)**:
   - Khi cấp quyền ghi (`orders.write`, `catalog.write`, `inventory.write`, `categories.write`, `menu.status.write`, `catalog.delete`), hệ thống tự động bật quyền đọc tương ứng (`orders.read`, `catalog.read`, `inventory.read`, `categories.read`).
   - Ngược lại, khi uncheck quyền đọc, hệ thống tự động tắt các quyền ghi phụ thuộc.
4. **Đồng bộ Session Động (Dynamic Session Auth Sync)**:
   - Middleware `requireAuth` kiểm tra trực tiếp tài khoản từ DB trong mỗi HTTP request.
   - Việc khóa tài khoản hoặc sửa phân quyền có **hiệu lực ngay lập tức** mà không bắt buộc nhân viên phải đăng xuất / đăng nhập lại.
5. **Quy tắc Trạng thái Món ăn & Soft Delete**:
   - `active = false` (Tạm ngưng bán): Vẫn hiển thị trên Storefront nhưng mờ card, gắn badge "Tạm ngưng bán", disabled nút thêm/quickview.
   - `stockQuantity = 0` (Hết hàng): Vẫn hiển thị trên Storefront, gắn badge "Hết hàng", disabled nút đặt.
   - `deletedAt != null` (Đã xóa): **Không hiển thị** trên Storefront, giữ snapshot trong đơn hàng cũ, có thể khôi phục từ Admin.

