// Step 2 of the AI flow: reword and reorder the REAL profile for one job.
//
// Who does what:
//  - CODE: headline, skill order, job-term spelling, honesty + quality guards.
//  - AI:   only the summary and the experience bullets (the creative part).
// Anything the AI writes that fails a guard is thrown away and the user's own
// text is used instead, so the worst case is "your original resume".
import { chatJSON } from './ollama.js';
import { hasSkill, normalize, profileCorpus } from './skillMatch.js';
import { alignTerms, jobSpellings } from './termAlign.js';

const tailorSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } },
        required: ['id', 'bullets'],
      },
    },
  },
  required: ['summary', 'experience'],
};

// Small local models follow concrete rules + one worked example far better
// than abstract advice.
const SYSTEM = `You are an expert resume writer tailoring a candidate's resume to ONE job.

HONESTY (most important):
- Use ONLY facts from CANDIDATE PROFILE. Never add a skill, tool, number, company or duty that is not there.
- Never mention anything listed under DO NOT CLAIM.

SUMMARY (3-4 sentences):
- Sentence 1: role + years of experience + main skill, aligned to the job title.
- Include the numbers from KEY FACTS exactly as written (e.g. "100+ screens").
- Use the job's exact words from USE THESE TERMS where the profile supports them.
- No filler: never write "innovative solutions", "passionate", "dynamic", "results-driven", "team player", "cutting-edge", "user-friendly and efficient".

BULLETS (for every experience id):
- Same number of bullets or fewer, one sentence each, most job-relevant first.
- Start with a strong past-tense verb (Built, Developed, Integrated, Implemented, Resolved, Optimized). Use present tense only if the original does.
- Keep every number and specific detail from the original bullet.
- Use the job's exact term when the bullet already describes that thing.

EXAMPLE
Job terms: "RESTful APIs", "Git"
Original bullet: "Worked on payment screens and connected them to REST APIs."
Good rewrite: "Built payment screens integrated with RESTful APIs."
Bad rewrite: "Built secure payment screens with RESTful APIs, Git and CI/CD, cutting errors by 40%." (adds facts)

Return JSON only.`;

const NUMBER_RE = /\d+(?:[.,]\d+)?\+?/g;
const FILLER = [
  'innovative solutions', 'passionate', 'dynamic', 'synergy', 'results-driven', 'results driven', 'go-getter',
  'team player', 'detail-oriented', 'think outside the box', 'cutting-edge', 'world-class',
  'user-friendly and efficient', 'proven track record', 'hard-working', 'self-starter',
];

// A piece of text is "honest" if every number in it and every job skill it
// mentions can also be found in the profile, and it has no filler phrases
// the user never wrote.
export function checkText(text, corpus, jobSkills) {
  const t = normalize(text);
  for (const n of t.match(NUMBER_RE) || []) {
    // whole-number match, so "38" in the profile does not approve "3" or "380"
    if (!hasSkill(corpus, n.replace(/\+$/, ''))) return `invented number "${n}"`;
  }
  for (const s of jobSkills) {
    if (hasSkill(t, s) && !hasSkill(corpus, s)) return `claims "${s}", which is not in your profile`;
  }
  for (const f of FILLER) {
    if (t.includes(normalize(f)) && !corpus.includes(normalize(f))) return `used filler phrase "${f}"`;
  }
  return null;
}

// Job-relevant skills first: inside each category, items the job mentions
// move up; categories with more relevant items move up. Stable otherwise.
export function orderSkills(profileSkills, job) {
  const jobText = normalize(`${job.role} ${job.description}`);
  const jobSkills = (job.analysis?.requiredSkills || []).map((s) => s.name);
  const relevant = (item) => hasSkill(jobText, item) || jobSkills.some((s) => hasSkill(normalize(item), s));

  return profileSkills
    .map((cat, index) => {
      const items = cat.items.map((item, i) => ({ item, i, hit: relevant(item) }));
      items.sort((a, b) => Number(b.hit) - Number(a.hit) || a.i - b.i);
      return { category: cat.category, items: items.map((x) => x.item), hits: items.filter((x) => x.hit).length, index };
    })
    .sort((a, b) => b.hits - a.hits || a.index - b.index)
    .map(({ category, items }) => ({ category, items }));
}

// Headline by code: "<job title> | <main skill>", e.g. "Application Developer | React Native".
// Only when the candidate genuinely fits (score ≥ 60) and the title claims nothing they lack.
export function buildHeadline(job, profile, corpus) {
  const a = job.analysis || {};
  const title = job.role.replace(/\(.*?\)/g, '').replace(/\s*[-–,].*$/, '').replace(/\s+/g, ' ').trim();
  const mainSkill = (a.requiredSkills || []).find((s) => s.importance === 'must' && hasSkill(corpus, s.name))?.name;
  if (!title || (a.matchScore ?? 0) < 60) return null;
  if (checkText(title, corpus, (a.requiredSkills || []).map((s) => s.name))) return null;
  if (mainSkill && !normalize(title).includes(normalize(mainSkill))) return `${title} | ${mainSkill}`;
  return title;
}

// Short factual achievements with numbers, e.g. "100+ screens delivered ..."
const keyFacts = (profile) => (profile.achievements || []).filter((a) => /\d/.test(a)).slice(0, 5);
const numbersIn = (s) => (normalize(s).match(NUMBER_RE) || []).map((n) => n.replace(/\+$/, ''));

export async function tailorResume(job, profile) {
  const corpus = profileCorpus(profile);
  const a = job.analysis || {};
  const jobSkills = (a.requiredSkills || []).map((s) => s.name);
  const spellings = jobSpellings(`${job.role}\n${job.description}`);
  const align = (s) => alignTerms(s, spellings);
  const warnings = [];

  const facts = keyFacts(profile);
  const factNumbers = [...new Set(facts.flatMap(numbersIn))];
  const useTerms = [...new Set([...(a.matchedKeywords || []), ...spellings.map((s) => s.target)])];
  const doNotClaim = a.missingKeywords || [];

  // compact prompt: CPU prompt processing is ~18 tokens/s, so every token counts
  const profileForPrompt = {
    summary: profile.summary,
    skills: profile.skills.flatMap((s) => s.items).join(', '),
    experience: profile.experience.map((e) => ({ id: String(e._id), title: e.title, company: e.company, bullets: e.bullets })),
  };

  const user = [
    `JOB TITLE: ${job.role} at ${job.company}`,
    `JOB DESCRIPTION:\n${job.description}`,
    `USE THESE TERMS: ${useTerms.join(', ') || '(none)'}`,
    `DO NOT CLAIM: ${doNotClaim.join(', ') || '(none)'}`,
    `KEY FACTS:\n- ${facts.join('\n- ') || '(none)'}`,
    `CANDIDATE PROFILE (JSON):\n${JSON.stringify(profileForPrompt)}`,
  ].join('\n\n');

  const { json, model } = await chatJSON({ system: SYSTEM, user, schema: tailorSchema, temperature: 0.3 });

  // ---- headline (code) ----
  const headline = buildHeadline(job, profile, corpus) || profile.headline;

  // ---- summary (AI, guarded) ----
  let summary = profile.summary;
  const proposedSummary = align((json.summary || '').trim());
  if (proposedSummary) {
    const problem = checkText(proposedSummary, corpus, jobSkills);
    const keptNumbers = factNumbers.filter((n) => numbersIn(proposedSummary).includes(n)).length;
    const needed = Math.min(2, factNumbers.length);
    if (problem) warnings.push(`summary: kept original because the AI ${problem}`);
    else if (keptNumbers < needed) warnings.push(`summary: kept original because the AI dropped your key numbers`);
    else summary = proposedSummary;
  }
  if (summary === profile.summary) summary = align(summary);

  // ---- experience bullets (AI, guarded) ----
  const aiById = new Map((json.experience || []).map((e) => [e.id, e.bullets || []]));
  const experience = profile.experience.map((exp) => {
    const original = (exp.bullets || []).map(align);
    const proposed = (aiById.get(String(exp._id)) || []).map((b) => align(b.trim())).filter(Boolean);
    if (!proposed.length) return { experienceId: exp._id, bullets: original };

    const kept = [];
    for (const b of proposed.slice(0, Math.max(original.length, 1))) {
      const problem = checkText(b, corpus, jobSkills);
      if (problem) warnings.push(`${exp.company}: removed a bullet because it ${problem}`);
      else kept.push(b);
    }
    // a bullet's own numbers must survive the rewrite ("200+ APIs" can't silently vanish)
    const lost = [...new Set(original.flatMap(numbersIn))].filter((n) => !kept.some((b) => numbersIn(b).includes(n)));
    if (lost.length) {
      warnings.push(`${exp.company}: kept original bullets because the rewrite dropped ${lost.join(', ')}`);
      return { experienceId: exp._id, bullets: original };
    }
    // if the guard removed too much, fall back to the user's own bullets
    if (kept.length < Math.ceil(original.length / 2)) {
      warnings.push(`${exp.company}: kept original bullets`);
      return { experienceId: exp._id, bullets: original };
    }
    return { experienceId: exp._id, bullets: kept };
  });

  const skills = orderSkills(profile.skills, job).map((c) => ({ category: align(c.category), items: c.items.map(align) }));
  return { headline, summary, skills, experience, warnings, model, generatedAt: new Date() };
}
