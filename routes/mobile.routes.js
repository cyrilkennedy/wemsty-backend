const express = require('express');
const router = express.Router();
const updateController = require('../controllers/update.controller');

// Check for live updates
router.get('/update-check', updateController.checkUpdate);

// Proxy download of update asset
router.get('/update-download/:assetId', updateController.downloadUpdate);

module.exports = router;
