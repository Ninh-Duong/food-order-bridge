import { API } from '../common/api.js';
import { setButtonLoading, restoreButton } from '../common/ui-state.js';

const $ = (selector) => document.querySelector(selector);

function showDashboard(user) {
  $('#auth-screen').hidden = true;
  document.querySelectorAll('.admin-protected').forEach((element) => { element.hidden = false; });
  $('#current-user').textContent = `${user.username} · ${user.role === 'admin' ? 'Admin' : 'Nhân viên'}`;
  if (user.role !== 'admin') document.querySelectorAll('.admin-only').forEach((element) => element.remove());
}

async function loadStaff() {
  const { users } = await API.get('/api/auth/staff');
  $('#staff-table-body').innerHTML = users.length ? users.map((user) => `
    <tr><td data-label="Tên đăng nhập">${escapeHtml(user.username)}</td><td data-label="Vai trò">Nhân viên</td><td data-label="Trạng thái">${user.active ? 'Hoạt động' : 'Đã khóa'}</td><td data-label="Ngày tạo">${new Date(user.createdAt).toLocaleDateString('vi-VN')}</td></tr>
  `).join('') : '<tr><td colspan="4">Chưa có tài khoản nhân viên.</td></tr>';
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function bindAuthenticatedActions(user) {
  $('#btn-logout').addEventListener('click', async () => {
    await API.post('/api/auth/logout', {});
    window.location.reload();
  });
  if (user.role !== 'admin') return;
  loadStaff().catch(console.error);
  $('#staff-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const message = $('#staff-message');
    if (submitBtn) setButtonLoading(submitBtn, 'Đang tạo...');
    try {
      await API.post('/api/auth/staff', { username: $('#staff-username').value, password: $('#staff-password').value });
      event.target.reset();
      message.textContent = 'Đã tạo tài khoản nhân viên.';
      await loadStaff();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      if (submitBtn) restoreButton(submitBtn);
    }
  });
}

export async function initAuth() {
  try {
    const { user } = await API.get('/api/auth/me');
    showDashboard(user);
    bindAuthenticatedActions(user);
    return user;
  } catch (_) {
    // A missing session is the expected state before login.
  }

  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const errorBox = $('#login-error');
    errorBox.textContent = '';
    if (submitBtn) setButtonLoading(submitBtn, 'Đang đăng nhập...');
    try {
      await API.post('/api/auth/login', { username: $('#login-username').value, password: $('#login-password').value });
      window.location.reload();
    } catch (error) {
      errorBox.textContent = error.message;
      if (submitBtn) restoreButton(submitBtn);
    }
  });
  return null;
}
