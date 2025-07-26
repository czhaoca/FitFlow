const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/database');
const emailService = require('./emailService');
const redisClient = require('../utils/redis');
const logger = require('../utils/logger');

class ClientAuthService {
  /**
   * Register a new client
   */
  async register(clientData) {
    const client = null;
    
    try {
      await db.beginTransaction();

      // Check if email already exists
      const existingUser = await db.getUserByEmail(clientData.email);
      if (existingUser) {
        throw new Error('Email already registered');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(clientData.password, 10);

      // Create user account
      const user = await db.createUser({
        email: clientData.email,
        passwordHash,
        role: 'client'
      });

      // Create client profile
      const client = await db.createClient({
        userId: user.id,
        firstName: clientData.firstName,
        lastName: clientData.lastName,
        email: clientData.email,
        phone: clientData.phone,
        dateOfBirth: clientData.dateOfBirth,
        emergencyContact: clientData.emergencyContact
      });

      // Generate verification token
      const verificationToken = uuidv4();
      await redisClient.setex(
        `email_verification:${verificationToken}`,
        86400, // 24 hours
        user.id
      );

      // Send verification email
      await emailService.sendVerificationEmail(
        clientData.email,
        clientData.firstName,
        verificationToken
      );

      await db.commitTransaction();

      logger.info(`Client registered successfully: ${client.id}`);
      
      return {
        clientId: client.id,
        userId: user.id,
        email: client.email,
        verificationSent: true
      };
    } catch (error) {
      await db.rollbackTransaction();
      logger.error('Client registration error:', error);
      throw error;
    }
  }

  /**
   * Client login
   */
  async login(email, password) {
    try {
      // Get user by email
      const user = await db.getUserByEmail(email);
      if (!user || user.status !== 'active') {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      // Check if email is verified
      if (!user.email_verified) {
        throw new Error('Please verify your email before logging in');
      }

      // Get client profile
      const client = await db.getClientByUserId(user.id);
      if (!client) {
        throw new Error('Client profile not found');
      }

      // Generate tokens
      const accessToken = this.generateAccessToken(user, client);
      const refreshToken = this.generateRefreshToken(user.id);

      // Store refresh token in Redis
      await redisClient.setex(
        `refresh_token:${user.id}`,
        604800, // 7 days
        refreshToken
      );

      // Update last login
      await db.updateUserLastLogin(user.id);

      logger.info(`Client login successful: ${client.id}`);

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          clientId: client.id,
          email: user.email,
          firstName: client.first_name,
          lastName: client.last_name,
          role: 'client'
        }
      };
    } catch (error) {
      logger.error('Client login error:', error);
      throw error;
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(token) {
    try {
      const userId = await redisClient.get(`email_verification:${token}`);
      if (!userId) {
        throw new Error('Invalid or expired verification token');
      }

      await db.verifyUserEmail(userId);
      await redisClient.del(`email_verification:${token}`);

      logger.info(`Email verified for user: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Email verification error:', error);
      throw error;
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email) {
    try {
      const user = await db.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists
        return { success: true };
      }

      const client = await db.getClientByUserId(user.id);
      if (!client) {
        return { success: true };
      }

      // Generate reset token
      const resetToken = uuidv4();
      await redisClient.setex(
        `password_reset:${resetToken}`,
        3600, // 1 hour
        user.id
      );

      // Send reset email
      await emailService.sendPasswordResetEmail(
        email,
        client.first_name,
        resetToken
      );

      logger.info(`Password reset requested for: ${email}`);
      return { success: true };
    } catch (error) {
      logger.error('Password reset request error:', error);
      throw error;
    }
  }

  /**
   * Reset password
   */
  async resetPassword(token, newPassword) {
    try {
      const userId = await redisClient.get(`password_reset:${token}`);
      if (!userId) {
        throw new Error('Invalid or expired reset token');
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await db.updateUserPassword(userId, passwordHash);
      await redisClient.del(`password_reset:${token}`);

      logger.info(`Password reset for user: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Password reset error:', error);
      throw error;
    }
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactor(userId) {
    try {
      const user = await db.getUserById(userId);
      const client = await db.getClientByUserId(userId);

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `FitFlow (${client.email})`,
        issuer: 'FitFlow'
      });

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url);

      // Store secret temporarily
      await redisClient.setex(
        `2fa_setup:${userId}`,
        600, // 10 minutes
        secret.base32
      );

      return {
        secret: secret.base32,
        qrCode
      };
    } catch (error) {
      logger.error('2FA setup error:', error);
      throw error;
    }
  }

  /**
   * Confirm two-factor authentication
   */
  async confirmTwoFactor(userId, token) {
    try {
      const secret = await redisClient.get(`2fa_setup:${userId}`);
      if (!secret) {
        throw new Error('2FA setup expired');
      }

      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 1
      });

      if (!verified) {
        throw new Error('Invalid 2FA token');
      }

      // Save encrypted secret
      await db.enableUserTwoFactor(userId, secret);
      await redisClient.del(`2fa_setup:${userId}`);

      logger.info(`2FA enabled for user: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('2FA confirmation error:', error);
      throw error;
    }
  }

  /**
   * Verify two-factor token
   */
  async verifyTwoFactor(userId, token) {
    try {
      const user = await db.getUserById(userId);
      if (!user.mfa_enabled || !user.mfa_secret) {
        throw new Error('2FA not enabled');
      }

      const verified = speakeasy.totp.verify({
        secret: user.mfa_secret,
        encoding: 'base32',
        token,
        window: 1
      });

      return verified;
    } catch (error) {
      logger.error('2FA verification error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      const storedToken = await redisClient.get(`refresh_token:${decoded.userId}`);

      if (storedToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      const user = await db.getUserById(decoded.userId);
      const client = await db.getClientByUserId(user.id);

      const newAccessToken = this.generateAccessToken(user, client);

      return { accessToken: newAccessToken };
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw error;
    }
  }

  /**
   * Logout
   */
  async logout(userId) {
    try {
      await redisClient.del(`refresh_token:${userId}`);
      logger.info(`Client logged out: ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Generate access token
   */
  generateAccessToken(user, client) {
    return jwt.sign(
      {
        id: user.id,
        clientId: client.id,
        email: user.email,
        role: 'client',
        firstName: client.first_name,
        lastName: client.last_name
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(userId) {
    return jwt.sign(
      { userId },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '7d' }
    );
  }
}

module.exports = new ClientAuthService();