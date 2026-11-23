import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, STATUSES } from '../api';
import { ErrorBox, fmtDate, StatusBadge } from '../components/ui';

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);
  const [q, setQ] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  // filters live in the URL (?status=applied&q=acme&page=2), so back/forward and refresh keep them
  const update = (next) => {
    const merged = { status, q: params.get('q') || '', page: 1, ...next };
    const out = {};
    if (merged.status) out.status = merged.status;
    if (merged.q) out.q = merged.q;
    if (merged.page > 1) out.page = String(merged.page);
    setParams(out);
  };

  // debounce the search box: query the API 400ms after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== (params.get('q') || '')) update({ q });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    let cancelled = false; // ignore a slow, outdated response if filters changed meanwhile
    setError(null);
    Promise.all([api.listJobs({ status, q: params.get('q') || '', page, limit: 20 }), api.stats()])
      .then(([list, s]) => {
        if (!cancelled) {
          setData(list);
          setStats(s);
        }
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [status, page, params]); // status/page come from params; listed for readability

  return (
    <>
      <div className="page-head">
        <h1>Jobs</h1>
        <Link to="/jobs/new" className="btn primary">+ Add job</Link>
      </div>

      {stats && (
        <div className="stats">
          <button className={`stat ${status === '' ? 'active' : ''}`} onClick={() => update({ status: '' })}>
            <span className="num">{stats.total}</span>
            <span className="lbl">All</span>
          </button>
          {STATUSES.map((s) => (
            <button key={s} className={`stat ${status === s ? 'active' : ''}`} onClick={() => update({ status: s })}>
              <span className="num">{stats.byStatus[s]}</span>
              <span className="lbl">{s}</span>
            </button>
          ))}
        </div>
      )}

      <input className="search" type="search" placeholder="Search company, role or description…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorBox error={error} />

      {data && data.items.length === 0 && (
        <div className="card empty">
          {stats?.total === 0 ? (
            <>
              <p>No jobs yet. Paste your first job description to get a match score and a tailored resume.</p>
              <Link to="/jobs/new" className="btn primary">Add your first job</Link>
            </>
          ) : (
            <p className="muted">No jobs match this filter.</p>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="card list">
          {data.items.map((j) => (
            <Link key={j._id} to={`/jobs/${j._id}`} className="row">
              <div className="row-main">
                <div className="row-title">{j.role}</div>
                <div className="muted small">
                  {j.company}
                  {j.location && ` · ${j.location}`} · {j.source}
                </div>
              </div>
              <div className="row-side">
                {j.analysis?.matchScore != null && <span className="score-pill">{j.analysis.matchScore}%</span>}
                {['queued', 'running'].includes(j.ai?.analyze?.status) || ['queued', 'running'].includes(j.ai?.tailor?.status) ? (
                  <span className="muted small">AI working…</span>
                ) : null}
                <StatusBadge status={j.status} />
                <span className="muted small hide-sm">{fmtDate(j.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="pager">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>← Prev</button>
          <span className="muted small">Page {page} of {data.pages}</span>
          <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => update({ page: page + 1 })}>Next →</button>
        </div>
      )}
    </>
  );
}
