/**
 * Food Order Bridge - Accessible Modal Helper
 * Handles focus trapping, Escape key closing, backdrop click closing,
 * body scroll lock, and proper aria-hidden / aria-modal management.
 */

let activeModal = null;
let lastFocusedElement = null;

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]'
].join(', ');

/**
 * Open an accessible modal overlay
 */
export function openAccessibleModal(overlayEl, dialogContentEl) {
  if (!overlayEl) return;

  lastFocusedElement = document.activeElement;
  activeModal = overlayEl;

  overlayEl.removeAttribute('aria-hidden');
  overlayEl.classList.add('active');

  if (dialogContentEl) {
    dialogContentEl.setAttribute('role', 'dialog');
    dialogContentEl.setAttribute('aria-modal', 'true');
  }

  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';

  // Focus the first focusable element inside the modal
  const focusables = getFocusableElements(overlayEl);
  if (focusables.length > 0) {
    setTimeout(() => focusables[0].focus(), 50);
  }

  // Attach keydown listener for Escape and Tab trap
  document.removeEventListener('keydown', handleModalKeyDown);
  document.addEventListener('keydown', handleModalKeyDown);
}

/**
 * Close the accessible modal overlay
 */
export function closeAccessibleModal(overlayEl) {
  const target = overlayEl || activeModal;
  if (!target) return;

  target.setAttribute('aria-hidden', 'true');
  target.classList.remove('active');

  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';

  document.removeEventListener('keydown', handleModalKeyDown);

  // Restore focus to element that triggered the modal
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }

  activeModal = null;
}

/**
 * Handle Escape key and Tab focus trap
 */
function handleModalKeyDown(e) {
  if (!activeModal) return;

  if (e.key === 'Escape' || e.keyCode === 27) {
    e.preventDefault();
    closeAccessibleModal(activeModal);
    return;
  }

  if (e.key === 'Tab' || e.keyCode === 9) {
    trapFocus(e, activeModal);
  }
}

/**
 * Focus Trap mechanism
 */
function trapFocus(e, container) {
  const focusables = getFocusableElements(container);
  if (focusables.length === 0) return;

  const firstEl = focusables[0];
  const lastEl = focusables[focusables.length - 1];

  if (e.shiftKey) { // Shift + Tab
    if (document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    }
  } else { // Tab
    if (document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  }
}

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)).filter(
    el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

/**
 * Setup backdrop click listener to close modal
 */
export function setupModalBackdropClose(overlayEl, dialogContentEl) {
  if (!overlayEl) return;

  overlayEl.addEventListener('click', (e) => {
    if (dialogContentEl && !dialogContentEl.contains(e.target)) {
      closeAccessibleModal(overlayEl);
    }
  });
}
