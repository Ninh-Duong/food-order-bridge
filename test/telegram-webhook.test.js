const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || '0123456789abcdef0123456789abcdef';

const config = require('../src/config');
const { app } = require('../src/server');
const telegramBotService = require('../src/services/telegram-bot-service');

describe('POST /api/telegram/webhook HTTP Integration Tests', () => {
  let server;
  let port;
  let originalGetSecret;
  let originalHandleUpdate;
  let handledUpdates = [];

  before(async () => {
    originalGetSecret = config.getTelegramWebhookSecret;
    originalHandleUpdate = telegramBotService.handleUpdate;

    telegramBotService.handleUpdate = async (update) => {
      handledUpdates.push(update);
      return { handled: true };
    };

    await new Promise(resolve => {
      server = http.createServer(app);
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    config.getTelegramWebhookSecret = originalGetSecret;
    telegramBotService.handleUpdate = originalHandleUpdate;

    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('Webhook nhận tin nhắn thành công khi không yêu cầu Secret Token', async () => {
    config.getTelegramWebhookSecret = () => '';
    handledUpdates = [];

    const res = await fetch(`http://localhost:${port}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: 100001,
        message: { chat: { id: 123 }, from: { id: 123 }, text: '/start' }
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(handledUpdates.length, 1);
    assert.equal(handledUpdates[0].update_id, 100001);
  });

  it('Webhook từ chối HTTP 403 khi Secret Token Header không hợp lệ', async () => {
    config.getTelegramWebhookSecret = () => 'my-secret-token-123';
    handledUpdates = [];

    const res = await fetch(`http://localhost:${port}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'wrong-secret-token'
      },
      body: JSON.stringify({ update_id: 100002 })
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.ok(body.error.includes('Forbidden'));
    assert.equal(handledUpdates.length, 0);
  });

  it('Webhook chấp nhận HTTP 200 khi Secret Token Header chính xác', async () => {
    config.getTelegramWebhookSecret = () => 'my-secret-token-123';
    handledUpdates = [];

    const res = await fetch(`http://localhost:${port}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'my-secret-token-123'
      },
      body: JSON.stringify({ update_id: 100003 })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(handledUpdates.length, 1);
  });
});
