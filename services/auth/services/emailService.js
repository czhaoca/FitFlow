const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendVerificationEmail(email, firstName, token) {
    try {
      const verificationUrl = `${process.env.CLIENT_APP_URL}/verify-email?token=${token}`;
      
      const mailOptions = {
        from: `"FitFlow" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: 'Verify Your FitFlow Account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome to FitFlow, ${firstName}!</h2>
            <p style="color: #666;">Thank you for registering. Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Verify Email
              </a>
            </div>
            <p style="color: #666;">Or copy and paste this link into your browser:</p>
            <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
            <p style="color: #666;">This link will expire in 24 hours.</p>
            <hr style="border: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">If you didn't create a FitFlow account, please ignore this email.</p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Verification email sent to ${email}`);
    } catch (error) {
      logger.error('Error sending verification email:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email, firstName, token) {
    try {
      const resetUrl = `${process.env.CLIENT_APP_URL}/reset-password?token=${token}`;
      
      const mailOptions = {
        from: `"FitFlow" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: 'Reset Your FitFlow Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p style="color: #666;">Hi ${firstName},</p>
            <p style="color: #666;">We received a request to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #FF9800; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #666;">Or copy and paste this link into your browser:</p>
            <p style="color: #666; word-break: break-all;">${resetUrl}</p>
            <p style="color: #666;">This link will expire in 1 hour.</p>
            <hr style="border: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Password reset email sent to ${email}`);
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(email, firstName) {
    try {
      const mailOptions = {
        from: `"FitFlow" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: 'Welcome to FitFlow!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome to FitFlow, ${firstName}!</h2>
            <p style="color: #666;">Your account has been successfully verified and you're all set to start your fitness journey.</p>
            <h3 style="color: #333;">What's Next?</h3>
            <ul style="color: #666;">
              <li>Browse available trainers and their specializations</li>
              <li>Book your first session</li>
              <li>Set up your fitness goals and preferences</li>
              <li>Track your progress and achievements</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.CLIENT_APP_URL}/dashboard" style="background-color: #2196F3; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Go to Dashboard
              </a>
            </div>
            <hr style="border: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">Need help? Contact us at support@fitflow.ca</p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Welcome email sent to ${email}`);
    } catch (error) {
      logger.error('Error sending welcome email:', error);
      throw error;
    }
  }

  async sendAppointmentConfirmation(email, appointmentDetails) {
    try {
      const mailOptions = {
        from: `"FitFlow" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: 'Appointment Confirmation - FitFlow',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Appointment Confirmed!</h2>
            <p style="color: #666;">Your appointment has been successfully booked.</p>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Appointment Details</h3>
              <p style="color: #666;"><strong>Trainer:</strong> ${appointmentDetails.trainerName}</p>
              <p style="color: #666;"><strong>Date:</strong> ${appointmentDetails.date}</p>
              <p style="color: #666;"><strong>Time:</strong> ${appointmentDetails.time}</p>
              <p style="color: #666;"><strong>Duration:</strong> ${appointmentDetails.duration} minutes</p>
              <p style="color: #666;"><strong>Location:</strong> ${appointmentDetails.location}</p>
              <p style="color: #666;"><strong>Class Type:</strong> ${appointmentDetails.classType}</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.CLIENT_APP_URL}/appointments" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
                View Appointment
              </a>
            </div>
            <hr style="border: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">Need to cancel or reschedule? Please do so at least 24 hours in advance.</p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Appointment confirmation sent to ${email}`);
    } catch (error) {
      logger.error('Error sending appointment confirmation:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();