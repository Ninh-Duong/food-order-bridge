import { API } from '../common/api.js';
import { escapeHTML } from '../common/utils.js';
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
  if (!workspace || !workspace.user) {
    throw new Error('Dữ liệu cửa hàng không hợp lệ');
  }

  window.__POS_WORKSPACE__ = workspace;
  const user = workspace.user;

  const storeName = workspace.store?.name || 'Cửa hàng';
  const branchName = workspace.activeBranch?.name || 'Chưa chọn chi nhánh';
  const badge = $('#current-tenant-badge');
  if (badge) badge.textContent = `🏬 ${storeName} · 📍 ${branchName}`;
  
  const currentUserEl = $('#current-user');
  if (currentUserEl) {
    currentUserEl.textContent = `${user.phoneDisplay || user.username || user.id} · ${roleLabel(user.role)}`;
  }

  const branchSwitcher = $('#branch-switcher');
  if (branchSwitcher) {
    const branches = Array.isArray(workspace.branches) ? workspace.branches : [];
    branchSwitcher.innerHTML = branches.map((branch) => (
      `<option value="${escapeHTML(branch.id)}" ${branch.id === workspace.activeBranch?.id ? 'selected' : ''}>${escapeHTML(branch.name)} (${escapeHTML(branch.code || '')})</option>`
    )).join('');
    branchSwitcher.hidden = branches.length <= 1;
  }

  document.querySelectorAll('[data-permission]').forEach((element) => {
    if (!hasPermission(user, element.dataset.permission)) element.remove();
  });

  // Only reveal protected admin workspace and hide auth screen after full rendering succeeds
  const authScreen = $('#auth-screen');
  if (authScreen) authScreen.hidden = true;
  document.querySelectorAll('.admin-protected').forEach((element) => { element.hidden = false; });
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
}

function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  return Promise.race([
    API.get(url),
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error('Quá thời gian kết nối tới máy chủ (Timeout). Vui lòng kiểm tra lại mạng hoặc thử lại.');
        err.isTimeout = true;
        reject(err);
      }, timeoutMs);
    })
  ]);
}

export async function initAuth() {
  const authMsg = document.querySelector('#auth-screen p');
  const errorBox = $('#login-error');

  try {
    if (authMsg) authMsg.textContent = 'Đang xác thực phiên làm việc...';

    const workspace = await fetchWithTimeout('/api/auth/bootstrap', {}, 12000);

    if (authMsg) authMsg.textContent = 'Đang tải thông tin cửa hàng & chi nhánh...';

    showDashboard(workspace);
    bindAuthenticatedActions(workspace);
    return workspace.user;
  } catch (error) {
    console.error('[Admin Bootstrap Error]', error);

    if (error.status === 401 || error.status === 403) {
      const errorMsg = encodeURIComponent(error.message || 'Phiên làm việc hết hạn hoặc không có quyền truy cập');
      window.location.replace(`/login.html?returnUrl=${encodeURIComponent(window.location.pathname)}&error=${errorMsg}`);
      return null;
    }

    if (errorBox) {
      const friendlyMsg = error.isTimeout
        ? 'Quá thời gian tải dữ liệu quản trị từ máy chủ. Vui lòng thử lại.'
        : (error.message || 'Không thể tải dữ liệu quản trị. Vui lòng thử lại.');

      errorBox.innerHTML = `
        <div style="color: #ef4444; margin-bottom: 12px;">⚠️ ${escapeHTML(friendlyMsg)}</div>
        <button type="button" class="btn btn-primary" id="btn-retry-bootstrap" style="min-height: 36px; padding: 6px 16px;">
          🔄 Thử lại
        </button>
      `;

      const retryBtn = document.getElementById('btn-retry-bootstrap');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => window.location.reload());
      }
    }
    return null;
  }
}
