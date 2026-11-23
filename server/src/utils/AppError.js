// An error we throw on purpose, with an HTTP status the client should see.
// Anything that is NOT an AppError is treated as an unexpected 500.
export class AppError extends Error {
  constructor(message, statusCode = 400, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const notFound = (what = 'Resource') => new AppError(`${what} not found`, 404);
