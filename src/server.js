import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { config as defaultConfig } from './config.js';
import { openDb } from './db/index.js';
import { createRepos } from './repos/index.js';
import { createAuth } from './auth.js';
import { handleComment } from './handler.js';
import * as instagram from './instagram.js';
import { startLinkChecker } from './linkService.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes, baseUrlFor } from './routes/admin.js';
import { mediaRoutes, publicRoutes } from './routes/public.js';

export function verifySignature(rawBody, header, secret) {
  if (!secret || !rawBody || !header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Builds the web app. `db` comes from openDb(); `ig` (Instagram) and `net` (fetch / DNS used to read
 * product pages) can be swapped for fakes in tests.
 */
export function createApp({ db, ig = instagram, config = defaultConfig, net = {} }) {
  const repos = createRepos(db);
  const auth = createAuth({ secret: config.sessionSecret, adminPhone: config.adminPhone, adminPassword: config.adminPassword });
  const app = express();

  app.set('trust proxy', 1); // exactly one proxy (Caddy, Codespaces or Render) terminates HTTPS in front of the app
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    next();
  });
  app.use(express.json({ limit: '200kb', verify: (req, _res, buf) => (req.rawBody = buf) }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use('/static', express.static(path.join(config.rootDir, 'public'), { maxAge: '1h' }));

  app.get(['/health', '/healthz'], (_req, res) => res.send('ok'));

  // Meta webhook verification handshake
  app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && config.verifyToken && req.query['hub.verify_token'] === config.verifyToken) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    res.sendStatus(403);
  });

  // Comments arrive here, from Meta directly or passed on unchanged (same body and signature) by another app
  // that shares the Instagram account.
  app.post('/webhook', async (req, res) => {
    if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'), config.appSecret)) {
      console.warn('Rejected webhook with bad signature');
      return res.sendStatus(401);
    }
    // Acknowledge fast; Meta retries deliveries that are slow to get a 200.
    res.sendStatus(200);

    const base = config.dmLinkBase || baseUrlFor(req, config);
    const storeUrl = (slug) => `${base}/l/${encodeURIComponent(slug)}?src=dm`;
    for (const entry of req.body?.entry || []) {
      const ownIds = new Set([entry.id, config.igUserId].filter(Boolean).map(String));
      for (const change of entry.changes || []) {
        if (change.field !== 'comments') continue;
        try {
          const result = await handleComment(change.value, { repos, ig, ownIds, storeUrl, oneDmPerUser: config.oneDmPerUser });
          console.log(`comment ${change.value?.id} on ${change.value?.media?.id}: ${result}`);
        } catch (err) {
          console.error(`Failed to handle comment ${change.value?.id}: ${err.message}`);
        }
      }
    }
  });

  app.use('/media', mediaRoutes({ repos }));
  // Everything below knows whether the owner is logged in, and logged-in POSTs need the session's CSRF token.
  app.use(auth.load, auth.checkCsrf);
  app.use('/', accountRoutes({ repos, auth }));
  app.use('/admin', adminRoutes({ db, repos, ig, auth, config, net }));
  app.use('/', publicRoutes({ repos, ig }));

  app.use((err, req, res, _next) => {
    console.error(`${req.method} ${req.originalUrl} failed:`, err);
    if (res.headersSent) return;
    if (req.get('accept')?.includes('application/json')) {
      return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
    }
    res.status(500).type('text').send('Something went wrong on our side. Please go back and try again.');
  });

  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = defaultConfig;
  const db = await openDb({ url: config.databaseUrl, dataDir: config.dataDir });
  startLinkChecker({ repos: createRepos(db), hours: config.refreshHours });
  createApp({ db, config }).listen(config.port, () => {
    console.log(`auto-dm-plugin listening on :${config.port}${config.dryRun ? ' (DRY_RUN)' : ''}`);
    console.log(`Database: ${config.databaseUrl ? 'Postgres (DATABASE_URL)' : config.dataDir}`);
    if (config.adminPhone && config.adminPassword) console.log(`Owner: log in on /login with ${config.adminPhone} and ADMIN_PASSWORD`);
    else console.log('No owner login yet: set ADMIN_PHONE and ADMIN_PASSWORD in .env to use /admin');
    if (config.dmLinkBase) console.log(`DM links use ${config.dmLinkBase}/l/<slug> (that site must redirect them here)`);
    if (!process.env.SESSION_SECRET) console.log('Tip: set SESSION_SECRET in .env so logins survive restarts');
  });
}
