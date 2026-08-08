const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || '0123456789abcdef0123456789abcdef';

const { app } = require('../src/server');
const authService = require('../src/services/auth-service');
const orderRepository = require('../src/repositories/order-repository');

describe('GET /api/orders HTTP Integration Tests', () => {
  let server;
  let port;
  let adminCookie;

  before(async () => {
    const token = authService.issueToken({ id: 'test-admin-id', username: 'admin', role: 'admin' });
    adminCookie = `admin_session=${token}`;

    await new Promise(resolve => {
      server = http.createServer(app);
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('Trả về HTTP 401 khi chưa đăng nhập (không gửi cookie)', async () => {
    const res = await fetch(`http://localhost:${port}/api/orders?page=1&limit=10`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.message, 'Vui lòng đăng nhập');
  });

  it('Trả về HTTP 200 và cấu trúc pagination contract chuẩn khi có session cookie hợp lệ', async () => {
    orderRepository.orders.clear();
    orderRepository.requests.clear();

    const res = await fetch(`http://localhost:${port}/api/orders?page=1&limit=10`, {
      headers: {
        cookie: adminCookie
      }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.orders));
    assert.ok(body.pagination);
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.limit, 10);
    assert.equal(typeof body.pagination.totalOrders, 'number');
    assert.equal(typeof body.pagination.totalPages, 'number');
  });

  it('Trả về HTTP 500 khi repository phát sinh lỗi và không làm lộ stack trace', async () => {
    const originalGetPaginated = orderRepository.getPaginated;
    orderRepository.getPaginated = async () => {
      throw new Error('Database connection failed mock error');
    };

    try {
      const res = await fetch(`http://localhost:${port}/api/orders?page=1&limit=10`, {
        headers: {
          cookie: adminCookie
        }
      });

      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.message, 'Lỗi lấy danh sách đơn hàng');
      assert.equal(body.stack, undefined);
    } finally {
      orderRepository.getPaginated = originalGetPaginated;
    }
  });
});
