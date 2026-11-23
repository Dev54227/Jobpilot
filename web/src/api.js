// Thin fetch wrapper for the JobPilot API.
// The JWT lives in localStorage; any 401 logs the user out.
const TOKEN_KEY = 'jobpilot.token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => {
    try {
      t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage blocked: session-only login */
    }
  },
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body, { raw = false } = {}) {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const details = data.details?.map((d) => `${d.field}: ${d.message}`).join('; ');
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, details);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (name, email, password) => request('POST', '/auth/register', { name, email, password }),
  me: () => request('GET', '/auth/me'),

  getProfile: () => request('GET', '/profile'),
  saveProfile: (p) => request('PUT', '/profile', p),

  listJobs: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return request('GET', `/jobs?${q}`);
  },
  stats: () => request('GET', '/jobs/stats'),
  getJob: (id) => request('GET', `/jobs/${id}`),
  createJob: (j) => request('POST', '/jobs', j),
  updateJob: (id, j) => request('PATCH', `/jobs/${id}`, j),
  setStatus: (id, status, note) => request('PATCH', `/jobs/${id}/status`, { status, note }),
  deleteJob: (id) => request('DELETE', `/jobs/${id}`),
  analyze: (id) => request('POST', `/jobs/${id}/analyze`),
  tailor: (id) => request('POST', `/jobs/${id}/tailor`),

  // fetch with the auth header, then hand the browser a file to save
  async downloadResume(id, format) {
    const res = await request('GET', `/jobs/${id}/resume.${format}`, null, { raw: true });
    const name = /filename="?([^"]+)"?/.exec(res.headers.get('content-disposition') || '')?.[1] || `resume.${format}`;
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export const STATUSES = ['saved', 'applied', 'shortlisted', 'interview', 'offer', 'rejected', 'withdrawn'];
export const SOURCES = ['manual', 'naukri', 'linkedin', 'company-site', 'adzuna', 'greenhouse', 'lever', 'other'];
