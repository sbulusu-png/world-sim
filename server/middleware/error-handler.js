/**
 * Express error-handling middleware.
 * Catches unhandled errors and returns a clean JSON response.
 * Must be registered AFTER all routes.
 */
function errorHandler(err, req, res, _next) {
  console.error(`[ErrorHandler] ${req.method} ${req.path}:`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
  });
}

module.exports = { errorHandler };
