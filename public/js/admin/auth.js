import { API } from '../common/api.js';
import { setButtonLoading, restoreButton } from '../common/ui-state.js';

const $ = (selector) => document.querySelector(selector);

function hasPermission(user, permission) {
  return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}

function roleLabel(role) {
  if (role === 'STORE_OWNER' || role === 'admin') return 'Chủ cửa hàng';
  if (role === 'STAFF' || role === 'staff') return 'Nhân viên';
  return role || 'Người dùng';
}

function showDashboard(workspace) {
  window.__POS_WORKSPACE__ = workspace;
  const user = workspace.user;
  $('#auth-screen').hidden = true;
  document.querySelectorAll('.admin-protected').forEach((element) => { element.hidden = false; });

  const storeName = workspace.store?.name || 'Cửa hàng';
  const branchName = workspace.activeBranch?.name || 'Chưa chọn chi nhánh';
  const badge = $('#current-tenant-badge');
  if (badge) badge.textContent = `🏬 ${storeName} · 📍 ${branchName}`;
  $('#current-user').textContent = `${user.phoneDisplay || user.username || user.id} · ${roleLabel(user.role)}`;

  const branchSwitcher = $('#branch-switcher');
  if (branchSwitcher) {
    branchSwitcher.innerHTML = workspace.branches.map((branch) => (
      `<option value="${escapeHtml(branch.id)}" ${branch.id === workspace.activeBranch?.id ? 'selected' : ''}>${escapeHtml(branch.name)} (${escapeHtml(branch.code || '')})</option>`
    )).join('');
    branchSwitcher.hidden = workspace.branches.length <= 1;
  }

  document.querySelectorAll('[data-permission]').forEach((element) => {
    if (!hasPermission(user, element.dataset.permission)) element.remove();
  });
}

async function loadStaff() {
  const { users } = await API.get('/api/auth/staff');
  $('#staff-table-body').innerHTML = users.length ? users.map((user) => `
    <tr><td data-label="Tên đăng nhập">${escapeHtml(user.username || user.phoneDisplay || '')}</td><td data-label="Vai trò">Nhân viên</td><td data-label="Trạng thái">${user.active ? 'Hoạt động' : 'Đã khóa'}</td><td data-label="Ngày tạo">${new Date(user.createdAt).toLocaleDateString('vi-VN')}</td></tr>
  `).join('') : '<tr><td colspan="4">Chưa có tài khoản nhân viên.</td></tr>';
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function bindAuthenticatedActions(workspace) {
  const user = workspace.user;
  const logoutBtn = $('#btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      setButtonLoading(logoutBtn, 'Đang đăng xuất...');
      try {
        await API.post('/api/auth/logout', {});
      } catch (_) {}
      window.location.replace('/login.html');
    });
  }

  const branchSwitcher = $('#branch-switcher');
  if (branchSwitcher) {
    branchSwitcher.addEventListener('change', async (event) => {
      const selectedBranchId = event.target.value;
      const originalValue = workspace.activeBranch?.id || '';
      try {
        await API.post('/api/auth/switch-branch', { branchId: selectedBranchId });
        window.location.reload();
      } catch (error) {
        event.target.value = originalValue;
        window.alert(error.message || 'Không thể chuyển chi nhánh');
      }
    });
  }

  if (hasPermission(user, 'staff.manage')) {
    loadStaff().catch(console.error);
    $('#staff-form')?.addEventListener('submit', async (event) => {
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
}

export async function initAuth() {
  try {
    const workspace = await API.get('/api/auth/bootstrap');
    showDashboard(workspace);
    bindAuthenticatedActions(workspace);
    return workspace.user;
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      const errorMsg = encodeURIComponent(error.message || 'Phiên làm việc hết hạn hoặc không có quyền truy cập');
      window.location.replace(`/login.html?returnUrl=${encodeURIComponent(window.location.pathname)}&error=${errorMsg}`);
      return null;
    }
    const errorBox = $('#login-error');
    if (errorBox) errorBox.textContent = error.message || 'Không thể tải dữ liệu cửa hàng';
    return null;
  }
}
