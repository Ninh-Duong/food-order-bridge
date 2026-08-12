/**
 * Food Order Bridge - Unified UI State Management & Component Helpers
 * Defines standardized UI states: idle | loading | success | error | empty | disabled
 */
import { escapeHTML, showToast } from './utils.js';

export { showToast };

/**
 * Standard SVG Fallback for broken food item images
 */
export const FALLBACK_FOOD_IMAGE = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200" fill="%23f1f5f9"><rect width="100%" height="100%" fill="%23f3f4f6"/><path d="M150 70c-25 0-45 20-45 45 0 24 20 45 45 45s45-21 45-45c0-25-20-45-45-45zm0 20c13.8 0 25 11.2 25 25s-11.2 25-25 25-25-11.2-25-25 11.2-25 25-25z" fill="%23cbd5e1"/><text x="50%" y="80%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="%2394a3b8">Không có hình ảnh</text></svg>`;

/**
 * Set button to loading state with spinner
 */
export function setButtonLoading(buttonEl, loadingText = 'Đang xử lý...') {
  if (!buttonEl) return;
  if (!buttonEl.dataset.originalHtml) {
    buttonEl.dataset.originalHtml = buttonEl.innerHTML;
  }
  buttonEl.disabled = true;
  buttonEl.setAttribute('aria-busy', 'true');
  buttonEl.innerHTML = `<span class="spinner-sm" aria-hidden="true"></span> <span>${escapeHTML(loadingText)}</span>`;
}

/**
 * Restore button to original state
 */
export function restoreButton(buttonEl) {
  if (!buttonEl) return;
  if (buttonEl.dataset.originalHtml) {
    buttonEl.innerHTML = buttonEl.dataset.originalHtml;
    delete buttonEl.dataset.originalHtml;
  }
  buttonEl.disabled = false;
  buttonEl.removeAttribute('aria-busy');
}

/**
 * Render inline error banner with optional Retry button
 */
export function renderInlineError(containerEl, message = 'Lỗi tải dữ liệu. Vui lòng thử lại.', onRetry = null) {
  if (!containerEl) return;
  const errorId = `error-msg-${Math.random().toString(36).substring(2, 9)}`;
  
  containerEl.innerHTML = `
    <div class="inline-error-banner" role="alert" aria-live="assertive">
      <div class="inline-error-content">
        <span class="inline-error-icon" aria-hidden="true">⚠️</span>
        <span id="${errorId}" class="inline-error-text">${escapeHTML(message)}</span>
      </div>
      ${onRetry ? `<button type="button" class="btn btn-secondary btn-retry" style="min-height: 32px; padding: 4px 12px; font-size: 13px;">🔄 Thử lại</button>` : ''}
    </div>
  `;

  if (onRetry) {
    const retryBtn = containerEl.querySelector('.btn-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        onRetry();
      });
    }
  }
}

/**
 * Render empty state container with guided instructions
 */
export function renderEmptyState(containerEl, { icon = '🍽️', title = 'Không tìm thấy dữ liệu', description = '', actionText = null, onAction = null }) {
  if (!containerEl) return;
  containerEl.innerHTML = `
    <div class="empty-state-panel">
      <div class="empty-state-icon" aria-hidden="true">${icon}</div>
      <h3 class="empty-state-title">${escapeHTML(title)}</h3>
      ${description ? `<p class="empty-state-desc">${escapeHTML(description)}</p>` : ''}
      ${actionText && onAction ? `<button type="button" class="btn btn-primary btn-empty-action" style="margin-top: 12px;">${escapeHTML(actionText)}</button>` : ''}
    </div>
  `;

  if (actionText && onAction) {
    const actionBtn = containerEl.querySelector('.btn-empty-action');
    if (actionBtn) {
      actionBtn.addEventListener('click', onAction);
    }
  }
}

/**
 * Render Skeleton loader for tables
 */
export function renderSkeletonTable(tbodyEl, rows = 5, cols = 6) {
  if (!tbodyEl) return;
  let html = '';
  for (let r = 0; r < rows; r++) {
    html += `<tr>`;
    for (let c = 0; c < cols; c++) {
      html += `<td><div class="skeleton-box skeleton-text"></div></td>`;
    }
    html += `</tr>`;
  }
  tbodyEl.innerHTML = html;
}

/**
 * Render Skeleton loader for Storefront Food Catalog Grid
 */
export function renderSkeletonGrid(containerEl, count = 6) {
  if (!containerEl) return;
  let cardsHtml = '';
  for (let i = 0; i < count; i++) {
    cardsHtml += `
      <div class="food-card skeleton-card" aria-hidden="true">
        <div class="skeleton-box skeleton-img"></div>
        <div class="food-card-body">
          <div class="skeleton-box skeleton-title"></div>
          <div class="skeleton-box skeleton-text" style="width: 80%;"></div>
          <div class="skeleton-box skeleton-text" style="width: 50%; margin-top: 8px;"></div>
        </div>
      </div>
    `;
  }
  containerEl.innerHTML = `
    <section class="menu-category-section">
      <h2 class="skeleton-box skeleton-title" style="width: 160px; height: 24px; margin-bottom: 16px;"></h2>
      <div class="food-grid">${cardsHtml}</div>
    </section>
  `;
}
