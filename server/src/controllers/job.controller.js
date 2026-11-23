import mongoose from 'mongoose';
import { Job, JOB_STATUSES } from '../models/Job.js';
import { notFound } from '../utils/AppError.js';

// Every query includes `user: req.userId` so one user can never read
// another user's jobs, which matters once the app goes public.
const findOwnJob = async (req) => {
  const job = await Job.findOne({ _id: req.valid.params.id, user: req.userId });
  if (!job) throw notFound('Job');
  return job;
};

export async function listJobs(req, res) {
  const { status, q, page, limit } = req.valid.query;
  const filter = { user: req.userId };
  if (status) filter.status = status;
  if (q) filter.$text = { $search: q };

  const [items, total] = await Promise.all([
    Job.find(filter)
      .select('-description') // descriptions are large; fetch them on the detail view
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Job.countDocuments(filter),
  ]);

  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}

export async function createJob(req, res) {
  const job = await Job.create({ ...req.valid.body, user: req.userId });
  res.status(201).json({ job });
}

export async function getJob(req, res) {
  res.json({ job: await findOwnJob(req) });
}

export async function updateJob(req, res) {
  const job = await findOwnJob(req);
  const descriptionChanged = req.valid.body.description !== undefined && req.valid.body.description !== job.description;
  job.set(req.valid.body);
  if (descriptionChanged) {
    // AI results were based on the old text
    job.analysis = undefined;
    job.tailored = undefined;
  }
  await job.save();
  res.json({ job });
}

export async function updateStatus(req, res) {
  const { status, note } = req.valid.body;
  const job = await findOwnJob(req);

  if (job.status !== status) {
    job.status = status;
    job.statusHistory.push({ status, note });
    if (status === 'applied' && !job.appliedAt) job.appliedAt = new Date();
    await job.save();
  }
  res.json({ job });
}

export async function deleteJob(req, res) {
  const job = await findOwnJob(req);
  await job.deleteOne();
  res.status(204).end();
}

// Counts per status for the dashboard, e.g. { saved: 3, applied: 10, ... }
export async function jobStats(req, res) {
  const rows = await Job.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(req.userId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0]));
  for (const r of rows) byStatus[r._id] = r.count;
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  res.json({ total, byStatus });
}
