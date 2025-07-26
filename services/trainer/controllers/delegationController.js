const db = require('../utils/database');
const logger = require('../utils/logger');
const { validateDelegation } = require('../utils/validators');

class DelegationController {
  /**
   * Get current delegations for a studio
   */
  async getDelegations(req, res) {
    try {
      const trainerId = req.user.trainerId;
      const { studioId } = req.params;

      // Check if trainer is manager/owner
      const role = await db.getTrainerStudioRole(trainerId, studioId);
      if (!['manager', 'owner'].includes(role)) {
        return res.status(403).json({ error: 'Only managers and owners can view delegations' });
      }

      const delegations = await db.getStudioDelegations(studioId);

      res.json({
        success: true,
        delegations: delegations.map(d => ({
          id: d.id,
          delegateId: d.delegate_id,
          delegateName: d.delegate_name,
          delegatorName: d.delegator_name,
          delegationType: d.delegation_type,
          permissions: d.permissions,
          startDate: d.start_date,
          endDate: d.end_date,
          isActive: d.is_active,
          reason: d.reason,
          createdAt: d.created_at
        }))
      });
    } catch (error) {
      logger.error('Error getting delegations:', error);
      res.status(500).json({ error: 'Failed to retrieve delegations' });
    }
  }

  /**
   * Create new delegation
   */
  async createDelegation(req, res) {
    try {
      const trainerId = req.user.trainerId;
      const { studioId } = req.params;

      // Validate request
      const { error } = validateDelegation(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const {
        delegateId,
        delegationType,
        permissions,
        startDate,
        endDate,
        reason
      } = req.body;

      // Check if trainer is manager/owner
      const role = await db.getTrainerStudioRole(trainerId, studioId);
      if (!['manager', 'owner'].includes(role)) {
        return res.status(403).json({ error: 'Only managers and owners can create delegations' });
      }

      // Check if delegate is a trainer in the studio
      const delegateRole = await db.getTrainerStudioRole(delegateId, studioId);
      if (!delegateRole) {
        return res.status(400).json({ error: 'Delegate must be a trainer in this studio' });
      }

      // Check for existing active delegation
      const existingDelegation = await db.getActiveDelegation(studioId, delegateId);
      if (existingDelegation) {
        return res.status(409).json({ error: 'Trainer already has an active delegation' });
      }

      // Create delegation (can_further_delegate is always false)
      const delegation = await db.createDelegation({
        studioId,
        delegatorId: trainerId,
        delegateId,
        delegationType,
        permissions: permissions || {},
        startDate,
        endDate,
        reason,
        createdBy: trainerId,
        canFurtherDelegate: false // Enforced to prevent delegation chains
      });

      // Send notification to delegate
      await db.queueNotification({
        userId: delegation.delegate_user_id,
        notificationType: 'delegation_granted',
        channel: 'email',
        recipient: delegation.delegate_email,
        subject: 'Manager Delegation Granted',
        content: `You have been granted ${delegationType} manager permissions for ${delegation.studio_name} from ${startDate} to ${endDate}.`
      });

      res.status(201).json({
        success: true,
        message: 'Delegation created successfully',
        delegation: {
          id: delegation.id,
          delegateId: delegation.delegate_id,
          startDate: delegation.start_date,
          endDate: delegation.end_date
        }
      });
    } catch (error) {
      logger.error('Error creating delegation:', error);
      res.status(500).json({ error: 'Failed to create delegation' });
    }
  }

  /**
   * Revoke delegation
   */
  async revokeDelegation(req, res) {
    try {
      const trainerId = req.user.trainerId;
      const { studioId, delegationId } = req.params;
      const { reason } = req.body;

      // Get delegation details
      const delegation = await db.getDelegation(delegationId);
      if (!delegation || delegation.studio_id !== studioId) {
        return res.status(404).json({ error: 'Delegation not found' });
      }

      // Check if trainer can revoke (must be delegator or owner)
      const role = await db.getTrainerStudioRole(trainerId, studioId);
      if (delegation.delegator_id !== trainerId && role !== 'owner') {
        return res.status(403).json({ error: 'You can only revoke delegations you created' });
      }

      // Revoke delegation
      await db.revokeDelegation(delegationId, trainerId, reason);

      // Send notification
      await db.queueNotification({
        userId: delegation.delegate_user_id,
        notificationType: 'delegation_revoked',
        channel: 'email',
        recipient: delegation.delegate_email,
        subject: 'Manager Delegation Revoked',
        content: `Your manager permissions for ${delegation.studio_name} have been revoked.${reason ? ` Reason: ${reason}` : ''}`
      });

      res.json({
        success: true,
        message: 'Delegation revoked successfully'
      });
    } catch (error) {
      logger.error('Error revoking delegation:', error);
      res.status(500).json({ error: 'Failed to revoke delegation' });
    }
  }

  /**
   * Check current permissions
   */
  async checkPermissions(req, res) {
    try {
      const trainerId = req.user.trainerId;
      const { studioId } = req.params;

      // Get base role
      const role = await db.getTrainerStudioRole(trainerId, studioId);
      
      // Get active delegations
      const delegations = await db.getTrainerActiveDelegations(trainerId, studioId);
      
      // Compile permissions
      const permissions = {
        baseRole: role,
        isDelegatedManager: delegations.length > 0,
        delegations: delegations.map(d => ({
          type: d.delegation_type,
          permissions: d.permissions,
          expiresAt: d.end_date,
          grantedBy: d.delegator_name
        })),
        effectivePermissions: this.calculateEffectivePermissions(role, delegations)
      };

      res.json({
        success: true,
        permissions
      });
    } catch (error) {
      logger.error('Error checking permissions:', error);
      res.status(500).json({ error: 'Failed to check permissions' });
    }
  }

  /**
   * Calculate effective permissions
   */
  calculateEffectivePermissions(baseRole, delegations) {
    const permissions = {
      viewAllClients: false,
      viewAllSessions: false,
      viewFinancials: false,
      manageTrainers: false,
      manageSchedule: false,
      viewReports: false,
      exportData: false
    };

    // Base role permissions
    if (baseRole === 'owner') {
      Object.keys(permissions).forEach(key => permissions[key] = true);
    } else if (baseRole === 'manager') {
      permissions.viewAllClients = true;
      permissions.viewAllSessions = true;
      permissions.viewFinancials = true;
      permissions.manageSchedule = true;
      permissions.viewReports = true;
    }

    // Add delegated permissions
    delegations.forEach(delegation => {
      if (delegation.delegation_type === 'full') {
        permissions.viewAllClients = true;
        permissions.viewAllSessions = true;
        permissions.viewFinancials = true;
        permissions.manageSchedule = true;
        permissions.viewReports = true;
      } else if (delegation.permissions) {
        Object.keys(delegation.permissions).forEach(key => {
          if (delegation.permissions[key]) {
            permissions[key] = true;
          }
        });
      }
    });

    return permissions;
  }

  /**
   * Get delegation history
   */
  async getDelegationHistory(req, res) {
    try {
      const trainerId = req.user.trainerId;
      const { studioId } = req.params;
      const { includeRevoked = false } = req.query;

      // Check if trainer is manager/owner
      const role = await db.getTrainerStudioRole(trainerId, studioId);
      if (!['manager', 'owner'].includes(role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const history = await db.getDelegationHistory(studioId, {
        includeRevoked: includeRevoked === 'true'
      });

      res.json({
        success: true,
        history
      });
    } catch (error) {
      logger.error('Error getting delegation history:', error);
      res.status(500).json({ error: 'Failed to retrieve delegation history' });
    }
  }

  /**
   * Attempt to further delegate (should always fail)
   */
  async attemptFurtherDelegation(req, res) {
    // This endpoint exists to explicitly show that further delegation is not allowed
    res.status(403).json({
      error: 'Further delegation is not permitted. Only original managers can delegate their authority.',
      canFurtherDelegate: false
    });
  }
}

module.exports = new DelegationController();