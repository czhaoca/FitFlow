const express = require('express');
const router = express.Router();
const delegationController = require('../controllers/delegationController');

// Delegation management routes
router.post('/delegate', delegationController.delegateAccess);
router.delete('/revoke/:delegationId', delegationController.revokeAccess);
router.get('/delegations', delegationController.listDelegations);

module.exports = router;
