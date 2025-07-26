const Joi = require('joi');

const validateNotificationPreference = (data) => {
  const schema = Joi.object({
    notificationType: Joi.string().valid(
      'daily_summary',
      'appointment_reminder',
      'payment_receipt',
      'session_summary',
      'marketing'
    ).required(),
    channel: Joi.string().valid('email', 'sms', 'push').required(),
    enabled: Joi.boolean().required(),
    schedule: Joi.object({
      time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      timezone: Joi.string(),
      days: Joi.array().items(Joi.number().min(0).max(6))
    }).optional()
  });

  return schema.validate(data);
};

const validateNotification = (data) => {
  const schema = Joi.object({
    userId: Joi.string().uuid().required(),
    notificationType: Joi.string().required(),
    channel: Joi.string().valid('email', 'sms', 'push').required(),
    recipient: Joi.string().required(),
    subject: Joi.string().when('channel', {
      is: 'email',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    content: Joi.string().required(),
    metadata: Joi.object().optional(),
    scheduledFor: Joi.date().optional(),
    priority: Joi.string().valid('high', 'normal', 'low').default('normal')
  });

  return schema.validate(data);
};

module.exports = {
  validateNotificationPreference,
  validateNotification
};