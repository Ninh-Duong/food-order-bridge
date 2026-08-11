const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { parseReportDate } = require('../src/services/telegram-date-parser');
const { getHourlyPeak, buildHourlyChartUrl } = require('../src/services/telegram-chart-service');
const { formatHourlyPeak, formatSalesReport } = require('../src/services/telegram-report-formatter');

describe('Telegram date input and hourly chart tests', () => {
  it('parseReportDate: nhận ngày DD/MM/YYYY theo timezone cửa hàng', () => {
    const now = DateTime.fromISO('2026-08-12T10:00:00+07:00');
    const parsed = parseReportDate('09/08/2026', now);

    assert.ok(parsed);
    assert.equal(parsed.dateLabel, '09/08/2026');
    assert.equal(parsed.dateTime.hour, 0);
    assert.equal(parsed.dateTime.minute, 0);
  });

  it('parseReportDate: từ chối ngày sai định dạng, ngày không tồn tại và ngày tương lai', () => {
    const now = DateTime.fromISO('2026-08-12T10:00:00+07:00');

    assert.equal(parseReportDate('2026-08-09', now), null);
    assert.equal(parseReportDate('31/02/2026', now), null);
    assert.equal(parseReportDate('13/08/2026', now), null);
  });

  it('getHourlyPeak: trả về tất cả giờ đồng hạng cao nhất', () => {
    const report = {
      hourlyOrders: [
        { hour: 10, label: '10:00', totalOrderCount: 3 },
        { hour: 18, label: '18:00', totalOrderCount: 7 },
        { hour: 19, label: '19:00', totalOrderCount: 7 }
      ]
    };

    const peak = getHourlyPeak(report);
    assert.equal(peak.maxCount, 7);
    assert.deepEqual(peak.buckets.map(bucket => bucket.hour), [18, 19]);
    assert.equal(formatHourlyPeak(report), 'Giờ cao điểm: 18:00 - 7 đơn, 19:00 - 7 đơn');
  });

  it('buildHourlyChartUrl: tạo URL QuickChart có dữ liệu 24 giờ và highlight giờ cao điểm', () => {
    const hourlyOrders = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      totalOrderCount: hour === 18 ? 9 : 0
    }));
    const url = buildHourlyChartUrl({ reportDate: '12/08/2026', hourlyOrders });
    const parsedUrl = new URL(url);
    const chart = JSON.parse(parsedUrl.searchParams.get('c'));

    assert.equal(parsedUrl.hostname, 'quickchart.io');
    assert.equal(chart.type, 'bar');
    assert.equal(chart.data.labels.length, 24);
    assert.equal(chart.data.datasets[0].data[18], 9);
    assert.equal(chart.data.datasets[0].backgroundColor[18], '#f97316');
  });

  it('formatSalesReport: thêm giờ cao điểm cho báo cáo ngày tùy chọn', () => {
    const text = formatSalesReport({
      filter: 'date',
      reportDate: '09/08/2026',
      generatedAt: '2026-08-09T14:30:00.000+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
      summary: {},
      hourlyOrders: [{ hour: 18, label: '18:00', totalOrderCount: 4 }],
      products: []
    });

    assert.ok(text.includes('BÁO CÁO DOANH THU NGÀY 09/08/2026'));
    assert.ok(text.includes('Giờ cao điểm: 18:00 - 4 đơn'));
  });
});
