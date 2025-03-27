const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Default error status and message
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  // Send error response
  res.status(status).json({
    status: 'error',
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = {
  errorHandler
}; 