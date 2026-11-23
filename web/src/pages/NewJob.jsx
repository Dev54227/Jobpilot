import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, SOURCES } from '../api';
import { ErrorBox } from '../components/ui';

export default function NewJob() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ company: '', role: '', location: '', source: 'naukri', url: '', description: '' });
  const [analyzeNow, setAnalyzeNow] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { job } = await api.createJob(form);
      if (analyzeNow) await api.analyze(job._id).catch(() => {}); // e.g. profile empty: job page shows why
      navigate(`/jobs/${job._id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head"><h1>Add a job</h1></div>
      <form className="card form" onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="grid2">
          <label>Company<input value={form.company} onChange={set('company')} required maxLength={200} /></label>
          <label>Role / title<input value={form.role} onChange={set('role')} required maxLength={200} placeholder="e.g. React Native Developer" /></label>
          <label>Location<input value={form.location} onChange={set('location')} placeholder="e.g. Bengaluru" /></label>
          <label>
            Source
            <select value={form.source} onChange={set('source')}>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label>Job link (optional)<input type="url" value={form.url} onChange={set('url')} placeholder="https://…" /></label>
        <label>
          Job description
          <textarea value={form.description} onChange={set('description')} required minLength={50} rows={14} placeholder="Paste the full job description here" />
          <span className="muted small">{form.description.trim().length} characters (minimum 50)</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={analyzeNow} onChange={(e) => setAnalyzeNow(e.target.checked)} />
          Analyze with AI right away (takes about 1–2 minutes in the background)
        </label>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save job'}</button>
        </div>
      </form>
    </>
  );
}
