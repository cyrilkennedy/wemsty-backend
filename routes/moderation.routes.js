const express = require('express');
const router = express.Router();
const moderationController = require('../controllers/moderation.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware.protect);

router.post('/reports', moderationController.createReport);
router.get('/reports', authMiddleware.restrictTo('admin', 'moderator'), moderationController.listReports);
router.post('/reports/:reportId/actions', authMiddleware.restrictTo('admin', 'moderator'), moderationController.takeModerationAction);
router.get('/audit-logs', authMiddleware.restrictTo('admin', 'moderator'), moderationController.listAuditLogs);

module.exports = router;
