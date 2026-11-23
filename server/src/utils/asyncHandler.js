// Express 4 does not catch rejected promises from async route handlers.
// Wrapping a handler forwards any thrown error to the error middleware.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
