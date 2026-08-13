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

    Merchant->>Front: Nhập SĐT (e.g. 0912345678) & Mật khẩu
    Front->>AuthAPI: POST /api/auth/login { phone, password }
    AuthAPI->>AuthAPI: Chuẩn hóa SĐT về E.164 (+84912345678)
    AuthAPI->>DB: Tìm User theo phoneNormalized
    DB-->>AuthAPI: Trả về User record & Store status
    AuthAPI->>AuthAPI: Xác thực scrypt password hash
    AuthAPI->>AuthAPI: Lấy danh sách Branch khả dụng của User
    AuthAPI-->>Front: Trả về JWT Pre-Session Token + Danh sách Branch
    Front->>Merchant: Hiển thị Màn hình Chọn Chi nhánh
    Merchant->>Front: Chọn Chi nhánh X (branchId_X)
    Front->>AuthAPI: POST /api/auth/select-branch { preToken, branchId_X }
    AuthAPI->>AuthAPI: Verify user có quyền truy cập branchId_X
    AuthAPI-->>Front: Trả về Official Session Cookie (chứa storeId, branchId)
    Front->>Merchant: Chuyển hướng tới /pos Dashboard
```

## 2. Chuẩn hóa Số điện thoại E.164
Tất cả các số điện thoại đầu vào được quy chuẩn về định dạng E.164 trước khi lưu vào DB hoặc tìm kiếm:
- `0912345678` -> `+84912345678`
- `84912345678` -> `+84912345678`
- `+84912345678` -> `+84912345678`

## 3. Super Admin Dedicated Auth Realm
Tài khoản Super Admin hoàn toàn tách biệt với merchant database:
- Khu vực đăng nhập riêng: `/super-admin/login`
- Đăng nhập sử dụng biến môi trường: `SUPER_ADMIN_PHONE`, `SUPER_ADMIN_PASSWORD_HASH`, `SUPER_ADMIN_AUTH_SECRET`.
