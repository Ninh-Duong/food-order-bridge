import { API } from '../common/api.js';

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
    <tr><td>${escapeHtml(user.username)}</td><td>Nhân viên</td><td>${user.active ? 'Hoạt động' : 'Đã khóa'}</td><td>${new Date(user.createdAt).toLocaleDateString('vi-VN')}</td></tr>
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
    const message = $('#staff-message');
    try {
      await API.post('/api/auth/staff', { username: $('#staff-username').value, password: $('#staff-password').value });
      event.target.reset();
      message.textContent = 'Đã tạo tài khoản nhân viên.';
      await loadStaff();
    } catch (error) {
      message.textContent = error.message;
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
    const errorBox = $('#login-error');
    errorBox.textContent = '';
    try {
      await API.post('/api/auth/login', { username: $('#login-username').value, password: $('#login-password').value });
      window.location.reload();
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
  return null;
}
