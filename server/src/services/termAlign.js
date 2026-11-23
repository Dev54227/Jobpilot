// Deterministic wording alignment: rewrite the candidate's spelling of a term
// into the job description's spelling, e.g. "REST APIs" -> "RESTful APIs".
// ATS keyword matching is often literal, so using the job's exact form matters.
//
// Only TRUE synonyms belong here (same thing, different spelling). This is
// deliberately separate from the evidence aliases in skillMatch.js, where
// "Xcode" counts as evidence of "iOS" but must never be rewritten to it.
const SYNONYM_GROUPS = [
  ['RESTful APIs', 'REST APIs', 'RESTful API', 'REST API', 'RESTful services', 'REST services'],
  ['React Native', 'React-Native', 'RN'],
  ['JavaScript', 'Javascript', 'JS'],
  ['TypeScript', 'Typescript', 'TS'],
  ['Node.js', 'NodeJS', 'Node JS'],
  ['Express.js', 'ExpressJS'],
  ['MongoDB', 'Mongo DB'],
  ['CI/CD', 'CI CD', 'CICD'],
  ['Google Play', 'Play Store', 'Google Play Store'],
  ['App Store', 'Apple App Store'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (s, flags = 'gi') => new RegExp(`(?<![A-Za-z0-9])${esc(s)}(?![A-Za-z0-9])`, flags);

// Which spelling does the job use for each group? (first one found in the JD wins)
export function jobSpellings(jobText) {
  const chosen = [];
  for (const group of SYNONYM_GROUPS) {
    // longest forms first so "RESTful APIs" is found before "REST API"
    const form = [...group].sort((a, b) => b.length - a.length).find((f) => wordRe(f, 'i').test(jobText));
    if (form) chosen.push({ target: form, group });
  }
  return chosen;
}

// Replace other spellings in `text` with the job's spelling.
// Very short forms (RN, JS, TS) are only used for matching the JD, never
// rewritten in the candidate's text, because they're ambiguous in prose.
export function alignTerms(text, spellings) {
  let out = text;
  for (const { target, group } of spellings) {
    const others = group.filter((f) => f !== target && f.length > 2).sort((a, b) => b.length - a.length);
    for (const f of others) {
      // keep singular/plural: "a REST API" -> "a RESTful API", not "a RESTful APIs"
      const plural = (s) => /APIs$|services$/.test(s);
      const replacement = plural(target) && !plural(f) ? target.replace(/s$/, '') : !plural(target) && plural(f) ? `${target}s` : target;
      out = out.replace(wordRe(f), replacement);
    }
  }
  return out;
}
