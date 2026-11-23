import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const signToken = (userId) =>
  jwt.sign({ sub: userId.toString() }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

// Expects "Authorization: Bearer <token>"; sets req.userId on success.
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new AppError('Not authenticated', 401));

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}
