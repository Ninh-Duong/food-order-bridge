/**
 * Food Order Bridge - Admin Shell & Navigation Manager
 * Handles responsive tab navigation and shell events independently from API data loading.
 */
import { refreshReportDashboard } from './report-dashboard.js';

export function switchAdminTab(targetId) {
  if (!targetId) return;

  const tabButtons = document.querySelectorAll('.admin-tab-btn');
  tabButtons.forEach(btn => {
    const isTarget = btn.dataset.target === targetId;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  const tabContents = document.querySelectorAll('.admin-tab-content');
  tabContents.forEach(content => {
    content.style.display = content.id === targetId ? 'block' : 'none';
  });

  if (targetId === 'tab-reports') {
    try {
      refreshReportDashboard();
    } catch (_) {}
  }
}

let navTabsBound = false;
export function initAdminTabNavigation() {
  if (navTabsBound) return;

  // Use event delegation on document / .admin-nav-tabs for fast, resilient tab switching
  document.addEventListener('click', (event) => {
    const tabBtn = event.target.closest('.admin-tab-btn');
    if (!tabBtn) return;

    const targetId = tabBtn.dataset.target;
    if (targetId) {
      switchAdminTab(targetId);
    }
  });

  navTabsBound = true;
}
