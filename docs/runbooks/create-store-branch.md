# Runbook: tạo Store và Branch

1. Cấu hình `SUPER_ADMIN_PHONE`, `SUPER_ADMIN_PASSWORD_HASH` và
   `SUPER_ADMIN_AUTH_SECRET` trên môi trường production.
2. Mở `/super-admin/index.html`, đăng nhập Super Admin.
3. Tạo Store với mã, tên, slug và số điện thoại/mật khẩu Owner. Số điện thoại phải là
   số di động Việt Nam hợp lệ.
4. Dùng nút **Chi nhánh** của Store để thêm Branch. Chỉ Super Admin có API này; Owner
   không tự tạo Branch.
5. Gửi số điện thoại và mật khẩu Owner cho chủ cửa hàng qua kênh bảo mật. Owner đăng
   nhập tại `/login.html`, chọn Branch và kiểm tra badge Store/Branch trên POS.
6. Khi khóa Store hoặc Branch, session cũ sẽ không thể chọn lại Branch đó; kiểm tra
   `/api/auth/bootstrap` sau khi thay đổi trạng thái.

Không dùng tài khoản mặc định trong source hoặc commit password/hash thật vào repository.
