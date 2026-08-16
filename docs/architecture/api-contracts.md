# API contracts — Merchant workspace

## Session & Staff Management

- `POST /api/auth/phone-login`: nhận `{ phone, password }`, trong đó `phone` có thể là số điện thoại Việt Nam hoặc username của tài khoản nhân viên; trả về user và danh sách Branch. Với nhiều Branch, token tạm được giữ trong HttpOnly cookie `merchant_pre_session`.
- `POST /api/auth/select-branch`: nhận `{ branchId }`, tạo `admin_session` HttpOnly.
- `POST /api/auth/switch-branch`: yêu cầu `admin_session`, đổi Branch trong cùng Store.
- `GET /api/auth/bootstrap`: yêu cầu session; trả về `user`, `store`, `branches`, `activeBranch`, `permissions`, `catalog`.
- `GET /api/auth/staff`: yêu cầu `staff.manage` hoặc `staff.rules.manage`. Trả về danh sách nhân viên của cửa hàng kèm `permissionMode`, `assignedPermissions`, `effectivePermissions`.
- `GET /api/auth/permissions/catalog`: yêu cầu `staff.rules.manage`. Trả về danh mục permission được phép gán cho staff.
- `PUT /api/auth/staff/:id/permissions`: yêu cầu `staff.rules.manage`. Nhận `{ permissionMode: 'DEFAULT'|'CUSTOM', permissions: [...] }`.
- `PATCH /api/auth/staff/:id/status`: yêu cầu `staff.manage` hoặc `staff.rules.manage`. Nhận `{ active: boolean }`.
- `POST /api/auth/logout`: xóa merchant và Super Admin cookies.

## Catalog & Inventory Management

- `GET /api/menu`: công khai / optionalAuth. Mặc định chỉ trả về các món chưa bị soft-delete (`deletedAt: null`). Hỗ trợ query `?includeDeleted=true` đối với người dùng có `catalog.read`.
- `POST /api/menu`: yêu cầu `catalog.write`. Tạo mới hoặc cập nhật thông tin master món (tên, giá gốc, danh mục, mô tả, ảnh, tùy chọn).
- `PATCH /api/menu/:id/inventory`: yêu cầu `inventory.write`. Cập nhật tồn kho theo `{ stockQuantity: number }`.
- `PUT /api/menu/:id/status`: yêu cầu `menu.status.write`. Bật/tắt trạng thái kinh doanh hôm nay theo `{ active: boolean }`.
- `DELETE /api/menu/:id`: yêu cầu `catalog.delete`. Soft-delete món ăn (`deletedAt = new Date()`, `deletedBy = userId`).
- `POST /api/menu/:id/restore`: yêu cầu `catalog.delete`. Khôi phục món đã bị soft-delete.

## Authorization & Security

Các route ghi dữ liệu phải lấy tenant context từ session đã ký. `storeId`/`branchId` trong request body hoặc query không được dùng làm nguồn tin cậy. Mọi API check permission thông qua `getEffectivePermissions` và DB status dynamic lookup.

## Error contract

- `401`: thiếu/hết hạn session hoặc tài khoản bị khóa/không tồn tại.
- `403`: session hợp lệ nhưng thiếu permission phù hợp hoặc chi nhánh không thuộc tài khoản.
- `409`: xung đột tồn kho hoặc chưa chọn Branch.
- `422`: dữ liệu đầu vào không hợp lệ hoặc món ăn đang tạm ngưng bán / đã bị xóa.

