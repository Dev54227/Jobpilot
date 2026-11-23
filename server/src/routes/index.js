import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as auth from '../controllers/auth.controller.js';
import * as profile from '../controllers/profile.controller.js';
import * as jobs from '../controllers/job.controller.js';
import * as ai from '../controllers/ai.controller.js';
import * as s from '../validators/schemas.js';

const router = Router();

// ---------- health (public) ----------
router.get('/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
});

// ---------- auth (public, rate-limited against password guessing) ----------
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
router.post('/auth/register', authLimiter, validate({ body: s.registerBody }), h(auth.register));
router.post('/auth/login', authLimiter, validate({ body: s.loginBody }), h(auth.login));

// ---------- protected (need a valid token) ----------
// requireAuth is attached per route group, NOT with router.use(requireAuth):
// that would also catch unknown URLs and answer 401 instead of a real 404.
router.get('/auth/me', requireAuth, h(auth.me));

const profileRouter = Router();
profileRouter.get('/', h(profile.getProfile));
profileRouter.put('/', validate({ body: s.profileBody }), h(profile.updateProfile));
router.use('/profile', requireAuth, profileRouter);

const jobsRouter = Router();
// /stats must be registered before /:id, or "stats" is read as an id
jobsRouter.get('/stats', h(jobs.jobStats));
jobsRouter.get('/', validate({ query: s.listJobsQuery }), h(jobs.listJobs));
jobsRouter.post('/', validate({ body: s.createJobBody }), h(jobs.createJob));
jobsRouter.get('/:id', validate({ params: s.idParams }), h(jobs.getJob));
jobsRouter.patch('/:id', validate({ params: s.idParams, body: s.updateJobBody }), h(jobs.updateJob));
jobsRouter.patch('/:id/status', validate({ params: s.idParams, body: s.statusBody }), h(jobs.updateStatus));
jobsRouter.delete('/:id', validate({ params: s.idParams }), h(jobs.deleteJob));

// AI calls are slow and CPU-heavy on the VM, so cap them per user
const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: (req) => req.userId, standardHeaders: 'draft-7', legacyHeaders: false });
jobsRouter.post('/:id/analyze', aiLimiter, validate({ params: s.idParams }), h(ai.analyze));
jobsRouter.post('/:id/tailor', aiLimiter, validate({ params: s.idParams }), h(ai.tailor));
jobsRouter.get('/:id/resume.:format', validate({ params: s.resumeParams }), h(ai.downloadResume));
router.use('/jobs', requireAuth, jobsRouter);

export default router;
