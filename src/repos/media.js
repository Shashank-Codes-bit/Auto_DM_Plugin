export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function mediaRepo(db) {
  return {
    async save(buffer, mime) {
      const [row] = await db.query('INSERT INTO media (mime, data, size) VALUES ($1, $2, $3) RETURNING id', [
        mime,
        buffer,
        buffer.length,
      ]);
      return row.id;
    },
    async get(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const [row] = await db.query('SELECT mime, data FROM media WHERE id = $1', [id]);
      return row || null;
    },
  };
}
