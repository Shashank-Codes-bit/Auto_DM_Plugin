import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const trimUrl = (v) => (v || '').replace(/\/+$/, '');

export const config = {
  rootDir,
  // Instagram / Meta
  accessToken: process.env.IG_ACCESS_TOKEN || '',
  igUserId: process.env.IG_USER_ID || '',
  appSecret: process.env.APP_SECRET || '',
  verifyToken: process.env.VERIFY_TOKEN || '',
  graphVersion: process.env.GRAPH_VERSION || 'v23.0',
  dryRun: process.env.DRY_RUN === '1',
  oneDmPerUser: process.env.ONE_DM_PER_USER === '1',
  // Web
  port: Number(process.env.PORT) || 3000,
  publicBaseUrl: trimUrl(process.env.PUBLIC_BASE_URL),
  // Address used for the link inside DMs: `${dmLinkBase}/l/<slug>`. Defaults to PUBLIC_BASE_URL.
  // Set it to another site that redirects /l/<slug> here (e.g. an existing store sharing the Instagram account).
  dmLinkBase: trimUrl(process.env.DM_LINK_BASE),
  // Brand owner: logs in on /login with this phone + password.
  adminPhone: process.env.ADMIN_PHONE || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // Without SESSION_SECRET, the owner is logged out when the server restarts.
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  // Database: Postgres connection string, or empty for the built-in database in data/pgdata
  databaseUrl: process.env.DATABASE_URL || '',
  dataDir: process.env.DATA_DIR || path.join(rootDir, 'data', 'pgdata'),
  // Product links are re-checked in the background when older than this (0 = never).
  refreshHours: Number(process.env.LINK_REFRESH_HOURS ?? 24),
};
