// Profile editor. Lists are edited as plain text (one item per line, or
// comma-separated) and converted to/from the API's arrays.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox } from '../components/ui';

const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const commas = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const toMonth = (d) => (d ? String(d).slice(0, 7) : ''); // "2023-05-01T…" → "2023-05"
// links as "Label | https://url", one per line
const linksToText = (links = []) => links.map((l) => `${l.label} | ${l.url}`).join('\n');
const textToLinks = (s) =>
  lines(s).map((l) => {
    const [label, ...rest] = l.split('|');
    return { label: label.trim(), url: rest.join('|').trim() };
  });

// API profile → editable form state
function toForm(p) {
  return {
    fullName: p.fullName || '',
    headline: p.headline || '',
    location: p.location || '',
    phone: p.phone || '',
    email: p.email || '',
    links: linksToText(p.links),
    summary: p.summary || '',
    skills: (p.skills || []).map((s) => ({ category: s.category, items: s.items.join(', ') })),
    achievements: (p.achievements || []).join('\n'),
    experience: (p.experience || []).map((e) => ({
      _id: e._id,
      title: e.title,
      company: e.company,
      location: e.location || '',
      startDate: toMonth(e.startDate),
      endDate: toMonth(e.endDate),
      current: !e.endDate,
      links: linksToText(e.links),
      bullets: (e.bullets || []).join('\n'),
    })),
    education: (p.education || []).map((e) => ({ ...e, startYear: e.startYear || '', endYear: e.endYear || '', score: e.score || '' })),
    languages: (p.languages || []).join(', '),
  };
}

// form state → API payload
function toPayload(f) {
  return {
    fullName: f.fullName,
    headline: f.headline,
    location: f.location,
    phone: f.phone,
    email: f.email,
    links: textToLinks(f.links),
    summary: f.summary,
    skills: f.skills.filter((s) => s.category.trim()).map((s) => ({ category: s.category.trim(), items: commas(s.items) })),
    achievements: lines(f.achievements),
    experience: f.experience.map((e) => ({
      ...(e._id ? { _id: e._id } : {}),
      title: e.title,
      company: e.company,
      location: e.location,
      startDate: `${e.startDate}-01`,
      endDate: e.current || !e.endDate ? null : `${e.endDate}-01`,
      links: textToLinks(e.links),
      bullets: lines(e.bullets),
    })),
    education: f.education.map((e) => ({
      degree: e.degree,
      institution: e.institution,
      ...(e.startYear ? { startYear: Number(e.startYear) } : {}),
      ...(e.endYear ? { endYear: Number(e.endYear) } : {}),
      score: e.score,
    })),
    languages: commas(f.languages),
  };
}

const blankExp = { title: '', company: '', location: '', startDate: '', endDate: '', current: true, links: '', bullets: '' };
const blankEdu = { degree: '', institution: '', startYear: '', endYear: '', score: '' };

export default function Profile() {
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getProfile().then(({ profile }) => setForm(toForm(profile))).catch(setError);
  }, []);

  if (!form) return error ? <ErrorBox error={error} /> : <div className="center muted">Loading…</div>;

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setSaved(false); };
  const setIn = (list, i, k, v) => { setForm({ ...form, [list]: form[list].map((x, j) => (j === i ? { ...x, [k]: v } : x)) }); setSaved(false); };
  const add = (list, blank) => setForm({ ...form, [list]: [...form[list], { ...blank }] });
  const remove = (list, i) => setForm({ ...form, [list]: form[list].filter((_, j) => j !== i) });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { profile } = await api.saveProfile(toPayload(form));
      setForm(toForm(profile));
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="page-head">
        <div>
          <h1>Your profile</h1>
          <p className="muted small">Your real base resume. The AI may only reword and reorder what's here, never add to it.</p>
        </div>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </div>
      <ErrorBox error={error} />
      {saved && <div className="alert ok">Profile saved.</div>}

      <section className="card form">
        <h2>Basics</h2>
        <div className="grid2">
          <label>Full name<input value={form.fullName} onChange={set('fullName')} /></label>
          <label>Headline<input value={form.headline} onChange={set('headline')} placeholder="React Native Developer" /></label>
          <label>Location<input value={form.location} onChange={set('location')} /></label>
          <label>Phone<input value={form.phone} onChange={set('phone')} /></label>
          <label>Email<input type="email" value={form.email} onChange={set('email')} /></label>
          <label>Links <span className="muted small">(one per line: Label | URL)</span><textarea rows={2} value={form.links} onChange={set('links')} placeholder="LinkedIn | https://linkedin.com/in/you" /></label>
        </div>
        <label>Summary<textarea rows={4} value={form.summary} onChange={set('summary')} /></label>
      </section>

      <section className="card form">
        <div className="section-head"><h2>Skills</h2><button type="button" className="btn sm" onClick={() => add('skills', { category: '', items: '' })}>+ Category</button></div>
        {form.skills.map((s, i) => (
          <div key={i} className="skill-row">
            <input value={s.category} onChange={(e) => setIn('skills', i, 'category', e.target.value)} placeholder="Category" aria-label="Category" />
            <input value={s.items} onChange={(e) => setIn('skills', i, 'items', e.target.value)} placeholder="Comma-separated skills" aria-label="Skills" />
            <button type="button" className="btn ghost sm" onClick={() => remove('skills', i)} aria-label="Remove category">✕</button>
          </div>
        ))}
      </section>

      <section className="card form">
        <h2>Key achievements <span className="muted small">(one per line; numbers here are kept in every tailored summary)</span></h2>
        <textarea rows={5} value={form.achievements} onChange={set('achievements')} />
      </section>

      <section className="card form">
        <div className="section-head"><h2>Experience</h2><button type="button" className="btn sm" onClick={() => add('experience', blankExp)}>+ Experience</button></div>
        {form.experience.map((e, i) => (
          <fieldset key={e._id || i} className="sub">
            <div className="grid2">
              <label>Title<input value={e.title} onChange={(ev) => setIn('experience', i, 'title', ev.target.value)} required /></label>
              <label>Company<input value={e.company} onChange={(ev) => setIn('experience', i, 'company', ev.target.value)} required /></label>
              <label>Start<input type="month" value={e.startDate} onChange={(ev) => setIn('experience', i, 'startDate', ev.target.value)} required /></label>
              <label>
                End
                <input type="month" value={e.endDate} disabled={e.current} onChange={(ev) => setIn('experience', i, 'endDate', ev.target.value)} />
                <span className="check small"><input type="checkbox" checked={e.current} onChange={(ev) => setIn('experience', i, 'current', ev.target.checked)} /> Present</span>
              </label>
            </div>
            <label>Links <span className="muted small">(Label | URL per line)</span><textarea rows={2} value={e.links} onChange={(ev) => setIn('experience', i, 'links', ev.target.value)} /></label>
            <label>Bullets <span className="muted small">(one per line)</span><textarea rows={5} value={e.bullets} onChange={(ev) => setIn('experience', i, 'bullets', ev.target.value)} /></label>
            <button type="button" className="btn danger sm" onClick={() => remove('experience', i)}>Remove experience</button>
          </fieldset>
        ))}
      </section>

      <section className="card form">
        <div className="section-head"><h2>Education</h2><button type="button" className="btn sm" onClick={() => add('education', blankEdu)}>+ Education</button></div>
        {form.education.map((e, i) => (
          <fieldset key={i} className="sub">
            <div className="grid2">
              <label>Degree<input value={e.degree} onChange={(ev) => setIn('education', i, 'degree', ev.target.value)} required /></label>
              <label>Institution<input value={e.institution} onChange={(ev) => setIn('education', i, 'institution', ev.target.value)} required /></label>
              <label>Start year<input type="number" value={e.startYear} onChange={(ev) => setIn('education', i, 'startYear', ev.target.value)} /></label>
              <label>End year<input type="number" value={e.endYear} onChange={(ev) => setIn('education', i, 'endYear', ev.target.value)} /></label>
              <label>Score<input value={e.score} onChange={(ev) => setIn('education', i, 'score', ev.target.value)} placeholder="CGPA 7.1" /></label>
            </div>
            <button type="button" className="btn danger sm" onClick={() => remove('education', i)}>Remove</button>
          </fieldset>
        ))}
      </section>

      <section className="card form">
        <h2>Languages</h2>
        <input value={form.languages} onChange={set('languages')} placeholder="English (Fluent), Telugu (Native)" />
      </section>

      <div className="actions"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
    </form>
  );
}
