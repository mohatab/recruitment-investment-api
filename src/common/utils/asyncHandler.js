// Wraps an async route/middleware so a rejected promise reaches Express's
// error handler instead of becoming an unhandled rejection.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
