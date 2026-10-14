import { ValidationError, cleanUrl, parseRupees } from '../util.js';

const MEDIA_PATH = /^\/media\/[0-9a-f-]{36}$/i;

export function normalizeLink(input = {}) {
  const url = cleanUrl(input.url);
  if (!url) throw new ValidationError('Paste the product’s full link, starting with https://');
  const title = String(input.title ?? '').replace(/\s+/g, ' ').trim();
  if (title.length < 2) throw new ValidationError('Add the product name');
  const image = String(input.image_url ?? '').trim();
  if (image && !cleanUrl(image) && !MEDIA_PATH.test(image)) throw new ValidationError('The photo must be a link starting with https://');
  const price = parseRupees(input.price, 'Price');
  const mrp = parseRupees(input.mrp, 'MRP');
  if (mrp != null && price != null && mrp < price) throw new ValidationError('MRP can’t be lower than the price');
  return {
    url,
    title: title.slice(0, 200),
    image_url: image,
    price_paise: price,
    mrp_paise: mrp != null && mrp > (price ?? 0) ? mrp : null,
    badge: String(input.badge ?? '').trim().slice(0, 24),
    active: input.active === undefined ? true : input.active === true || input.active === 'on' || input.active === 'true',
  };
}

const STATS = `
  (SELECT count(*)::int FROM clicks c WHERE c.link_id = l.id) AS click_count,
  (SELECT count(*)::int FROM reel_links rl WHERE rl.link_id = l.id) AS reel_count`;

export function linksRepo(db) {
  return {
    async get(id) {
      const [row] = await db.query('SELECT * FROM links WHERE id = $1', [Number(id) || 0]);
      return row || null;
    },
    async findByUrl(url) {
      const clean = cleanUrl(url);
      if (!clean) return null;
      const [row] = await db.query('SELECT * FROM links WHERE url = $1', [clean]);
      return row || null;
    },
    async list({ search = '', status = 'all' } = {}) {
      return db.query(
        `SELECT l.*, ${STATS} FROM links l
         WHERE ($1 = '' OR l.title ILIKE '%' || $1 || '%' OR l.url ILIKE '%' || $1 || '%')
           AND ($2 = 'all'
             OR ($2 = 'active' AND l.active) OR ($2 = 'archived' AND NOT l.active)
             OR ($2 = 'attention' AND (l.fetch_status = 'broken' OR l.price_changed)))
         ORDER BY l.created_at DESC, l.id DESC LIMIT 1000`,
        [search.trim(), status],
      );
    },
    /** `fetchStatus`: 'ok' when the details came from the page, 'manual' when the owner typed them. */
    async create(input, { fetchStatus = 'manual' } = {}) {
      const l = normalizeLink(input);
      if (await this.findByUrl(l.url)) throw new ValidationError('This link is already in your list');
      const [row] = await db.query(
        `INSERT INTO links (url, title, image_url, price_paise, mrp_paise, badge, active, fetch_status, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'ok' THEN now() END) RETURNING *`,
        [l.url, l.title, l.image_url, l.price_paise, l.mrp_paise, l.badge, l.active, fetchStatus],
      );
      return row;
    },
    async update(id, input) {
      const l = normalizeLink(input);
      const [taken] = await db.query('SELECT 1 FROM links WHERE url = $1 AND id <> $2', [l.url, Number(id)]);
      if (taken) throw new ValidationError('Another product already uses this link');
      // Saving clears the "price changed" flag: the owner has seen the new price.
      const [row] = await db.query(
        `UPDATE links SET url = $2, title = $3, image_url = $4, price_paise = $5, mrp_paise = $6, badge = $7, active = $8,
           price_changed = false, updated_at = now() WHERE id = $1 RETURNING *`,
        [Number(id), l.url, l.title, l.image_url, l.price_paise, l.mrp_paise, l.badge, l.active],
      );
      return row || null;
    },
    async remove(id) {
      await db.query('DELETE FROM links WHERE id = $1', [Number(id)]);
    },
    /**
     * Result of a background re-check. Only the price and status change; names and photos stay as the owner set them.
     * Prices the owner typed in by hand (status 'manual') are left alone; the check only confirms the page still exists.
     */
    async markChecked(id, { price_paise, mrp_paise }) {
      await db.query(
        `UPDATE links SET
           price_changed = price_changed OR (fetch_status <> 'manual' AND $2::int IS NOT NULL AND price_paise IS DISTINCT FROM $2::int),
           price_paise = CASE WHEN fetch_status = 'manual' OR $2::int IS NULL THEN price_paise ELSE $2::int END,
           mrp_paise = CASE WHEN fetch_status = 'manual' OR $2::int IS NULL THEN mrp_paise ELSE $3::int END,
           fetch_status = CASE WHEN fetch_status = 'manual' THEN 'manual' ELSE 'ok' END,
           fetch_error = '', fetched_at = now()
         WHERE id = $1`,
        [Number(id), price_paise ?? null, mrp_paise ?? null],
      );
    },
    async markBroken(id, error) {
      await db.query(`UPDATE links SET fetch_status = 'broken', fetch_error = $2, fetched_at = now() WHERE id = $1`, [
        Number(id), String(error).slice(0, 300),
      ]);
    },
    /** A failed check that doesn't mean the product is gone (timeout, blocked): try again next time. */
    async markCheckFailed(id, error) {
      await db.query('UPDATE links SET fetch_error = $2, fetched_at = now() WHERE id = $1', [Number(id), String(error).slice(0, 300)]);
    },
    async dueForCheck(hours, limit = 50) {
      return db.query(
        `SELECT * FROM links WHERE active AND (fetched_at IS NULL OR fetched_at < now() - make_interval(hours => $1))
         ORDER BY fetched_at NULLS FIRST LIMIT $2`,
        [Math.max(1, Number(hours) || 24), limit],
      );
    },
    async recordClick(reelId, linkId) {
      await db.query('INSERT INTO clicks (reel_id, link_id) VALUES ($1, $2)', [reelId || null, linkId || null]);
    },
  };
}
