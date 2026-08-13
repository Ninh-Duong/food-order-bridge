# Tổng quan hệ thống

Food Order Bridge được tổ chức theo ba scope:

- **SYSTEM**: Super Admin realm, Store/Branch registry và audit log toàn hệ thống.
- **STORE**: owner, catalog, cấu hình và nhân viên của một cửa hàng.
- **BRANCH**: ca làm, tồn kho và đơn hàng phát sinh tại chi nhánh đang chọn.

Luồng request merchant đi qua session parser, permission guard và tenant context trước khi
đến service/repository. Các repository mới phải nhận `{ storeId, branchId }` ở tham số đầu
tiên và fail-fast nếu thiếu `storeId`. Legacy data được gắn `legacy-store` và
`legacy-main-branch` bởi migration để không làm mất dữ liệu hiện hữu.
