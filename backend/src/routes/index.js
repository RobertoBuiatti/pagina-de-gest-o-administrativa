const express = require('express');
const multer = require('multer');
const { ocrPost } = require('../controllers/ocr.controller');
const { geminiRawPost } = require('../controllers/gemini.controller');
const { createTransaction } = require('../controllers/transactions.controller');
const { getSummary, getAnalytics } = require('../controllers/reports.controller');
const { exportSql, exportXls, importData } = require('../controllers/data.controller');
const { validate } = require('../middlewares/validation.middleware');
const { createTransactionSchema } = require('../validators/transaction.validator');

const router = express.Router();
const upload = multer({ dest: 'uploads/' }); // Configure multer to store uploaded files in the 'uploads/' directory

router.post('/ocr', ocrPost);
router.post('/gemini-raw', geminiRawPost);
router.post('/transactions', validate(createTransactionSchema), createTransaction);
router.get('/summary', getSummary);
router.get('/analytics', getAnalytics);

// Data Management Routes
router.get('/export/sql', exportSql);
router.get('/export/xls', exportXls);
router.post('/import', upload.array('files'), importData); // Use upload.array('files') for multiple file upload

module.exports = router;
