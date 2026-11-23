import { z } from 'zod';
import mongoose from 'mongoose';
import { JOB_SOURCES, JOB_STATUSES } from '../models/Job.js';

const str = (max = 500) => z.string().trim().max(max);
const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');
const link = z.object({ label: str(100).min(1), url: z.url() });

// ---------- auth ----------
export const registerBody = z.object({
  name: str(100).min(1),
  email: z.email().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const loginBody = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1).max(128),
});

// ---------- profile ----------
export const profileBody = z.object({
  fullName: str(100).optional(),
  headline: str(200).optional(),
  location: str(200).optional(),
  phone: str(30).optional(),
  email: z.email().optional().or(z.literal('')),
  links: z.array(link).max(20).optional(),
  summary: str(3000).optional(),
  skills: z.array(z.object({ category: str(100).min(1), items: z.array(str(100)).max(50) })).max(30).optional(),
  achievements: z.array(str(500)).max(30).optional(),
  experience: z
    .array(
      z.object({
        // keep the id on edits: tailored resumes refer to experiences by id
        _id: objectId.optional(),
        title: str(150).min(1),
        company: str(150).min(1),
        location: str(150).optional(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().nullable().optional(),
        links: z.array(link).max(10).optional(),
        bullets: z.array(str(600)).max(20).optional(),
      })
    )
    .max(20)
    .optional(),
  projects: z
    .array(
      z.object({
        name: str(150).min(1),
        description: str(1000).optional(),
        techStack: z.array(str(60)).max(30).optional(),
        links: z.array(link).max(10).optional(),
        bullets: z.array(str(600)).max(20).optional(),
      })
    )
    .max(20)
    .optional(),
  education: z
    .array(
      z.object({
        degree: str(150).min(1),
        institution: str(200).min(1),
        startYear: z.number().int().min(1950).max(2100).optional(),
        endYear: z.number().int().min(1950).max(2100).optional(),
        score: str(50).optional(),
      })
    )
    .max(10)
    .optional(),
  languages: z.array(str(60)).max(20).optional(),
});

// ---------- jobs ----------
export const idParams = z.object({ id: objectId });
export const resumeParams = z.object({ id: objectId, format: z.enum(['docx', 'pdf']) });

export const createJobBody = z.object({
  company: str(200).min(1),
  role: str(200).min(1),
  location: str(200).optional(),
  source: z.enum(JOB_SOURCES).optional(),
  url: z.url().optional().or(z.literal('')),
  description: z.string().trim().min(50, 'Paste the full job description (at least 50 characters)').max(50000),
  status: z.enum(JOB_STATUSES).optional(),
  notes: str(5000).optional(),
  tags: z.array(str(40)).max(20).optional(),
});

// Everything optional on update, but status changes go through /status
export const updateJobBody = createJobBody.omit({ status: true }).partial();

export const statusBody = z.object({
  status: z.enum(JOB_STATUSES),
  note: str(500).optional(),
});

export const listJobsQuery = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  q: str(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
