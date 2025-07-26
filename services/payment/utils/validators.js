const Joi = require('joi');

const validatePaymentIntent = (data) => {
  const schema = Joi.object({
    amount: Joi.number().positive().required(),
    appointmentId: Joi.string().uuid(),
    clientId: Joi.string().uuid().required(),
    trainerId: Joi.string().uuid().required(),
    studioId: Joi.string().uuid().allow(null)
  });

  return schema.validate(data);
};

const validateRefund = (data) => {
  const schema = Joi.object({
    paymentIntentId: Joi.string().required(),
    amount: Joi.number().positive().optional(),
    reason: Joi.string().valid(
      'duplicate',
      'fraudulent',
      'requested_by_customer',
      'other'
    ).optional()
  });

  return schema.validate(data);
};

const validatePackagePayment = (data) => {
  const schema = Joi.object({
    packageId: Joi.string().uuid().required(),
    clientId: Joi.string().uuid().required(),
    trainerId: Joi.string().uuid().required()
  });

  return schema.validate(data);
};

const validateSubscription = (data) => {
  const schema = Joi.object({
    packageId: Joi.string().uuid().required(),
    clientId: Joi.string().uuid().required(),
    trainerId: Joi.string().uuid().required(),
    paymentMethodId: Joi.string().required()
  });

  return schema.validate(data);
};

module.exports = {
  validatePaymentIntent,
  validateRefund,
  validatePackagePayment,
  validateSubscription
};