import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { HttpError } from './lib/httpError.js';
import { authRouter } from './routes/auth.js';
import { familiesRouter } from './routes/families.js';
import { eventsRouter } from './routes/events.js';
import { meRouter } from './routes/me.js';
import { categoriesRouter } from './routes/categories.js';
import { tasksRouter } from './routes/tasks.js';
import { botRouter } from './bot/webhook.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Built frontend, when it exists: `backend/dist/app.js` and `backend/src/app.ts`
 * are both two levels below the workspace root.
 */
function frontendDist(): string | null {
  const candidate = path.resolve(here, '..', '..', 'frontend', 'dist');
  return existsSync(path.join(candidate, 'index.html')) ? candidate : null;
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, bot: env.hasBot, devLogin: env.allowFakeUser });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/families', familiesRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/bot', botRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // One origin serves both the API and the app, so a Mini App needs a single
  // HTTPS URL and no CORS setup at all.
  const dist = frontendDist();
  if (dist) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    console.error('[api] unhandled error', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
