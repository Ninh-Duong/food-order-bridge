# Food Order Bridge (Telegram Bot Integration)

Hệ thống đặt đồ ăn nhanh tích hợp nhận đơn trực tiếp qua nhóm Telegram, thiết kế theo kiến trúc 1-repo 1-service trên Render với giao diện Web tĩnh tối ưu UI/UX & Performance (Mobile-First & Desktop).

---

## 🌟 Tính Năng Nổi Bật

### 🛒 Trang Bán Hàng (Storefront - `index.html`)
- **Sale-Focused UI & Smart Badges**: Hiển thị nổi bật badge giảm giá (`-XX%`), giá sau giảm to đậm, giá gốc gạch ngang và số tiền tiết kiệm ("Tiết kiệm 20.000đ").
- **Tùy chọn thành phần miễn phí (Product Options)**: Cho phép khách hàng chọn/bỏ chọn các thành phần kèm theo món (Hành phi, Tỏi phi, Nước tương, Dưa leo...). Giỏ hàng quản lý theo cấu hình độc lập (`lineId`), cho phép đặt cùng một món với các yêu cầu chế biến khác nhau mà không bị nén/gộp nhầm.
- **Quản lý Tồn kho & Trạng thái Hết hàng**: Khóa bộ đếm (+) khi chạm giới hạn tồn kho. Kiểm tra tổng tồn kho chính xác trên tất cả các cấu hình tùy chọn của cùng một món. Món hết hàng (`stockQuantity = 0`) hiển thị badge "Hết hàng" với hiệu ứng mờ nhẹ, ngăn chặn chọn vượt tồn kho ở mọi điểm chạm (Card, Quick View, Checkout Drawer).
- **Revalidation & 409 Conflict Handling**: Tự động revalidate menu khi mở Checkout. Nếu tồn kho thay đổi bị từ chối 409 Conflict `INSUFFICIENT_STOCK`, hệ thống giữ nguyên giỏ hàng và highlight dòng món lỗi cho khách chỉnh sửa.
- **Mobile-First & Responsive Grid**: Tự động tương thích hoàn hảo từ Điện thoại màn hình nhỏ đến Desktop 4K.
- **Sticky Category Bar & Scrollspy**: Vuốt ngang mượt mà trên Mobile, tự động highlight danh mục theo vị trí cuộn màn hình (`IntersectionObserver`).
- **Mobile Bottom Sheet Drawer & Floating Cart Bar**: Thanh giỏ hàng nổi ở đáy màn hình Mobile, Drawer trượt từ dưới lên cho Quick View & Checkout.

### ⚙️ Trang Quản Trị (Admin Dashboard - `admin.html`)
- **Quản lý Tùy chọn thành phần theo món**: Admin thiết lập mã tùy chọn, tên thành phần, thứ tự hiển thị, trạng thái mặc định chọn và bật/tắt tùy chọn trực tiếp trong form sửa món. Tự động gợi ý mã ID in hoa slugify từ tên.
- **In Hóa đơn & Xem trước (Invoice Preview & Print View)**: Nút `[🖨 In hóa đơn]` hiển thị Modal xem trước hóa đơn với đầy đủ thông tin cửa hàng, thông tin khách hàng, số lượng, đơn giá, chiết khấu, tùy chọn loại trừ thành phần (`KHÔNG LẤY`) và tổng tiền thanh toán. Nút `[In ngay]` kích hoạt `window.print()` tối ưu cho cả giấy nhiệt 80mm và khổ A4.
- **Quản lý Tồn kho & Khuyến mãi (Inventory & Discount)**: Admin nhập Giá gốc (VND), Phần trăm giảm giá (0-100%) và Số lượng tồn kho. Hỗ trợ Preview real-time giá sau giảm & số tiền tiết kiệm trong modal.
- **Bảng Món ăn Thông Minh**: Cảnh báo màu sắc trực quan về tồn kho (Còn X: xanh, Sắp hết <= 5: cam, Hết hàng: đỏ) và Badge % giảm giá.
- **Quản lý Danh mục (Category Management)**: Xem danh sách, tạo mới, chỉnh sửa tên/mô tả/thứ tự hiển thị (`sortOrder`), bật/tắt danh mục (`active`).
- **Cờ Bật/Tắt Kinh Doanh (`active`)**: Công tắc chuyển đổi độc lập với tồn kho. `active = false` đại diện cửa hàng chủ động ngưng bán; `stockQuantity = 0` đại diện hết hàng.
- **Cấu hình Telegram Bot API**: Giao diện điền `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID`, nút Lưu và nút **Gửi tin nhắn thử (Test Telegram)**.
- **Theo dõi Đơn hàng**: Xem lịch sử đơn hàng chi tiết với snapshot tên thành phần loại bỏ (`KHÔNG LẤY: ...`), giá gốc, % giảm giá, tổng giảm giá và số tiền thực trả.

### 🛡 Backend Node.js / Express
- **Atomic Stock Decrement & Concurrency Control**: Luồng trừ kho là thao tác atomic ở MongoDB (dùng `findOneAndUpdate` điều kiện `stockQuantity >= quantity` trong session transaction) hoặc Async Mutex Lock ở JSON Fallback Mode, ngăn chặn tuyệt đối việc bán vượt kho (overselling) khi nhiều khách mua đồng thời.
- **Tính giá Server-side & Safe Formula**: Công thức quy chuẩn toàn hệ thống `Math.round(price * (100 - discountPercent) / 100)`. Backend tự tính lại toàn bộ giá trị từ thực đơn tác quyền, không tin giá do client gửi lên.
- **Idempotency & RequestId Lifecycle**: Client tự tạo `requestId` cho phiên checkout và tái sử dụng khi retry cùng payload. Tránh trừ kho hai lần hay gửi Telegram trùng lặp khi rớt mạng.
- **Ghi File Bền Vững (Atomic Write)**: Lưu đơn hàng ra file `orders.json` và cập nhật `menu.json` qua file tạm `.tmp` giúp giữ tính lặp lại (idempotency) sau khi restart server. (Lưu ý: Hoàn kho khi hủy đơn là feature tiếp theo).

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
│  │  └─ admin.css                # Admin Dashboard tables, Forms, Toggle switches & Invoice Print CSS
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
│        ├─ invoice-renderer.js   # Module render HTML hóa đơn in chuẩn mực
│        ├─ telegram-settings.js  # Cấu hình Token/Chat ID & Gửi tin thử
│        └─ order-monitor.js      # Xem lịch sử đơn hàng & Xem trước/In hóa đơn
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
   Tạo file `.env` hoặc cấu hình các biến môi trường sau trước khi chạy:
   ```env
   AUTH_SECRET=chuoi-ngau-nhien-dai-it-nhat-32-ky-tu
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=mat-khau-manh-it-nhat-8-ky-tu
   ```
   Lần chạy đầu tiên hệ thống sẽ tạo duy nhất một tài khoản admin. Sau đó admin có thể tạo tài khoản nhân viên trong tab **Tài khoản nhân viên**.

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
   - `AUTH_SECRET` (chuỗi ngẫu nhiên, tối thiểu 32 ký tự)
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD` (tối thiểu 8 ký tự; chỉ dùng để khởi tạo admin lần đầu)
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
