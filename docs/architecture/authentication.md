# Luồng Đăng nhập & Xác thực (Authentication & Session)

Tài liệu chi tiết cơ chế Đăng nhập và Session trong hệ thống Multi-Tenant.

## 1. Luồng Đăng nhập Merchant (Store Owner & Staff)

```mermaid
sequenceDiagram
    autonumber
    actor Merchant as Người dùng (Owner / Staff)
    participant Front as Frontend (/login)
    participant AuthAPI as Auth Service
    participant DB as Mongo DB

Merchant->>Front: Nhập username hoặc SĐT (e.g. 0912345678) & Mật khẩu
Front->>AuthAPI: POST /api/auth/phone-login { phone, password }
AuthAPI->>AuthAPI: Nếu là SĐT, chuẩn hóa về E.164; nếu không, giữ username
AuthAPI->>DB: Tìm User theo phoneNormalized hoặc username
    DB-->>AuthAPI: Trả về User record & Store status
    AuthAPI->>AuthAPI: Xác thực scrypt password hash
    AuthAPI->>AuthAPI: Lấy danh sách Branch khả dụng của User
    AuthAPI-->>Front: Set HttpOnly pre-session cookie + Danh sách Branch
    Front->>Merchant: Hiển thị Màn hình Chọn Chi nhánh
    Merchant->>Front: Chọn Chi nhánh X (branchId_X)
    Front->>AuthAPI: POST /api/auth/select-branch { branchId_X }
    AuthAPI->>AuthAPI: Verify user có quyền truy cập branchId_X
    AuthAPI-->>Front: Trả về Official Session Cookie (chứa storeId, branchId)
    Front->>Merchant: Chuyển hướng tới /pos Dashboard
```

## 2. Thông tin đăng nhập merchant & Phân vùng Nhân viên (Store-Scoped Staff)

- **Chủ cửa hàng (Store Owner)**:
  - Đăng nhập bằng số điện thoại di động Việt Nam (được chuẩn hóa sang định dạng E.164, ví dụ `0912 345 678` -> `+84912345678`).
  - Số điện thoại là định danh duy nhất toàn hệ thống (Sparse Unique Index trên `phoneNormalized`).

- **Nhân viên (Staff)**:
  - Do Chủ cửa hàng tạo trực tiếp trong Admin POS (`POST /api/auth/staff`).
  - Tên đăng nhập của nhân viên được phân vùng theo từng Cửa hàng (`storeId`) với **Compound Unique Index: `{ storeId: 1, username: 1 }`**.
  - Các cửa hàng khác nhau có thể tạo nhân viên có cùng tên đăng nhập (ví dụ Cửa hàng A và Cửa hàng B đều có thể có nhân viên tên `ddn` hoặc `nv01`).
  - Khi nhân viên đăng nhập tại `/login.html`:
    - Hỗ trợ cú pháp gắn Store Key: `MãQuán/username` (ví dụ `STOREA/ddn`), `STOREA:ddn`, hoặc `ddn@STOREA`.
    - Nếu nhập username đơn thuần (`ddn`) và username này là duy nhất trong toàn hệ thống, hệ thống tự động đăng nhập. Nếu username tồn tại ở nhiều quán, hệ thống sẽ trả về thông báo hướng dẫn nhân viên nhập kèm mã quán.

## 3. Chuẩn hóa Số điện thoại E.164
Tất cả các số điện thoại đầu vào được quy chuẩn về định dạng E.164 trước khi lưu vào DB hoặc tìm kiếm:
- `0912345678` -> `+84912345678`
- `84912345678` -> `+84912345678`
- `+84912345678` -> `+84912345678`

## 4. Super Admin Dedicated Auth Realm
Tài khoản Super Admin hoàn toàn tách biệt với merchant database:
- Khu vực đăng nhập riêng: `/super-admin/login`
- Đăng nhập sử dụng biến môi trường: `SUPER_ADMIN_PHONE`, `SUPER_ADMIN_PASSWORD_HASH`, `SUPER_ADMIN_AUTH_SECRET`.

## 5. Merchant workspace bootstrap

Sau khi session chính được tạo, frontend gọi `GET /api/auth/bootstrap`. API kiểm tra
`storeId`/`branchId` từ chữ ký session rồi trả về metadata cửa hàng, các chi nhánh mà
người dùng được phép truy cập, quyền và catalog đã lọc theo `storeId`. Frontend không
được lấy `storeId` hoặc `branchId` từ query/body để quyết định phạm vi dữ liệu.

`GET /` và `/admin.html` là merchant entry points. Nếu chưa có session, server redirect
đến `/login.html`; static middleware không còn được phép phục vụ dashboard admin trước
khi qua guard xác thực.
