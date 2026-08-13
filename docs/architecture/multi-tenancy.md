# Kiến trúc Multi-Tenancy & Cô lập Dữ liệu

Tài liệu quy định giải pháp kỹ thuật cho tính năng Multi-Tenant (Cửa hàng → Chi nhánh).

## 1. Mô hình Phân vùng Dữ liệu (Shared Database, Discriminator Columns)
Hệ thống sử dụng chung một Database MongoDB duy nhất. Phân vùng dữ liệu được thực hiện bằng cách gắn trường phân định (`storeId` và `branchId`) vào mọi tài nguyên.

```
                    ┌─────────────────────────┐
                    │    MongoDB Collection   │
                    └────────────┬────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
┌─────────────────────┐                     ┌─────────────────────┐
│   Store A Data      │                     │   Store B Data      │
│ (storeId = "st_a")  │                     │ (storeId = "st_b")  │
└─────────────────────┘                     └─────────────────────┘
```

## 2. Fail-Safe Tenant Context Guard

Tất cả các repository method bắt buộc nhận `tenantContext` làm tham số đầu tiên:

```javascript
// Cú pháp repository bắt buộc:
async function findOrderById(tenantCtx, orderId) {
  assertTenantContext(tenantCtx); // Throws error if storeId is missing
  return await OrderModel.findOne({ storeId: tenantCtx.storeId, branchId: tenantCtx.branchId, id: orderId });
}
```

Nếu `tenantCtx` rỗng hoặc thiếu `storeId`, `assertTenantContext` ném lỗi `TenantContextMissingError` lập tức để dừng request, ngăn ngừa lọt dữ liệu.

## 3. Session-Bound Context
- Context của request đăng nhập được lưu trong JWT Token đã ký HMAC.
- Không nhận `storeId` hoặc `branchId` từ request body như nguồn tin cậy.

## 4. Trạng thái triển khai hiện tại

- Merchant catalog (`/api/menu`, `/api/categories`) và merchant order listing/report đã
  có các repository method scoped theo `storeId`; tồn kho MongoDB dùng
  `BranchInventory(storeId, branchId, menuItemId)` khi session có Branch.
- Chế độ JSON legacy vẫn là single-tenant fallback (`legacy-store`) để giữ tương thích dữ
  liệu cũ; không dùng chế độ này làm backend production cho nhiều Store.
- Các method legacy không nhận context chỉ được giữ cho storefront/migration và test tương
  thích. Tính năng mới phải dùng method `*ForTenant` và fail-fast bằng `assertTenantContext`.
