const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('../config');

function isComplete(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasMomoConfig() {
  const momo = config.getMomoConfig();
  return [momo.partnerCode, momo.accessKey, momo.secretKey, momo.ipnUrl, momo.redirectUrl]
    .every(isComplete);
}

function hasBankQrConfig() {
  const bank = config.getBankQrConfig();
  return [bank.bankCode, bank.accountNumber, bank.accountName].every(isComplete);
}

function createSignature(secretKey, rawSignature) {
  return crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');
}

function createMockReference(orderId, paymentMethod) {
  return `MOCK-${paymentMethod}-${orderId}`;
}

async function createMockPayment({ orderId, amount, paymentMethod }) {
  const reference = createMockReference(orderId, paymentMethod);
  const payload = `${reference}|${amount}|FOOD-ORDER-BRIDGE-TEST`;
  const qrImageUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280
  });

  return {
    paymentMethod,
    paymentProvider: 'MOCK',
    paymentStatus: 'PENDING',
    paymentReference: reference,
    paymentTransactionId: null,
    paymentAmount: amount,
    qrImageUrl,
    paymentLink: null,
    isMock: true,
    mockCompletionEnabled: config.getPaymentMockEnabled(),
    message: 'QR mô phỏng để kiểm thử. Chưa kết nối nhà cung cấp thanh toán.'
  };
}

async function createBankQrPayment({ orderId, amount }) {
  if (!hasBankQrConfig()) {
    return createMockPayment({ orderId, amount, paymentMethod: 'BANK_QR' });
  }

  const bank = config.getBankQrConfig();
  const reference = `FO${orderId.replace(/[^A-Z0-9]/gi, '')}`.slice(0, 25);
  const qrImageUrl = `https://img.vietqr.io/image/${encodeURIComponent(bank.bankCode)}-${encodeURIComponent(bank.accountNumber)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodeURIComponent(reference)}&accountName=${encodeURIComponent(bank.accountName)}`;

  return {
    paymentMethod: 'BANK_QR',
    paymentProvider: 'VIETQR',
    paymentStatus: 'PENDING',
    paymentReference: reference,
    paymentTransactionId: null,
    paymentAmount: amount,
    qrImageUrl,
    paymentLink: null,
    isMock: false,
    mockCompletionEnabled: false,
    message: 'Quét QR bằng ứng dụng ngân hàng và nhập đúng số tiền.'
  };
}

async function createMomoPayment({ orderId, amount }) {
  if (!hasMomoConfig()) {
    return createMockPayment({ orderId, amount, paymentMethod: 'MOMO_QR' });
  }

  const momo = config.getMomoConfig();
  const requestId = crypto.randomUUID();
  const orderInfo = `Thanh toan don ${orderId}`;
  const extraData = Buffer.from(JSON.stringify({ orderId })).toString('base64');
  const rawSignature = [
    `accessKey=${momo.accessKey}`,
    `amount=${amount}`,
    `extraData=${extraData}`,
    `ipnUrl=${momo.ipnUrl}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${momo.partnerCode}`,
    `redirectUrl=${momo.redirectUrl}`,
    `requestId=${requestId}`,
    'requestType=captureWallet'
  ].join('&');

  const response = await fetch(`${momo.apiBaseUrl.replace(/\/$/, '')}/v2/gateway/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      partnerCode: momo.partnerCode,
      requestType: 'captureWallet',
      ipnUrl: momo.ipnUrl,
      redirectUrl: momo.redirectUrl,
      orderId,
      amount,
      orderInfo,
      requestId,
      extraData,
      lang: 'vi',
      autoCapture: true,
      signature: createSignature(momo.secretKey, rawSignature)
    })
  });

  const body = await response.json();
  if (!response.ok || body.resultCode !== 0 || !body.qrCodeUrl) {
    throw new Error(body.message || `MoMo trả về resultCode ${body.resultCode}`);
  }

  return {
    paymentMethod: 'MOMO_QR',
    paymentProvider: 'MOMO',
    paymentStatus: 'PENDING',
    paymentReference: orderId,
    paymentTransactionId: null,
    paymentAmount: amount,
    qrImageUrl: await QRCode.toDataURL(body.qrCodeUrl, { margin: 2, width: 280 }),
    paymentLink: body.payUrl || null,
    isMock: false,
    mockCompletionEnabled: false,
    providerRequestId: body.requestId || requestId,
    message: 'Quét QR MoMo để thanh toán đúng số tiền.'
  };
}

async function createPaymentForOrder({ orderId, amount, paymentMethod }) {
  if (paymentMethod === 'CASH') {
    return {
      paymentMethod: 'CASH',
      paymentProvider: 'MANUAL',
      paymentStatus: 'UNPAID',
      paymentReference: null,
      paymentTransactionId: null,
      paymentAmount: amount,
      qrImageUrl: null,
      paymentLink: null,
      isMock: false,
      mockCompletionEnabled: false,
      message: 'Thanh toán tiền mặt tại quán.'
    };
  }

  if (paymentMethod === 'BANK_QR') {
    return await createBankQrPayment({ orderId, amount });
  }

  try {
    return await createMomoPayment({ orderId, amount });
  } catch (err) {
    console.error(`[Payment] MoMo unavailable for ${orderId}:`, err.message);
    return createMockPayment({ orderId, amount, paymentMethod: 'MOMO_QR' });
  }
}

function verifyMomoIpn(payload) {
  if (!payload || !hasMomoConfig()) return false;
  const momo = config.getMomoConfig();
  const rawSignature = [
    `accessKey=${momo.accessKey}`,
    `amount=${payload.amount}`,
    `extraData=${payload.extraData || ''}`,
    `message=${payload.message || ''}`,
    `orderId=${payload.orderId || ''}`,
    `orderInfo=${payload.orderInfo || ''}`,
    `orderType=${payload.orderType || 'momo_wallet'}`,
    `partnerCode=${payload.partnerCode || ''}`,
    `payType=${payload.payType || ''}`,
    `requestId=${payload.requestId || ''}`,
    `responseTime=${payload.responseTime || ''}`,
    `resultCode=${payload.resultCode}`,
    `transId=${payload.transId || ''}`
  ].join('&');
  const expected = createSignature(momo.secretKey, rawSignature);
  const actual = String(payload.signature || '');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

module.exports = {
  hasMomoConfig,
  hasBankQrConfig,
  createPaymentForOrder,
  verifyMomoIpn
};
