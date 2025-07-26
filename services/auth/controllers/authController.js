const clientAuthService = require('../services/clientAuthService');
const webauthnService = require('../services/webauthnService');
const { validateRegistration, validateLogin, validatePasswordReset } = require('../utils/validators');
const logger = require('../utils/logger');

class AuthController {
  /**
   * Register new client
   */
  async registerClient(req, res) {
    try {
      const { error } = validateRegistration(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const result = await clientAuthService.register(req.body);
      
      res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        data: result
      });
    } catch (error) {
      logger.error('Registration error:', error);
      if (error.message === 'Email already registered') {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: 'Registration failed' });
    }
  }

  /**
   * Client login
   */
  async loginClient(req, res) {
    try {
      const { error } = validateLogin(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { email, password, twoFactorToken } = req.body;
      
      // Initial login
      const loginResult = await clientAuthService.login(email, password);
      
      // Check if 2FA is required
      const user = await clientAuthService.getUserByEmail(email);
      if (user.mfa_enabled) {
        if (!twoFactorToken) {
          return res.status(200).json({
            requiresTwoFactor: true,
            tempToken: loginResult.tempToken
          });
        }
        
        // Verify 2FA token
        const isValid = await clientAuthService.verifyTwoFactor(user.id, twoFactorToken);
        if (!isValid) {
          return res.status(401).json({ error: 'Invalid 2FA token' });
        }
      }

      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', loginResult.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({
        success: true,
        accessToken: loginResult.accessToken,
        user: loginResult.user
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(401).json({ error: error.message || 'Login failed' });
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;
      
      await clientAuthService.verifyEmail(token);
      
      res.json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      logger.error('Email verification error:', error);
      res.status(400).json({ error: error.message || 'Verification failed' });
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(req, res) {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      await clientAuthService.requestPasswordReset(email);
      
      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent'
      });
    } catch (error) {
      logger.error('Password reset request error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  }

  /**
   * Reset password
   */
  async resetPassword(req, res) {
    try {
      const { error } = validatePasswordReset(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { token, newPassword } = req.body;
      
      await clientAuthService.resetPassword(token, newPassword);
      
      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      logger.error('Password reset error:', error);
      res.status(400).json({ error: error.message || 'Password reset failed' });
    }
  }

  /**
   * Enable 2FA
   */
  async enableTwoFactor(req, res) {
    try {
      const userId = req.user.id;
      
      const result = await clientAuthService.enableTwoFactor(userId);
      
      res.json({
        success: true,
        secret: result.secret,
        qrCode: result.qrCode
      });
    } catch (error) {
      logger.error('2FA setup error:', error);
      res.status(500).json({ error: 'Failed to setup 2FA' });
    }
  }

  /**
   * Confirm 2FA
   */
  async confirmTwoFactor(req, res) {
    try {
      const userId = req.user.id;
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: '2FA token is required' });
      }

      await clientAuthService.confirmTwoFactor(userId, token);
      
      res.json({
        success: true,
        message: '2FA enabled successfully'
      });
    } catch (error) {
      logger.error('2FA confirmation error:', error);
      res.status(400).json({ error: error.message || 'Failed to enable 2FA' });
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(req, res) {
    try {
      const refreshToken = req.cookies.refreshToken;
      
      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token not provided' });
      }

      const result = await clientAuthService.refreshToken(refreshToken);
      
      res.json({
        success: true,
        accessToken: result.accessToken
      });
    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  }

  /**
   * Logout
   */
  async logout(req, res) {
    try {
      const userId = req.user.id;
      
      await clientAuthService.logout(userId);
      
      // Clear refresh token cookie
      res.clearCookie('refreshToken');
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(req, res) {
    try {
      const userId = req.user.id;
      
      const user = await clientAuthService.getUserProfile(userId);
      
      res.json({
        success: true,
        user
      });
    } catch (error) {
      logger.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user data' });
    }
  }

  /**
   * Update profile
   */
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const updates = req.body;
      
      const updatedProfile = await clientAuthService.updateProfile(userId, updates);
      
      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: updatedProfile
      });
    } catch (error) {
      logger.error('Profile update error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }

  /**
   * WebAuthn - Generate registration options
   */
  async generateRegistrationOptions(req, res) {
    try {
      const userId = req.user.id;
      const { email, firstName, lastName } = req.user;
      const userName = `${firstName} ${lastName}`;

      const options = await webauthnService.generateRegistrationOptions(userId, email, userName);
      
      res.json(options);
    } catch (error) {
      logger.error('WebAuthn registration options error:', error);
      res.status(500).json({ error: 'Failed to generate registration options' });
    }
  }

  /**
   * WebAuthn - Verify registration
   */
  async verifyRegistration(req, res) {
    try {
      const userId = req.user.id;
      const response = req.body;

      const result = await webauthnService.verifyRegistration(userId, response);
      
      if (result.verified) {
        // Enable WebAuthn for user
        await clientAuthService.enableWebAuthn(userId);
        
        res.json({
          success: true,
          message: 'Passkey registered successfully'
        });
      } else {
        res.status(400).json({ error: result.error || 'Registration verification failed' });
      }
    } catch (error) {
      logger.error('WebAuthn registration verification error:', error);
      res.status(500).json({ error: 'Failed to verify registration' });
    }
  }

  /**
   * WebAuthn - Generate authentication options
   */
  async generateAuthenticationOptions(req, res) {
    try {
      const { email } = req.body; // Optional, for passwordless login
      
      const options = await webauthnService.generateAuthenticationOptions(email || req.user?.id);
      
      res.json(options);
    } catch (error) {
      logger.error('WebAuthn authentication options error:', error);
      res.status(500).json({ error: 'Failed to generate authentication options' });
    }
  }

  /**
   * WebAuthn - Verify authentication
   */
  async verifyAuthentication(req, res) {
    try {
      const response = req.body;
      const expectedChallenge = req.body.expectedChallenge;

      const result = await webauthnService.verifyAuthentication(response, expectedChallenge);
      
      if (result.verified) {
        // Generate tokens
        const tokens = await clientAuthService.generateTokensForUser(result.userId);
        
        // Set refresh token as httpOnly cookie
        res.cookie('refreshToken', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
          success: true,
          accessToken: tokens.accessToken,
          user: tokens.user
        });
      } else {
        res.status(400).json({ error: result.error || 'Authentication verification failed' });
      }
    } catch (error) {
      logger.error('WebAuthn authentication verification error:', error);
      res.status(500).json({ error: 'Failed to verify authentication' });
    }
  }

  /**
   * List user's passkeys
   */
  async listPasskeys(req, res) {
    try {
      const userId = req.user.id;
      
      const passkeys = await webauthnService.listUserPasskeys(userId);
      
      res.json({
        success: true,
        passkeys
      });
    } catch (error) {
      logger.error('List passkeys error:', error);
      res.status(500).json({ error: 'Failed to list passkeys' });
    }
  }

  /**
   * Delete a passkey
   */
  async deletePasskey(req, res) {
    try {
      const userId = req.user.id;
      const { passkeyId } = req.params;
      
      await webauthnService.deletePasskey(userId, passkeyId);
      
      res.json({
        success: true,
        message: 'Passkey deleted successfully'
      });
    } catch (error) {
      logger.error('Delete passkey error:', error);
      res.status(500).json({ error: 'Failed to delete passkey' });
    }
  }

  /**
   * Rename a passkey
   */
  async renamePasskey(req, res) {
    try {
      const userId = req.user.id;
      const { passkeyId } = req.params;
      const { name } = req.body;
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required' });
      }

      await webauthnService.renamePasskey(userId, passkeyId, name.trim());
      
      res.json({
        success: true,
        message: 'Passkey renamed successfully'
      });
    } catch (error) {
      logger.error('Rename passkey error:', error);
      res.status(500).json({ error: 'Failed to rename passkey' });
    }
  }
}

module.exports = new AuthController();