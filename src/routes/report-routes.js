const express = require('express');
const router = express.Router();
const reportService = require('../services/report-service');
const reportPdfService = require('../services/report-pdf-service');
const config = require('../config');

// GET /api/reports/sales.pdf - Export PDF sales report
router.get('/sales.pdf', async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const report = await reportService.generateSalesReport(period);
    const pdfBuffer = await reportPdfService.generateSalesPDFBuffer(report, config.SHOP_NAME);
    const filename = reportPdfService.getPDFFilename(report.filter, report.from, report.to);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdfBuffer);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('Unhandled Report PDF Error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi tạo PDF báo cáo' });
  }
});

// GET /api/reports/sales - JSON sales report
router.get('/sales', async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const report = await reportService.generateSalesReport(period);
    res.json(report);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('Unhandled Report JSON Error:', err);
    res.status(500).json({ message: 'Lỗi máy chủ khi tạo báo cáo' });
  }
});

module.exports = router;
