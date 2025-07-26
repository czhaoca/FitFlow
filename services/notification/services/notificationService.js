const nodemailer = require('nodemailer');
const twilio = require('twilio');
const Bull = require('bull');
const { format, addDays, startOfDay } = require('date-fns');
const { toZonedTime } = require('date-fns-tz');
const db = require('../utils/database');
const logger = require('../utils/logger');
const aiService = require('./aiSummaryService');

class NotificationService {
  constructor() {
    // Email transporter
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Twilio client for SMS
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    }

    // Bull queue for notification processing
    this.notificationQueue = new Bull('notifications', {
      redis: {
        port: process.env.REDIS_PORT || 6379,
        host: process.env.REDIS_HOST || 'localhost'
      }
    });

    this.setupQueueProcessors();
  }

  /**
   * Setup queue processors
   */
  setupQueueProcessors() {
    this.notificationQueue.process('email', async (job) => {
      return this.sendEmail(job.data);
    });

    this.notificationQueue.process('sms', async (job) => {
      return this.sendSMS(job.data);
    });

    this.notificationQueue.process('daily_summary', async (job) => {
      return this.sendDailySummary(job.data);
    });
  }

  /**
   * Queue a notification
   */
  async queueNotification(notification) {
    try {
      const job = await this.notificationQueue.add(
        notification.channel,
        notification,
        {
          delay: notification.delay || 0,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      );

      // Store in database
      await db.createNotification({
        ...notification,
        jobId: job.id,
        status: 'queued'
      });

      logger.info(`Notification queued: ${job.id}`);
      return job.id;
    } catch (error) {
      logger.error('Error queuing notification:', error);
      throw error;
    }
  }

  /**
   * Send email notification
   */
  async sendEmail(data) {
    try {
      const mailOptions = {
        from: `"FitFlow" <${process.env.SMTP_FROM}>`,
        to: data.recipient,
        subject: data.subject,
        html: data.content
      };

      const result = await this.emailTransporter.sendMail(mailOptions);
      
      await db.updateNotificationStatus(data.id, 'sent', {
        messageId: result.messageId
      });

      logger.info(`Email sent to ${data.recipient}`);
      return result;
    } catch (error) {
      logger.error('Error sending email:', error);
      await db.updateNotificationStatus(data.id, 'failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMS(data) {
    try {
      if (!this.twilioClient) {
        throw new Error('SMS service not configured');
      }

      const message = await this.twilioClient.messages.create({
        body: data.content,
        from: this.twilioPhoneNumber,
        to: data.recipient
      });

      await db.updateNotificationStatus(data.id, 'sent', {
        messageId: message.sid
      });

      logger.info(`SMS sent to ${data.recipient}`);
      return message;
    } catch (error) {
      logger.error('Error sending SMS:', error);
      await db.updateNotificationStatus(data.id, 'failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send daily summary to trainer
   */
  async sendDailySummary(data) {
    try {
      const { trainerId, date } = data;
      
      // Get trainer info and preferences
      const trainer = await db.getTrainerById(trainerId);
      const preferences = await db.getNotificationPreferences(trainer.user_id);
      
      // Check if daily summary is enabled
      const dailySummaryPref = preferences.find(
        p => p.notification_type === 'daily_summary'
      );
      
      if (!dailySummaryPref || !dailySummaryPref.enabled) {
        logger.info(`Daily summary disabled for trainer ${trainerId}`);
        return;
      }

      // Get tomorrow's appointments
      const tomorrow = addDays(new Date(date), 1);
      const appointments = await db.getTrainerAppointments(trainerId, tomorrow);

      if (appointments.length === 0) {
        logger.info(`No appointments for trainer ${trainerId} on ${format(tomorrow, 'yyyy-MM-dd')}`);
        return;
      }

      // Get client notes summaries
      const clientNotes = await this.getClientNotesSummaries(appointments);

      // Generate AI summary if enabled
      let aiInsights = null;
      if (process.env.ENABLE_AI_SUMMARIES === 'true') {
        aiInsights = await aiService.generateDailySummary(appointments, clientNotes);
      }

      // Prepare email content
      const emailContent = this.formatDailySummaryEmail({
        trainer,
        date: tomorrow,
        appointments,
        clientNotes,
        aiInsights
      });

      // Send notification based on preferred channel
      const channels = preferences
        .filter(p => p.notification_type === 'daily_summary' && p.enabled)
        .map(p => p.channel);

      for (const channel of channels) {
        await this.queueNotification({
          userId: trainer.user_id,
          trainerId,
          notificationType: 'daily_summary',
          channel,
          recipient: channel === 'email' ? trainer.email : trainer.phone,
          subject: `Your Schedule for ${format(tomorrow, 'EEEE, MMMM d')}`,
          content: channel === 'email' ? emailContent : this.formatDailySummarySMS(appointments),
          metadata: {
            date: tomorrow,
            appointmentCount: appointments.length
          }
        });
      }

      // Store summary in database
      await db.createTrainerDailySummary({
        trainerId,
        summaryDate: tomorrow,
        appointments,
        clientNotes,
        aiInsights
      });

      logger.info(`Daily summary sent to trainer ${trainerId}`);
    } catch (error) {
      logger.error('Error sending daily summary:', error);
      throw error;
    }
  }

  /**
   * Get client notes summaries for appointments
   */
  async getClientNotesSummaries(appointments) {
    const summaries = {};
    
    for (const appointment of appointments) {
      const clientId = appointment.participants[0]?.client_id;
      if (clientId) {
        // Get last 3 session notes
        const recentNotes = await db.getRecentSessionNotes(clientId, 3);
        
        if (recentNotes.length > 0) {
          summaries[clientId] = {
            clientName: appointment.participants[0].client_name,
            lastSession: recentNotes[0].session_date,
            keyPoints: recentNotes.map(note => ({
              date: note.session_date,
              assessment: note.assessment,
              plan: note.plan,
              privateNotes: note.private_notes
            }))
          };
        }
      }
    }
    
    return summaries;
  }

  /**
   * Format daily summary email
   */
  formatDailySummaryEmail({ trainer, date, appointments, clientNotes, aiInsights }) {
    const dateStr = format(date, 'EEEE, MMMM d, yyyy');
    
    let html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your Schedule for ${dateStr}</h2>
        <p>Hi ${trainer.business_name || trainer.first_name},</p>
        <p>You have ${appointments.length} appointment${appointments.length > 1 ? 's' : ''} scheduled for tomorrow:</p>
        
        <div style="margin: 20px 0;">
    `;

    // List appointments
    appointments.forEach(apt => {
      const startTime = format(new Date(apt.start_time), 'h:mm a');
      const endTime = format(new Date(apt.end_time), 'h:mm a');
      const client = apt.participants[0];
      
      html += `
        <div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px;">
          <h3 style="margin: 0 0 10px 0; color: #2196F3;">${startTime} - ${endTime}</h3>
          <p style="margin: 5px 0;"><strong>Client:</strong> ${client?.client_name || 'No client assigned'}</p>
          <p style="margin: 5px 0;"><strong>Type:</strong> ${apt.class_type}</p>
          <p style="margin: 5px 0;"><strong>Location:</strong> ${apt.studio_name || apt.location_type}</p>
      `;

      // Add client notes if available
      if (client && clientNotes[client.client_id]) {
        const notes = clientNotes[client.client_id];
        html += `
          <div style="background-color: #f5f5f5; padding: 10px; margin-top: 10px; border-radius: 4px;">
            <h4 style="margin: 0 0 5px 0; color: #666;">Recent Notes:</h4>
        `;
        
        notes.keyPoints.slice(0, 2).forEach(point => {
          html += `
            <div style="margin: 5px 0; font-size: 14px;">
              <strong>${format(new Date(point.date), 'MMM d')}:</strong>
              ${point.plan || point.assessment || 'No notes'}
            </div>
          `;
        });
        
        html += `</div>`;
      }
      
      html += `</div>`;
    });

    // Add AI insights if available
    if (aiInsights) {
      html += `
        <div style="background-color: #e3f2fd; padding: 15px; margin: 20px 0; border-radius: 8px;">
          <h3 style="margin: 0 0 10px 0; color: #1976D2;">AI Insights</h3>
          <div style="white-space: pre-wrap;">${aiInsights}</div>
        </div>
      `;
    }

    html += `
        </div>
        <hr style="border: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 14px;">
          You can update your notification preferences in your account settings.
        </p>
      </div>
    `;

    return html;
  }

  /**
   * Format daily summary SMS
   */
  formatDailySummarySMS(appointments) {
    const tomorrow = format(addDays(new Date(), 1), 'MMM d');
    let message = `FitFlow: ${appointments.length} appointments tomorrow (${tomorrow}):\n\n`;
    
    appointments.slice(0, 3).forEach(apt => {
      const time = format(new Date(apt.start_time), 'h:mma');
      const client = apt.participants[0]?.client_name || 'TBD';
      message += `${time} - ${client}\n`;
    });
    
    if (appointments.length > 3) {
      message += `\n+${appointments.length - 3} more`;
    }
    
    return message.substring(0, 160); // SMS limit
  }

  /**
   * Schedule daily summaries
   */
  async scheduleDailySummaries() {
    try {
      // Get all trainers with daily summary enabled
      const trainers = await db.getTrainersWithDailySummary();
      
      for (const trainer of trainers) {
        // Get trainer's timezone and preferred time
        const preferences = await db.getNotificationPreferences(trainer.user_id);
        const dailySummaryPref = preferences.find(
          p => p.notification_type === 'daily_summary'
        );
        
        if (dailySummaryPref?.schedule) {
          const { time, timezone } = dailySummaryPref.schedule;
          
          // Calculate when to send based on timezone
          const now = new Date();
          const userTime = toZonedTime(now, timezone);
          const [hours, minutes] = time.split(':').map(Number);
          
          const scheduledTime = new Date(userTime);
          scheduledTime.setHours(hours, minutes, 0, 0);
          
          // If time has passed today, schedule for tomorrow
          if (scheduledTime < userTime) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
          }
          
          const delay = scheduledTime.getTime() - now.getTime();
          
          await this.notificationQueue.add(
            'daily_summary',
            {
              trainerId: trainer.id,
              date: format(now, 'yyyy-MM-dd')
            },
            { delay }
          );
        }
      }
      
      logger.info('Daily summaries scheduled');
    } catch (error) {
      logger.error('Error scheduling daily summaries:', error);
      throw error;
    }
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder(appointmentId, hoursBeforeö) {
    try {
      const appointment = await db.getAppointmentById(appointmentId);
      const participants = appointment.participants;

      for (const participant of participants) {
        const client = await db.getClientById(participant.client_id);
        const preferences = await db.getNotificationPreferences(client.user_id);
        
        const reminderPref = preferences.find(
          p => p.notification_type === 'appointment_reminder'
        );
        
        if (reminderPref?.enabled) {
          const content = this.formatAppointmentReminder(appointment, client);
          
          await this.queueNotification({
            userId: client.user_id,
            notificationType: 'appointment_reminder',
            channel: reminderPref.channel,
            recipient: reminderPref.channel === 'email' ? client.email : client.phone,
            subject: 'Appointment Reminder',
            content,
            metadata: {
              appointmentId,
              hoursBeforeö
            }
          });
        }
      }
    } catch (error) {
      logger.error('Error sending appointment reminder:', error);
      throw error;
    }
  }

  /**
   * Format appointment reminder
   */
  formatAppointmentReminder(appointment, client) {
    const startTime = format(new Date(appointment.start_time), 'EEEE, MMMM d at h:mm a');
    
    return `
      <div style="font-family: Arial, sans-serif;">
        <h3>Appointment Reminder</h3>
        <p>Hi ${client.first_name},</p>
        <p>This is a reminder about your upcoming appointment:</p>
        <ul>
          <li><strong>Date & Time:</strong> ${startTime}</li>
          <li><strong>Trainer:</strong> ${appointment.trainer_name}</li>
          <li><strong>Type:</strong> ${appointment.class_type}</li>
          <li><strong>Location:</strong> ${appointment.studio_name || appointment.location_type}</li>
        </ul>
        <p>If you need to cancel or reschedule, please do so at least 24 hours in advance.</p>
      </div>
    `;
  }
}

module.exports = new NotificationService();