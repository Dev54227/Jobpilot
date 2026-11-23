// Manual end-to-end check against the RUNNING API with the REAL Ollama model.
// usage: node scripts/try-real-ai.js <jd-file.txt> "<Company>" "<Role>"
// Needs data/login.local.json ({ "email", "password" }) and data/profile.local.json.
import { readFile, writeFile } from 'node:fs/promises';

const API = process.env.API_URL || 'http://localhost:5000/api';
const [jdFile, company = 'Unknown', role = 'Application Developer'] = process.argv.slice(2);
if (!jdFile) {
  console.error('usage: node scripts/try-real-ai.js <jd-file.txt> "<Company>" "<Role>"');
  process.exit(1);
}

const login = JSON.parse(await readFile(new URL('../data/login.local.json', import.meta.url)));
const profile = JSON.parse(await readFile(new URL('../data/profile.local.json', import.meta.url)));

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.headers.get('content-type')?.includes('json') ? res.json() : Buffer.from(await res.arrayBuffer());
}

// log in, or create the single account on first run
let token;
try {
  ({ token } = await call('POST', '/auth/login', login));
} catch {
  ({ token } = await call('POST', '/auth/register', { name: profile.fullName, ...login }));
  console.log('Account created');
}

await call('PUT', '/profile', profile, token);
console.log('Profile saved');

// keep only the JD body if the file has the "=== FULL JD ===" layout used in Job Applications
let description = await readFile(jdFile, 'utf8');
const m = description.match(/=== FULL JD[^\n]*\n([\s\S]*?)\n=== /);
if (m) description = m[1].trim();

const { job } = await call('POST', '/jobs', { company, role, description, source: 'manual' }, token);

// start a background AI task, then poll until it's done
async function runTask(kind) {
  const t = Date.now();
  await call('POST', `/jobs/${job._id}/${kind}`, null, token);
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const { job: j } = await call('GET', `/jobs/${job._id}`, null, token);
    const s = j.ai?.[kind];
    process.stdout.write(`\r${kind}: ${s?.status} ${((Date.now() - t) / 1000).toFixed(0)}s   `);
    if (s?.status === 'failed') throw new Error(`${kind} failed: ${s.error}`);
    if (s?.status === 'done') {
      console.log();
      return j;
    }
  }
}

let t = Date.now();
const { analysis } = await runTask('analyze');
console.log(`\nANALYSIS (${((Date.now() - t) / 1000).toFixed(0)}s, ${analysis.model})`);
console.log('Match score :', analysis.matchScore + '%');
console.log('Required    :', analysis.requiredSkills.map((s) => `${s.name}[${s.importance}]`).join(', '));
console.log('Matched     :', analysis.matchedKeywords.join(', '));
console.log('Gaps        :', analysis.gaps.join(' | ') || 'none');

t = Date.now();
const { tailored } = await runTask('tailor');
console.log(`\nTAILORED (${((Date.now() - t) / 1000).toFixed(0)}s)`);
console.log('Headline :', tailored.headline);
console.log('Summary  :', tailored.summary);
console.log('Skills   :', tailored.skills.map((s) => `${s.category}: ${s.items.join(', ')}`).join('\n           '));
for (const e of tailored.experience) console.log('Bullets  :', '\n  * ' + e.bullets.join('\n  * '));
console.log('Warnings :', tailored.warnings.length ? '\n  - ' + tailored.warnings.join('\n  - ') : 'none');

for (const fmt of ['docx', 'pdf']) {
  try {
    const file = await call('GET', `/jobs/${job._id}/resume.${fmt}`, null, token);
    const out = `generated/${company.replace(/\W+/g, '_')}_Resume.${fmt}`;
    await writeFile(new URL(`../${out}`, import.meta.url), file);
    console.log(`Saved ${out}`);
  } catch (e) {
    console.log(`${fmt}: ${e.message}`);
  }
}
