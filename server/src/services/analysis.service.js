// Step 1 of the AI flow: read a job description, extract what it asks for,
// then score it against the profile with deterministic code.
import { chatJSON } from './ollama.js';
import { profileCorpus, scoreMatch } from './skillMatch.js';

const extractionSchema = {
  type: 'object',
  properties: {
    requiredSkills: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          importance: { type: 'string', enum: ['must', 'nice'] },
        },
        required: ['name', 'importance'],
      },
    },
    keywords: { type: 'array', items: { type: 'string' } },
    minYearsExperience: { type: ['number', 'null'] },
    summary: { type: 'string' },
  },
  required: ['requiredSkills', 'keywords', 'minYearsExperience', 'summary'],
};

const SYSTEM = `You extract structured requirements from job descriptions.
Rules:
- List each concrete technical skill, tool, framework or practice the job asks for, as a short name (e.g. "React Native", "Git", "REST API", "Jest").
- importance "must" = required / must-have / minimum; "nice" = good to have / preferred / plus.
- Do not list soft skills or education as requiredSkills.
- keywords: other important phrases an ATS would scan for (role title, domain, responsibilities), max 15.
- summary: 1-2 sentences describing the role.
- Use only what the text says. Never guess.`;

export async function analyzeJob(job, profile) {
  const { json, model } = await chatJSON({
    system: SYSTEM,
    user: `Job title: ${job.role}\nCompany: ${job.company}\n\nJob description:\n${job.description}`,
    schema: extractionSchema,
    temperature: 0,
  });

  // de-duplicate skills the model may repeat
  const seen = new Set();
  const requiredSkills = (json.requiredSkills || []).filter((s) => {
    const k = s.name?.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const { matchScore, matched, missing } = scoreMatch(requiredSkills, profileCorpus(profile));

  return {
    matchScore,
    requiredSkills,
    matchedKeywords: matched,
    missingKeywords: missing.map((m) => m.name),
    gaps: missing.map((m) => `${m.name} (${m.importance === 'must' ? 'must-have' : 'nice-to-have'}) is not in your profile`),
    keywords: (json.keywords || []).slice(0, 15),
    minYearsExperience: json.minYearsExperience ?? null,
    summary: json.summary || '',
    model,
    analyzedAt: new Date(),
  };
}
