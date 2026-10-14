import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

// A short fingerprint of public/ so a new deploy's CSS and JS load fresh instead of from browser caches.
const VERSION = (() => {
  const hash = crypto.createHash('sha1');
  for (const name of fs.readdirSync(PUBLIC_DIR).sort()) hash.update(name).update(fs.readFileSync(path.join(PUBLIC_DIR, name)));
  return hash.digest('hex').slice(0, 10);
})();

/** `/static/store.css` → `/static/store.css?v=<fingerprint>` */
export const asset = (file) => `/static/${file}?v=${VERSION}`;
