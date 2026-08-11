const { DateTime } = require('luxon');
const config = require('../config');

function getTimezone() {
  return process.env.ORDER_TIMEZONE || config.ORDER_TIMEZONE || 'Asia/Ho_Chi_Minh';
}

function parseReportDate(input, now = DateTime.now().setZone(getTimezone())) {
  const value = String(input || '').trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null;

  const timezone = getTimezone();
  const parsed = DateTime.fromFormat(value, 'dd/MM/yyyy', {
    zone: timezone,
    locale: 'vi'
  });
  if (!parsed.isValid) return null;

  const today = now.setZone(timezone).startOf('day');
  const selected = parsed.startOf('day');
  if (selected > today) return null;

  return {
    dateTime: selected,
    referenceDate: selected.toJSDate(),
    dateLabel: selected.toFormat('dd/MM/yyyy'),
    timezone
  };
}

module.exports = { parseReportDate };
