const db = require('../utils/database');
const logger = require('../utils/logger');

class ClientPrivacyController {
  /**
   * Get client privacy settings
   */
  async getPrivacySettings(req, res) {
    try {
      const clientId = req.user.clientId;
      
      const settings = await db.getClientPrivacySettings(clientId);
      
      res.json({
        success: true,
        privacySettings: {
          allowSessionSharing: settings.allow_session_sharing,
          allowTrainerNotesSharing: settings.allow_trainer_notes_sharing,
          allowProgressSharing: settings.allow_progress_sharing
        }
      });
    } catch (error) {
      logger.error('Error getting privacy settings:', error);
      res.status(500).json({ error: 'Failed to retrieve privacy settings' });
    }
  }

  /**
   * Update client privacy settings
   */
  async updatePrivacySettings(req, res) {
    try {
      const clientId = req.user.clientId;
      const {
        allowSessionSharing,
        allowTrainerNotesSharing,
        allowProgressSharing
      } = req.body;

      // Validate at least one setting is provided
      if (allowSessionSharing === undefined && 
          allowTrainerNotesSharing === undefined && 
          allowProgressSharing === undefined) {
        return res.status(400).json({ error: 'No settings provided to update' });
      }

      const updates = {};
      if (allowSessionSharing !== undefined) {
        updates.allow_session_sharing = allowSessionSharing;
      }
      if (allowTrainerNotesSharing !== undefined) {
        updates.allow_trainer_notes_sharing = allowTrainerNotesSharing;
      }
      if (allowProgressSharing !== undefined) {
        updates.allow_progress_sharing = allowProgressSharing;
      }

      await db.updateClientPrivacySettings(clientId, updates);

      // Log privacy change for audit
      await db.logPrivacyChange(clientId, req.user.id, updates);

      res.json({
        success: true,
        message: 'Privacy settings updated successfully',
        updatedSettings: updates
      });
    } catch (error) {
      logger.error('Error updating privacy settings:', error);
      res.status(500).json({ error: 'Failed to update privacy settings' });
    }
  }

  /**
   * Get trainers who have access to client data
   */
  async getDataAccessList(req, res) {
    try {
      const clientId = req.user.clientId;
      
      // Get all trainers with relationships
      const trainers = await db.getClientTrainers(clientId);
      
      // Get privacy settings
      const settings = await db.getClientPrivacySettings(clientId);
      
      // Map trainers with their access levels
      const accessList = await Promise.all(trainers.map(async (trainer) => {
        const sessions = await db.getTrainerClientSessionCount(clientId, trainer.trainer_id);
        const isCurrentTrainer = trainer.relationship_type === 'active';
        
        return {
          trainerId: trainer.trainer_id,
          trainerName: trainer.trainer_name,
          studioName: trainer.studio_name,
          relationshipType: trainer.relationship_type,
          firstSession: trainer.first_session_date,
          lastSession: trainer.last_session_date,
          totalSessions: sessions.count,
          hasAccess: {
            sessions: isCurrentTrainer || settings.allow_session_sharing,
            notes: isCurrentTrainer || (settings.allow_session_sharing && settings.allow_trainer_notes_sharing),
            progress: isCurrentTrainer || settings.allow_progress_sharing
          }
        };
      }));

      res.json({
        success: true,
        privacySettings: {
          allowSessionSharing: settings.allow_session_sharing,
          allowTrainerNotesSharing: settings.allow_trainer_notes_sharing,
          allowProgressSharing: settings.allow_progress_sharing
        },
        trainersWithAccess: accessList
      });
    } catch (error) {
      logger.error('Error getting data access list:', error);
      res.status(500).json({ error: 'Failed to retrieve access list' });
    }
  }

  /**
   * Revoke trainer access
   */
  async revokeTrainerAccess(req, res) {
    try {
      const clientId = req.user.clientId;
      const { trainerId } = req.params;
      
      // Update relationship to past
      await db.updateClientTrainerRelationship(clientId, trainerId, {
        relationship_type: 'past'
      });

      // Log the access revocation
      await db.logAccessRevocation(clientId, trainerId, req.user.id);

      res.json({
        success: true,
        message: 'Trainer access revoked successfully'
      });
    } catch (error) {
      logger.error('Error revoking trainer access:', error);
      res.status(500).json({ error: 'Failed to revoke access' });
    }
  }

  /**
   * Get session notes visible to client
   */
  async getVisibleNotes(req, res) {
    try {
      const clientId = req.user.clientId;
      const { limit = 20, offset = 0 } = req.query;
      
      // Get visible notes only (not private/internal)
      const notes = await db.getClientVisibleNotes(clientId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        notes: notes.map(note => ({
          id: note.id,
          sessionDate: note.session_date,
          trainerName: note.trainer_name,
          type: note.note_type,
          content: note.content,
          isPinned: note.is_pinned,
          createdAt: note.created_at
        })),
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      logger.error('Error getting visible notes:', error);
      res.status(500).json({ error: 'Failed to retrieve notes' });
    }
  }

  /**
   * Request data export (GDPR/Privacy compliance)
   */
  async requestDataExport(req, res) {
    try {
      const clientId = req.user.clientId;
      
      // Queue data export job
      const exportId = await db.queueDataExport(clientId, req.user.id);
      
      res.json({
        success: true,
        message: 'Data export requested. You will receive an email when it\'s ready.',
        exportId
      });
    } catch (error) {
      logger.error('Error requesting data export:', error);
      res.status(500).json({ error: 'Failed to request data export' });
    }
  }

  /**
   * Request data deletion (Right to be forgotten)
   */
  async requestDataDeletion(req, res) {
    try {
      const clientId = req.user.clientId;
      const { confirmDeletion, reason } = req.body;
      
      if (!confirmDeletion) {
        return res.status(400).json({ 
          error: 'Please confirm you want to delete all your data' 
        });
      }

      // Queue deletion request for review
      const deletionId = await db.queueDataDeletion(clientId, req.user.id, reason);
      
      res.json({
        success: true,
        message: 'Data deletion requested. This will be processed within 30 days.',
        deletionId
      });
    } catch (error) {
      logger.error('Error requesting data deletion:', error);
      res.status(500).json({ error: 'Failed to request data deletion' });
    }
  }
}

module.exports = new ClientPrivacyController();