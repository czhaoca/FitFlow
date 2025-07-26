const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { rateLimiter, strictRateLimiter } = require('../middleware/rateLimiter');

// Public routes
router.post('/client/register', rateLimiter, authController.registerClient);
router.post('/client/login', strictRateLimiter, authController.loginClient);
router.get('/verify-email/:token', rateLimiter, authController.verifyEmail);
router.post('/password-reset/request', strictRateLimiter, authController.requestPasswordReset);
router.post('/password-reset/confirm', strictRateLimiter, authController.resetPassword);
router.post('/refresh', rateLimiter, authController.refreshToken);

// Protected routes
router.use(authenticate);

router.post('/logout', authController.logout);
router.get('/me', authController.getCurrentUser);
router.put('/profile', rateLimiter, authController.updateProfile);
router.post('/2fa/enable', rateLimiter, authController.enableTwoFactor);
router.post('/2fa/confirm', rateLimiter, authController.confirmTwoFactor);

// WebAuthn/Passkey routes
router.post('/webauthn/registration/options', authController.generateRegistrationOptions);
router.post('/webauthn/registration/verify', authController.verifyRegistration);
router.post('/webauthn/authentication/options', authController.generateAuthenticationOptions);
router.post('/webauthn/authentication/verify', authController.verifyAuthentication);
router.get('/webauthn/passkeys', authController.listPasskeys);
router.delete('/webauthn/passkeys/:passkeyId', authController.deletePasskey);
router.put('/webauthn/passkeys/:passkeyId', authController.renamePasskey);

module.exports = router;