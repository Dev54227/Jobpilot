// The user's REAL base resume. The AI may only reword/reorder facts from
// here when tailoring; it must never invent skills or experience.
import mongoose from 'mongoose';

const { Schema } = mongoose;

const linkSchema = new Schema(
  { label: { type: String, required: true, trim: true }, url: { type: String, required: true, trim: true } },
  { _id: false }
);

const experienceSchema = new Schema({
  title: { type: String, required: true, trim: true },
  company: { type: String, required: true, trim: true },
  location: { type: String, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, default: null }, // null = Present
  links: [linkSchema],
  bullets: [{ type: String, trim: true }],
});

const projectSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  techStack: [{ type: String, trim: true }],
  links: [linkSchema],
  bullets: [{ type: String, trim: true }],
});

const educationSchema = new Schema({
  degree: { type: String, required: true, trim: true },
  institution: { type: String, required: true, trim: true },
  startYear: Number,
  endYear: Number,
  score: { type: String, trim: true },
});

const profileSchema = new Schema(
  {
    // one profile per user (unique index)
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, trim: true, default: '' },
    headline: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    links: [linkSchema],
    summary: { type: String, trim: true, default: '' },
    skills: [
      new Schema(
        { category: { type: String, required: true, trim: true }, items: [{ type: String, trim: true }] },
        { _id: false }
      ),
    ],
    achievements: [{ type: String, trim: true }],
    experience: [experienceSchema],
    projects: [projectSchema],
    education: [educationSchema],
    languages: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

export const Profile = mongoose.model('Profile', profileSchema);
