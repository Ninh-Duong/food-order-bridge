# Mô hình Dữ liệu (Data Model & Mongo Schemas)

Tài liệu chi tiết cấu trúc Schema, Compound Unique Index và cơ chế phân vùng Multi-Tenant trong MongoDB.

---

## 1. Core Models

### Store Schema (`StoreModel`)
- `id`: String (PK, UUID)
- `code`: String (Unique, uppercase, e.g. `STORE01`)
- `name`: String
- `slug`: String (Unique)
- `phone`: String (E.164)
- `email`: String
- `status`: String Enum (`ACTIVE`, `SUSPENDED`)
- `primaryOwnerId`: String (FK -> User)
- `plan`: String (`FREE`, `PRO`, `ENTERPRISE`)
- `maxBranches`: Number (default: 5)
- `createdAt`, `updatedAt`: Date

### Branch Schema (`BranchModel`)
- `id`: String (PK, UUID)
- `storeId`: String (FK -> Store, Index)
- `code`: String (e.g. `CS01`)
- `name`: String
- `slug`: String
- `phone`: String
- `address`: String
- `timezone`: String (default: `Asia/Ho_Chi_Minh`)
- `status`: String Enum (`ACTIVE`, `INACTIVE`)
- `createdAt`, `updatedAt`: Date
- **Indexes**: Compound `{ storeId: 1, code: 1 }` Unique.

### User Schema (`UserModel`)
- `id`: String (PK, UUID)
- `storeId`: String (FK -> Store, Index, default: `'legacy-store'`)
- `username`: String (required, lowercase, trim)
- `phoneNormalized`: String (Sparse Index, E.164, e.g. `+84912345678`)
- `phoneDisplay`: String (e.g. `0912 345 678`)
- `passwordHash`: String (scrypt format `salt:hash`)
- `role`: String Enum (`admin`, `staff`, `STORE_OWNER`, `STAFF`)
- `branchIds`: Array of String (FK -> Branch)
- `permissionMode`: String Enum (`DEFAULT`, `CUSTOM`, default: `DEFAULT`)
- `assignedPermissions`: Array of String
- `active`: Boolean (default: `true`)
- `lastLoginAt`: Date
- `createdAt`, `updatedAt`: Date
- **Indexes**:
  - Compound Unique: `{ storeId: 1, username: 1 }` (Đảm bảo tên đăng nhập là duy nhất trong từng Cửa hàng).
  - Single Admin Partial Index: `{ role: 1 }` where `{ role: 'admin' }` Unique.

---

## 2. Business Scoped Models

### Category Schema (`CategoryModel`)
- `storeId`: String (FK -> Store)
- `id`: String (e.g. `COM`, `NUOC`)
- `name`: String
- `description`: String
- `sortOrder`: Number (default: 10)
- `active`: Boolean (default: `true`)
- `createdAt`, `updatedAt`: Date
- **Indexes**: Compound `{ storeId: 1, id: 1 }` Unique.

### MenuItem Schema (`MenuItemModel`)
- `storeId`: String (FK -> Store)
- `id`: String (e.g. `COM_GA`)
- `name`: String
- `categoryId`: String (FK -> Category)
- `price`: Number (Giá gốc)
- `discountPercent`: Number (0 - 100)
- `salePrice`: Number (Giá bán thực tế)
- `stockQuantity`: Number
- `customizationOptions`: Array of Object `{ id, name, defaultIncluded, active, sortOrder }`
- `image`: String (URL hoặc placeholder)
- `description`: String
- `active`: Boolean (Bật/Tắt bán hôm nay)
- `deletedAt`: Date (Soft delete timestamp)
- `deletedBy`: String (User ID thực hiện xóa)
- `createdAt`, `updatedAt`: Date
- **Indexes**: Compound `{ storeId: 1, id: 1 }` Unique.

### BranchInventory Schema (`BranchInventoryModel`)
- `storeId`: String (FK -> Store)
- `branchId`: String (FK -> Branch)
- `menuItemId`: String (FK -> MenuItem)
- `stockQuantity`: Number
- `priceOverride`: Number (Optional)
- `active`: Boolean
- **Indexes**: Compound `{ storeId: 1, branchId: 1, menuItemId: 1 }` Unique.

### Order Schema (`OrderModel`)
- `storeId`: String (FK -> Store)
- `branchId`: String (FK -> Branch)
- `id`: String (e.g. `FO-20260816-0001`)
- `requestId`: String (Unique Idempotency key)
- `customer`: Object `{ name, phone, address, note }`
- `items`: Array of Object `{ productId, name, price, quantity, excludedOptionIds }`
- `totalAmount`: Number
- `fulfillmentType`: String Enum (`DELIVERY`, `DINE_IN`)
- `orderStatus`: String Enum (`PENDING`, `PAID`, `CANCELLED`)
- `isPaid`: Boolean
- `paidAt`: Date
- `paidBy`: String
- `payment`: Object `{ method, paymentStatus, paymentAmount, paymentReference, qrImageUrl }`
- `createdAt`, `updatedAt`: Date
- **Indexes**: Compound `{ storeId: 1, branchId: 1, id: 1 }` Unique.

### Settings Schema (`SettingsModel`)
- `storeId`: String (FK -> Store)
- `key`: String
- `telegramBotToken`: String
- `telegramChatId`: String
- `shopName`: String
- `timezone`: String
- `updatedAt`: Date

### Telegram Settings Schema (`TelegramSettingsModel`)
- `storeId`: String (required)
- `branchId`: String hoặc `null`; `null` là Store default
- Telegram credential được mã hóa: `botTokenEncrypted`, `webhookSecretEncrypted`
- `chatId`, `recipientChatIds`: nơi nhận cảnh báo
- Feature flags: order created/cancelled, pending capacity, inventory, scheduled reports, chart
- Payment capacity: `pendingOrderLimit`, `pendingTimeoutMinutes`, `pendingScope`, `alertCooldownMinutes`
- Report schedule: daily/weekly/monthly time và `timezone`
- **Index**: Compound unique `{ storeId: 1, branchId: 1 }`

### Telegram Report Access (`TelegramReportAccessModel`)
- `storeId`, `branchId`, `telegramUserId`
- `canViewReports`, `canReceiveAlerts`, `active`
- **Index**: Compound unique `{ storeId: 1, branchId: 1, telegramUserId: 1 }`

### Telegram Delivery Log (`TelegramDeliveryLogModel`)
- Lưu trạng thái gửi scheduled report theo Store/Branch/period/recipient.
- Compound unique idempotency index chống gửi trùng sau restart hoặc deploy nhiều instance.

### AuditLog Schema (`AuditLogModel`)
- `actor`: String
- `actorRole`: String
- `action`: String (e.g. `CREATE_STORE`, `DELETE_STORE`, `UPDATE_PERMISSIONS`)
- `target`: String
- `storeId`: String
- `branchId`: String
- `details`: Object
- `timestamp`: Date
