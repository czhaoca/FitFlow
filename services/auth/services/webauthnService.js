const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const db = require('../utils/database');
const logger = require('../utils/logger');

class WebAuthnService {
  constructor() {
    this.rpName = 'FitFlow';
    this.rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
    this.origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
  }

  /**
   * Generate registration options for a new passkey
   */
  async generateRegistrationOptions(userId, userEmail, userName) {
    try {
      // Get existing credentials for this user
      const existingCredentials = await db.getUserWebAuthnCredentials(userId);
      
      const excludeCredentials = existingCredentials.map(cred => ({
        id: Buffer.from(cred.credential_id, 'base64'),
        type: 'public-key',
        transports: cred.transports || []
      }));

      const options = await generateRegistrationOptions({
        rpName: this.rpName,
        rpID: this.rpID,
        userID: userId,
        userName: userEmail,
        userDisplayName: userName,
        attestationType: 'none',
        excludeCredentials,
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          requireResidentKey: true,
          residentKey: 'required',
          userVerification: 'required'
        },
        supportedAlgorithmIDs: [-7, -257], // ES256, RS256
      });

      // Store challenge temporarily
      await db.storeWebAuthnChallenge(userId, options.challenge, 'registration');

      return options;
    } catch (error) {
      logger.error('Error generating registration options:', error);
      throw error;
    }
  }

  /**
   * Verify registration response
   */
  async verifyRegistration(userId, response) {
    try {
      // Get stored challenge
      const expectedChallenge = await db.getWebAuthnChallenge(userId, 'registration');
      if (!expectedChallenge) {
        throw new Error('Registration challenge not found or expired');
      }

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true
      });

      if (verification.verified && verification.registrationInfo) {
        const { credentialPublicKey, credentialID, counter, aaguid } = verification.registrationInfo;
        
        // Save credential to database
        await db.saveWebAuthnCredential({
          userId,
          credentialId: Buffer.from(credentialID).toString('base64'),
          publicKey: Buffer.from(credentialPublicKey).toString('base64'),
          counter,
          aaguid: aaguid || null,
          transports: response.response.transports || [],
          deviceName: response.deviceName || 'Unknown Device'
        });

        // Clear challenge
        await db.clearWebAuthnChallenge(userId, 'registration');

        logger.info(`WebAuthn credential registered for user ${userId}`);
        return { verified: true };
      }

      return { verified: false, error: 'Verification failed' };
    } catch (error) {
      logger.error('Error verifying registration:', error);
      throw error;
    }
  }

  /**
   * Generate authentication options
   */
  async generateAuthenticationOptions(userIdOrEmail) {
    try {
      let userId;
      let allowCredentials = [];

      // Check if it's an email or userId
      if (userIdOrEmail && userIdOrEmail.includes('@')) {
        // It's an email, get user credentials
        const user = await db.getUserByEmail(userIdOrEmail);
        if (user) {
          userId = user.id;
          const credentials = await db.getUserWebAuthnCredentials(user.id);
          allowCredentials = credentials.map(cred => ({
            id: Buffer.from(cred.credential_id, 'base64'),
            type: 'public-key',
            transports: cred.transports || []
          }));
        }
      } else if (userIdOrEmail) {
        // It's a userId
        userId = userIdOrEmail;
        const credentials = await db.getUserWebAuthnCredentials(userId);
        allowCredentials = credentials.map(cred => ({
          id: Buffer.from(cred.credential_id, 'base64'),
          type: 'public-key',
          transports: cred.transports || []
        }));
      }

      const options = await generateAuthenticationOptions({
        rpID: this.rpID,
        allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
        userVerification: 'required'
      });

      // Store challenge
      if (userId) {
        await db.storeWebAuthnChallenge(userId, options.challenge, 'authentication');
      } else {
        // For passwordless login, store challenge with a temporary key
        await db.storeWebAuthnChallenge(`temp_${options.challenge}`, options.challenge, 'authentication');
      }

      return options;
    } catch (error) {
      logger.error('Error generating authentication options:', error);
      throw error;
    }
  }

  /**
   * Verify authentication response
   */
  async verifyAuthentication(response, expectedChallenge) {
    try {
      const credentialId = response.id;
      
      // Get credential from database
      const credential = await db.getWebAuthnCredential(credentialId);
      if (!credential) {
        throw new Error('Credential not found');
      }

      // Get expected challenge
      const challenge = expectedChallenge || 
        await db.getWebAuthnChallenge(credential.user_id, 'authentication') ||
        await db.getWebAuthnChallenge(`temp_${response.response.challenge}`, 'authentication');

      if (!challenge) {
        throw new Error('Authentication challenge not found or expired');
      }

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        authenticator: {
          credentialID: Buffer.from(credential.credential_id, 'base64'),
          credentialPublicKey: Buffer.from(credential.public_key, 'base64'),
          counter: credential.counter
        },
        requireUserVerification: true
      });

      if (verification.verified) {
        // Update counter and last used
        await db.updateWebAuthnCredential(credentialId, {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date()
        });

        // Clear challenge
        await db.clearWebAuthnChallenge(credential.user_id, 'authentication');

        // Get user info
        const user = await db.getUserById(credential.user_id);
        const person = await db.getPersonByUserId(credential.user_id);

        logger.info(`WebAuthn authentication successful for user ${credential.user_id}`);
        
        return { 
          verified: true, 
          userId: credential.user_id,
          user,
          person
        };
      }

      return { verified: false, error: 'Verification failed' };
    } catch (error) {
      logger.error('Error verifying authentication:', error);
      throw error;
    }
  }

  /**
   * List user's passkeys
   */
  async listUserPasskeys(userId) {
    try {
      const credentials = await db.getUserWebAuthnCredentials(userId);
      
      return credentials.map(cred => ({
        id: cred.id,
        deviceName: cred.device_name,
        createdAt: cred.created_at,
        lastUsedAt: cred.last_used_at,
        transports: cred.transports
      }));
    } catch (error) {
      logger.error('Error listing user passkeys:', error);
      throw error;
    }
  }

  /**
   * Delete a passkey
   */
  async deletePasskey(userId, passkeyId) {
    try {
      await db.deleteWebAuthnCredential(userId, passkeyId);
      logger.info(`Deleted passkey ${passkeyId} for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting passkey:', error);
      throw error;
    }
  }

  /**
   * Rename a passkey
   */
  async renamePasskey(userId, passkeyId, newName) {
    try {
      await db.updateWebAuthnCredential(passkeyId, {
        deviceName: newName
      }, userId);
      
      logger.info(`Renamed passkey ${passkeyId} for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error renaming passkey:', error);
      throw error;
    }
  }
}

module.exports = new WebAuthnService();