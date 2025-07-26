const db = require('../utils/database');
const logger = require('../utils/logger');

class PrivacyController {
  /**
   * Get session note with privacy controls
   */
  async getSessionNote(req, res) {
    try {
      const trainerId = req.user.trainerId;
      const { sessionNoteId } = req.params;

      const note = await db.getSessionNoteWithPrivacy(sessionNoteId, trainerId);
      
      if (!note) {
        return res.status(404).json({ error: 'Session note not found' });
      }

      // Check privacy permissions
      const canView = await this.checkSessionNoteAccess(note, trainerId);
      if (!canView) {
        return res.status(403).json({ error: 'Access denied to this session note' });
      }

      // Filter fields based on access level
      const filteredNote = this.filterSessionNoteFields(note, trainerId);

      res.json({
        success: true,
        sessionNote: filteredNote
      });
    } catch (error) {
      logger.error('Error getting session note:', error);
      res.status(500).json({ error: 'Failed to retrieve session note' });
    }
  }

  /**
   * Update session note sharing settings
   */
  async updateSessionNoteSharing(req, res) {
    try {
      const trainerId = req.user.trainerId;
      const { sessionNoteId } = req.params;
      const { shareWithTrainers } = req.body;

      // Verify trainer owns this note
      const note = await db.getSessionNote(sessionNoteId);
      if (note.trainer_id !== trainerId) {
        return res.status(403).json({ error: 'You can only update your own session notes' });
      }

      await db.updateSessionNoteSharing(sessionNoteId, {
        shared_by_trainer: shareWithTrainers
      });

      res.json({
        success: true,
        message: 'Session note sharing settings updated'
      });
    } catch (error) {
      logger.error('Error updating session note sharing:', error);
      res.status(500).json({ error: 'Failed to update sharing settings' });
    }
  }

  /**
   * Get client sessions visible to trainer
   */
  async getClientSessions(req, res) {
    try {
      const trainerId = req.user.trainerId;
      const { clientId } = req.params;
      const { includeShared = true } = req.query;

      // Check if trainer has relationship with client
      const hasRelationship = await db.checkTrainerClientRelationship(trainerId, clientId);
      if (!hasRelationship) {
        return res.status(403).json({ error: 'No access to this client' });
      }

      // Get client privacy preferences
      const client = await db.getClientPrivacySettings(clientId);
      
      let sessions;
      if (client.allow_session_sharing && includeShared === 'true') {
        // Get all sessions if client allows sharing
        sessions = await db.getClientSessionsWithSharing(clientId, trainerId);
      } else {
        // Get only trainer's own sessions
        sessions = await db.getTrainerClientSessions(clientId, trainerId);
      }

      res.json({
        success: true,
        sessions,
        sharingEnabled: client.allow_session_sharing
      });
    } catch (error) {
      logger.error('Error getting client sessions:', error);
      res.status(500).json({ error: 'Failed to retrieve client sessions' });
    }
  }

  /**
   * Check if trainer can access session note
   */
  async checkSessionNoteAccess(note, trainerId) {
    // Trainer who created the note always has access
    if (note.trainer_id === trainerId) {
      return true;
    }

    // Check if client allows sharing
    const client = await db.getClientPrivacySettings(note.client_id);
    if (!client.allow_session_sharing || !client.allow_trainer_notes_sharing) {
      return false;
    }

    // Check if note is marked as shareable
    if (!note.is_shareable_with_trainers || !note.shared_by_trainer) {
      return false;
    }

    // Check if trainer has relationship with client
    const hasRelationship = await db.checkTrainerClientRelationship(trainerId, note.client_id);
    if (!hasRelationship) {
      return false;
    }

    // Check if trainer is manager/owner of the studio
    const isManager = await db.checkTrainerStudioRole(trainerId, note.studio_id, ['manager', 'owner']);
    if (isManager) {
      return true;
    }

    // Check for active delegation
    const hasDelegate = await db.checkManagerDelegation(trainerId, note.studio_id);
    if (hasDelegate) {
      return true;
    }

    return true; // Basic sharing allowed
  }

  /**
   * Filter session note fields based on access level
   */
  filterSessionNoteFields(note, trainerId) {
    const filtered = { ...note };

    // Remove private fields for non-owner trainers
    if (note.trainer_id !== trainerId) {
      delete filtered.private_notes;
      delete filtered.trainer_internal_notes;
    }

    // Always remove sensitive fields
    delete filtered.is_shareable_with_trainers;
    delete filtered.shared_by_trainer;

    return filtered;
  }

  /**
   * Bulk update session sharing for a client
   */
  async bulkUpdateSessionSharing(req, res) {
    try {
      const trainerId = req.user.trainerId;
      const { clientId } = req.params;
      const { shareAll, sessionIds } = req.body;

      // Verify trainer has sessions with this client
      const sessions = await db.getTrainerClientSessions(clientId, trainerId);
      
      if (sessions.length === 0) {
        return res.status(404).json({ error: 'No sessions found with this client' });
      }

      if (shareAll) {
        // Share all trainer's sessions with this client
        await db.bulkUpdateSessionSharing(trainerId, clientId, true);
      } else if (sessionIds && sessionIds.length > 0) {
        // Share specific sessions
        await db.updateMultipleSessionSharing(sessionIds, trainerId, true);
      }

      res.json({
        success: true,
        message: 'Session sharing settings updated',
        updatedCount: shareAll ? sessions.length : sessionIds.length
      });
    } catch (error) {
      logger.error('Error bulk updating session sharing:', error);
      res.status(500).json({ error: 'Failed to update session sharing' });
    }
  }
}

module.exports = new PrivacyController();