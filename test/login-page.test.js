const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Login page HTML & inline script safety test suite', async (t) => {
  const loginHtmlPath = path.join(__dirname, '..', 'public', 'login.html');
  assert.ok(fs.existsSync(loginHtmlPath), 'login.html must exist');

  const htmlContent = fs.readFileSync(loginHtmlPath, 'utf8');

  // Extract <script> content
  const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, '<script> tag must exist in login.html');
  const scriptContent = scriptMatch[1];

  await t.test('login.html script syntax and execution without ReferenceError', () => {
    let replacedUrl = null;
    let errorDisplayed = null;

    // Create mock DOM environment
    const mockElements = {
      'login-form': { style: {}, addEventListener: (evt, fn) => {} },
      'phone-input': { value: '0912345678', trim: () => '0912345678' },
      'password-input': { value: 'password123' },
      'alert-error': { style: {}, textContent: '' },
      'branch-section': { style: {} },
      'branch-container': { innerHTML: '', appendChild: () => {} },
      'sub-title': { textContent: '' },
      'btn-login': { disabled: false, innerHTML: 'Đăng nhập', dataset: {} }
    };

    const mockWindow = {
      location: {
        search: '?error=TestErrorMsg&returnUrl=/admin.html',
        replace: (url) => { replacedUrl = url; }
      }
    };

    const mockDocument = {
      getElementById: (id) => mockElements[id] || { style: {}, dataset: {} },
      createElement: (tag) => ({ style: {}, classList: { add: () => {}, remove: () => {} } })
    };

    const context = {
      window: mockWindow,
      document: mockDocument,
      URLSearchParams: URLSearchParams,
      fetch: async () => ({ ok: true, json: async () => ({}) }),
      console: console,
      setTimeout: setTimeout
    };

    vm.createContext(context);

    // Running script should NOT throw ReferenceError
    assert.doesNotThrow(() => {
      vm.runInContext(scriptContent, context);
    }, 'Script in login.html must execute without ReferenceError');

    // Verify error was shown from query string
    assert.equal(mockElements['alert-error'].textContent, 'TestErrorMsg');
    assert.equal(mockElements['alert-error'].style.display, 'block');

    // Test goToWorkspace redirect
    context.goToWorkspace();
    assert.equal(replacedUrl, '/admin.html');
  });

  await t.test('goToWorkspace sanitizes unsafe returnUrl', () => {
    let replacedUrl = null;
    const mockWindow = {
      location: {
        search: '?returnUrl=//attacker.com',
        replace: (url) => { replacedUrl = url; }
      }
    };
    const mockElements = {
      'login-form': { style: {}, addEventListener: () => {} },
      'phone-input': { value: '' },
      'password-input': { value: '' },
      'alert-error': { style: {}, textContent: '' },
      'branch-section': { style: {} },
      'branch-container': { innerHTML: '', appendChild: () => {} },
      'sub-title': { textContent: '' },
      'btn-login': { disabled: false, innerHTML: '', dataset: {} }
    };
    const mockDocument = {
      getElementById: (id) => mockElements[id] || { style: {}, dataset: {} },
      createElement: () => ({ style: {}, classList: { add: () => {} } })
    };

    const context = {
      window: mockWindow,
      document: mockDocument,
      URLSearchParams: URLSearchParams,
      fetch: async () => ({ ok: true, json: async () => ({}) }),
      console: console
    };

    vm.createContext(context);
    vm.runInContext(scriptContent, context);

    context.goToWorkspace();
    // Protocol relative returnUrl should be replaced with default /admin.html
    assert.equal(replacedUrl, '/admin.html');
  });
});
