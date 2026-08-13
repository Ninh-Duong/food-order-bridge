const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeVNPhone, formatPhoneDisplay } = require('../src/utils/phone-normalizer');

test('Phone Number Normalization (E.164) Unit Tests', async (t) => {
  await t.test('normalizeVNPhone: Chuẩn hóa 0912345678 thành +84912345678', () => {
    assert.equal(normalizeVNPhone('0912345678'), '+84912345678');
  });

  await t.test('normalizeVNPhone: Chuẩn hóa 84912345678 thành +84912345678', () => {
    assert.equal(normalizeVNPhone('84912345678'), '+84912345678');
  });

  await t.test('normalizeVNPhone: Giữ nguyên +84912345678', () => {
    assert.equal(normalizeVNPhone('+84912345678'), '+84912345678');
  });

  await t.test('normalizeVNPhone: Loại bỏ khoảng trắng, dấu chấm, dấu gạch ngang (090 123 4567 -> +84901234567)', () => {
    assert.equal(normalizeVNPhone('090.123-4567'), '+84901234567');
  });

  await t.test('normalizeVNPhone: Từ chối số điện thoại không đủ 10 số hoặc không đúng mạng di động', () => {
    assert.throws(
      () => normalizeVNPhone('012345678'),
      (err) => err.message.includes('không đúng định dạng')
    );

    assert.throws(
      () => normalizeVNPhone('09123456789'),
      (err) => err.message.includes('không đúng định dạng')
    );
  });

  await t.test('formatPhoneDisplay: Trả về định dạng 0912 345 678', () => {
    assert.equal(formatPhoneDisplay('+84912345678'), '0912 345 678');
  });
});
