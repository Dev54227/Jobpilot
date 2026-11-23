import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, STATUSES } from '../api';
import { ErrorBox, fmtDate, ScoreRing, Spinner, StatusBadge } from '../components/ui';

const ACTIVE = ['queued', 'running'];
const isActive = (task) => ACTIVE.includes(task?.status);

// Re-renders every second while `on`, for the "running for 42s" counter
function useTick(on) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

function AiTaskState({ task, label }) {
  useTick(isActive(task));
  if (!task) return null;
  if (isActive(task)) {
    const since = new Date(task.startedAt || task.queuedAt);
    const secs = Math.max(0, Math.round((Date.now() - since) / 1000));
    return (
      <div className="ai-state">
        <Spinner /> {task.status === 'queued' ? `${label}: waiting in queue…` : `${label}: AI working… ${secs}s`}
        <span className="muted small"> (you can leave this page, it keeps running)</span>
      </div>
    );
  }
  if (task.status === 'failed') return <div className="alert error">{label} failed: {task.error}</div>;
  return null;
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const { job } = await api.getJob(id);
    setJob(job);
    return job;
  }, [id]);

  useEffect(() => {
    setError(null);
    Promise.all([load(), api.getProfile()])
      .then(([j, { profile }]) => {
        setNotes(j.notes || '');
        setProfile(profile);
      })
      .catch(setError);
  }, [load]);

  // Poll while an AI task is queued/running; stop as soon as both are idle.
  const working = isActive(job?.ai?.analyze) || isActive(job?.ai?.tailor);
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => load().catch(setError), 4000);
    return () => clearInterval(t);
  }, [working, load]);

  async function act(name, fn) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy('');
    }
  }

  if (error && !job) return <ErrorBox error={error} />;
  if (!job) return <div className="center muted">Loading…</div>;

  const a = job.analysis;
  const t = job.tailored;
  const expName = (eid) => profile?.experience.find((e) => e._id === eid)?.company || 'Experience';

  return (
    <>
      <Link to="/" className="muted small">← All jobs</Link>
      <div className="page-head">
        <div>
          <h1>{job.role}</h1>
          <div className="muted">
            {job.company}
            {job.location && ` · ${job.location}`} · {job.source}
            {job.url && <> · <a href={job.url} target="_blank" rel="noreferrer">Job link ↗</a></>}
          </div>
        </div>
        <div className="head-actions">
          <select value={job.status} onChange={(e) => act('status', () => api.setStatus(id, e.target.value))} disabled={!!busy} aria-label="Status">
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn danger sm" onClick={() => confirm('Delete this job?') && act('delete', async () => { await api.deleteJob(id); navigate('/'); })}>Delete</button>
        </div>
      </div>
      <ErrorBox error={error} />

      {/* ---------- 1. Analysis ---------- */}
      <section className="card">
        <div className="section-head">
          <h2>1 · Match analysis</h2>
          <button className="btn sm" disabled={!!busy || working} onClick={() => act('analyze', () => api.analyze(id))}>
            {a ? 'Re-analyze' : 'Analyze with AI'}
          </button>
        </div>
        <AiTaskState task={job.ai?.analyze} label="Analysis" />
        {!a && !isActive(job.ai?.analyze) && <p className="muted">Not analyzed yet. The AI reads the job description, and the score is calculated from your real profile.</p>}
        {a && (
          <div className="analysis">
            <ScoreRing score={a.matchScore} />
            <div className="analysis-body">
              {a.summary && <p>{a.summary}</p>}
              <div className="chips">
                {a.requiredSkills.map((s) => (
                  <span key={s.name} className={`chip ${a.matchedKeywords.includes(s.name) ? 'yes' : 'no'}`} title={s.importance === 'must' ? 'Must-have' : 'Nice-to-have'}>
                    {a.matchedKeywords.includes(s.name) ? '✓' : '✗'} {s.name}
                    {s.importance === 'must' && <b> *</b>}
                  </span>
                ))}
              </div>
              <p className="muted small">* must-have · {a.minYearsExperience ? `asks for ${a.minYearsExperience}+ years · ` : ''}analyzed {fmtDate(a.analyzedAt)} with {a.model}</p>
              {a.gaps.length > 0 && (
                <>
                  <h3>Gaps to prepare for</h3>
                  <ul>{a.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ---------- 2. Tailored resume ---------- */}
      <section className="card">
        <div className="section-head">
          <h2>2 · Tailored resume</h2>
          <button className="btn sm" disabled={!a || !!busy || working} onClick={() => act('tailor', () => api.tailor(id))} title={a ? '' : 'Analyze first'}>
            {t ? 'Re-tailor' : 'Tailor with AI'}
          </button>
        </div>
        <AiTaskState task={job.ai?.tailor} label="Tailoring" />
        {!t && !isActive(job.ai?.tailor) && <p className="muted">{a ? 'Rewrites your summary and bullets in this job’s language, using only facts from your profile.' : 'Run the analysis first.'}</p>}
        {t && (
          <div className="tailored">
            {t.warnings.length > 0 && (
              <div className="alert warn">
                <b>Honesty guard removed {t.warnings.length} AI suggestion{t.warnings.length > 1 ? 's' : ''}:</b>
                <ul>{t.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            )}
            <h3>{t.headline}</h3>
            <p>{t.summary}</p>
            <h4>Skills</h4>
            <ul className="tight">{t.skills.map((s) => <li key={s.category}><b>{s.category}:</b> {s.items.join(', ')}</li>)}</ul>
            {t.experience.map((e) => (
              <div key={e.experienceId}>
                <h4>{expName(e.experienceId)}</h4>
                <ul className="tight">{e.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
        <div className="actions left">
          <button className="btn primary" disabled={busy === 'docx'} onClick={() => act('docx', () => api.downloadResume(id, 'docx'))}>
            {busy === 'docx' ? 'Preparing…' : 'Download .docx'}
          </button>
          <button className="btn" disabled={busy === 'pdf'} onClick={() => act('pdf', () => api.downloadResume(id, 'pdf'))}>
            {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </button>
          <span className="muted small">{t ? 'Tailored version' : 'Your base resume (not tailored yet)'}</span>
        </div>
      </section>

      {/* ---------- 3. Tracking ---------- */}
      <section className="card">
        <h2>3 · Tracking</h2>
        <ol className="timeline">
          {job.statusHistory.map((h, i) => (
            <li key={i}><StatusBadge status={h.status} /> <span className="muted small">{fmtDate(h.at)}</span> {h.note && <span className="small">{h.note}</span>}</li>
          ))}
        </ol>
        <label>
          Notes
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Recruiter name, interview dates, salary discussed…" />
        </label>
        <div className="actions left">
          <button className="btn sm" disabled={busy === 'notes' || notes === (job.notes || '')} onClick={() => act('notes', () => api.updateJob(id, { notes }))}>
            {busy === 'notes' ? 'Saving…' : 'Save notes'}
          </button>
        </div>
      </section>

      <details className="card">
        <summary>Job description</summary>
        <pre className="jd">{job.description}</pre>
      </details>
    </>
  );
}
