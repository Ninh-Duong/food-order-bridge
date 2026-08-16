import { API } from '../common/api.js';
import { escapeHTML, showToast } from '../common/utils.js';
import { setButtonLoading, restoreButton } from '../common/ui-state.js';

let staffList = [];
let permissionCatalog = null;
let currentEditingStaff = null;
let selectedPermissionsSet = new Set();

export async function initStaffPermissionsManager(workspace) {
  const container = document.getElementById('tab-accounts');
  if (!container) return;

  bindStaffEvents();
  await loadStaffList();

  if (hasPermission('staff.rules.manage')) {
    loadPermissionCatalog().catch(console.error);
  }
}

function hasPermission(permissionKey) {
  const user = window.__POS_WORKSPACE__?.user;
  return Array.isArray(user?.permissions) && user.permissions.includes(permissionKey);
}

async function loadPermissionCatalog() {
  try {
    const res = await API.get('/api/auth/permissions/catalog');
    permissionCatalog = res.catalog || [];
  } catch (err) {
    console.error('Không thể tải catalog permission:', err);
  }
}

export async function loadStaffList() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;

  try {
    const res = await API.get('/api/auth/staff');
    staffList = res.users || [];
    renderStaffTable();
  } catch (err) {
    console.error('Lỗi tải danh sách nhân viên:', err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Không thể tải danh sách nhân viên: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderStaffTable() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;

  const searchInput = document.getElementById('search-staff-input');
  const statusFilter = document.getElementById('filter-staff-status');

  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const statusVal = statusFilter ? statusFilter.value : 'ALL';

  const filtered = staffList.filter(user => {
    const matchName = !query || (user.username || '').toLowerCase().includes(query);
    const matchStatus = statusVal === 'ALL' || (statusVal === 'ACTIVE' && user.active) || (statusVal === 'LOCKED' && !user.active);
    return matchName && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--color-text-muted); padding: var(--space-4);">Chưa có tài khoản nhân viên phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(user => {
    const isOwnerOrAdmin = user.role === 'STORE_OWNER' || user.role === 'admin';
    const isCustom = user.permissionMode === 'CUSTOM';
    const modeBadge = isCustom
      ? `<span class="badge" style="background:#8b5cf6; color:#fff;">Tùy chỉnh (${(user.assignedPermissions || []).length} quyền)</span>`
      : `<span class="badge" style="background:#3b82f6; color:#fff;">Mặc định (${(user.effectivePermissions || []).length} quyền)</span>`;

    const statusBadge = user.active
      ? `<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981;">Đang hoạt động</span>`
      : `<span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">Đã khóa</span>`;

    const formattedDate = user.permissionUpdatedAt
      ? new Date(user.permissionUpdatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
      : (user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : 'Mặc định');

    const canManageRules = hasPermission('staff.rules.manage') && !isOwnerOrAdmin;
    const canManageStatus = (hasPermission('staff.manage') || hasPermission('staff.rules.manage')) && !isOwnerOrAdmin;

    return `
      <tr>
        <td data-label="Tên đăng nhập">
          <strong>${escapeHTML(user.username)}</strong>
        </td>
        <td data-label="Chi nhánh">
          <span style="font-size: var(--font-size-xs); color: var(--color-text-muted);">
            ${Array.isArray(user.branchIds) && user.branchIds.length ? escapeHTML(user.branchIds.join(', ')) : 'Tất cả chi nhánh'}
          </span>
        </td>
        <td data-label="Trạng thái">${statusBadge}</td>
        <td data-label="Chế độ quyền">${modeBadge}</td>
        <td data-label="Ngày cập nhật">${formattedDate}</td>
        <td data-label="Hành động">
          <div style="display:flex; gap: 6px; flex-wrap: wrap;">
            ${canManageRules ? `
              <button class="btn btn-secondary btn-sm btn-edit-permissions" data-staff-id="${escapeHTML(user.id)}" style="font-size: 12px; padding: 4px 8px;">
                🔑 Phân quyền
              </button>
            ` : ''}
            ${canManageStatus ? `
              <button class="btn ${user.active ? 'btn-secondary' : 'btn-primary'} btn-sm btn-toggle-status" data-staff-id="${escapeHTML(user.id)}" data-active="${user.active}" style="font-size: 12px; padding: 4px 8px; ${user.active ? 'color:#ef4444; border-color:rgba(239,68,68,0.3);' : ''}">
                ${user.active ? '🔒 Khóa' : '🔓 Mở khóa'}
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Bind row action events
  tbody.querySelectorAll('.btn-edit-permissions').forEach(btn => {
    btn.addEventListener('click', () => {
      const staffId = btn.dataset.staffId;
      const staff = staffList.find(s => String(s.id) === String(staffId));
      if (staff) openPermissionModal(staff);
    });
  });

  tbody.querySelectorAll('.btn-toggle-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const staffId = btn.dataset.staffId;
      const currentActive = btn.dataset.active === 'true';
      const staff = staffList.find(s => String(s.id) === String(staffId));
      if (!staff) return;

      const actionText = currentActive ? 'khóa' : 'mở khóa';
      if (!confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản nhân viên "${staff.username}"?`)) {
        return;
      }

      setButtonLoading(btn, 'Đang lưu...');
      try {
        await API.patch(`/api/auth/staff/${staffId}/status`, { active: !currentActive });
        showToast(`Đã ${actionText} tài khoản "${staff.username}" thành công`, 'success');
        await loadStaffList();
      } catch (err) {
        showToast(err.message || `Không thể ${actionText} tài khoản`, 'error');
      } finally {
        restoreButton(btn);
      }
    });
  });
}

function bindStaffEvents() {
  const staffForm = document.getElementById('staff-form');
  if (staffForm) {
    staffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = staffForm.querySelector('button[type="submit"]');
      const usernameInput = document.getElementById('staff-username');
      const passwordInput = document.getElementById('staff-password');
      const msgBox = document.getElementById('staff-message');

      if (submitBtn) setButtonLoading(submitBtn, 'Đang tạo...');
      try {
        await API.post('/api/auth/staff', {
          username: usernameInput.value.trim(),
          password: passwordInput.value
        });
        staffForm.reset();
        if (msgBox) msgBox.textContent = 'Đã tạo tài khoản nhân viên thành công!';
        showToast('Tạo tài khoản nhân viên thành công', 'success');
        await loadStaffList();
      } catch (err) {
        if (msgBox) msgBox.textContent = err.message || 'Không thể tạo nhân viên';
        showToast(err.message || 'Lỗi tạo nhân viên', 'error');
      } finally {
        if (submitBtn) restoreButton(submitBtn);
      }
    });
  }

  const searchInput = document.getElementById('search-staff-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderStaffTable());
  }

  const statusFilter = document.getElementById('filter-staff-status');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => renderStaffTable());
  }
}

export function openPermissionModal(staff) {
  currentEditingStaff = staff;
  selectedPermissionsSet = new Set(
    staff.permissionMode === 'CUSTOM'
      ? (staff.assignedPermissions || [])
      : (staff.effectivePermissions || [])
  );

  const modal = document.getElementById('staff-permission-modal');
  if (!modal) return;

  const nameEl = document.getElementById('perm-modal-staff-name');
  if (nameEl) nameEl.textContent = staff.username;

  const modeDefaultRadio = document.getElementById('perm-mode-default');
  const modeCustomRadio = document.getElementById('perm-mode-custom');

  if (staff.permissionMode === 'CUSTOM') {
    if (modeCustomRadio) modeCustomRadio.checked = true;
  } else {
    if (modeDefaultRadio) modeDefaultRadio.checked = true;
  }

  renderPermissionGroupsUI();

  // Mode radio toggle event
  const modeRadios = modal.querySelectorAll('input[name="permissionMode"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      const isCustom = document.getElementById('perm-mode-custom').checked;
      const groupsContainer = document.getElementById('perm-groups-container');
      if (groupsContainer) {
        groupsContainer.style.opacity = isCustom ? '1' : '0.5';
        groupsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.disabled = !isCustom;
        });
      }
    });
  });

  modal.hidden = false;
  modal.style.display = 'flex';
}

function renderPermissionGroupsUI() {
  const container = document.getElementById('perm-groups-container');
  if (!container) return;

  if (!permissionCatalog || permissionCatalog.length === 0) {
    container.innerHTML = `<div style="padding: 16px; text-align: center;">Đang tải danh mục quyền...</div>`;
    return;
  }

  const isCustomMode = document.getElementById('perm-mode-custom')?.checked ?? (currentEditingStaff?.permissionMode === 'CUSTOM');

  let html = '';
  permissionCatalog.forEach(group => {
    html += `
      <div class="perm-group-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 12px; margin-bottom: 12px; background: #0f172a;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 8px;">
          <strong style="color: #38bdf8; font-size: 14px;">${escapeHTML(group.groupName)}</strong>
          <label style="font-size: 11px; color: var(--color-text-muted); cursor: pointer;">
            <input type="checkbox" class="perm-group-select-all" data-group="${escapeHTML(group.groupKey)}" ${!isCustomMode ? 'disabled' : ''}> Chọn tất cả
          </label>
        </div>
        <div class="perm-checkbox-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px;">
          ${group.permissions.map(perm => {
            const isChecked = selectedPermissionsSet.has(perm.key);
            const isLockedForStaff = perm.lockedForStaff;
            const isSensitive = perm.sensitive;

            return `
              <label class="perm-checkbox-item" style="display: flex; align-items: flex-start; gap: 6px; font-size: 12px; cursor: ${isLockedForStaff || !isCustomMode ? 'not-allowed' : 'pointer'}; opacity: ${isLockedForStaff ? '0.5' : '1'};">
                <input type="checkbox" 
                       class="perm-cb" 
                       data-perm-key="${escapeHTML(perm.key)}" 
                       data-group="${escapeHTML(group.groupKey)}"
                       ${isChecked ? 'checked' : ''} 
                       ${isLockedForStaff || !isCustomMode ? 'disabled' : ''} />
                <div>
                  <span style="font-weight: 600; color: ${isSensitive ? '#f59e0b' : '#f8fafc'};">
                    ${escapeHTML(perm.label)}
                    ${isSensitive ? ' ⚠️' : ''}
                    ${isLockedForStaff ? ' 🔒 (Chỉ Admin)' : ''}
                  </span>
                  <div style="font-size: 10px; color: var(--color-text-muted);">${escapeHTML(perm.description || '')}</div>
                </div>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  container.style.opacity = isCustomMode ? '1' : '0.5';

  updateSelectedCountBadge();

  // Checkbox change handlers
  container.querySelectorAll('.perm-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const permKey = cb.dataset.permKey;
      if (cb.checked) {
        // Warning if granting catalog.delete
        if (permKey === 'catalog.delete' && !selectedPermissionsSet.has('catalog.delete')) {
          if (!confirm('Cảnh báo: Quyền "Xóa món ăn" rất nhạy cảm. Bạn có chắc chắn muốn cấp quyền xóa món cho nhân viên này?')) {
            cb.checked = false;
            return;
          }
        }
        selectedPermissionsSet.add(permKey);
        // Auto check dependencies (e.g. read permission if write is checked)
        autoCheckDependencies(permKey, container);
      } else {
        selectedPermissionsSet.delete(permKey);
        // If unchecking read, auto uncheck dependent write permissions
        autoUncheckDependents(permKey, container);
      }
      updateSelectedCountBadge();
    });
  });

  // Group Select All handlers
  container.querySelectorAll('.perm-group-select-all').forEach(groupCb => {
    groupCb.addEventListener('change', (e) => {
      const groupKey = groupCb.dataset.group;
      const groupCbs = container.querySelectorAll(`.perm-cb[data-group="${groupKey}"]:not([disabled])`);
      groupCbs.forEach(cb => {
        cb.checked = groupCb.checked;
        if (groupCb.checked) {
          selectedPermissionsSet.add(cb.dataset.permKey);
        } else {
          selectedPermissionsSet.delete(cb.dataset.permKey);
        }
      });
      updateSelectedCountBadge();
    });
  });

  // Bind Save / Cancel / Default buttons
  const btnSave = document.getElementById('btn-save-permissions');
  const btnCancel = document.getElementById('btn-cancel-permissions');
  const btnResetDefault = document.getElementById('btn-reset-default-permissions');

  if (btnSave) {
    btnSave.onclick = async () => {
      if (!currentEditingStaff) return;
      const isCustomModeSelected = document.getElementById('perm-mode-custom')?.checked;
      const mode = isCustomModeSelected ? 'CUSTOM' : 'DEFAULT';
      const permissionsArray = Array.from(selectedPermissionsSet);

      setButtonLoading(btnSave, 'Đang lưu...');
      try {
        await API.put(`/api/auth/staff/${currentEditingStaff.id}/permissions`, {
          permissionMode: mode,
          permissions: permissionsArray
        });
        showToast(`Đã cập nhật phân quyền cho "${currentEditingStaff.username}"`, 'success');
        closePermissionModal();
        await loadStaffList();
      } catch (err) {
        showToast(err.message || 'Lỗi cập nhật phân quyền', 'error');
      } finally {
        restoreButton(btnSave);
      }
    };
  }

  if (btnCancel) {
    btnCancel.onclick = closePermissionModal;
  }

  if (btnResetDefault) {
    btnResetDefault.onclick = async () => {
      if (!currentEditingStaff) return;
      if (!confirm(`Khôi phục tài khoản "${currentEditingStaff.username}" về bộ quyền mặc định theo Role?`)) return;

      setButtonLoading(btnResetDefault, 'Đang xử lý...');
      try {
        await API.put(`/api/auth/staff/${currentEditingStaff.id}/permissions`, {
          permissionMode: 'DEFAULT'
        });
        showToast('Đã đặt lại quyền mặc định', 'success');
        closePermissionModal();
        await loadStaffList();
      } catch (err) {
        showToast(err.message || 'Lỗi khôi phục quyền', 'error');
      } finally {
        restoreButton(btnResetDefault);
      }
    };
  }
}

function autoCheckDependencies(checkedKey, container) {
  const depMap = {
    'orders.write': ['orders.read'],
    'catalog.write': ['catalog.read'],
    'catalog.delete': ['catalog.read'],
    'menu.status.write': ['catalog.read'],
    'inventory.write': ['inventory.read'],
    'categories.write': ['categories.read', 'catalog.read']
  };

  const deps = depMap[checkedKey];
  if (Array.isArray(deps)) {
    deps.forEach(depKey => {
      selectedPermissionsSet.add(depKey);
      const depCb = container.querySelector(`.perm-cb[data-perm-key="${depKey}"]`);
      if (depCb) depCb.checked = true;
    });
  }
}

function autoUncheckDependents(uncheckedKey, container) {
  const dependentMap = {
    'orders.read': ['orders.write'],
    'catalog.read': ['catalog.write', 'catalog.delete', 'menu.status.write', 'categories.write'],
    'inventory.read': ['inventory.write'],
    'categories.read': ['categories.write']
  };

  const dependents = dependentMap[uncheckedKey];
  if (Array.isArray(dependents)) {
    dependents.forEach(depKey => {
      selectedPermissionsSet.delete(depKey);
      const depCb = container.querySelector(`.perm-cb[data-perm-key="${depKey}"]`);
      if (depCb) depCb.checked = false;
    });
  }
}

function updateSelectedCountBadge() {
  const badge = document.getElementById('perm-selected-count-badge');
  if (badge) {
    badge.textContent = `Đã chọn: ${selectedPermissionsSet.size} quyền`;
  }
}

export function closePermissionModal() {
  const modal = document.getElementById('staff-permission-modal');
  if (modal) {
    modal.hidden = true;
    modal.style.display = 'none';
  }
  currentEditingStaff = null;
}
