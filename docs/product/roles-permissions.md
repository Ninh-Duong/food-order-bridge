# Ma trận Phân quyền (Permission Matrix)

Tài liệu quy định chi tiết quyền hạn giữa các vai trò trong hệ thống.

## 👥 Các Vai trò trong Hệ thống

1. **SUPER_ADMIN**: Quản trị viên hệ thống (Nền tảng).
2. **STORE_OWNER**: Chủ cửa hàng (Thương hiệu).
3. **STAFF**: Nhân viên vận hành Chi nhánh.
4. **CUSTOMER**: Khách hàng storefront.

---

## 📊 Ma trận Phân quyền Chi tiết

| Chức năng / Hành động | SUPER_ADMIN | STORE_OWNER | STAFF | CUSTOMER |
| :--- | :---: | :---: | :---: | :---: |
| **Tạo / Khóa Cửa hàng (Store)** | ✅ | ❌ | ❌ | ❌ |
| **Tạo / Khóa Chi nhánh (Branch)** | ✅ | ❌ | ❌ | ❌ |
| **Tạo / Reset Tài khoản Store Owner** | ✅ | ❌ | ❌ | ❌ |
| **Cấu hình Feature Flags & Giới hạn Branch** | ✅ | ❌ | ❌ | ❌ |
| **Xem Audit Log Toàn Hệ thống** | ✅ | ❌ | ❌ | ❌ |
| **Tạo & Quản lý Danh mục / Món ăn (Store Catalog)** | ❌ | ✅ | ❌ | ❌ |
| **Đổi giá niêm yết Món ăn** | ❌ | ✅ | ❌ | ❌ |
| **Cấu hình Telegram / Cài đặt Cửa hàng** | ❌ | ✅ | ❌ | ❌ |
| **Tạo & Gán Nhân viên (Staff) vào Chi nhánh** | ❌ | ✅ | ❌ | ❌ |
| **Xem Báo cáo Doanh thu Toàn Cửa hàng** | ❌ | ✅ | ❌ | ❌ |
| **Bật / Tắt trạng thái bán món tại Chi nhánh được gán** | ❌ | ✅ | ✅ | ❌ |
| **Cập nhật Tồn kho Chi nhánh được gán** | ❌ | ✅ | ✅ | ❌ |
| **Xử lý Đơn hàng (Duyệt, Đổi trạng thái, In hóa đơn)** | ❌ | ✅ | ✅ | ❌ |
| **Xem Báo cáo Ca / Ngày tại Chi nhánh được gán** | ❌ | ✅ | ✅ | ❌ |
| **Xem Menu / Đặt món / Thanh toán tại Storefront Chi nhánh** | ❌ | ❌ | ❌ | ✅ |

---

## 🔒 Nguyên tắc Bảo mật Phân quyền

1. **Owner không tự tạo Branch**: Để kiểm soát tài nguyên và tính phí gói dịch vụ, chỉ `SUPER_ADMIN` mới có quyền khởi tạo Chi nhánh mới. Khi Owner cần thêm chi nhánh, UI hiển thị thông báo: *"Cần thêm chi nhánh? Vui lòng liên hệ Super Admin"*.
2. **Staff Scope Containment**: Staff chỉ có quyền trên các `branchIds` được Store Owner gán trực tiếp. Mọi API call của Staff ngoài danh sách chi nhánh này đều bị ném lỗi `403 Forbidden`.
3. **POS access vs owner admin**: `admin.access` chỉ quyết định tài khoản được mở POS; `owner.admin` là quyền riêng cho các API quản trị Store Owner (nhân viên, reset, báo cáo toàn Store, settings). Staff có thể vào POS nhưng không vượt qua `owner.admin`.
