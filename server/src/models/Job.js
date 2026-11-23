import mongoose from 'mongoose';

const { Schema } = mongoose;

export const JOB_STATUSES = ['saved', 'applied', 'shortlisted', 'interview', 'offer', 'rejected', 'withdrawn'];
export const JOB_SOURCES = ['manual', 'naukri', 'linkedin', 'company-site', 'adzuna', 'greenhouse', 'lever', 'other'];

const statusEventSchema = new Schema(
  {
    status: { type: String, enum: JOB_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true },
  },
  { _id: false }
);

// Filled in by POST /jobs/:id/analyze
const analysisSchema = new Schema(
  {
    matchScore: { type: Number, min: 0, max: 100 }, // computed by code, not by the AI
    requiredSkills: [new Schema({ name: String, importance: { type: String, enum: ['must', 'nice'] } }, { _id: false })],
    matchedKeywords: [String],
    missingKeywords: [String],
    gaps: [String],
    keywords: [String],
    minYearsExperience: { type: Number, default: null },
    summary: String,
    model: String,
    analyzedAt: Date,
  },
  { _id: false }
);

// Filled in by POST /jobs/:id/tailor. Only text overrides are stored; the
// resume file is rebuilt from profile + overrides on every download.
const tailoredSchema = new Schema(
  {
    headline: String,
    summary: String,
    skills: [new Schema({ category: String, items: [String] }, { _id: false })],
    experience: [new Schema({ experienceId: Schema.Types.ObjectId, bullets: [String] }, { _id: false })],
    warnings: [String],
    model: String,
    generatedAt: Date,
  },
  { _id: false }
);

// Background AI task state (see services/aiQueue.js)
export const AI_STATUSES = ['queued', 'running', 'done', 'failed'];
const aiTaskSchema = new Schema(
  {
    status: { type: String, enum: AI_STATUSES },
    error: String,
    queuedAt: Date,
    startedAt: Date,
    finishedAt: Date,
  },
  { _id: false }
);

const jobSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: String, required: true, trim: true, maxlength: 200 },
    role: { type: String, required: true, trim: true, maxlength: 200 },
    location: { type: String, trim: true, default: '' },
    source: { type: String, enum: JOB_SOURCES, default: 'manual' },
    url: { type: String, trim: true, default: '' },
    description: { type: String, required: true, maxlength: 50000 },
    status: { type: String, enum: JOB_STATUSES, default: 'saved' },
    statusHistory: [statusEventSchema],
    appliedAt: { type: Date, default: null },
    analysis: { type: analysisSchema, default: undefined },
    tailored: { type: tailoredSchema, default: undefined },
    ai: {
      analyze: { type: aiTaskSchema, default: undefined },
      tailor: { type: aiTaskSchema, default: undefined },
    },
    notes: { type: String, default: '' },
    tags: [{ type: String, trim: true, lowercase: true }],
  },
  { timestamps: true }
);

// Every query is scoped to a user, so user is the first key of each index.
jobSchema.index({ user: 1, status: 1, updatedAt: -1 });
jobSchema.index({ user: 1, createdAt: -1 });
jobSchema.index({ company: 'text', role: 'text', description: 'text' });

jobSchema.pre('save', function (next) {
  if (this.isNew && this.statusHistory.length === 0) {
    this.statusHistory.push({ status: this.status });
  }
  if (this.status === 'applied' && !this.appliedAt) this.appliedAt = new Date();
  next();
});

export const Job = mongoose.model('Job', jobSchema);
