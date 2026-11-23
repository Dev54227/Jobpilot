import { User } from '../models/User.js';
import { Profile } from '../models/Profile.js';
import { signToken } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// v1 is single-user: registration works only for the very first account,
// unless ALLOW_REGISTRATION=true (for when the app goes public).
export async function register(req, res) {
  const { name, email, password } = req.valid.body;

  if (!env.ALLOW_REGISTRATION && (await User.estimatedDocumentCount()) > 0) {
    throw new AppError('Registration is closed', 403);
  }
  if (await User.exists({ email })) throw new AppError('Email already registered', 409);

  const user = await User.create({ name, email, passwordHash: await User.hashPassword(password) });
  await Profile.create({ user: user._id, fullName: name, email });

  res.status(201).json({ token: signToken(user._id), user });
}

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  // Same message for "no user" and "wrong password" so attackers can't probe emails
  if (!user || !(await user.checkPassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }
  res.json({ token: signToken(user._id), user });
}

export async function me(req, res) {
  const user = await User.findById(req.userId);
  if (!user) throw new AppError('User no longer exists', 401);
  res.json({ user });
}
