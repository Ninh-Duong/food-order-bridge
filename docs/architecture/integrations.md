# Telegram Integration — Store/Branch Scoped

Telegram runtime phải resolve cấu hình bằng `{ storeId, branchId }`. Store có cấu hình mặc định; Branch có thể override. Không được dùng một `TELEGRAM_CHAT_ID` global để gửi dữ liệu của nhiều cửa hàng.

## Credential and webhook

- Khuyến nghị một Bot Telegram cho mỗi Store.
- Token và webhook secret được mã hóa trong `TelegramSettingsModel`.
- `PUBLIC_BASE_URL` vẫn là cấu hình hệ thống để đăng ký webhook.
- Webhook tenant dùng `/api/telegram/webhook/:storeId` và kiểm tra secret theo Store.

## Notification scopes

- Đơn mới.
- Đơn bị hủy.
- Vượt giới hạn đơn chờ thanh toán.
- Report daily/weekly/monthly.
- Inventory và chart tùy feature flag.

Mọi report query phải nhận tenant context; thiếu `storeId` phải fail-fast.
