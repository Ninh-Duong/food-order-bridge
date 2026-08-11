const config = require('../config');

function getHourlyPeak(report) {
  const buckets = Array.isArray(report?.hourlyOrders) ? report.hourlyOrders : [];
  const maxCount = buckets.reduce((max, bucket) => Math.max(max, Number(bucket.totalOrderCount) || 0), 0);
  if (maxCount <= 0) return { maxCount: 0, buckets: [] };

  return {
    maxCount,
    buckets: buckets.filter(bucket => (Number(bucket.totalOrderCount) || 0) === maxCount)
  };
}

function buildHourlyChartUrl(report) {
  if (!config.getReportChartEnabled()) return null;
  if (!Array.isArray(report?.hourlyOrders) || report.hourlyOrders.length === 0) return null;

  const peak = getHourlyPeak(report);
  const peakHours = new Set(peak.buckets.map(bucket => bucket.hour));
  const labels = report.hourlyOrders.map(bucket => bucket.label);
  const values = report.hourlyOrders.map(bucket => Number(bucket.totalOrderCount) || 0);
  const colors = report.hourlyOrders.map(bucket => (
    peakHours.has(bucket.hour) && peak.maxCount > 0 ? '#f97316' : '#14b8a6'
  ));

  const chart = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Số đơn',
        data: values,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Số đơn theo giờ - ${report.reportDate || ''}`,
          color: '#0f172a',
          font: { size: 18, weight: 'bold' }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Khung giờ' },
          ticks: { maxRotation: 60, minRotation: 60, autoSkip: false, font: { size: 9 } }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Số lượng đơn' },
          ticks: { precision: 0 }
        }
      }
    }
  };

  const url = new URL(config.getReportChartBaseUrl());
  url.searchParams.set('c', JSON.stringify(chart));
  url.searchParams.set('w', String(config.getReportChartWidth()));
  url.searchParams.set('h', String(config.getReportChartHeight()));
  url.searchParams.set('f', 'png');
  url.searchParams.set('b', 'white');
  return url.toString();
}

module.exports = { getHourlyPeak, buildHourlyChartUrl };
