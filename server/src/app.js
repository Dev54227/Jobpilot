import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env, isProd } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  // Behind Nginx in production: trust the first proxy so req.ip and the
  // rate limiter see the real client IP, not 127.0.0.1.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS }));
  app.use(express.json({ limit: '200kb' }));
  app.use(morgan(isProd ? 'combined' : 'dev'));

  app.use('/api', routes);
  app.use('/api', notFoundHandler); // unknown API routes stay real 404s, never the web page

  // Serve the built dashboard (web/dist) from the same origin, so one process
  // on one port is the whole app. In dev, Vite serves the UI on :5173 instead.
  if (env.WEB_DIST && existsSync(join(env.WEB_DIST, 'index.html'))) {
    app.use(express.static(env.WEB_DIST, { index: false, maxAge: '1h' }));
    // client-side routes (/jobs/123, /profile) all load index.html
    app.get('*', (_req, res) => res.sendFile(join(env.WEB_DIST, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
