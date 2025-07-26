const Joi = require('joi');

const validateRegistration = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required()
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])'))
      .message('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    phone: Joi.string().pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/).optional(),
    dateOfBirth: Joi.date().max('now').optional(),
    emergencyContact: Joi.object({
      name: Joi.string().required(),
      phone: Joi.string().required(),
      relationship: Joi.string().required()
    }).optional()
  });

  return schema.validate(data);
};

const validateLogin = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    twoFactorToken: Joi.string().length(6).optional()
  });

  return schema.validate(data);
};

const validatePasswordReset = (data) => {
  const schema = Joi.object({
    token: Joi.string().uuid().required(),
    newPassword: Joi.string().min(8).required()
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])'))
      .message('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
  });

  return schema.validate(data);
};

const validateProfileUpdate = (data) => {
  const schema = Joi.object({
    firstName: Joi.string().min(2).max(50).optional(),
    lastName: Joi.string().min(2).max(50).optional(),
    phone: Joi.string().pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/).optional(),
    dateOfBirth: Joi.date().max('now').optional(),
    emergencyContact: Joi.object({
      name: Joi.string().required(),
      phone: Joi.string().required(),
      relationship: Joi.string().required()
    }).optional(),
    goals: Joi.string().max(1000).optional(),
    preferences: Joi.object().optional()
  });

  return schema.validate(data);
};

module.exports = {
  validateRegistration,
  validateLogin,
  validatePasswordReset,
  validateProfileUpdate
};