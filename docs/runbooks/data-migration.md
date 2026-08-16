# Runbook: MongoDB Index Migration — Multi-Tenant Staff Username Scoping

Tài liệu hướng dẫn quy trình chuyển đổi và cập nhật Index MongoDB an toàn trên môi trường Production.

---

## 🎯 Mục tiêu
Chuyển đổi chỉ mục duy nhất toàn cầu cũ (`username_1`) sang chỉ mục kết hợp theo Cửa hàng (`storeId_1_username_1` với `unique: true`), cho phép các cửa hàng khác nhau có thể tạo nhân viên trùng tên đăng nhập mà không bị xung đột `E11000 duplicate key error`.

---

## 📋 Quy trình Thực thi An toàn (Step-by-Step)

### Bước 1: Sao lưu dữ liệu Collection `users` (Backup)
Trước khi thực hiện bất kỳ thao tác thay đổi index nào trên cơ sở dữ liệu production, xuất bản sao lưu:
```bash
mongodump --uri="<MONGODB_URI>" --collection=users --out=./backup-users-$(date +%F)
```

### Bước 2: Kiểm tra các bản ghi trùng lặp trong cùng Cửa hàng (Audit)
Mở MongoDB Shell (`mongosh`) và chạy script kiểm tra:
```javascript
db.users.aggregate([
  {
    $group: {
      _id: { storeId: "$storeId", username: "$username" },
      count: { $sum: 1 },
      docs: { $push: "$_id" }
    }
  },
  {
    $match: {
      count: { $gt: 1 }
    }
  }
]);
```
*Ghi chú: Nếu có bản ghi trùng lặp trong cùng một `storeId`, cần đổi tên username của bản ghi phụ trước khi tạo index unique.*

### Bước 3: Xóa Index cũ `username_1` (Drop Legacy Index)
Kiểm tra danh sách index hiện tại:
```javascript
db.users.getIndexes();
```
Xóa index cũ nếu tồn tại:
```javascript
db.users.dropIndex("username_1");
```

### Bước 4: Tạo Compound Unique Index mới
Tạo compound index mới kết hợp `storeId` và `username`:
```javascript
db.users.createIndex(
  { storeId: 1, username: 1 },
  { unique: true, background: true }
);
```

### Bước 5: Kiểm tra và Xác nhận (Verify)
Chạy lệnh kiểm tra danh sách index sau migration:
```javascript
db.users.getIndexes();
```
Kết quả mong đợi:
```json
[
  { "v": 2, "key": { "_id": 1 }, "name": "_id_" },
  { "v": 2, "key": { "storeId": 1, "username": 1 }, "name": "storeId_1_username_1", "unique": true }
]
```
Thử insert 2 user cùng username ở 2 `storeId` khác nhau để kiểm tra tính hợp lệ.
