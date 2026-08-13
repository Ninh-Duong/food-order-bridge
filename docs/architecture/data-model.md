# Mô hình Dữ liệu (Data Model & Mongo Schemas)

Tài liệu chi tiết cấu trúc Schema và Compound Index trong hệ thống Multi-Tenant.

## 1. Core Models

### Store Schema
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

### Branch Schema
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

### User Schema
- `id`: String (PK, UUID)
- `storeId`: String (FK -> Store, Index)
- `phoneNormalized`: String (Unique, E.164, e.g. `+84912345678`)
- `phoneDisplay`: String (e.g. `0912 345 678`)
- `passwordHash`: String (scrypt format)
- `role`: String Enum (`STORE_OWNER`, `STAFF`)
- `branchIds`: Array of String (FK -> Branch)
- `active`: Boolean
- `lastLoginAt`: Date
- `createdAt`, `updatedAt`: Date

## 2. Business Scoped Models

### Category Schema
- `storeId`: String (FK -> Store)
- `id`: String
- `name`: String
- `slug`: String
- Index: Compound `{ storeId: 1, id: 1 }` Unique, `{ storeId: 1, slug: 1 }` Unique.

### MenuItem Schema
- `storeId`: String (FK -> Store)
- `id`: String
- `name`: String
- `categoryId`: String
- `price`: Number
- Index: Compound `{ storeId: 1, id: 1 }` Unique.

### BranchInventory Schema
- `storeId`: String (FK -> Store)
- `branchId`: String (FK -> Branch)
- `menuItemId`: String (FK -> MenuItem)
- `stockQuantity`: Number
- `priceOverride`: Number (Optional)
- `active`: Boolean
- Index: Compound `{ storeId: 1, branchId: 1, menuItemId: 1 }` Unique.

### Order Schema
- `storeId`: String (FK -> Store)
- `branchId`: String (FK -> Branch)
- `id`: String
- `requestId`: String (Unique)
- `items`: Array
- `totalPrice`: Number
- Index: Compound `{ storeId: 1, branchId: 1, id: 1 }` Unique.
