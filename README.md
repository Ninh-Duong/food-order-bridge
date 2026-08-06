# Food Order Bridge (Telegram Bot Integration)

Hệ thống đặt đồ ăn nhanh tích hợp nhận đơn trực tiếp qua nhóm Telegram, thiết kế theo kiến trúc 1-repo 1-service trên Render với giao diện Web tĩnh tối ưu UI/UX & Performance (Mobile-First & Desktop).

---

## 🌟 Tính Năng Nổi Bật

### 🛒 Trang Bán Hàng (Storefront - `index.html`)
- **Mobile-First & Responsive Grid**: Tự động tương thích hoàn hảo từ Điện thoại màn hình nhỏ đến Desktop 4K.
- **Sticky Category Bar & Scrollspy**: Vuốt ngang mượt mà trên Mobile, tự động highlight danh mục theo vị trí cuộn màn hình (`IntersectionObserver`).
- **Food Card Architecture**: Tỷ lệ ảnh cố định `1:1` không vỡ khung, bộ đếm số lượng `[-] 1 [+]` biến đổi tức thì (Optimistic UI Update $0\text{ms}$ delay).
- **Mobile Bottom Sheet Drawer & Floating Cart Bar**: Thanh giỏ hàng nổi ở đáy màn hình Mobile, Drawer trượt từ dưới lên cho Quick View & Checkout.
- **Performance & Skeleton Wave**: Khung xương hiệu ứng sóng mờ mịn trong lúc load dữ liệu, lazy loading ảnh chống giật trang (CLS).

### ⚙️ Trang Quản Trị (Admin Dashboard - `admin.html`)
- **Quản lý Món ăn**: Thêm/sửa món ăn, tên, ảnh WebP, mô tả, giá cả.
- **Cờ Bật/Tắt Kinh Doanh (`active`)**: Công tắc chuyển đổi để ngưng bán món hết hàng hôm nay và bật lại dễ dàng vào hôm sau mà không cần xóa dữ liệu.
- **Cấu hình Telegram Bot API**: Giao diện điền `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID`, nút Lưu và nút **Gửi tin nhắn thử (Test Telegram)**.
- **Theo dõi Đơn hàng**: Xem lịch sử các đơn hàng được ghi nhận và trạng thái bắn Telegram.

### 🛡 Backend Node.js / Express
- **Tính giá Server-side**: Giá món ăn luôn lấy từ `menu.json` trên server, ngăn chặn tuyệt đối việc can thiệp sửa giá từ DevTools.
- **Chống trùng đơn (`requestId`)**: Sử dụng UUID client-side để đảm bảo 1 hành động bấm chỉ tạo 1 đơn duy nhất.
- **Telegram Bot API Native Client**: Xử lý gửi tin nhắn Telegram HTTPS API với retry (1s, 3s), timeout 8s, error handling (400, 401, 403, 429, 5xx).

---

## 📁 Cấu Trúc Thư Mục Mô-Đun

```text
food-order-bridge/
├─ public/
│  ├─ index.html                  # Page chính: Bán hàng cho Khách (Storefront)
│  ├─ admin.html                  # Page quản lý: Dành cho Chủ shop / Admin
│  ├─ css/
│  │  ├─ main.css                 # Design tokens (Rule of 8, colors, CSS variables)
│  │  ├─ components.css           # Components (Buttons, Modals, Skeleton, Badges, Steppers)
│  │  ├─ storefront.css           # Sticky nav, Scrollspy, Mobile Bottom Drawer, Floating Cart Bar
│  │  └─ admin.css                # Admin Dashboard tables, Forms, Toggle switches
│  └─ js/
│     ├─ common/
│     │  ├─ api.js                # Fetch API client wrapper
│     │  └─ utils.js              # Format VND, Toast notifications, Dynamic Alt Generator
│     ├─ storefront/
│     │  ├─ menu-catalog.js       # Dynamic Catalog render, Search/Filter, Scrollspy
│     │  ├─ cart.js               # Optimistic UI Cart State & Stepper
│     │  ├─ quick-view-drawer.js  # Mobile Bottom Sheet Drawer
│     │  └─ checkout.js           # Form đặt hàng, tạo UUID requestId, submit API
│     └─ admin/
│        ├─ item-manager.js       # CRUD món ăn & Cờ bật/tắt bán hôm nay
│        ├─ telegram-settings.js  # Cấu hình Token/Chat ID & Gửi tin thử
│        └─ order-monitor.js      # Xem lịch sử đơn hàng
├─ src/
│  ├─ server.js                   # Entry point Express server
│  ├─ config.js                   # Cấu hình môi trường & file
│  ├─ data/
│  │  ├─ menu.json                # Source of truth thực đơn
│  │  └─ settings.json            # Lưu trữ động Bot Token & Chat ID
│  ├─ routes/
│  │  ├─ menu-routes.js           # GET/POST/PUT /api/menu
│  │  ├─ order-routes.js          # POST /api/orders, GET /api/orders
│  │  ├─ settings-routes.js       # GET/POST /api/settings
│  │  └─ health-routes.js         # GET /health
│  ├─ services/
│  │  ├─ order-service.js         # Validate, tính giá server-side, gửi Telegram
│  │  ├─ menu-service.js          # Xử lý logic thực đơn
│  │  └─ telegram-service.js      # Plain-text Telegram order formatting & dispatch
│  ├─ repositories/
│  │  ├─ order-repository.js      # In-memory order store & idempotency requests
│  │  └─ menu-repository.js       # Đọc/Ghi dữ liệu menu.json
│  └─ integrations/
│     └─ telegram-client.js       # Native HTTPS Telegram fetch integration
├─ package.json
├─ .env.example
├─ render.yaml
└─ README.md
```

---

## 🚀 Hướng Dẫn Chạy Cục Bộ (Local)

1. Cài đặt các gói phụ thuộc:
   ```bash
   npm install
   ```

2. Chạy ứng dụng ở chế độ Development:
   ```bash
   npm run dev
   ```

3. Truy cập trình duyệt:
   - **Trang Bán hàng (Khách đặt món)**: `http://localhost:3000`
   - **Trang Quản trị (Admin)**: `http://localhost:3000/admin.html`

4. Cấu hình Telegram trong Admin Page:
   - Truy cập `http://localhost:3000/admin.html`, chọn tab **🤖 Cấu hình Telegram Bot**.
   - Điền `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`.
   - Bấm **Lưu cấu hình** và chọn **Gửi tin nhắn thử (Test Telegram)** để xác nhận kết nối thành công.

---

## ☁️ Triển Khai Lên Render (Deploy)

1. Đẩy dự án lên GitHub repository.
2. Tạo **New Web Service** trên [Render](https://render.com).
3. Chọn repo `food-order-bridge`.
4. Render sẽ tự động phát hiện `render.yaml`:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
5. Thêm các Biến Môi Trường (Environment Variables) trên Render Dashboard nếu muốn hardcode cố định:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
