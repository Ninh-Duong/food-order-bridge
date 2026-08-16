function getCookieValue(requestOrHeader, name) {
  const cookieHeader = typeof requestOrHeader === 'string'
    ? requestOrHeader
    : requestOrHeader?.headers?.cookie;
  const prefix = `${name}=`;
  const cookie = String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!cookie) return '';

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch (_) {
    return '';
  }
}

module.exports = { getCookieValue };
