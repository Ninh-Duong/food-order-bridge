# Thuật ngữ Hệ thống (Terminology)

Tài liệu chuẩn hóa danh xưng và khái niệm trong hệ thống Food POS Multi-Tenant.

| Thuật ngữ | Khái niệm & Phạm vi | Mô tả |
| :--- | :--- | :--- |
| **Super Admin** | Toàn hệ thống (Platform) | Tài khoản quản trị cấp cao nhất, cấu hình hệ thống từ biến môi trường. Không thuộc Cửa hàng nào. |
| **Store (Cửa hàng)** | Cấp Thương hiệu (Tenant) | Một thương hiệu kinh doanh (ví dụ: Phở Thìn). Có thông tin chủ cửa hàng (`primaryOwnerId`), danh mục món ăn chung. |
| **Branch (Chi nhánh)** | Cấp Địa điểm | Một cơ sở kinh doanh cụ thể thuộc Cửa hàng (ví dụ: Phở Thìn - Cơ sở 1 Quận 1). Quản lý tồn kho, đơn hàng và nhân viên làm việc tại chi nhánh. |
| **Store Owner** | Cửa hàng | Chủ sở hữu cửa hàng, quản lý toàn bộ các Chi nhánh thuộc Cửa hàng đó, có quyền quản lý món ăn, báo cáo, nhân viên và thiết lập cửa hàng. |
| **Staff** | Chi nhánh cụ thể | Nhân viên vận hành tại một hoặc nhiều Chi nhánh được gán. Có quyền nhận đơn, xử lý thanh toán, đổi trạng thái món ăn trong ca. |
| **Customer** | Storefront | Khách hàng truy cập trang đặt món của một Chi nhánh qua QR code hoặc URL để xem menu, tạo đơn và thanh toán. |
