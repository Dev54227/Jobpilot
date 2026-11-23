// AI flow tests with a FAKE Ollama server, so they are fast and repeatable.
// The fake deliberately "lies" to prove the honesty guard works.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

let mongo, app, mongoose, fake, token, jobId, expId;

const EXTRACTION = {
  requiredSkills: [
    { name: 'React Native', importance: 'must' },
    { name: 'JavaScript', importance: 'must' },
    { name: 'REST API', importance: 'must' },
    { name: 'Git', importance: 'nice' },
    { name: 'Jest', importance: 'nice' },
    { name: 'Kotlin', importance: 'must' },
  ],
  keywords: ['Application Developer', 'mobile'],
  minYearsExperience: 3,
  summary: 'React Native application developer role.',
};

// The tailor reply mixes honest rewording with lies: an invented skill item,
// an invented metric, and a summary claiming a skill (Kotlin) the profile lacks.
// `mode = 'mostlyLies'` makes 2 of 3 bullets dishonest to test the fallback.
let mode = 'normal';
const tailorReply = () => ({
  headline: 'Application Developer | React Native',
  summary: 'React Native developer with 3+ years, also experienced in Kotlin.',
  skills: [
    { category: 'Mobile', items: ['React Native', 'Kotlin'] },
    { category: 'Languages', items: ['JavaScript'] },
  ],
  experience: [
    {
      id: expId,
      bullets:
        mode === 'normal'
          ? [
              'Integrated 200+ RESTful APIs across production apps.',
              'Cut crash rate by 75% using Firebase Crashlytics.',
              'Resolved production crashes using Firebase Crashlytics.',
            ]
          : ['Integrated 200+ RESTful APIs across production apps.', 'Cut crash rate by 75%.', 'Built native modules in Kotlin.'],
    },
  ],
});

before(async () => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { messages } = JSON.parse(body);
      const isExtraction = messages[0].content.includes('extract structured requirements');
      const content = JSON.stringify(isExtraction ? EXTRACTION : tailorReply());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: 'fake-model', message: { role: 'assistant', content } }));
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));

  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGO_URI: mongo.getUri('jobpilot-ai-test'),
    JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
    OLLAMA_URL: `http://127.0.0.1:${fake.address().port}`,
  });
  mongoose = (await import('mongoose')).default;
  await (await import('../src/config/db.js')).connectDB();
  await mongoose.connection.syncIndexes();
  app = (await import('../src/app.js')).createApp();

  const r = await request(app).post('/api/auth/register').send({ name: 'David Bonda', email: 'd@example.com', password: 'supersecret1' });
  token = r.body.token;
});

after(async () => {
  await mongoose?.connection.close();
  await mongo?.stop();
  fake?.close();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('skill matching (unit)', () => {
  test('aliases and word boundaries', async () => {
    const { hasSkill, normalize } = await import('../src/services/skillMatch.js');
    const corpus = normalize('React Native | JavaScript | RESTful APIs | Git');
    assert.ok(hasSkill(corpus, 'RN'));
    assert.ok(hasSkill(corpus, 'REST API'));
    assert.ok(hasSkill(corpus, 'version control'));
    assert.ok(!hasSkill(corpus, 'Java'), '"Java" must not match inside "JavaScript"');
  });

  test("term alignment uses the job's spelling, keeps singular/plural", async () => {
    const { alignTerms, jobSpellings } = await import('../src/services/termAlign.js');
    const sp = jobSpellings('Familiarity with RESTful APIs and Git. Publish to Google Play.');
    assert.equal(alignTerms('Integrated 200+ REST APIs and a REST API gateway.', sp), 'Integrated 200+ RESTful APIs and a RESTful API gateway.');
    assert.equal(alignTerms('Shipped 21 Play Store releases.', sp), 'Shipped 21 Google Play releases.');
    assert.equal(alignTerms('Uses Xcode daily.', sp), 'Uses Xcode daily.', 'evidence aliases are never rewritten');
  });

  test('guard rejects filler phrases and invented numbers', async () => {
    const { checkText } = await import('../src/services/tailor.service.js');
    const corpus = 'react native developer with 3+ years 200+ rest apis';
    assert.match(checkText('Delivers innovative solutions.', corpus, []), /filler/);
    assert.match(checkText('Improved speed by 40%.', corpus, []), /invented number/);
    assert.equal(checkText('React Native developer with 3+ years.', corpus, []), null);
  });

  test('headline: job title + main skill, only for a real fit', async () => {
    const { buildHeadline } = await import('../src/services/tailor.service.js');
    const corpus = 'react native javascript';
    const analysis = { matchScore: 100, requiredSkills: [{ name: 'React Native', importance: 'must' }] };
    assert.equal(buildHeadline({ role: 'Application Developer (React Native), Bengaluru', analysis }, {}, corpus), 'Application Developer | React Native');
    assert.equal(buildHeadline({ role: 'Application Developer', analysis: { ...analysis, matchScore: 40 } }, {}, corpus), null);
    assert.equal(
      buildHeadline({ role: 'Kotlin Developer', analysis: { matchScore: 80, requiredSkills: [{ name: 'Kotlin', importance: 'must' }] } }, {}, corpus),
      null,
      'title claiming a missing skill is refused'
    );
  });
});

describe('AI flow', () => {
  test('analyze needs a filled profile first', async () => {
    const j = await request(app).post('/api/jobs').set(auth()).send({ company: 'Acme', role: 'Application Developer', description: 'React Native developer needed. '.repeat(5) });
    jobId = j.body.job._id;
    const r = await request(app).post(`/api/jobs/${jobId}/analyze`).set(auth());
    assert.equal(r.status, 409);
  });

  test('fill profile', async () => {
    const r = await request(app)
      .put('/api/profile')
      .set(auth())
      .send({
        fullName: 'David Bonda',
        headline: 'React Native Developer',
        summary: 'React Native developer with 3+ years of experience. Integrated 200+ REST APIs.',
        links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/example' }],
        skills: [
          { category: 'Core', items: ['React Native', 'JavaScript', 'TypeScript'] },
          { category: 'Tools', items: ['Git', 'Firebase Crashlytics'] },
        ],
        experience: [
          {
            title: 'React Native Developer',
            company: 'FHPL Sparrow',
            startDate: '2023-05-01',
            endDate: null,
            links: [{ label: 'App Store', url: 'https://apps.apple.com/in/app/example/id1' }],
            bullets: ['Integrated 200+ REST APIs.', 'Resolved production crashes using Firebase Crashlytics.', 'Built claim tracking screens.'],
          },
        ],
        education: [{ degree: 'B.Tech CSE', institution: 'R.S.R Engineering College', startYear: 2018, endYear: 2022 }],
      });
    assert.equal(r.status, 200);
    expId = r.body.profile.experience[0]._id;
  });

  // POST returns 202 at once; the work happens in the background queue
  async function runTask(kind) {
    const r = await request(app).post(`/api/jobs/${jobId}/${kind}`).set(auth());
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal(r.body.status, 'queued');
    await (await import('../src/services/aiQueue.js')).idle();
    const { body } = await request(app).get(`/api/jobs/${jobId}`).set(auth());
    assert.equal(body.job.ai[kind].status, 'done', JSON.stringify(body.job.ai));
    return body.job;
  }

  test('tailor before analyze is refused', async () => {
    assert.equal((await request(app).post(`/api/jobs/${jobId}/tailor`).set(auth())).status, 409);
  });

  test('analyze: the score is computed by code from real matches', async () => {
    const a = (await runTask('analyze')).analysis;
    // must: RN ✓ JS ✓ REST ✓ Kotlin ✗ (2+2+2+0) ; nice: Git ✓ Jest ✗ (1+0) → 7/10
    assert.equal(a.matchScore, 70);
    assert.deepEqual(a.missingKeywords.sort(), ['Jest', 'Kotlin']);
    assert.ok(a.gaps.some((g) => g.includes('Kotlin (must-have)')));
  });

  test('double-clicking analyze does not queue the task twice', async () => {
    const [a, b] = await Promise.all([
      request(app).post(`/api/jobs/${jobId}/analyze`).set(auth()),
      request(app).post(`/api/jobs/${jobId}/analyze`).set(auth()),
    ]);
    assert.deepEqual([a.body.status, b.body.status].sort(), ['already-in-progress', 'queued']);
    await (await import('../src/services/aiQueue.js')).idle();
  });

  test('tailor: the honesty guard removes every invented claim', async () => {
    const t = (await runTask('tailor')).tailored;

    assert.equal(t.headline, 'Application Developer | React Native');
    // skills are ordered by code: exactly the profile's skills, job-relevant first
    assert.deepEqual(t.skills, [
      { category: 'Core', items: ['React Native', 'JavaScript', 'TypeScript'] },
      { category: 'Tools', items: ['Git', 'Firebase Crashlytics'] },
    ]);

    assert.equal(t.summary, 'React Native developer with 3+ years of experience. Integrated 200+ REST APIs.', 'dishonest summary falls back to the original');

    const bullets = t.experience[0].bullets;
    assert.deepEqual(bullets, [
      'Integrated 200+ RESTful APIs across production apps.',
      'Resolved production crashes using Firebase Crashlytics.',
    ], 'honest rewording kept, invented 75% metric removed');
    assert.ok(t.warnings.length >= 2);
  });

  test('tailor: if most bullets are dishonest, the original bullets are used', async () => {
    mode = 'mostlyLies';
    const t = (await runTask('tailor')).tailored;
    mode = 'normal';
    assert.deepEqual(t.experience[0].bullets, [
      'Integrated 200+ REST APIs.',
      'Resolved production crashes using Firebase Crashlytics.',
      'Built claim tracking screens.',
    ]);
    assert.ok(t.warnings.some((w) => w.includes('kept original bullets')));
  });

  test('skill ordering puts job-relevant skills and categories first', async () => {
    const { orderSkills } = await import('../src/services/tailor.service.js');
    const ordered = orderSkills(
      [
        { category: 'Mobile Features', items: ['Google Maps', 'Vision Camera'] },
        { category: 'Core', items: ['TypeScript', 'React Native', 'JavaScript'] },
      ],
      { role: 'RN Developer', description: 'Needs React Native and JavaScript.', analysis: { requiredSkills: [] } }
    );
    assert.deepEqual(ordered, [
      { category: 'Core', items: ['React Native', 'JavaScript', 'TypeScript'] },
      { category: 'Mobile Features', items: ['Google Maps', 'Vision Camera'] },
    ]);
  });

  test('download tailored resume as .docx', async () => {
    const r = await request(app)
      .get(`/api/jobs/${jobId}/resume.docx`)
      .set(auth())
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(r.status, 200);
    assert.match(r.headers['content-disposition'], /David_Bonda_Acme_Resume\.docx/);
    assert.equal(r.body.subarray(0, 2).toString(), 'PK', 'a .docx is a zip file');
  });

  test('bad format is rejected', async () => {
    assert.equal((await request(app).get(`/api/jobs/${jobId}/resume.exe`).set(auth())).status, 422);
  });

  test('changing the job description clears stale AI results', async () => {
    const r = await request(app).patch(`/api/jobs/${jobId}`).set(auth()).send({ description: 'Completely different JD text for a backend role. '.repeat(3) });
    assert.equal(r.status, 200);
    assert.equal(r.body.job.analysis, undefined);
    assert.equal(r.body.job.tailored, undefined);
  });
});
