# ADR 0001: Chiến lược Kiến trúc Multi-Tenant (Shared Database)

* **Status**: Accepted
* **Date**: 2026-08-13
* **Deciders**: Software Architecture Team

## Context
Hệ thống `food-order-bridge` cần chuyển đổi từ ứng dụng đơn cửa hàng (Single-tenant) sang hỗ trợ nhiều cửa hàng (Multi-tenant) với phân cấp Cửa hàng (Store) → Chi nhánh (Branch).

## Decision
Chúng tôi quyết định sử dụng mô hình **Shared Database with Discriminator Columns** (`storeId` và `branchId` trong từng collection MongoDB).

### Lý do chọn:
1. **Tối ưu chi phí & tài nguyên**: Không cần khởi tạo nhiều database instance trên MongoDB Atlas.
2. **Quản lý tập trung**: Dễ dàng triển khai Super Admin dashboard, báo cáo tổng quan và nâng cấp hệ thống.
3. **Fail-safe Middleware Protection**: Sử dụng middleware và repository assertion để đảm bảo cô lập dữ liệu 100%.

## Consequences
- Mọi câu lệnh query Mongo phải có compound index bao gồm `storeId` và `branchId`.
- Phải có cơ chế test tự động cô lập dữ liệu (Tenant Isolation Tests).
