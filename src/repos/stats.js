export function statsRepo(db) {
  return {
    async dashboard() {
      const [s] = await db.query(`
        SELECT
          (SELECT count(*)::int FROM activity WHERE result = 'sent') AS dms,
          (SELECT count(*)::int FROM activity WHERE result = 'sent' AND created_at >= date_trunc('day', now())) AS dms_today,
          (SELECT count(*)::int FROM visits) AS visits,
          (SELECT count(*)::int FROM visits WHERE created_at >= date_trunc('day', now())) AS visits_today,
          (SELECT count(*)::int FROM clicks) AS clicks,
          (SELECT count(*)::int FROM clicks WHERE created_at >= date_trunc('day', now())) AS clicks_today,
          (SELECT count(*)::int FROM links WHERE active) AS links,
          (SELECT count(*)::int FROM links WHERE active AND fetch_status = 'broken') AS broken,
          (SELECT count(*)::int FROM links WHERE active AND price_changed) AS price_changed`);
      return s;
    },
    /** Most-clicked products, for the dashboard. */
    async topLinks(limit = 5) {
      return db.query(
        `SELECT l.id, l.title, l.image_url, count(c.id)::int AS clicks
         FROM clicks c JOIN links l ON l.id = c.link_id
         GROUP BY l.id ORDER BY clicks DESC, l.id LIMIT $1`,
        [limit],
      );
    },
  };
}
