import express from 'express';
import { indexPage, notFoundPage, reelPage } from '../views/page.js';

const MEDIA_REFRESH_MS = 6 * 60 * 60 * 1000;

// Instagram CDN links (thumbnails and videos) expire; refresh in the background, at most every 6 hours per reel.
function mediaRefresher({ repos, ig }) {
  const refreshing = new Set();
  return (reel) => {
    if (!ig?.getMedia || refreshing.has(reel.ig_media_id)) return;
    if (Date.now() - new Date(reel.media_checked_at).getTime() < MEDIA_REFRESH_MS) return;
    refreshing.add(reel.ig_media_id);
    ig.getMedia(reel.ig_media_id)
      .then((m) =>
        repos.reels.updateMediaInfo(reel.ig_media_id, {
          thumbnail_url: m.thumbnail_url || m.media_url,
          permalink: m.permalink,
          video_url: m.media_type === 'VIDEO' ? m.media_url : '',
        }),
      )
      .catch((err) => console.error(`Couldn't refresh reel ${reel.ig_media_id} media: ${err.message}`))
      .finally(() => refreshing.delete(reel.ig_media_id));
  };
}

/** Adds campaign tags so the brand sees this traffic in its own analytics. Tags already on the link win. */
export function withUtm(url, { campaign, content }) {
  const u = new URL(url);
  const tags = { utm_source: 'instagram', utm_medium: 'dm', utm_campaign: campaign || 'reels', utm_content: content };
  for (const [k, v] of Object.entries(tags)) if (v && !u.searchParams.has(k)) u.searchParams.set(k, v);
  return u.toString();
}

export function publicRoutes({ repos, ig }) {
  const refreshMedia = mediaRefresher({ repos, ig });
  const r = express.Router();
  const page = (res, view, status = 200) => res.status(status).type('html').send(String(view));
  const notFound = async (res, message) => page(res, notFoundPage({ settings: await repos.settings.getAll(), message }), 404);

  r.get('/', async (req, res) => {
    const [settings, reels] = await Promise.all([repos.settings.getAll(), repos.reels.live({ limit: 24 })]);
    reels.forEach(refreshMedia);
    page(res, indexPage({ settings, reels, owner: Boolean(req.user) }));
  });

  // DM links point here (`DM_LINK_BASE/l/<slug>`), so another site sharing the Instagram account can redirect them.
  r.get('/l/:slug', (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    res.redirect(302, `/r/${encodeURIComponent(req.params.slug)}${qs ? `?${qs}` : ''}`);
  });

  r.get('/r/:slug', async (req, res) => {
    const reel = await repos.reels.getPage(req.params.slug);
    if (!reel || !reel.active) return notFound(res, 'This reel’s page isn’t open right now.');
    // Admin previews (?preview=1) and the owner's own visits don't count.
    if (!req.query.preview && !req.user) await repos.reels.recordVisit(reel.ig_media_id, String(req.query.src || ''));
    refreshMedia(reel);
    const [settings, live] = await Promise.all([repos.settings.getAll(), repos.reels.live({ limit: 9 })]);
    const moreReels = live.filter((x) => x.ig_media_id !== reel.ig_media_id).slice(0, 8);
    res.set('Cache-Control', 'no-cache');
    page(res, reelPage({ settings, reel, moreReels, owner: Boolean(req.user) }));
  });

  // Every tap that leaves for the brand's website comes through here: counted, tagged, then redirected.
  // Only saved links and the saved website address can be targets, so this is never an open redirect.
  r.get('/go/:id', async (req, res) => {
    const settings = await repos.settings.getAll();
    const slug = String(req.query.r || '').slice(0, 60);
    const reel = slug ? await repos.reels.getPage(slug) : null;
    let target;
    let content;
    if (req.params.id === 'site') {
      target = settings.website_url;
      content = 'website-button';
    } else {
      const link = /^\d+$/.test(req.params.id) ? await repos.links.get(req.params.id) : null;
      target = link?.url;
      content = link ? `product-${link.id}` : '';
    }
    if (!target) return notFound(res, 'That link isn’t available any more.');
    if (!req.user) await repos.links.recordClick(reel?.ig_media_id, req.params.id === 'site' ? null : Number(req.params.id));
    const to = settings.utm_enabled === '1' ? withUtm(target, { campaign: reel?.slug, content }) : target;
    res.set('Cache-Control', 'no-store');
    res.redirect(302, to);
  });

  r.use(async (_req, res) => notFound(res, 'This page doesn’t exist.'));
  return r;
}

export function mediaRoutes({ repos }) {
  const r = express.Router();
  r.get('/:id', async (req, res) => {
    const m = await repos.media.get(req.params.id);
    if (!m) return res.sendStatus(404);
    res.set({ 'Content-Type': m.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    res.send(m.data);
  });
  return r;
}
