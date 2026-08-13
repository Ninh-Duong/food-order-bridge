# Chiến lược Kiểm thử & Tiêu chuẩn Đầu ra (Phase Test Strategy & Gate Criteria)

Tài liệu này quy định **Chiến lược Kiểm thử phòng ngừa bug (Zero-Bug Policy)** cho từng Phase từ Phase 0 đến Phase 8.

---

## 🎯 Nguyên tắc Cốt lõi: Gate Criteria (Tiêu chuẩn Chuyển Phase)

> [!IMPORTANT]
> - Một Phase **CHỈ ĐƯỢC COI LÀ HOÀN THÀNH** khi tất cả các bài test cũ (100% existing test suite) và bài test mới của Phase đó vượt qua (Pass 100%).
> - Không chuyển Phase nếu còn bất kỳ test failure hoặc lọt lỗi tenant isolation.

---

## 📋 Danh sách 9 Phase & Kịch bản Test Chi tiết

### Phase 0: Foundation & Governance (Tài liệu & Test Suite Nền)
* **Mục tiêu**: Thiết lập tài liệu chuẩn, AGENTS.md, Skill quy trình và đảm bảo bộ test hiện tại pass 100%.
* **Kịch bản Test bắt buộc**:
  - `npm test`: Đảm bảo 124 test suites hiện tại vượt qua 100%.
  - Markdown Linter: Đảm bảo không vỡ liên kết và mermaid chart hợp lệ.

### Phase 1: Tenant Foundation (Database Models & Fail-Safe Repository)
* **Mục tiêu**: Thêm `Store`, `Branch`, `AuditLog`, gắn `storeId`/`branchId` vào Schemas & Repository Guard.
* **Kịch bản Test mới**:
  - `test/tenant-context.test.js`: Thử gọi repository mà KHÔNG truyền `storeId` -> Phải throw `TenantContextMissingError` (Fail-Fast).
  - `test/store-branch-model.test.js`: Kiểm tra tạo Store, Branch và compound unique index thành công.

### Phase 2: Migration Dữ liệu Legacy
* **Mục tiêu**: Chuyển dữ liệu cũ sang `legacy-store` và `legacy-branch`.
* **Kịch bản Test mới**:
  - `test/data-migration.test.js`: Dry-run migration trên dữ liệu giả lập, đảm bảo tổng số lượng `Order`, `MenuItem`, `Category`, `User` trước và sau migration khớp 100%.

### Phase 3: Authentication & Multi-Branch Session
* **Mục tiêu**: Đăng nhập bằng SĐT E.164, chọn Chi nhánh, JWT Session đã ký.
* **Kịch bản Test mới**:
  - `test/auth-e164-phone.test.js`: Kiểm tra chuẩn hóa `0912...`, `8491...`, `+8491...` về E.164.
  - `test/branch-selection.test.js`: User không thuộc Branch A thử chọn Branch A -> Phải trả HTTP 403 Forbidden.

### Phase 4: Super Admin Backend Realm
* **Mục tiêu**: APIs riêng cho Super Admin (`/super-admin/login`, CRUD Store, CRUD Branch).
* **Kịch bản Test mới**:
  - `test/super-admin-auth.test.js`: Đăng nhập Super Admin bằng env credentials.
  - `test/super-admin-merchant-isolation.test.js`: Super Admin token thử gọi API Merchant -> Phải bị từ chối. Merchant token thử gọi API Super Admin -> Phải bị từ chối 403.

### Phase 5: Super Admin & Merchant UI
* **Mục tiêu**: Trang đăng nhập SĐT, Branch Selector, Header Switcher, Responsive Super Admin Dashboard.
* **Kịch bản Test mới**:
  - E2E / In-App Browser Test: Thao tác đăng nhập -> chọn chi nhánh -> đổi chi nhánh trên Header -> verify session payload trên UI.

### Phase 6: Refactor Scoping Nghiệp vụ Chi tiết
* **Mục tiêu**: Chuyển Menu, Kho, Order, Payment Webhook, Telegram, Job hết hạn sang Tenant Scope.
* **Kịch bản Test mới**:
  - `test/tenant-isolation-orders.test.js`: Store A tạo đơn -> Store B query danh sách đơn -> Phải không thấy đơn của Store A.
  - `test/webhook-tenant-routing.test.js`: Webhook chuyển khoản kèm mã đơn Store A -> Hệ thống cập nhật đúng đơn Store A.

### Phase 7: Comprehensive Security Hardening & Tenant Isolation E2E
* **Mục tiêu**: Kiểm thử xâm nhập (Penetration Test), khóa Store, khóa Staff, kiểm tra va chạm ID.
* **Kịch bản Test mới**:
  - `test/security-store-lockout.test.js`: Khóa Store A -> Tất cả Staff & Owner của Store A bị ngắt session lập tức.

### Phase 8: Cutover & Production Deployment
* **Mục tiêu**: Deploy Production, dry-run backfill, bật index mới, chuyển đổi hệ thống an toàn.
* **Kịch bản Test bắt buộc**:
  - Production Healthcheck API & Sanity Smoke Test.
