# Documentation Map — food-order-bridge

Tài liệu dự án được cấu trúc theo chuẩn hóa để làm "Nguồn sự thật" (Single Source of Truth) duy nhất cho toàn bộ hệ thống Food POS Multi-Tenant.

## 📁 Cấu trúc Thư mục Tài liệu

```
docs/
├── README.md                          # Bản đồ tài liệu hệ thống (Tệp này)
├── product/                           # Tài liệu Nghiệp vụ & Sản phẩm
│   ├── terminology.md                 # Định nghĩa Thuật ngữ chuẩn
│   ├── business-rules.md              # Quy tắc Nghiệp vụ (Kho, Giá, Đơn hàng, Webhook)
│   ├── roles-permissions.md           # Ma trận Phân quyền (Permission Matrix)
│   └── user-flows.md                  # Các luồng trải nghiệm Người dùng
├── architecture/                      # Tài liệu Kiến trúc Kỹ thuật
│   ├── system-overview.md             # Tổng quan Hệ thống
│   ├── multi-tenancy.md               # Chiến lược Multi-Tenancy & Tenant Isolation
│   ├── authentication.md              # Luồng Auth, Session & Super Admin Realm
│   ├── data-model.md                  # Mongo Schemas, Indexes & Scoping
│   ├── api-contracts.md               # Chuẩn giao tiếp RESTful API
│   └── integrations.md                # Tích hợp Telegram, VietQR, Webhook
├── adr/                               # Architecture Decision Records
│   ├── 0001-multi-tenant-strategy.md  # Quyết định kiến trúc Multi-Tenant
│   ├── 0002-branch-context.md         # Quyết định cơ chế Session-Bound Tenant Context
│   └── 0003-super-admin-auth.md       # Quyết định tách biệt Super Admin Auth Realm
├── testing/                           # Chiến lược Kiểm thử
│   ├── test-strategy.md               # Quy chuẩn Kiểm thử theo Phase (Definition of Done)
│   └── tenant-isolation-cases.md      # Test matrix cho Cô lập Dữ liệu Tenant
└── runbooks/                          # Quy trình Vận hành & Deployment
    ├── data-migration.md              # Kịch bản Chuyển đổi Dữ liệu Legacy
    ├── rollback.md                    # Quy trình Rollback sự cố
    └── create-store-branch.md         # Hướng dẫn tạo Cửa hàng & Chi nhánh mới
```

## 📜 Nguyên tắc Cập nhật Tài liệu

1. **Đồng bộ với Mã nguồn**: Khi có bất kỳ thay đổi nào về API, Schema hoặc Business Logic, file tài liệu tương ứng **PHẢI** được cập nhật trong cùng một thay đổi code.
2. **Kiểm tra trước khi Thực thi**: Tất cả Developer và Agent phải tra cứu `docs/README.md` trước khi tiến hành viết code cho tính năng mới.
