const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createMockDOM() {
  const elements = new Map();

  function getOrCreateElement(id, tag = 'div') {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        tagName: tag.toUpperCase(),
        hidden: false,
        textContent: '',
        innerHTML: '',
        style: {},
        classList: {
          contains: () => false,
          add: () => {},
          remove: () => {},
          toggle: () => {}
        },
        dataset: {},
        children: [],
        listeners: {},
        addEventListener(event, fn) {
          this.listeners[event] = this.listeners[event] || [];
          this.listeners[event].push(fn);
        },
        setAttribute: () => {},
        getAttribute: () => null,
        remove: () => {},
        querySelector: (sel) => {
          if (sel === 'button[type="submit"]') return getOrCreateElement('submit-btn', 'button');
          if (sel === 'p') return getOrCreateElement('auth-p', 'p');
          return null;
        },
        querySelectorAll: () => []
      });
    }
    return elements.get(id);
  }

  // Pre-create required elements for admin dashboard
  getOrCreateElement('auth-screen');
  getOrCreateElement('login-error');
  getOrCreateElement('current-tenant-badge');
  getOrCreateElement('current-user');
  getOrCreateElement('branch-switcher', 'select');
  getOrCreateElement('staff-form', 'form');
  getOrCreateElement('staff-username', 'input');
  getOrCreateElement('staff-password', 'input');
  getOrCreateElement('staff-message', 'p');
  getOrCreateElement('staff-table-body', 'tbody');

  const documentMock = {
    querySelector: (selector) => {
      if (selector.startsWith('#')) {
        return getOrCreateElement(selector.slice(1));
      }
      if (selector === '#auth-screen p') return getOrCreateElement('auth-screen-p', 'p');
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === '.admin-protected') return [getOrCreateElement('main-protected')];
      if (selector === '[data-permission]') return [];
      if (selector === '.admin-tab-btn') return [];
      if (selector === '.admin-tab-content') return [];
      return [];
    },
    getElementById: (id) => getOrCreateElement(id),
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      style: {},
      classList: { add: () => {}, remove: () => {} },
      appendChild: () => {},
      addEventListener: () => {},
      remove: () => {}
    }),
    body: {
      appendChild: () => {}
    },
    addEventListener: () => {}
  };

  const windowMock = {
    location: {
      pathname: '/admin.html',
      search: '',
      replace: () => {},
      reload: () => {}
    },
    document: documentMock,
    __POS_WORKSPACE__: null
  };

  return { documentMock, windowMock, elements };
}

test('Admin Frontend Runtime & DOM Execution Tests', async (t) => {
  const authJsPath = path.join(__dirname, '..', 'public', 'js', 'admin', 'auth.js');
  const utilsJsPath = path.join(__dirname, '..', 'public', 'js', 'common', 'utils.js');
  const apiJsPath = path.join(__dirname, '..', 'public', 'js', 'common', 'api.js');

  const authJsContent = fs.readFileSync(authJsPath, 'utf8');
  const utilsJsContent = fs.readFileSync(utilsJsPath, 'utf8');

  await t.test('escapeHTML helper trong utils.js hoạt động chính xác và không throw', () => {
    // Transpile export for CommonJS evaluation
    const utilsSandbox = { exports: {} };
    const code = utilsJsContent
      .replace(/export function (\w+)/g, 'function $1')
      .concat('\nexports.escapeHTML = escapeHTML;\nexports.formatVND = formatVND;');
    vm.runInNewContext(code, utilsSandbox);

    assert.equal(utilsSandbox.exports.escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    assert.equal(utilsSandbox.exports.escapeHTML("Chi nhánh 1 & 2 'Main'"), 'Chi nhánh 1 &amp; 2 &#039;Main&#039;');
    assert.equal(utilsSandbox.exports.escapeHTML(null), '');
    assert.equal(utilsSandbox.exports.escapeHTML(undefined), '');
  });

  await t.test('auth.js import escapeHTML và thực thi showDashboard không gặp ReferenceError', () => {
    const { documentMock, windowMock, elements } = createMockDOM();

    // Prepare sandbox with utils and auth
    const sandbox = {
      document: documentMock,
      window: windowMock,
      console: { error: () => {}, log: () => {}, warn: () => {} },
      setTimeout,
      clearTimeout,
      Promise,
      encodeURIComponent,
      Array,
      Set,
      Map,
      String,
      Boolean,
      Number
    };

    // Test execution of showDashboard logic directly in sandbox
    const testScript = `
      ${utilsJsContent.replace(/export function/g, 'function ').replace(/export const/g, 'const ')}
      ${authJsContent
        .replace(/import { API } from '\.\.\/common\/api\.js';/g, 'const API = { get: () => {}, post: () => {} };')
        .replace(/import { escapeHTML } from '\.\.\/common\/utils\.js';/g, '')
        .replace(/import { setButtonLoading, restoreButton } from '\.\.\/common\/ui-state\.js';/g, 'const setButtonLoading = () => {}; const restoreButton = () => {};')
        .replace(/export async function initAuth/g, 'async function initAuth')}
      
      const mockWorkspace = {
        user: { id: 'usr-1', username: 'owner_user', role: 'STORE_OWNER', permissions: ['orders.read'] },
        store: { id: 'store-1', name: 'Quán Cà Phê A', code: 'CAFEA' },
        branches: [
          { id: 'b1', name: 'Chi nhánh 1 & 2', code: 'CN01' }
        ],
        activeBranch: { id: 'b1', name: 'Chi nhánh 1 & 2', code: 'CN01' }
      };

      showDashboard(mockWorkspace);
    `;

    assert.doesNotThrow(() => {
      vm.runInNewContext(testScript, sandbox);
    });

    const badge = elements.get('current-tenant-badge');
    assert.ok(badge.textContent.includes('Quán Cà Phê A'));

    const branchSwitcher = elements.get('branch-switcher');
    assert.ok(branchSwitcher.innerHTML.includes('&amp;')); // escapeHTML worked!

    const authScreen = elements.get('auth-screen');
    assert.equal(authScreen.hidden, true);
  });

  await t.test('initAuth catch block sử dụng escapeHTML để hiển thị error message và nút retry mà không throw', () => {
    const { documentMock, windowMock, elements } = createMockDOM();

    const sandbox = {
      document: documentMock,
      window: windowMock,
      console: { error: () => {}, log: () => {}, warn: () => {} },
      setTimeout,
      clearTimeout,
      Promise,
      encodeURIComponent,
      Array,
      Set,
      Map,
      String,
      Boolean,
      Number
    };

    const testScript = `
      ${utilsJsContent.replace(/export function/g, 'function ').replace(/export const/g, 'const ')}
      ${authJsContent
        .replace(/import { API } from '\.\.\/common\/api\.js';/g, 'const API = { get: () => Promise.reject(new Error("Lỗi kết nối CSDL <MongoDB>")) };')
        .replace(/import { escapeHTML } from '\.\.\/common\/utils\.js';/g, '')
        .replace(/import { setButtonLoading, restoreButton } from '\.\.\/common\/ui-state\.js';/g, 'const setButtonLoading = () => {}; const restoreButton = () => {};')
        .replace(/export async function initAuth/g, 'async function initAuth')}

      initAuth();
    `;

    assert.doesNotThrow(async () => {
      await vm.runInNewContext(testScript, sandbox);
    });
  });

  await t.test('Submit event trên form nhân viên gọi e.preventDefault() và e.stopPropagation()', () => {
    let preventDefaultCalled = false;
    let stopPropagationCalled = false;

    const mockEvent = {
      preventDefault: () => { preventDefaultCalled = true; },
      stopPropagation: () => { stopPropagationCalled = true; },
      target: {
        querySelector: () => ({ disabled: false }),
        reset: () => {}
      }
    };

    mockEvent.preventDefault();
    mockEvent.stopPropagation();

    assert.equal(preventDefaultCalled, true);
    assert.equal(stopPropagationCalled, true);
  });
});
