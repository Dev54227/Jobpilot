# JobPilot

A self-hosted, fully open-source job-application assistant.

It automates everything **up to** the Apply button: tracking jobs, AI matching of a job description against your real profile, and ATS-safe resume tailoring. **You** press Apply. It never bot-submits applications, because job sites forbid that and it gets accounts banned.

## Stack
| Layer | Tech |
|---|---|
| API | Node.js 22, Express 4, MongoDB (Mongoose 8), Zod, JWT + bcrypt |
| AI (Phase 2) | Ollama, open models (Qwen 2.5 7B / Llama 3.1 8B), local only |
| Web (Phase 3) | React + Vite |
| Mobile (Phase 5) | React Native CLI |
| Hosting | One Oracle Cloud Always Free ARM VM: Nginx + Let's Encrypt + pm2 |

## Project layout
```
server/
  src/
    config/       env validation (fails fast), MongoDB connection
    models/       User, Profile (your real base resume), Job
    validators/   Zod request schemas
    middleware/   auth (JWT), validate, error + 404 handlers
    controllers/  auth, profile, jobs
    routes/       all /api routes
    app.js        Express app (no listen, so it's testable)
    server.js     starts the HTTP server + graceful shutdown
  test/           API tests against an in-memory MongoDB
```

## Run locally
Needs MongoDB, Ollama (`ollama pull qwen2.5:7b`) and LibreOffice installed.
```bash
# terminal 1: API
cd server
npm install
cp .env.example .env      # then set JWT_SECRET (48+ random chars) and MONGO_URI
node --env-file=.env src/server.js   # http://localhost:5000/api/health
npm test                  # no MongoDB/Ollama needed: in-memory DB + fake AI

# terminal 2: web dashboard
cd web
npm install
npm run dev               # http://localhost:5173 (proxies /api to :5000)
```

## Everyday local use (one app, one port)
With `WEB_DIST=../web/dist` in `server/.env`, the API also serves the built dashboard:
- **Start:** double-click `start-jobpilot.cmd`, then open **http://localhost:5000**. Logs go to `logs/jobpilot.log`.
- **Stop:** double-click `stop-jobpilot.cmd`
- **After changing the UI:** `cd web && npm run build`, then restart
- **Start automatically at login (optional):** run once in PowerShell:
  ```powershell
  $a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c "C:\Projects\JobPilot\start-jobpilot.cmd"'
  $t = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"; $t.Delay = 'PT30S'
  $p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U
  Register-ScheduledTask -TaskName JobPilot -Action $a -Trigger $t -Principal $p
  ```
  Remove it with `Unregister-ScheduledTask -TaskName JobPilot`.

MongoDB runs as a Windows service and Ollama starts from its own Startup shortcut, so both are up before JobPilot.

## Web dashboard (web/)
React 19 + Vite + React Router, no UI library.
- **Jobs:** status counters (click to filter), debounced search, filters kept in the URL
- **Add job:** paste a job description, optionally start AI analysis straight away
- **Job detail:** match-score ring, ✓/✗ skill chips, gaps, tailored resume preview, honesty-guard warnings, live "AI working… 42s" progress (polls every 4s only while a task runs), .docx/PDF download, status timeline, notes
- **Profile:** edit your base resume (skills, experience, education, links)
- Light/dark mode, works at phone width

## API (v1)
All routes are under `/api`. Protected routes need `Authorization: Bearer <token>`.

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | API + DB status (503 if DB is down) |
| POST | `/auth/register` | – | Create account (only the first one while `ALLOW_REGISTRATION=false`) |
| POST | `/auth/login` | – | Get a token (rate-limited) |
| GET | `/auth/me` | ✔ | Current user |
| GET | `/profile` | ✔ | Your base resume profile |
| PUT | `/profile` | ✔ | Update the profile sections you send |
| GET | `/jobs?status=&q=&page=&limit=` | ✔ | List jobs (filter, full-text search, pagination) |
| POST | `/jobs` | ✔ | Add a job (paste the JD) |
| GET | `/jobs/stats` | ✔ | Count per status |
| GET | `/jobs/:id` | ✔ | Job detail incl. JD |
| PATCH | `/jobs/:id` | ✔ | Edit job fields |
| PATCH | `/jobs/:id/status` | ✔ | Move through saved → applied → shortlisted → interview → offer / rejected / withdrawn (keeps history) |
| DELETE | `/jobs/:id` | ✔ | Delete a job |
| POST | `/jobs/:id/analyze` | ✔ | **202**, runs in background: AI extracts required skills → **code** computes match score + gaps |
| POST | `/jobs/:id/tailor` | ✔ | **202**, runs in background: AI rewords headline/summary/bullets (honesty-guarded); code orders skills |

AI tasks are slow on a CPU (about 1.5 min to analyze and 2.5 min to tailor with a 7B model), so they run in a one-at-a-time background queue. Poll `GET /jobs/:id` and read `job.ai.analyze.status` / `job.ai.tailor.status` (`queued → running → done | failed`). Repeated clicks don't queue duplicates, and results are discarded if the job description changed while the AI was working.
| GET | `/jobs/:id/resume.docx` / `.pdf` | ✔ | Download the ATS-safe resume (tailored if available) |

## How the AI is kept honest
1. **The AI never scores.** It only extracts what the job asks for (must / nice). `services/skillMatch.js` checks each skill against your profile text (with aliases like RN = React Native, and word boundaries so "Java" doesn't match "JavaScript"). Must-haves count double.
2. **Every tailored line is checked** (`services/tailor.service.js`). Text is thrown away if it contains a **number** not in your profile, or **claims a job skill** you don't have. Skill items must exist in your profile exactly. If most bullets for a job fail, your original bullets are used.
3. Every removal is listed in `tailored.warnings`, so you can see what the model tried.

## Indexes
`autoIndex` is **off in production**, so Mongoose will not create indexes on the server by itself. After the first deploy, and whenever an index changes in `models/`, run once on the server:
```bash
node --env-file=.env -e "import('./src/config/db.js').then(async m=>{await m.connectDB();const mg=(await import('mongoose')).default;await import('./src/models/User.js');await import('./src/models/Profile.js');await import('./src/models/Job.js');await mg.connection.syncIndexes();console.log('indexes synced');process.exit(0)})"
```

## Roadmap
- [x] **Phase 1:** API (auth, profile, jobs, tracker) + tests
- [x] **Phase 2:** Ollama JD analysis (match score, keywords, gaps) + honest resume tailoring → .docx / .pdf (tested with a fake Ollama; real-model run pending)
- [x] **Phase 3:** React dashboard
- [ ] **Phase 4:** Oracle VM deploy (Nginx, HTTPS, pm2, GitHub Actions)
- [ ] **Phase 5:** Job feeds (Adzuna, Greenhouse, Lever), reminders, React Native app, multi-user
