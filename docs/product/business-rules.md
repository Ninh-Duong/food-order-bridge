# Quy tắc Nghiệp vụ (Business Rules)

Tài liệu quy định các quy tắc nghiệp vụ cốt lõi trong hệ thống Multi-Tenant.

## 1. Catalog Món ăn & Tồn kho Chi nhánh
- **Shared Catalog**: Danh mục (`Category`) và Món ăn (`MenuItem`) được tạo ở cấp Cửa hàng (`storeId`).
- **Branch Inventory**: Tồn kho (`stockQuantity`) và Trạng thái sẵn sàng (`active`) được quản lý riêng theo từng Chi nhánh (`branchId`).
- **Price Override**: Chi nhánh có thể ghi đè giá bán (`priceOverride`) so với giá niêm yết của Cửa hàng nếu cần.

## 2. Mã Đơn hàng & Idempotency
- **Cấu trúc Mã đơn**: Mã đơn hàng sinh theo định dạng `{storeCode}-{branchCode}-{YYYYMMDD}-{seq}` (Ví dụ: `PT-CS1-20260813-0001`).
- **Idempotency**: `requestId` gửi từ client để phòng chống gửi đơn trùng lặp phải là duy nhất toàn hệ thống (`unique: true`).

## 3. Webhook Thanh toán & Định danh Tenant
- **Nội dung chuyển khoản (Memo)**: Khi sinh QR chuyển khoản ngân hàng (VietQR / Momo), nội dung chuyển khoản bắt buộc theo định dạng chứa Mã đơn hàng unique.
- **Routing Webhook**: Bộ xử lý Webhook thanh toán giải mã mã đơn hàng để xác định chính xác `storeId` và `branchId` xử lý giao dịch.

## 4. Telegram Notification & Report Scope
- **Store / Branch Level**: Cấu hình Telegram (Bot Token, Chat ID) nằm tại `StoreSettings`. Nếu Chi nhánh có cấu hình riêng (`BranchSettings`), hệ thống sẽ ưu tiên gửi về Telegram Chi nhánh.
