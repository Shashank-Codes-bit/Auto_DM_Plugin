export function activityRepo(db) {
  return {
    /** Records a skipped/failed comment. Never overwrites a comment that already got a DM. */
    async log({ commentId = null, reelId = null, userId = '', username = '', text = '', result, error = '' }) {
      await db.query(
        `INSERT INTO activity (comment_id, reel_id, user_id, username, text, result, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (comment_id) DO UPDATE SET result = EXCLUDED.result, error = EXCLUDED.error, created_at = now()
         WHERE activity.result NOT IN ('sent', 'processing')`,
        [commentId, reelId, userId, username, String(text).slice(0, 500), result, String(error).slice(0, 500)],
      );
    },
    /**
     * Claims a comment before sending a DM so that duplicate webhook deliveries (even concurrent ones)
     * send at most one DM. Returns false if the comment is already sent or being processed.
     */
    async claim({ commentId, reelId, userId, username, text }) {
      const rows = await db.query(
        `INSERT INTO activity (comment_id, reel_id, user_id, username, text, result)
         VALUES ($1, $2, $3, $4, $5, 'processing')
         ON CONFLICT (comment_id) DO UPDATE SET result = 'processing', error = '', created_at = now()
         WHERE activity.result NOT IN ('sent', 'processing')
         RETURNING id`,
        [commentId, reelId, userId, username, String(text).slice(0, 500)],
      );
      return rows.length > 0;
    },
    async finish(commentId, result, error = '') {
      await db.query('UPDATE activity SET result = $2, error = $3 WHERE comment_id = $1', [commentId, result, String(error).slice(0, 500)]);
    },
    async hasSentToUser(userId, reelId) {
      const [row] = await db.query(
        `SELECT 1 FROM activity WHERE user_id = $1 AND reel_id = $2 AND result = 'sent' LIMIT 1`,
        [userId, reelId],
      );
      return Boolean(row);
    },
    async list({ limit = 100 } = {}) {
      return db.query(
        `SELECT a.*, r.headline, r.slug FROM activity a LEFT JOIN reels r ON r.ig_media_id = a.reel_id
         ORDER BY a.created_at DESC LIMIT $1`,
        [limit],
      );
    },
  };
}
