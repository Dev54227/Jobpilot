import { Job } from '../models/Job.js';
import { Profile } from '../models/Profile.js';
import { AppError, notFound } from '../utils/AppError.js';
import { enqueue } from '../services/aiQueue.js';
import { analyzeJob } from '../services/analysis.service.js';
import { tailorResume } from '../services/tailor.service.js';
import { buildResumeDocx } from '../services/resumeDocx.js';
import { docxToPdf } from '../services/pdf.js';

const IN_PROGRESS = ['queued', 'running'];

async function loadProfileOrFail(userId) {
  const profile = await Profile.findOne({ user: userId });
  if (!profile || (!profile.skills.length && !profile.experience.length)) {
    throw new AppError('Fill in your profile (skills and experience) first', 409);
  }
  return profile;
}

// Atomically flip ai.<kind> to "queued" unless it's already queued/running,
// so double-clicking "Analyze" can't start the same slow task twice.
async function claim(req, kind, extraFilter = {}) {
  const field = `ai.${kind}.status`;
  const job = await Job.findOneAndUpdate(
    { _id: req.valid.params.id, user: req.userId, [field]: { $nin: IN_PROGRESS }, ...extraFilter },
    { $set: { [`ai.${kind}`]: { status: 'queued', queuedAt: new Date() } } },
    { new: true }
  );
  if (job) return job;

  const existing = await Job.findOne({ _id: req.valid.params.id, user: req.userId });
  if (!existing) throw notFound('Job');
  if (IN_PROGRESS.includes(existing.ai?.[kind]?.status)) return null; // already on its way
  throw new AppError(kind === 'tailor' ? 'Analyze this job first' : 'Cannot start this task', 409);
}

// Runs inside the queue. Results are saved ONLY if the job description is
// still the one we analysed; if the user edited it meanwhile, they're stale.
function runInBackground(kind, jobId, userId, work) {
  enqueue(async () => {
    // fields set to undefined are removed ($unset), everything else is $set
    const set = (fields, filter = {}) => {
      const $set = {};
      const $unset = {};
      for (const [k, v] of Object.entries(fields)) v === undefined ? ($unset[k] = 1) : ($set[k] = v);
      return Job.updateOne({ _id: jobId, ...filter }, { $set, ...(Object.keys($unset).length ? { $unset } : {}) });
    };
    const job = await Job.findById(jobId);
    if (!job) return;
    const startedAt = new Date();
    await set({ [`ai.${kind}.status`]: 'running', [`ai.${kind}.startedAt`]: startedAt });

    try {
      const profile = await loadProfileOrFail(userId);
      const result = await work(job, profile);
      const done = { status: 'done', queuedAt: job.ai[kind].queuedAt, startedAt, finishedAt: new Date() };
      const { matchedCount } = await set({ ...result, [`ai.${kind}`]: done }, { description: job.description });
      if (matchedCount === 0) {
        await set({ [`ai.${kind}.status`]: 'failed', [`ai.${kind}.error`]: 'The job changed while the AI was working, please retry', [`ai.${kind}.finishedAt`]: new Date() });
      }
    } catch (err) {
      await set({ [`ai.${kind}.status`]: 'failed', [`ai.${kind}.error`]: err.message, [`ai.${kind}.finishedAt`]: new Date() });
    }
  });
}

// POST /jobs/:id/analyze → 202, poll GET /jobs/:id until ai.analyze.status is done/failed
export async function analyze(req, res) {
  await loadProfileOrFail(req.userId);
  const job = await claim(req, 'analyze');
  if (job) {
    runInBackground('analyze', job._id, req.userId, async (j, profile) => ({
      analysis: await analyzeJob(j, profile),
      tailored: undefined, // a new analysis makes any old tailoring stale
    }));
  }
  res.status(202).json({ status: job ? 'queued' : 'already-in-progress' });
}

export async function tailor(req, res) {
  await loadProfileOrFail(req.userId);
  const job = await claim(req, 'tailor', { analysis: { $exists: true } });
  if (job) {
    runInBackground('tailor', job._id, req.userId, async (j, profile) => ({ tailored: await tailorResume(j, profile) }));
  }
  res.status(202).json({ status: job ? 'queued' : 'already-in-progress' });
}

const fileName = (profile, job, ext) =>
  `${[profile.fullName, job.company, 'Resume'].filter(Boolean).join('_').replace(/[^A-Za-z0-9_-]+/g, '_')}.${ext}`;

// Works without tailoring too (plain base resume)
export async function downloadResume(req, res) {
  const [job, profile] = await Promise.all([
    Job.findOne({ _id: req.valid.params.id, user: req.userId }),
    loadProfileOrFail(req.userId),
  ]);
  if (!job) throw notFound('Job');

  const docx = await buildResumeDocx(profile, job.tailored);
  if (req.valid.params.format === 'pdf') {
    res.type('application/pdf').attachment(fileName(profile, job, 'pdf'));
    return res.send(await docxToPdf(docx));
  }
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').attachment(fileName(profile, job, 'docx'));
  res.send(docx);
}
