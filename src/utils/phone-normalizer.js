/**
 Chuẩn hóa số điện thoại Việt Nam về định dạng E.164 (+84xxxxxxxx)
 */
function normalizeVNPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Số điện thoại không hợp lệ');
  }

  // Loại bỏ khoảng trắng, dấu chấm, dấu gạch ngang, ngoặc đơn
  let cleaned = phone.replace(/[\s\.\-\(\)]/g, '');

  if (!cleaned) {
    throw new Error('Số điện thoại không được để trống');
  }

  // Chuyển 0x -> +84x
  if (cleaned.startsWith('0')) {
    cleaned = '+84' + cleaned.substring(1);
  } else if (cleaned.startsWith('84') && !cleaned.startsWith('+84')) {
    cleaned = '+' + cleaned;
  } else if (!cleaned.startsWith('+84')) {
    cleaned = '+84' + cleaned;
  }

  // Kiểm tra định dạng số điện thoại Việt Nam di động (10 chữ số: +84 + 9 chữ số)
  const e164Regex = /^\+84(3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/;

  if (!e164Regex.test(cleaned)) {
    throw new Error('Số điện thoại Việt Nam không đúng định dạng di động hợp lệ (10 số)');
  }

  return cleaned;
}

/**
 * Định dạng hiển thị đẹp cho số điện thoại (ví dụ: 0912 345 678)
 */
function formatPhoneDisplay(e164Phone) {
  try {
    const normalized = normalizeVNPhone(e164Phone);
    const local = '0' + normalized.substring(3);
    return `${local.substring(0, 4)} ${local.substring(4, 7)} ${local.substring(7)}`;
  } catch (_) {
    return e164Phone;
  }
}

module.exports = {
  normalizeVNPhone,
  formatPhoneDisplay
};
