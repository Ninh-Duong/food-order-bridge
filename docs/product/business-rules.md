# Quy tắc Nghiệp vụ (Business Rules)

Tài liệu quy định các quy tắc nghiệp vụ cốt lõi trong hệ thống Food POS Multi-Tenant.

---

## 1. Phân vùng Định danh Nhân viên (Store-Scoped Staff & Login)
- **Tên đăng nhập cấp Store**: Tên đăng nhập của nhân viên (`username`) được giới hạn theo từng Cửa hàng (`storeId`). Các cửa hàng khác nhau có thể tạo nhân viên trùng tên (ví dụ `ddn`, `nv01`).
- **Cơ chế Đăng nhập thông minh**:
  - Chủ quán: Đăng nhập bằng số điện thoại di động Việt Nam E.164.
  - Nhân viên: Hỗ trợ cú pháp gắn mã quán `MãQuán/username` (ví dụ `STORE_A/ddn`), `STORE_A:ddn`, hoặc `ddn@STORE_A`. Nếu username là duy nhất trong toàn hệ thống, nhân viên có thể chỉ nhập `ddn`.

---

## 2. Catalog Món ăn & Tồn kho Chi nhánh
- **Shared Catalog**: Danh mục (`Category`) và Món ăn (`MenuItem`) được tạo ở cấp Cửa hàng (`storeId`).
- **Branch Inventory**: Tồn kho (`stockQuantity`) và Trạng thái sẵn sàng (`active`) được quản lý riêng theo từng Chi nhánh (`branchId`).
- **Price Override**: Chi nhánh có thể ghi đè giá bán (`priceOverride`) so với giá niêm yết của Cửa hàng nếu cần.
- **Customization Options**: Món ăn có thể có các tùy chọn thành phần (`customizationOptions`). Đơn hàng lưu snapshot các tùy chọn loại bỏ (`excludedOptionIds`).

---

## 3. Mã Đơn hàng, Idempotency & Hình thức Phục vụ
- **Cấu trúc Mã đơn**: Mã đơn hàng sinh theo định dạng `{storeCode}-{branchCode}-{YYYYMMDD}-{seq}` (Ví dụ: `PT-CS1-20260813-0001`).
- **Idempotency**: `requestId` gửi từ client để phòng chống gửi đơn trùng lặp phải là duy nhất toàn hệ thống (`unique: true`). Khi nhận retry cùng `requestId`, hệ thống trả lại thông tin đơn đã tạo mà không trừ kho lần thứ 2.
- **Fulfillment Types**:
  - `DELIVERY` (Giao tận nơi): Bắt buộc có tên, số điện thoại VN hợp lệ (10 số) và địa chỉ chi tiết.
  - `DINE_IN` (Dùng tại quán): Hỗ trợ thanh toán tiền mặt hoặc chuyển khoản QR MoMo.

---

## 4. Xóa Cửa hàng Toàn diện (Super Admin Cascade Deletion)
- **Quy tắc An toàn**: Chỉ Super Admin có quyền xóa Cửa hàng (`DELETE /api/super-admin/stores/:id`).
- **Phạm vi Xóa**: Khi xóa một Cửa hàng, toàn bộ 8 nhóm dữ liệu (Cửa hàng, Chi nhánh, Tồn kho, Tài khoản nhân viên, Danh mục, Thực đơn, Đơn hàng, Cài đặt) sẽ bị xóa vĩnh viễn khỏi hệ thống.
- **Audit Logging**: Mọi hành động xóa đều được ghi nhận vào `AuditLog` hệ thống với action `DELETE_STORE`.

---

## 5. Telegram Notification & Report Scope
- **Store / Branch Level**: Cấu hình Telegram, cảnh báo đơn chờ thanh toán, lịch report và quyền report nằm tại `TelegramSettings`/`TelegramReportAccess` trong Database. Nếu Chi nhánh có cấu hình riêng, hệ thống ưu tiên Branch override; nếu không thì dùng Store default.
- **Tenant Notification Isolation**: Mọi cảnh báo và report phải được resolve bằng `storeId + branchId`; tuyệt đối không gửi dữ liệu của Store này tới Chat ID của Store khác.
- **Report Access**: Một Store/Branch có thể cấp quyền cho nhiều Telegram User ID xem report và khai báo nhiều Chat ID nhận cảnh báo tự động.
- **Báo cáo & Thống kê**: Hỗ trợ xem báo cáo doanh thu theo Hôm nay, Tuần này, Tháng này và xuất file PDF.
