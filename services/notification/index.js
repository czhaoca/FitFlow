require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const notificationRoutes = require('./routes/notificationRoutes');
const notificationService = require('./services/notificationService');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 3003;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'notification-service', timestamp: new Date() });
});

// Routes
app.use('/api/notifications', notificationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Schedule daily summaries every day at 6 PM (to send for next day)
cron.schedule('0 18 * * *', async () => {
  logger.info('Running daily summary scheduler');
  try {
    await notificationService.scheduleDailySummaries();
  } catch (error) {
    logger.error('Error in daily summary cron job:', error);
  }
});

// Schedule appointment reminders check every hour
cron.schedule('0 * * * *', async () => {
  logger.info('Running appointment reminder scheduler');
  try {
    await notificationService.scheduleAppointmentReminders();
  } catch (error) {
    logger.error('Error in appointment reminder cron job:', error);
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Notification service running on port ${PORT}`);
});