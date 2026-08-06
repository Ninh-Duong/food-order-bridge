/**
 * Food Order Bridge - Admin Telegram Config Management
 */
import { API } from '../common/api.js';
import { showToast } from '../common/utils.js';

export async function initTelegramSettings() {
  const settingsForm = document.getElementById('telegram-settings-form');
  const testBtn = document.getElementById('btn-test-telegram');

  if (!settingsForm) return;

  // Load existing settings
  try {
    const config = await API.get('/api/settings');
    if (config) {
      document.getElementById('telegram-token-input').value = config.telegramBotToken || '';
      document.getElementById('telegram-chat-id-input').value = config.telegramChatId || '';
    }
  } catch (error) {
    showToast('Lỗi tải cấu hình Telegram', 'error');
  }

  // Save settings
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const botToken = document.getElementById('telegram-token-input').value.trim();
    const chatId = document.getElementById('telegram-chat-id-input').value.trim();

    try {
      await API.post('/api/settings', {
        telegramBotToken: botToken,
        telegramChatId: chatId
      });
      showToast('Đã lưu cấu hình Telegram thành công!', 'success');
    } catch (err) {
      showToast(err.message || 'Lỗi lưu cấu hình', 'error');
    }
  });

  // Test send message button
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Đang gửi tin thử...';
      try {
        await API.post('/api/settings/test', {});
        showToast('🟢 Đã bắn tin nhắn thử nghiệm thành công vào Telegram!', 'success');
      } catch (err) {
        showToast(`❌ Lỗi gửi Telegram: ${err.message}`, 'error');
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Gửi tin nhắn thử (Test Telegram)';
      }
    });
  }
}
