// End-to-end API tests against a throwaway in-memory MongoDB.
// Run: npm test
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

let mongo, app, mongoose;
const JD = 'We need a React Native developer with 3+ years of experience, JavaScript, REST APIs and Git. '.repeat(2);

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGO_URI: mongo.getUri('jobpilot-test'),
    JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
    ALLOW_REGISTRATION: 'false',
  });
  // import after env is set, because env.js validates at import time
  mongoose = (await import('mongoose')).default;
  await (await import('../src/config/db.js')).connectDB();
  await mongoose.connection.syncIndexes();
  app = (await import('../src/app.js')).createApp();
});

after(async () => {
  await mongoose?.connection.close();
  await mongo?.stop();
});

const api = () => request(app);
let token, jobId;
const auth = () => ({ Authorization: `Bearer ${token}` });

describe('health + 404', () => {
  test('health is ok', async () => {
    const r = await api().get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.db, 'up');
  });
  test('unknown route returns a real 404', async () => {
    assert.equal((await api().get('/api/nope')).status, 404);
  });
});

describe('auth', () => {
  test('first user can register', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'David', email: 'David@Example.com', password: 'supersecret1' });
    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.user.email, 'david@example.com');
    assert.equal(r.body.user.passwordHash, undefined, 'hash must never be returned');
    token = r.body.token;
  });
  test('second registration is blocked in single-user mode', async () => {
    const r = await api().post('/api/auth/register').send({ name: 'X', email: 'x@example.com', password: 'supersecret1' });
    assert.equal(r.status, 403);
  });
  test('wrong password is rejected', async () => {
    const r = await api().post('/api/auth/login').send({ email: 'david@example.com', password: 'wrong-pass' });
    assert.equal(r.status, 401);
  });
  test('login works and /me returns the user', async () => {
    const r = await api().post('/api/auth/login').send({ email: 'david@example.com', password: 'supersecret1' });
    assert.equal(r.status, 200);
    const me = await api().get('/api/auth/me').set({ Authorization: `Bearer ${r.body.token}` });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.name, 'David');
  });
  test('protected route without token is 401', async () => {
    assert.equal((await api().get('/api/jobs')).status, 401);
  });
  test('invalid body gives 422 with field details', async () => {
    const r = await api().post('/api/auth/login').send({ email: 'not-an-email' });
    assert.equal(r.status, 422);
    assert.ok(r.body.details.some((d) => d.field === 'email'));
  });
});

describe('profile', () => {
  test('profile was created at registration', async () => {
    const r = await api().get('/api/profile').set(auth());
    assert.equal(r.status, 200);
    assert.equal(r.body.profile.fullName, 'David');
  });
  test('partial update keeps other sections', async () => {
    await api().put('/api/profile').set(auth()).send({ headline: 'React Native Developer' });
    const r = await api()
      .put('/api/profile')
      .set(auth())
      .send({ skills: [{ category: 'Core', items: ['React Native', 'JavaScript'] }] });
    assert.equal(r.status, 200);
    assert.equal(r.body.profile.headline, 'React Native Developer');
    assert.deepEqual(r.body.profile.skills[0].items, ['React Native', 'JavaScript']);
  });
  test('editing an experience keeps its id (tailored resumes refer to it)', async () => {
    const exp = { title: 'Dev', company: 'Acme', startDate: '2023-01-01', bullets: ['Built screens.'] };
    const first = await api().put('/api/profile').set(auth()).send({ experience: [exp] });
    const id = first.body.profile.experience[0]._id;
    const second = await api().put('/api/profile').set(auth()).send({ experience: [{ ...exp, _id: id, bullets: ['Built 10 screens.'] }] });
    assert.equal(second.body.profile.experience[0]._id, id);
    assert.deepEqual(second.body.profile.experience[0].bullets, ['Built 10 screens.']);
  });
});

describe('jobs', () => {
  test('create a job', async () => {
    const r = await api().post('/api/jobs').set(auth()).send({ company: 'Acme', role: 'RN Developer', description: JD, source: 'naukri' });
    assert.equal(r.status, 201);
    assert.equal(r.body.job.status, 'saved');
    assert.equal(r.body.job.statusHistory.length, 1);
    jobId = r.body.job._id;
  });
  test('short description is rejected', async () => {
    const r = await api().post('/api/jobs').set(auth()).send({ company: 'A', role: 'B', description: 'too short' });
    assert.equal(r.status, 422);
  });
  test('status change records history and appliedAt', async () => {
    const r = await api().patch(`/api/jobs/${jobId}/status`).set(auth()).send({ status: 'applied', note: 'via Naukri' });
    assert.equal(r.status, 200);
    assert.equal(r.body.job.status, 'applied');
    assert.equal(r.body.job.statusHistory.length, 2);
    assert.ok(r.body.job.appliedAt);
  });
  test('list excludes description, supports status filter and text search', async () => {
    await api().post('/api/jobs').set(auth()).send({ company: 'Globex', role: 'MERN Developer', description: JD.replace('React Native', 'MongoDB Express') });
    const all = await api().get('/api/jobs').set(auth());
    assert.equal(all.body.total, 2);
    assert.equal(all.body.items[0].description, undefined);

    const applied = await api().get('/api/jobs?status=applied').set(auth());
    assert.equal(applied.body.total, 1);

    const search = await api().get('/api/jobs?q=Globex').set(auth());
    assert.equal(search.body.total, 1);
    assert.equal(search.body.items[0].company, 'Globex');
  });
  test('stats counts by status (and /stats is not read as an id)', async () => {
    const r = await api().get('/api/jobs/stats').set(auth());
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 2);
    assert.equal(r.body.byStatus.applied, 1);
    assert.equal(r.body.byStatus.saved, 1);
  });
  test('bad id is 422, unknown id is 404', async () => {
    assert.equal((await api().get('/api/jobs/123').set(auth())).status, 422);
    assert.equal((await api().get('/api/jobs/64b7f0000000000000000000').set(auth())).status, 404);
  });
  test('delete a job', async () => {
    assert.equal((await api().delete(`/api/jobs/${jobId}`).set(auth())).status, 204);
    assert.equal((await api().get(`/api/jobs/${jobId}`).set(auth())).status, 404);
  });
});
