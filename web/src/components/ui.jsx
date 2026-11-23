// Small shared UI pieces.

export function StatusBadge({ status }) {
  return <span className={`badge s-${status}`}>{status}</span>;
}

// Circular match score: green ≥ 75, amber ≥ 50, red below
export function ScoreRing({ score, size = 96 }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? 'good' : score >= 50 ? 'ok' : 'bad';
  return (
    <svg className={`ring ${tone}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Match score ${score}%`}>
      <circle cx="50" cy="50" r={r} className="ring-bg" />
      <circle cx="50" cy="50" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 50 50)" />
      <text x="50" y="50" dy="0.35em" textAnchor="middle">{score}%</text>
    </svg>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      {error.message || String(error)}
      {error.details && <div className="small">{error.details}</div>}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
