import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewJob from './pages/NewJob';
import JobDetail from './pages/JobDetail';
import Profile from './pages/Profile';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

function Layout() {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand" aria-label="JobPilot home">🧭<span className="hide-sm"> JobPilot</span></NavLink>
          <nav>
            <NavLink to="/" end>Jobs</NavLink>
            <NavLink to="/jobs/new">Add job</NavLink>
            <NavLink to="/profile">Profile</NavLink>
          </nav>
          <div className="user">
            <span className="muted hide-sm">{user.name}</span>
            <button className="btn ghost sm" onClick={logout}>Log out</button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="jobs/new" element={<NewJob />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
