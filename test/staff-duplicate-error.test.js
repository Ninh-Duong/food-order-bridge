const test = require('node:test');
const assert = require('node:assert/strict');
const authService = require('../src/services/auth-service');
const userRepository = require('../src/repositories/user-repository');

test('Staff Duplicate Username & MongoDB Race Condition Error Handling', async (t) => {
  const originalCreate = userRepository.create;
  const originalFindByUsernameForTenant = userRepository.findByUsernameForTenant;

  t.after(() => {
    userRepository.create = originalCreate;
    userRepository.findByUsernameForTenant = originalFindByUsernameForTenant;
  });

  await t.test('Pre-check duplicate username in same store throws 409 STAFF_USERNAME_EXISTS', async () => {
    userRepository.findByUsernameForTenant = async () => ({ id: 'existing-user', username: 'nv_duplicate' });

    await assert.rejects(
      async () => {
        await authService.createStaff('nv_duplicate', 'password123', { storeId: 'store-1' });
      },
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, 'STAFF_USERNAME_EXISTS');
        assert.equal(err.message, 'Tên đăng nhập này đã tồn tại trong cửa hàng hiện tại.');
        assert.equal(err.message.includes('E11000'), false);
        return true;
      }
    );
  });

  await t.test('MongoDB Race Condition duplicate error (code 11000) converts to friendly 409 without raw Mongo string', async () => {
    userRepository.findByUsernameForTenant = async () => null; // Passed pre-check
    userRepository.create = async () => {
      const mongoErr = new Error('E11000 duplicate key error collection: food-order-bridge.users index: storeId_1_username_1 dup key: { storeId: "store-1", username: "nv_race" }');
      mongoErr.code = 11000;
      throw mongoErr;
    };

    await assert.rejects(
      async () => {
        await authService.createStaff('nv_race', 'password123', { storeId: 'store-1' });
      },
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, 'STAFF_USERNAME_EXISTS');
        assert.equal(err.message, 'Tên đăng nhập này đã tồn tại trong cửa hàng hiện tại.');
        assert.equal(err.message.includes('E11000'), false);
        assert.equal(err.message.includes('dup key'), false);
        return true;
      }
    );
  });
});
