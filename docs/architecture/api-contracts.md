# API contracts — Merchant workspace

## Session

- `POST /api/auth/phone-login`: nhận `{ phone, password }`, trong đó `phone` có thể là
  số điện thoại Việt Nam hoặc username của tài khoản nhân viên; trả về user và danh sách Branch.
  Với nhiều Branch, token tạm được giữ trong HttpOnly cookie `merchant_pre_session`.
- `POST /api/auth/select-branch`: nhận `{ branchId }`, tạo `admin_session` HttpOnly.
- `POST /api/auth/switch-branch`: yêu cầu `admin_session`, đổi Branch trong cùng Store.
- `GET /api/auth/bootstrap`: yêu cầu session; trả về `user`, `store`, `branches`,
  `activeBranch`, `permissions`, `catalog`.
- `POST /api/auth/logout`: xóa merchant và Super Admin cookies.

## Authorization

Các route ghi dữ liệu phải lấy tenant context từ session đã ký. `storeId`/`branchId` trong
request body hoặc query không được dùng làm nguồn tin cậy. `admin.access` cho phép mở POS;
`owner.admin` dành cho các API quản trị Store Owner; các permission còn lại giới hạn theo
nghiệp vụ.

## Error contract

- `401`: thiếu hoặc hết hạn session.
- `403`: session hợp lệ nhưng thiếu permission hoặc Branch không thuộc tài khoản.
- `409`: yêu cầu thao tác merchant nhưng chưa chọn Branch.
