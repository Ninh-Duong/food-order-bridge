# Luồng người dùng chuẩn

## Merchant

1. Truy cập `/` hoặc `/admin.html` và được chuyển tới `/login.html` nếu chưa có session.
2. Nhập username do chủ cửa hàng cấp (hoặc số điện thoại di động Việt Nam đối với tài khoản cũ) và mật khẩu.
3. Server tìm tài khoản theo username hoặc chuẩn hóa số điện thoại, xác thực mật khẩu, kiểm tra Store đang `ACTIVE`.
4. Nếu tài khoản có nhiều chi nhánh, chọn một chi nhánh trong danh sách được cấp; lựa chọn được xác minh lại theo `storeId` trong session.
5. Server tạo HttpOnly session chứa `storeId`, `branchId`, role và permissions.
6. Frontend gọi `/api/auth/bootstrap`, tải metadata và catalog thuộc Store hiện tại, rồi mở POS.
7. Owner có thể quản lý nhân viên/cấu hình; Staff chỉ thấy và gọi các chức năng theo permission.

## Super Admin

Super Admin đăng nhập bằng realm riêng và thông tin cấu hình từ ENV. Super Admin có thể
tạo/khóa Store, tạo/khóa Branch và điều chỉnh giới hạn Branch. Chủ cửa hàng không có API
để tự tạo Branch; khi cần thêm Branch phải liên hệ Super Admin.

## Chuyển chi nhánh

POS gửi `POST /api/auth/switch-branch` với `branchId`. Server chỉ chấp nhận Branch đang
`ACTIVE`, có cùng `storeId` với session và nằm trong danh sách được cấp cho Staff.
