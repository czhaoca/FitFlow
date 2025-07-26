const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate, authorize } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');

// All routes require authentication
router.use(authenticate);

// User preference routes
router.get('/preferences', notificationController.getPreferences);
router.put('/preferences', rateLimiter, notificationController.updatePreference);
router.post('/test', rateLimiter, notificationController.sendTest);

// Notification history
router.get('/history', notificationController.getHistory);
router.put('/read/:notificationId', notificationController.markAsRead);
router.get('/unread-count', notificationController.getUnreadCount);

// Admin routes
router.post(
  '/queue',
  authorize(['admin', 'manager']),
  rateLimiter,
  notificationController.queueNotification
);

router.post(
  '/trigger-summaries',
  authorize(['admin']),
  rateLimiter,
  notificationController.triggerDailySummaries
);

router.get(
  '/statistics',
  authorize(['admin', 'manager']),
  notificationController.getStatistics
);

module.exports = router;