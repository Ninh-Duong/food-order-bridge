/**
 * Food Order Bridge - Admin Sales Report Dashboard
 */
import { API } from '../common/api.js';
import { formatVND, showToast, escapeHTML } from '../common/utils.js';

let currentPeriod = 'today';
let isExportingPdf = false;

export function initReportDashboard() {
  bindPeriodEvents();
  bindPdfExportEvent();
  document.addEventListener('paymentStatusUpdated', refreshReportDashboard);
  refreshReportDashboard();
}

export function refreshReportDashboard() {
  return fetchReportData(currentPeriod);
}

function bindPeriodEvents() {
  const periodBtns = document.querySelectorAll('.report-period-btn');
  periodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      if (!period || period === currentPeriod) return;

      periodBtns.forEach(b => b.classList.remove('active', 'btn-primary'));
      periodBtns.forEach(b => b.classList.add('btn-secondary'));

      btn.classList.remove('btn-secondary');
      btn.classList.add('active', 'btn-primary');

      currentPeriod = period;
      fetchReportData(currentPeriod);
    });
  });
}

async function fetchReportData(period = 'today') {
  const summaryBox = document.getElementById('report-summary-cards');
  const tableBody = document.getElementById('report-product-table-body');
  const subtitleEl = document.getElementById('report-date-range-subtitle');

  if (summaryBox) {
    summaryBox.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--color-text-muted);">
        ⏳ Đang tải dữ liệu báo cáo...
      </div>
    `;
  }
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 16px;">
          Đang tải chi tiết danh sách sản phẩm...
        </td>
      </tr>
    `;
  }

  try {
    const data = await API.get(`/api/reports/sales?period=${period}`);
    renderReportDashboard(data);
  } catch (error) {
    console.error('[Report Dashboard Error]:', error);
    if (error.status === 403) {
      showToast('Bạn không có quyền truy cập báo cáo', 'error');
    } else {
      showToast('Lỗi tải dữ liệu báo cáo bán hàng', 'error');
    }

    if (summaryBox) {
      summaryBox.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: #ef4444; background: rgba(239,68,68,0.05); border-radius: 8px;">
          ❌ Không thể tải báo cáo. <button class="btn btn-secondary" id="btn-retry-report" style="margin-left: 8px; font-size: 12px;">Thử lại</button>
        </div>
      `;
      const retryBtn = document.getElementById('btn-retry-report');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => fetchReportData(currentPeriod));
      }
    }
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted);">Lỗi dữ liệu.</td></tr>`;
    }
  }
}

function renderReportDashboard(report) {
  const subtitleEl = document.getElementById('report-date-range-subtitle');
  const summaryBox = document.getElementById('report-summary-cards');
  const tableBody = document.getElementById('report-product-table-body');

  if (subtitleEl && report.from && report.to) {
    const fromStr = new Date(report.from).toLocaleDateString('vi-VN');
    const toStr = new Date(report.to).toLocaleDateString('vi-VN');
    const genTime = new Date(report.generatedAt).toLocaleTimeString('vi-VN');
    subtitleEl.textContent = `Khoảng thời gian: ${fromStr} – ${toStr} | Múi giờ: ${report.timezone || 'Asia/Ho_Chi_Minh'} (Cập nhật: ${genTime})`;
  }

  const s = report.summary || {};
  const paidCount = s.paidOrderCount || 0;
  const qtySold = s.totalQuantitySold || 0;
  const discountAmt = s.discountAmount || 0;
  const revenue = s.revenue || 0;

  if (summaryBox) {
    summaryBox.innerHTML = `
      <div class="admin-card" style="padding: 16px; border-left: 4px solid var(--color-primary, #3b82f6);">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600;">Đơn đã thanh toán</div>
        <div style="font-size: 24px; font-weight: 800; color: var(--color-text-main); margin-top: 4px;">${paidCount}</div>
      </div>
      <div class="admin-card" style="padding: 16px; border-left: 4px solid #8b5cf6;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600;">Sản phẩm đã bán</div>
        <div style="font-size: 24px; font-weight: 800; color: var(--color-text-main); margin-top: 4px;">${qtySold}</div>
      </div>
      <div class="admin-card" style="padding: 16px; border-left: 4px solid #f59e0b;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600;">Tổng giảm giá</div>
        <div style="font-size: 24px; font-weight: 800; color: #d97706; margin-top: 4px;">${formatVND(discountAmt)}</div>
      </div>
      <div class="admin-card" style="padding: 16px; border-left: 4px solid #10b981;">
        <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600;">Doanh thu thực tế</div>
        <div style="font-size: 24px; font-weight: 800; color: #059669; margin-top: 4px;">${formatVND(revenue)}</div>
      </div>
    `;
  }

  const products = report.products || [];
  if (tableBody) {
    if (products.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 24px;">
            Không có đơn hàng nào đã thanh toán trong kỳ báo cáo này.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = products.map(p => {
      const pId = escapeHTML(p.productId);
      const pName = escapeHTML(p.productName);
      return `
        <tr>
          <td><strong style="color: var(--color-text-muted); font-size: 12px;">${pId}</strong></td>
          <td><strong>${pName}</strong></td>
          <td style="text-align: right; font-weight: 700;">${p.quantitySold}</td>
          <td style="text-align: right; color: var(--color-text-muted);">${formatVND(p.subtotalAmount)}</td>
          <td style="text-align: right; color: #d97706;">${p.discountAmount > 0 ? `-${formatVND(p.discountAmount)}` : '0đ'}</td>
          <td style="text-align: right; font-weight: 800; color: #059669;">${formatVND(p.revenue)}</td>
        </tr>
      `;
    }).join('');
  }
}

function bindPdfExportEvent() {
  const exportBtn = document.getElementById('btn-export-pdf-report');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', async () => {
    if (isExportingPdf) return;

    isExportingPdf = true;
    exportBtn.disabled = true;
    const originalText = exportBtn.innerHTML;
    exportBtn.innerHTML = '⏳ Đang tạo PDF...';

    try {
      const res = await fetch(`/api/reports/sales.pdf?period=${currentPeriod}`);
      if (!res.ok) {
        let errMessage = 'Không thể xuất PDF báo cáo';
        try {
          const errJson = await res.json();
          if (errJson.message) errMessage = errJson.message;
        } catch (e) {}
        throw new Error(errMessage);
      }

      // Read Content-Disposition filename or generate default
      const dispHeader = res.headers.get('Content-Disposition') || '';
      let filename = `bao-cao-ban-hang-${currentPeriod}.pdf`;
      const match = dispHeader.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobUrl);

      showToast('Đã tải xuống file PDF báo cáo', 'success');
    } catch (err) {
      console.error('[PDF Export Error]:', err);
      showToast(err.message || 'Lỗi khi tải file PDF', 'error');
    } finally {
      isExportingPdf = false;
      exportBtn.disabled = false;
      exportBtn.innerHTML = originalText;
    }
  });
}
