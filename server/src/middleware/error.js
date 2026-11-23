import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(req, res) {
  // Always a real 404 status, so a wrong URL never looks like success.
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Error middleware is recognised by Express because it has 4 arguments.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: `Invalid ${err.path}` });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return res.status(422).json({ error: 'Validation failed', details });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value', fields: Object.keys(err.keyValue || {}) });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error', ...(isProd ? {} : { message: err.message }) });
}
