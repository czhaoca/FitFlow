const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { validateNotificationPreference, validateNotification } = require('../utils/validators');

class NotificationController {
  /**
   * Get user notification preferences
   */
  async getPreferences(req, res) {
    try {
      const userId = req.user.id;
      
      const preferences = await notificationService.getUserPreferences(userId);
      
      res.json({
        success: true,
        preferences
      });
    } catch (error) {
      logger.error('Error getting notification preferences:', error);
      res.status(500).json({ error: 'Failed to get preferences' });
    }
  }

  /**
   * Update notification preference
   */
  async updatePreference(req, res) {
    try {
      const { error } = validateNotificationPreference(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const userId = req.user.id;
      const { notificationType, channel, enabled, schedule } = req.body;

      await notificationService.updatePreference({
        userId,
        notificationType,
        channel,
        enabled,
        schedule
      });

      res.json({
        success: true,
        message: 'Preference updated successfully'
      });
    } catch (error) {
      logger.error('Error updating notification preference:', error);
      res.status(500).json({ error: 'Failed to update preference' });
    }
  }

  /**
   * Send test notification
   */
  async sendTest(req, res) {
    try {
      const userId = req.user.id;
      const { notificationType, channel } = req.body;

      if (!notificationType || !channel) {
        return res.status(400).json({ 
          error: 'Notification type and channel are required' 
        });
      }

      await notificationService.sendTestNotification(userId, notificationType, channel);

      res.json({
        success: true,
        message: 'Test notification sent'
      });
    } catch (error) {
      logger.error('Error sending test notification:', error);
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  }

  /**
   * Get notification history
   */
  async getHistory(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 20, offset = 0, status } = req.query;

      const notifications = await notificationService.getNotificationHistory(
        userId,
        { limit: parseInt(limit), offset: parseInt(offset), status }
      );

      res.json({
        success: true,
        notifications,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('Error getting notification history:', error);
      res.status(500).json({ error: 'Failed to get notification history' });
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(req, res) {
    try {
      const userId = req.user.id;
      const { notificationId } = req.params;

      await notificationService.markAsRead(userId, notificationId);

      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  }

  /**
   * Get unread count
   */
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;

      const count = await notificationService.getUnreadCount(userId);

      res.json({
        success: true,
        count
      });
    } catch (error) {
      logger.error('Error getting unread count:', error);
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  }

  /**
   * Queue custom notification (admin only)
   */
  async queueNotification(req, res) {
    try {
      const { error } = validateNotification(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const jobId = await notificationService.queueNotification(req.body);

      res.json({
        success: true,
        jobId,
        message: 'Notification queued successfully'
      });
    } catch (error) {
      logger.error('Error queuing notification:', error);
      res.status(500).json({ error: 'Failed to queue notification' });
    }
  }

  /**
   * Trigger daily summaries manually (admin only)
   */
  async triggerDailySummaries(req, res) {
    try {
      await notificationService.scheduleDailySummaries();

      res.json({
        success: true,
        message: 'Daily summaries scheduled'
      });
    } catch (error) {
      logger.error('Error triggering daily summaries:', error);
      res.status(500).json({ error: 'Failed to schedule daily summaries' });
    }
  }

  /**
   * Get notification statistics (admin only)
   */
  async getStatistics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const stats = await notificationService.getNotificationStatistics({
        startDate,
        endDate
      });

      res.json({
        success: true,
        statistics: stats
      });
    } catch (error) {
      logger.error('Error getting notification statistics:', error);
      res.status(500).json({ error: 'Failed to get statistics' });
    }
  }
}

module.exports = new NotificationController();