const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const REGULAR_FONT = path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf');
const BOLD_FONT = path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSans-Bold.ttf');

function formatVND(amount) {
  return (Number(amount) || 0).toLocaleString('vi-VN') + 'đ';
}

function generateSalesPDFBuffer(report, shopName = 'Food Order Shop') {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const hasRegularFont = fs.existsSync(REGULAR_FONT);
      const hasBoldFont = fs.existsSync(BOLD_FONT);

      const fontRegular = hasRegularFont ? REGULAR_FONT : 'Helvetica';
      const fontBold = hasBoldFont ? BOLD_FONT : 'Helvetica-Bold';

      // Header
      doc.font(fontBold).fontSize(16).fillColor('#0f172a').text(shopName.toUpperCase(), { align: 'center' });
      doc.moveDown(0.2);
      doc.font(fontBold).fontSize(18).fillColor('#1e293b').text('BÁO CÁO BÁN HÀNG', { align: 'center' });
      doc.moveDown(0.3);

      const periodLabel = report.filter === 'today' ? 'Hôm nay' : report.filter === 'week' ? 'Tuần hiện tại' : 'Tháng hiện tại';
      doc.font(fontRegular).fontSize(10).fillColor('#64748b').text(`Kỳ báo cáo: ${periodLabel} (${report.timezone})`, { align: 'center' });

      const fromStr = new Date(report.from).toLocaleDateString('vi-VN');
      const toStr = new Date(report.to).toLocaleDateString('vi-VN');
      const genStr = new Date(report.generatedAt).toLocaleString('vi-VN');

      doc.font(fontRegular).fontSize(9).fillColor('#64748b').text(`Từ: ${fromStr}  -  Đến: ${toStr}  |  Thời điểm xuất: ${genStr}`, { align: 'center' });
      doc.moveDown(1);

      // Summary Box
      const summaryY = doc.y;
      doc.rect(40, summaryY, 515, 112).fillAndStroke('#f8fafc', '#cbd5e1');

      doc.font(fontBold).fontSize(10).fillColor('#0f172a');
      doc.text('TỔNG QUAN DOANH THU', 50, summaryY + 8);

      doc.font(fontRegular).fontSize(9).fillColor('#334155');
      doc.text(`• Số đơn đã thanh toán: ${report.summary.paidOrderCount}`, 50, summaryY + 24);
      doc.text(`• Số sản phẩm đã bán: ${report.summary.totalQuantitySold}`, 50, summaryY + 40);

      doc.text(`• Tạm tính: ${formatVND(report.summary.subtotalAmount)}`, 240, summaryY + 24);
      doc.text(`• Tổng giảm giá: ${formatVND(report.summary.discountAmount)}`, 240, summaryY + 40);
      doc.text(`• Đơn dùng tại quán: ${report.summary.dineInOrderCount || 0}`, 50, summaryY + 58);
      doc.text(`• Đơn giao tận nơi: ${report.summary.deliveryOrderCount || 0}`, 240, summaryY + 58);
      doc.text(`• Tự hủy quá hạn: ${report.summary.autoCancelledOrderCount || 0}`, 50, summaryY + 76);
      doc.text(`• Hủy thủ công: ${report.summary.manuallyCancelledOrderCount || 0}`, 240, summaryY + 76);
      doc.text(`• Tổng đơn phát sinh: ${report.summary.totalOrderCount || 0}`, 50, summaryY + 94);
      doc.text(`• Tổng đơn bị hủy: ${report.summary.cancelledOrderCount || 0}`, 240, summaryY + 94);

      doc.font(fontBold).fontSize(10).fillColor('#059669');
      doc.text(`THỰC THU: ${formatVND(report.summary.revenue)}`, 380, summaryY + 8);

      doc.y = summaryY + 122;
      doc.moveDown(0.5);

      // Table Headers
      doc.font(fontBold).fontSize(11).fillColor('#0f172a').text('CHI TIẾT THEO SẢN PHẨM');
      doc.moveDown(0.4);

      const tableTop = doc.y;
      const colX = [40, 110, 240, 310, 390, 470];
      const colW = [70, 130, 70, 80, 80, 85];

      function drawTableHeader(y) {
        doc.rect(40, y, 515, 20).fill('#e2e8f0');
        doc.font(fontBold).fontSize(8.5).fillColor('#1e293b');
        doc.text('Mã SP', colX[0] + 4, y + 5, { width: colW[0] });
        doc.text('Tên sản phẩm', colX[1], y + 5, { width: colW[1] });
        doc.text('Số lượng', colX[2], y + 5, { width: colW[2], align: 'right' });
        doc.text('Giá gốc', colX[3], y + 5, { width: colW[3], align: 'right' });
        doc.text('Giảm giá', colX[4], y + 5, { width: colW[4], align: 'right' });
        doc.text('Doanh thu', colX[5] - 4, y + 5, { width: colW[5], align: 'right' });
      }

      drawTableHeader(tableTop);
      let currentY = tableTop + 20;

      if (!report.products || report.products.length === 0) {
        currentY += 10;
        doc.font(fontRegular).fontSize(9.5).fillColor('#64748b').text('Không có đơn hàng đã thanh toán trong kỳ báo cáo này.', 40, currentY, { align: 'center', width: 515 });
      } else {
        report.products.forEach((p, idx) => {
          if (currentY + 25 > 770) {
            doc.addPage();
            currentY = 40;
            drawTableHeader(currentY);
            currentY += 20;
          }

          const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(40, currentY, 515, 20).fill(bgColor);

          doc.font(fontRegular).fontSize(8.5).fillColor('#334155');
          doc.text(p.productId, colX[0] + 4, currentY + 5, { width: colW[0], height: 14, ellipsis: true });
          doc.text(p.productName, colX[1], currentY + 5, { width: colW[1], height: 14, ellipsis: true });
          doc.text(String(p.quantitySold), colX[2], currentY + 5, { width: colW[2], align: 'right' });
          doc.text(formatVND(p.subtotalAmount), colX[3], currentY + 5, { width: colW[3], align: 'right' });
          doc.text(formatVND(p.discountAmount), colX[4], currentY + 5, { width: colW[4], align: 'right' });
          doc.font(fontBold).text(formatVND(p.revenue), colX[5] - 4, currentY + 5, { width: colW[5], align: 'right' });

          currentY += 20;
        });

        // Total row
        if (currentY + 25 > 770) {
          doc.addPage();
          currentY = 40;
        }

        doc.rect(40, currentY, 515, 22).fill('#cbd5e1');
        doc.font(fontBold).fontSize(9).fillColor('#0f172a');
        doc.text('TỔNG CỘNG', colX[0] + 4, currentY + 6, { width: colW[0] + colW[1] });
        doc.text(String(report.summary.totalQuantitySold), colX[2], currentY + 6, { width: colW[2], align: 'right' });
        doc.text(formatVND(report.summary.subtotalAmount), colX[3], currentY + 6, { width: colW[3], align: 'right' });
        doc.text(formatVND(report.summary.discountAmount), colX[4], currentY + 6, { width: colW[4], align: 'right' });
        doc.text(formatVND(report.summary.revenue), colX[5] - 4, currentY + 6, { width: colW[5], align: 'right' });
      }

      // Page Numbering Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.font(fontRegular).fontSize(8).fillColor('#94a3b8');
        doc.text(`Trang ${i + 1} / ${pages.count}`, 40, 800, { align: 'center', width: 515 });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function getPDFFilename(filter, fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const yyyyMmDd = (d) => d.toISOString().split('T')[0];

  if (filter === 'today') {
    return `bao-cao-ban-hang-hom-nay-${yyyyMmDd(from)}.pdf`;
  }
  if (filter === 'week') {
    return `bao-cao-ban-hang-tuan-${yyyyMmDd(from)}-den-${yyyyMmDd(to)}.pdf`;
  }
  if (filter === 'month') {
    const yyyyMm = from.toISOString().slice(0, 7);
    return `bao-cao-ban-hang-thang-${yyyyMm}.pdf`;
  }
  return `bao-cao-ban-hang-${yyyyMmDd(from)}.pdf`;
}

module.exports = {
  generateSalesPDFBuffer,
  getPDFFilename
};
