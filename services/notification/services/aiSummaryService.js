const OpenAI = require('openai');
const logger = require('../utils/logger');

class AISummaryService {
  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  /**
   * Generate daily summary for trainer
   */
  async generateDailySummary(appointments, clientNotes) {
    try {
      if (!this.openai) {
        logger.warn('OpenAI not configured, skipping AI summary');
        return null;
      }

      const prompt = this.buildDailySummaryPrompt(appointments, clientNotes);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful fitness assistant that provides concise, actionable summaries for personal trainers. Focus on key points that will help the trainer prepare for their sessions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('Error generating AI summary:', error);
      return null;
    }
  }

  /**
   * Build prompt for daily summary
   */
  buildDailySummaryPrompt(appointments, clientNotes) {
    let prompt = `Generate a brief daily summary for a personal trainer with the following appointments:\n\n`;

    appointments.forEach((apt, index) => {
      const client = apt.participants[0];
      prompt += `${index + 1}. ${apt.start_time} - ${apt.end_time}\n`;
      prompt += `   Client: ${client?.client_name || 'Not assigned'}\n`;
      prompt += `   Type: ${apt.class_type}\n`;
      
      if (client && clientNotes[client.client_id]) {
        const notes = clientNotes[client.client_id];
        const lastNote = notes.keyPoints[0];
        if (lastNote) {
          prompt += `   Last session plan: ${lastNote.plan || 'No plan recorded'}\n`;
          if (lastNote.privateNotes) {
            prompt += `   Trainer notes: ${lastNote.privateNotes}\n`;
          }
        }
      }
      prompt += '\n';
    });

    prompt += `\nProvide:\n`;
    prompt += `1. Key preparation points for the day\n`;
    prompt += `2. Important client considerations based on their history\n`;
    prompt += `3. Any scheduling considerations or potential issues\n`;
    prompt += `\nKeep the summary concise and actionable.`;

    return prompt;
  }

  /**
   * Generate session summary from notes
   */
  async generateSessionSummary(sessionNote) {
    try {
      if (!this.openai) {
        return null;
      }

      const prompt = `Summarize this fitness session concisely:\n
Subjective: ${sessionNote.subjective || 'N/A'}
Objective: ${sessionNote.objective || 'N/A'}
Assessment: ${sessionNote.assessment || 'N/A'}
Plan: ${sessionNote.plan || 'N/A'}
Exercises: ${JSON.stringify(sessionNote.exercises || [])}

Provide a 2-3 sentence summary focusing on progress and next steps.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a fitness expert summarizing session notes. Be concise and focus on key progress indicators and actionable next steps.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.5
      });

      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('Error generating session summary:', error);
      return null;
    }
  }

  /**
   * Generate client progress insights
   */
  async generateProgressInsights(clientId, recentSessions) {
    try {
      if (!this.openai || recentSessions.length < 3) {
        return null;
      }

      const prompt = this.buildProgressPrompt(recentSessions);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a fitness analytics expert. Analyze training progress and provide actionable insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.6
      });

      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('Error generating progress insights:', error);
      return null;
    }
  }

  /**
   * Build prompt for progress insights
   */
  buildProgressPrompt(sessions) {
    let prompt = `Analyze the following training sessions and provide progress insights:\n\n`;

    sessions.forEach((session, index) => {
      prompt += `Session ${index + 1} (${session.session_date}):\n`;
      prompt += `- Assessment: ${session.assessment || 'N/A'}\n`;
      prompt += `- Exercises: ${JSON.stringify(session.exercises || [])}\n`;
      prompt += `- Measurements: ${JSON.stringify(session.measurements || {})}\n\n`;
    });

    prompt += `Provide:\n`;
    prompt += `1. Progress trends observed\n`;
    prompt += `2. Areas of improvement\n`;
    prompt += `3. Recommendations for next sessions\n`;
    prompt += `4. Any concerns to address\n`;

    return prompt;
  }

  /**
   * Generate smart reminder content
   */
  async generateSmartReminder(appointment, clientHistory) {
    try {
      if (!this.openai) {
        return this.getDefaultReminder(appointment);
      }

      const prompt = `Create a personalized appointment reminder for:
Client: ${appointment.client_name}
Appointment: ${appointment.class_type}
Time: ${appointment.start_time}
Previous sessions: ${clientHistory.length}
Last session focus: ${clientHistory[0]?.plan || 'First session'}

Make it friendly, motivating, and include a relevant tip based on their history.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a friendly fitness assistant creating personalized appointment reminders. Keep it brief and motivating.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.8
      });

      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('Error generating smart reminder:', error);
      return this.getDefaultReminder(appointment);
    }
  }

  /**
   * Get default reminder template
   */
  getDefaultReminder(appointment) {
    return `Hi ${appointment.client_name}! Just a reminder about your ${appointment.class_type} session tomorrow at ${appointment.start_time}. Looking forward to seeing you!`;
  }
}

module.exports = new AISummaryService();