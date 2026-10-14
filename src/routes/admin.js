import fs from 'node:fs';
import express from 'express';
import { ValidationError, cleanUrl } from '../util.js';
import { PRESETS, THEME_KEYS, cleanTheme } from '../themes.js';
import { SETTING_DEFAULTS } from '../repos/settings.js';
import { UnfurlError } from '../unfurl.js';
import { checkLink, previewLink } from '../linkService.js';
import { SEED_FILE, newestReels, seedDemo } from '../../scripts/seed.js';
import {
  activityPage, adminLayout, dashboardPage, linkFormPage, linkValues, linksPage, reelFormPage, reelValues, reelsPage, settingsPage,
} from '../views/admin.js';

const FLASH = {
  saved: 'Saved.',
  created: 'Product added.',
  deleted: 'Deleted.',
  checked: 'Checked against your website.',
  reel_saved: 'Reel saved. Comments with its keyword now get a DM with the page link.',
  reel_removed: 'Reel page removed.',
  preset: 'Look updated. Open a reel page to see it.',
  demo: 'Demo loaded: brand, look, products and reel pages. Open “View reel pages” to see them.',
};

export const baseUrlFor = (req, config) =>
  config.publicBaseUrl || `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;

const list = (v) => [].concat(v ?? []).filter((x) => x !== '');
const MAX_BULK = 20;

export function adminRoutes({ db, repos, ig, auth, config, net = {} }) {
  const r = express.Router();

  // Only the brand owner gets past this.
  r.use(auth.requireAdmin);

  // Whether the Instagram token works, cached so the dashboard stays fast.
  let igCheck = { at: 0, ok: false };
  async function instagramConnected() {
    if (!config.accessToken) return false;
    if (Date.now() - igCheck.at < 10 * 60_000) return igCheck.ok;
    let ok = false;
    try {
      ok = Boolean((await ig.getAccount())?.username);
    } catch {
      ok = false;
    }
    igCheck = { at: Date.now(), ok };
    return ok;
  }

  async function setupChecklist(settings, stats, reels) {
    const [{ comments }] = await db.query('SELECT count(*)::int AS comments FROM activity');
    return {
      dismissed: settings.checklist_dismissed === '1',
      steps: [
        { title: 'Connect Instagram', text: 'Add your Instagram token to .env so comments can be answered with a DM.', done: await instagramConnected(), href: '/admin/settings', action: 'Check connection' },
        { title: 'Add your brand', text: 'Name, website, logo and the look of your reel pages.', done: Boolean(settings.website_url), href: '/admin/settings', action: 'Open settings' },
        { title: 'Add products', text: 'Paste product links from your website. Name, photo and price fill themselves in.', done: stats.links > 0, href: '/admin/links', action: 'Add products' },
        { title: 'Set up your first reel', text: 'Pick a reel, its products and the keyword people comment.', done: reels.length > 0, href: '/admin/reels', action: 'Choose a reel' },
        { title: 'Receive a comment', text: 'Comment your keyword on the reel from another account. The DM shows up in DM activity.', done: comments > 0, href: '/admin/activity', action: 'See DM activity' },
        { title: 'Get your first click', text: 'Tap a product on the reel page. It opens on your website and shows up on the dashboard.', done: stats.clicks > 0, href: '/', action: 'Open reel pages' },
      ],
    };
  }

  const page = async (req, res, { title, active, body, error, status = 200 }) => {
    const stats = await repos.stats.dashboard();
    const flash = { ok: FLASH[req.query.ok], error };
    res
      .status(status)
      .type('html')
      .send(String(adminLayout({ title, active, body, csrf: req.csrf, flash, badges: { links: stats.broken + stats.price_changed } })));
  };

  // ---- dashboard ----
  r.get('/', async (req, res) => {
    const [stats, reels, topLinks, activity, settings] = await Promise.all([
      repos.stats.dashboard(), repos.reels.list(), repos.stats.topLinks(6), repos.activity.list({ limit: 8 }), repos.settings.getAll(),
    ]);
    const checklist = await setupChecklist(settings, stats, reels);
    const warnings = [];
    if (!config.accessToken) warnings.push('IG_ACCESS_TOKEN is missing in .env, so DMs can’t be sent.');
    if (config.dryRun) warnings.push('Test mode is on (DRY_RUN=1): DMs are logged, not sent.');
    if (!config.publicBaseUrl) warnings.push(`PUBLIC_BASE_URL isn’t set. DM links will use ${baseUrlFor(req, config)}. Set it in .env to be sure.`);
    await page(req, res, { title: 'Dashboard', active: 'dashboard', body: dashboardPage({ stats, reels, topLinks, activity, warnings, checklist, csrf: req.csrf }) });
  });

  r.post('/checklist/dismiss', async (_req, res) => {
    await repos.settings.update({ checklist_dismissed: '1' });
    res.redirect(303, '/admin');
  });

  // ---- products (links to the brand's website) ----
  async function linksView(req, res, { error, status } = {}) {
    const search = String(req.query.search || '');
    const filter = ['active', 'archived', 'attention'].includes(req.query.status) ? req.query.status : 'all';
    const [links, settings] = await Promise.all([repos.links.list({ search, status: filter }), repos.settings.getAll()]);
    await page(req, res, { title: 'Products', active: 'links', error, status, body: linksPage({ links, search, status: filter, csrf: req.csrf, websiteUrl: settings.website_url }) });
  }

  r.get('/links', (req, res) => linksView(req, res));

  const linkForm = (req, res, opts) =>
    page(req, res, {
      title: opts.link ? opts.link.title : 'Add product', active: 'links', error: opts.error, status: opts.status,
      body: linkFormPage({ csrf: req.csrf, ...opts }),
    });

  // Paste links: one link opens a filled-in preview to check; several are added straight away.
  r.post('/links/add', async (req, res) => {
    const urls = [...new Set(String(req.body.urls || '').split(/[\s,]+/).map((u) => u.trim()).filter(Boolean))];
    if (!urls.length) return linksView(req, res, { error: 'Paste at least one product link.', status: 400 });
    if (urls.length > MAX_BULK) return linksView(req, res, { error: `Paste up to ${MAX_BULK} links at a time.`, status: 400 });

    if (urls.length === 1) {
      const url = cleanUrl(urls[0]);
      if (!url) return linksView(req, res, { error: 'That doesn’t look like a link. It should start with https://', status: 400 });
      const existing = await repos.links.findByUrl(url);
      if (existing) return res.redirect(303, `/admin/links/${existing.id}`);
      try {
        const values = await previewLink(url, { repos, net });
        return linkForm(req, res, { link: null, values: { ...linkValues(null), ...values }, fetched: true });
      } catch (err) {
        if (!(err instanceof UnfurlError)) throw err;
        return linkForm(req, res, { link: null, values: { ...linkValues(null), url }, fetchError: err.message });
      }
    }

    let added = 0;
    const problems = [];
    for (const raw of urls) {
      const url = cleanUrl(raw);
      if (!url) {
        problems.push(`${raw}: not a link`);
        continue;
      }
      if (await repos.links.findByUrl(url)) {
        problems.push(`${url}: already added`);
        continue;
      }
      try {
        await repos.links.create(await previewLink(url, { repos, net }), { fetchStatus: 'ok' });
        added++;
      } catch (err) {
        if (!(err instanceof UnfurlError || err instanceof ValidationError)) throw err;
        problems.push(`${url}: ${err.message}`);
      }
    }
    const summary = `Added ${added} of ${urls.length} product${urls.length > 1 ? 's' : ''}.`;
    if (!problems.length) return res.redirect(303, '/admin/links?ok=created');
    await linksView(req, res, { error: `${summary} Not added: ${problems.join(' · ')}`, status: added ? 200 : 400 });
  });

  r.get('/links/new', async (req, res) => {
    await linkForm(req, res, { link: null, values: { ...linkValues(null), url: cleanUrl(req.query.url) || '' } });
  });

  const formValues = (body) => ({ ...body, active: Boolean(body.active) });

  r.post('/links', async (req, res) => {
    try {
      const link = await repos.links.create(formValues(req.body), { fetchStatus: req.body.fetched === '1' ? 'ok' : 'manual' });
      res.redirect(303, `/admin/links/${link.id}?ok=created`);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      await linkForm(req, res, { link: null, values: formValues(req.body), fetched: req.body.fetched === '1', error: err.message, status: 400 });
    }
  });

  async function linkWithStats(id) {
    const link = await repos.links.get(id);
    if (!link) return null;
    const [{ clicks }] = await db.query('SELECT count(*)::int AS clicks FROM clicks WHERE link_id = $1', [link.id]);
    return { ...link, click_count: clicks };
  }

  r.get('/links/:id', async (req, res) => {
    const link = await linkWithStats(req.params.id);
    if (!link) return res.redirect('/admin/links');
    await linkForm(req, res, { link, values: linkValues(link) });
  });

  r.post('/links/:id', async (req, res) => {
    const link = await linkWithStats(req.params.id);
    if (!link) return res.redirect(303, '/admin/links');
    try {
      await repos.links.update(link.id, formValues(req.body));
      res.redirect(303, `/admin/links/${link.id}?ok=saved`);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      await linkForm(req, res, { link, values: formValues(req.body), error: err.message, status: 400 });
    }
  });

  r.post('/links/:id/check', async (req, res) => {
    const link = await repos.links.get(req.params.id);
    if (!link) return res.redirect(303, '/admin/links');
    await checkLink(link, { repos, net });
    res.redirect(303, `/admin/links/${link.id}?ok=checked`);
  });

  r.post('/links/:id/delete', async (req, res) => {
    await repos.links.remove(req.params.id);
    res.redirect(303, '/admin/links?ok=deleted');
  });

  // ---- reels ----
  r.get('/reels', async (req, res) => {
    let posts = [];
    let postsError = '';
    try {
      posts = (await ig.listMedia(50)).data || [];
    } catch (err) {
      postsError = err.message;
    }
    const reels = await repos.reels.list();
    await page(req, res, { title: 'Reels', active: 'reels', body: reelsPage({ posts, postsError, reels }) });
  });

  async function reelEditor(req, res, { values, error, status }) {
    const mediaId = String(req.params.id);
    const reel = await repos.reels.get(mediaId);
    let post = null;
    try {
      post = await ig.getMedia(mediaId);
    } catch {
      // Instagram unreachable or post deleted: edit with what we have stored.
    }
    if (!reel && !post) return res.redirect(303, '/admin/reels');
    const links = await repos.links.list();
    const pageUrl = baseUrlFor(req, config);
    const dmUrl = reel ? `${config.dmLinkBase || pageUrl}/l/${reel.slug}` : '';
    await page(req, res, {
      title: 'Reel', active: 'reels', status, error,
      body: reelFormPage({ mediaId, post, reel, links, values: values || reelValues(reel, post), pageUrl, dmUrl, csrf: req.csrf }),
    });
  }

  r.get('/reels/:id', (req, res) => reelEditor(req, res, {}));

  r.post('/reels/:id', async (req, res) => {
    const input = { ...req.body, linkIds: list(req.body.linkIds) };
    try {
      await repos.reels.save(req.params.id, input);
      res.redirect(303, `/admin/reels/${req.params.id}?ok=reel_saved`);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      await reelEditor(req, res, { values: { ...input, active: Boolean(req.body.active) }, error: err.message, status: 400 });
    }
  });

  r.post('/reels/:id/delete', async (req, res) => {
    await repos.reels.remove(req.params.id);
    res.redirect(303, '/admin/reels?ok=reel_removed');
  });

  // ---- activity ----
  r.get('/activity', async (req, res) => {
    const rows = await repos.activity.list({ limit: 200 });
    await page(req, res, { title: 'DM activity', active: 'activity', body: activityPage({ rows }) });
  });

  // ---- settings ----
  function demoInfo() {
    try {
      const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      return { description: data.description, reels: data.reels.length };
    } catch {
      return null;
    }
  }

  async function settingsView(req, res, { error, status } = {}) {
    const settings = await repos.settings.getAll();
    const baseUrl = baseUrlFor(req, config);
    const connection = {
      baseUrl,
      baseUrlFromEnv: Boolean(config.publicBaseUrl),
      dmBase: config.dmLinkBase || baseUrl,
      dryRun: config.dryRun,
      oneDmPerUser: config.oneDmPerUser,
      database: config.databaseUrl ? 'Postgres (DATABASE_URL)' : 'Built-in database in data/pgdata',
      demo: demoInfo(),
    };
    try {
      connection.account = config.accessToken ? await ig.getAccount() : null;
      if (!config.accessToken) connection.error = 'IG_ACCESS_TOKEN is missing in .env';
    } catch (err) {
      connection.error = err.message;
    }
    await page(req, res, { title: 'Brand & settings', active: 'settings', error, status, body: settingsPage({ settings, connection, csrf: req.csrf }) });
  }

  r.get('/settings', (req, res) => settingsView(req, res));

  r.post('/settings', async (req, res) => {
    try {
      const b = req.body;
      const text = (k, max) => String(b[k] ?? '').trim().slice(0, max);
      if (!text('brand_name', 60)) throw new ValidationError('Brand name is required');
      const website = b.website_url ? cleanUrl(b.website_url) : '';
      if (website === null) throw new ValidationError('Website must be a full link, like https://yourwebsite.com');
      if (b.logo_url && !cleanUrl(b.logo_url)) throw new ValidationError('Logo link must start with https://');
      const theme = cleanTheme({ ...b, button_case: b.button_case || 'none' });
      const current = await repos.settings.getAll();
      const changedLook = THEME_KEYS.some((k) => theme[k] !== current[k]);
      await repos.settings.update({
        brand_name: text('brand_name', 60), website_url: website, logo_url: text('logo_url', 500),
        instagram_handle: text('instagram_handle', 40).replace(/^@/, ''),
        announcement: text('announcement', 600), page_kicker: text('page_kicker', 40),
        card_button: text('card_button', 30) || SETTING_DEFAULTS.card_button,
        cta_title: text('cta_title', 80), cta_text: text('cta_text', 200), cta_button: text('cta_button', 40) || SETTING_DEFAULTS.cta_button,
        trust_points: text('trust_points', 600), footer_text: text('footer_text', 120),
        show_prices: b.show_prices ? '1' : '0', utm_enabled: b.utm_enabled ? '1' : '0',
        ...theme,
        ...(changedLook ? { theme_preset: 'custom' } : {}),
      });
      res.redirect(303, '/admin/settings?ok=saved');
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      await settingsView(req, res, { error: err.message, status: 400 });
    }
  });

  r.post('/settings/preset', async (req, res) => {
    const preset = PRESETS[req.body.preset];
    if (!preset) return res.redirect(303, '/admin/settings');
    await repos.settings.update({ ...cleanTheme(preset), theme_preset: req.body.preset });
    res.redirect(303, '/admin/settings?ok=preset');
  });

  // Loads seed/demo.json: brand, look, products (read live from the website) and reel pages.
  r.post('/demo-data', async (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      const reels = await newestReels(ig, data.reels.length, { skip: data.skip_newest || 0 });
      await seedDemo({ repos, net }, data, reels);
      res.redirect(303, '/admin/reels?ok=demo');
    } catch (err) {
      const message = err instanceof ValidationError ? err.message : `Couldn’t load demo data: ${err.message}`;
      await settingsView(req, res, { error: message, status: 400 });
    }
  });

  return r;
}
