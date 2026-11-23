// Deterministic matching: is a skill actually present in the user's profile?
// The AI never decides this; it only extracts what the job asks for.

// Common aliases so "RN" matches "React Native", "REST" matches "RESTful APIs", etc.
const ALIASES = {
  'react native': ['rn', 'react-native'],
  javascript: ['js', 'es6', 'ecmascript'],
  typescript: ['ts'],
  'rest api': ['rest', 'restful', 'restful api', 'rest apis', 'restful apis', 'api integration'],
  git: ['github', 'gitlab', 'version control'],
  redux: ['redux toolkit', 'rtk'],
  'node.js': ['node', 'nodejs'],
  'express.js': ['express', 'expressjs'],
  mongodb: ['mongo', 'mongoose'],
  ios: ['xcode', 'app store'],
  android: ['android studio', 'play store'],
  'ci/cd': ['github actions', 'jenkins', 'fastlane', 'bitrise'],
  firebase: ['crashlytics', 'fcm', 'firebase analytics'],
};

export const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#./ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function variants(skill) {
  const n = normalize(skill);
  const out = new Set([n]);
  for (const [canon, alts] of Object.entries(ALIASES)) {
    if (n === canon || alts.includes(n)) {
      out.add(canon);
      alts.forEach((a) => out.add(a));
    }
  }
  return [...out].filter(Boolean);
}

// Word-boundary match so "java" does not match inside "javascript"
const containsTerm = (haystack, term) => {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(haystack);
};

// All the text in the profile that counts as evidence of a skill
export function profileCorpus(profile) {
  const parts = [
    profile.headline,
    profile.summary,
    ...(profile.skills || []).flatMap((s) => [s.category, ...(s.items || [])]),
    ...(profile.achievements || []),
    ...(profile.experience || []).flatMap((e) => [e.title, ...(e.bullets || [])]),
    ...(profile.projects || []).flatMap((p) => [p.name, p.description, ...(p.techStack || []), ...(p.bullets || [])]),
  ];
  return normalize(parts.filter(Boolean).join(' | '));
}

export const hasSkill = (corpus, skill) => variants(skill).some((v) => containsTerm(corpus, v));

// must-have skills count double
export function scoreMatch(requiredSkills, corpus) {
  const matched = [];
  const missing = [];
  let earned = 0;
  let possible = 0;

  for (const { name, importance } of requiredSkills) {
    const weight = importance === 'must' ? 2 : 1;
    possible += weight;
    if (hasSkill(corpus, name)) {
      matched.push(name);
      earned += weight;
    } else {
      missing.push({ name, importance });
    }
  }
  const matchScore = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  return { matchScore, matched, missing };
}
