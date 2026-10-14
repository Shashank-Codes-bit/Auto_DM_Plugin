// Loads the demo in seed/demo.json: brand settings, theme, products and reel pages.
//   npm run seed                        # finds each demo reel by its caption ("match"), or the newest reels
//   npm run seed -- <id> <id>           # choose the Instagram reels yourself, in demo order
//   npm run seed -- --offline           # don't read the website; use the saved product details
// With the built-in database, stop the server first (only one process can open it).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ValidationError } from '../src/util.js';
import { PRESETS, cleanTheme } from '../src/themes.js';
import { previewLink } from '../src/linkService.js';

export const SEED_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed/demo.json');

/**
 * The Instagram reels for the demo, in data.reels order. A demo reel with `match` takes the newest reel whose
 * caption contains that text; the others take the newest reels left, after skipping `skip_newest`.
 */
export async function pickReels(ig, data) {
  const posts = ((await ig.listMedia(50)).data || []).filter((p) => p.media_product_type === 'REELS' || p.media_type === 'VIDEO');
  const used = new Set();
  const byCaption = data.reels.map((spec) => {
    if (!spec.match) return null;
    const post = posts.find((p) => !used.has(p.id) && (p.caption || '').toLowerCase().includes(spec.match.toLowerCase()));
    if (!post) throw new ValidationError(`No reel on your Instagram account has “${spec.match}” in its caption. Post it first, or edit seed/demo.json.`);
    used.add(post.id);
    return post;
  });
  const rest = posts.slice(data.skip_newest || 0).filter((p) => !used.has(p.id));
  const reels = byCaption.map((post) => post || rest.shift()).filter(Boolean);
  if (reels.length < data.reels.length) throw new ValidationError(`The demo needs ${data.reels.length} reels on your Instagram account; found ${reels.length}.`);
  return reels;
}

/** Adds one product: read live from the website when possible, otherwise from the saved details. Reuses existing links. */
async function ensureLink({ repos, net, offline }, item) {
  const existing = await repos.links.findByUrl(item.url);
  if (existing) return existing;
  let values = item;
  if (!offline) {
    try {
      values = await previewLink(item.url, { repos, net });
    } catch (err) {
      console.warn(`Using saved details for ${item.url}: ${err.message}`);
    }
  }
  return repos.links.create(values, { fetchStatus: 'ok' });
}

/**
 * `reels` are Instagram posts ({ id, permalink, thumbnail_url, media_url, media_type, caption }),
 * matched in order to data.reels. Extra demo reels without a post are skipped.
 */
export async function seedDemo({ repos, net = {}, offline = false }, data, reels) {
  const preset = PRESETS[data.preset] || PRESETS.default;
  await repos.settings.update({ ...cleanTheme(preset), theme_preset: data.preset || 'default', ...data.settings });

  const done = [];
  for (const [i, post] of reels.entries()) {
    const spec = data.reels[i];
    if (!spec) break;
    const links = [];
    for (const item of spec.links) links.push(await ensureLink({ repos, net, offline }, item));
    await repos.reels.save(post.id, {
      ...spec,
      linkIds: links.map((l) => l.id),
      active: true,
      permalink: post.permalink || '',
      thumbnail_url: post.thumbnail_url || post.media_url || '',
      video_url: post.media_type === 'VIDEO' ? post.media_url || '' : '',
      caption: post.caption || '',
    });
    done.push({ id: post.id, slug: spec.slug, products: links.length });
  }
  return done;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import('../src/config.js');
  const { openDb } = await import('../src/db/index.js');
  const { createRepos } = await import('../src/repos/index.js');
  const ig = await import('../src/instagram.js');

  const args = process.argv.slice(2);
  const offline = args.includes('--offline');
  const ids = args.filter((a) => /^\d+$/.test(a));
  const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const db = await openDb({ url: config.databaseUrl, dataDir: config.dataDir });
  try {
    const reels = ids.length ? await Promise.all(ids.map((id) => ig.getMedia(id))) : await pickReels(ig, data);
    const done = await seedDemo({ repos: createRepos(db), offline }, data, reels);
    for (const r of done) console.log(`Reel ${r.id} -> /r/${r.slug} (${r.products} products)`);
  } finally {
    await db.close();
  }
}
