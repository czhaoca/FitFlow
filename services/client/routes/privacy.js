const express = require('express');
const router = express.Router();
const privacyController = require('../controllers/privacyController');

// Privacy management routes
router.post('/privacy-export', privacyController.exportClientData);
router.delete('/privacy-delete', privacyController.deleteClientData);

module.exports = router;
