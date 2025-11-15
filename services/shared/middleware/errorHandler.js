/**
 * Centralized Error Handling Middleware for FitFlow
 *
 * Provides consistent error response format across all services
 */

const logger = require('../utils/logger');

/**
 * Error types
 */
const ErrorTypes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, type, statusCode, details = null) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 *
 * Catches all errors and returns consistent error response
 */
function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Error occurred', {
    error: err.message,
    type: err.type || 'UNHANDLED_ERROR',
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    tenantId: req.tenantId
  });

  // Determine status code
  const statusCode = err.statusCode || 500;

  // Determine error type
  const errorType = err.type || ErrorTypes.INTERNAL_ERROR;

  // Build error response
  const errorResponse = {
    error: {
      message: err.message || 'An unexpected error occurred',
      type: errorType,
      code: err.code || errorType,
      timestamp: err.timestamp || new Date().toISOString()
    }
  };

  // Add details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.details = err.details;
    errorResponse.error.stack = err.stack;
  }

  // Add request ID if available
  if (req.id) {
    errorResponse.error.requestId = req.id;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res, next) {
  const error = new AppError(
    `Route ${req.method} ${req.path} not found`,
    ErrorTypes.NOT_FOUND_ERROR,
    404
  );
  next(error);
}

/**
 * Async error wrapper
 *
 * Wraps async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error factory
 */
function validationError(message, details = null) {
  return new AppError(message, ErrorTypes.VALIDATION_ERROR, 400, details);
}

/**
 * Authentication error factory
 */
function authenticationError(message = 'Authentication required') {
  return new AppError(message, ErrorTypes.AUTHENTICATION_ERROR, 401);
}

/**
 * Authorization error factory
 */
function authorizationError(message = 'Access denied') {
  return new AppError(message, ErrorTypes.AUTHORIZATION_ERROR, 403);
}

/**
 * Not found error factory
 */
function notFoundError(resource, id = null) {
  const message = id
    ? `${resource} with id ${id} not found`
    : `${resource} not found`;
  return new AppError(message, ErrorTypes.NOT_FOUND_ERROR, 404);
}

/**
 * Conflict error factory
 */
function conflictError(message, details = null) {
  return new AppError(message, ErrorTypes.CONFLICT_ERROR, 409, details);
}

/**
 * Database error factory
 */
function databaseError(message, details = null) {
  return new AppError(message, ErrorTypes.DATABASE_ERROR, 500, details);
}

/**
 * External service error factory
 */
function externalServiceError(service, message, details = null) {
  return new AppError(
    `External service ${service} error: ${message}`,
    ErrorTypes.EXTERNAL_SERVICE_ERROR,
    502,
    details
  );
}

module.exports = {
  ErrorTypes,
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validationError,
  authenticationError,
  authorizationError,
  notFoundError,
  conflictError,
  databaseError,
  externalServiceError
};
