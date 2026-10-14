import { ValidationError, slugify } from '../util.js';

export const MIN_REEL_LINKS = 1;
export const MAX_REEL_LINKS = 20;
export const DEFAULT_DM = 'Hey @{username}! Here’s everything from the reel 👇';

const COLS = `r.ig_media_id, r.slug, r.headline, r.subtitle, r.keywords, r.dm_message, r.button_text, r.public_reply, r.active,
  r.permalink, r.thumbnail_url, r.video_url, r.caption, r.created_at, r.updated_at, r.media_checked_at`;

export function normalizeReel(input) {
  const keywords = String(input.keywords ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keywords.length) throw new ValidationError('Add at least one keyword people can comment');

  const slug = slugify(input.slug || input.headline || '');
  if (!slug) throw new ValidationError('Add a headline or a page link name');

  const linkIds = [...new Set((Array.isArray(input.linkIds) ? input.linkIds : []).map(Number).filter(Boolean))];
  if (linkIds.length < MIN_REEL_LINKS) throw new ValidationError('Pick at least 1 product for this reel');
  if (linkIds.length > MAX_REEL_LINKS) throw new ValidationError(`A reel can show at most ${MAX_REEL_LINKS} products`);

  const buttonText = String(input.button_text ?? '').trim() || 'Shop now';
  if (buttonText.length > 20) throw new ValidationError('Button text must be 20 characters or fewer');

  return {
    slug,
    headline: String(input.headline ?? '').trim().slice(0, 80),
    subtitle: String(input.subtitle ?? '').trim().slice(0, 200),
    keywords,
    dm_message: String(input.dm_message ?? '').trim() || DEFAULT_DM,
    button_text: buttonText,
    public_reply: String(input.public_reply ?? '').trim(),
    active: input.active === true || input.active === 'on' || input.active === 'true',
    permalink: String(input.permalink ?? ''),
    thumbnail_url: String(input.thumbnail_url ?? ''),
    caption: String(input.caption ?? '').slice(0, 500),
    video_url: /^https:\/\//i.test(String(input.video_url ?? '')) ? String(input.video_url) : '',
    linkIds,
  };
}

export function reelsRepo(db) {
  async function linksFor(reelId, { activeOnly = false } = {}) {
    return db.query(
      `SELECT l.*, rl.position FROM reel_links rl JOIN links l ON l.id = rl.link_id
       WHERE rl.reel_id = $1 AND (NOT $2 OR l.active) ORDER BY rl.position`,
      [reelId, activeOnly],
    );
  }

  return {
    /** All configured reels with funnel numbers for the admin: DMs → page opens → clicks to the website. */
    async list() {
      return db.query(
        `SELECT ${COLS},
           (SELECT count(*)::int FROM reel_links rl WHERE rl.reel_id = r.ig_media_id) AS link_count,
           (SELECT count(*)::int FROM activity a WHERE a.reel_id = r.ig_media_id AND a.result = 'sent') AS dm_count,
           (SELECT count(*)::int FROM visits v WHERE v.reel_id = r.ig_media_id) AS visit_count,
           (SELECT count(*)::int FROM clicks c WHERE c.reel_id = r.ig_media_id) AS click_count
         FROM reels r ORDER BY r.updated_at DESC`,
      );
    },
    async get(id) {
      const [reel] = await db.query(`SELECT ${COLS} FROM reels r WHERE r.ig_media_id = $1`, [String(id)]);
      if (!reel) return null;
      reel.links = await linksFor(reel.ig_media_id);
      return reel;
    },
    /** Reel for the public page: shows only active links. */
    async getPage(slug) {
      const [reel] = await db.query(`SELECT ${COLS} FROM reels r WHERE r.slug = $1`, [String(slug)]);
      if (!reel) return null;
      reel.links = await linksFor(reel.ig_media_id, { activeOnly: true });
      return reel;
    },
    /** Used by the webhook: only active reels send DMs. */
    async getActiveByMediaId(id) {
      const [reel] = await db.query(`SELECT ${COLS} FROM reels r WHERE r.ig_media_id = $1 AND r.active`, [String(id)]);
      return reel || null;
    },
    async save(id, input) {
      const r = normalizeReel(input);
      const mediaId = String(id ?? '').trim();
      if (!/^\d+$/.test(mediaId)) throw new ValidationError('Invalid Instagram post ID');

      const [taken] = await db.query('SELECT 1 FROM reels WHERE slug = $1 AND ig_media_id <> $2', [r.slug, mediaId]);
      if (taken) throw new ValidationError(`The page link “${r.slug}” is already used by another reel`);
      const found = await db.query('SELECT id FROM links WHERE id = ANY($1::int[])', [r.linkIds]);
      if (found.length !== r.linkIds.length) throw new ValidationError('One of the picked products no longer exists');

      await db.tx(async (t) => {
        await t.query(
          `INSERT INTO reels (ig_media_id, slug, headline, subtitle, keywords, dm_message, button_text, public_reply, active,
             permalink, thumbnail_url, caption, video_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (ig_media_id) DO UPDATE SET slug = $2, headline = $3, subtitle = $4, keywords = $5, dm_message = $6,
             button_text = $7, public_reply = $8, active = $9,
             permalink = COALESCE(NULLIF($10, ''), reels.permalink),
             thumbnail_url = COALESCE(NULLIF($11, ''), reels.thumbnail_url),
             caption = COALESCE(NULLIF($12, ''), reels.caption),
             video_url = COALESCE(NULLIF($13, ''), reels.video_url), updated_at = now()`,
          [mediaId, r.slug, r.headline, r.subtitle, r.keywords, r.dm_message, r.button_text, r.public_reply, r.active,
            r.permalink, r.thumbnail_url, r.caption, r.video_url],
        );
        await t.query('DELETE FROM reel_links WHERE reel_id = $1', [mediaId]);
        for (const [i, lid] of r.linkIds.entries()) {
          await t.query('INSERT INTO reel_links (reel_id, link_id, position) VALUES ($1, $2, $3)', [mediaId, lid, i]);
        }
      });
      return this.get(mediaId);
    },
    /** Instagram thumbnail and video links expire, so reel pages refresh them from time to time. */
    async updateMediaInfo(id, { thumbnail_url, permalink, video_url }) {
      await db.query(
        `UPDATE reels SET thumbnail_url = COALESCE(NULLIF($2, ''), thumbnail_url), permalink = COALESCE(NULLIF($3, ''), permalink),
           video_url = COALESCE(NULLIF($4, ''), video_url), media_checked_at = now() WHERE ig_media_id = $1`,
        [String(id), thumbnail_url || '', permalink || '', video_url || ''],
      );
    },
    /** Live reels with at least one active link, newest first (Instagram IDs grow over time). */
    async live({ limit = 12 } = {}) {
      return db.query(
        `SELECT ${COLS},
           (SELECT count(*)::int FROM reel_links rl JOIN links l ON l.id = rl.link_id WHERE rl.reel_id = r.ig_media_id AND l.active) AS link_count
         FROM reels r
         WHERE r.active AND EXISTS (SELECT 1 FROM reel_links rl JOIN links l ON l.id = rl.link_id WHERE rl.reel_id = r.ig_media_id AND l.active)
         ORDER BY length(r.ig_media_id) DESC, r.ig_media_id DESC
         LIMIT $1`,
        [Math.min(Math.max(limit, 1), 50)],
      );
    },
    async remove(id) {
      await db.query('DELETE FROM reels WHERE ig_media_id = $1', [String(id)]);
    },
    async recordVisit(reelId, source = '') {
      await db.query('INSERT INTO visits (reel_id, source) VALUES ($1, $2)', [reelId, String(source).slice(0, 20)]);
    },
  };
}
