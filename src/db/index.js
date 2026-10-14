import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

/**
 * Opens the database and applies the schema.
 * - `url` set (e.g. a Neon/Supabase connection string): real Postgres via `pg`.
 * - `url` empty: embedded Postgres (PGlite) stored in `dataDir`, or in memory when `dataDir` is omitted.
 * Returns { query(sql, params) -> rows, tx(fn), close() }. Inside tx, fn receives the same { query }.
 */
export async function openDb({ url = '', dataDir } = {}) {
  const db = url ? await openPg(url) : await openPglite(dataDir);
  await db.exec(fs.readFileSync(schemaFile, 'utf8'));
  return db;
}

async function openPg(url) {
  const { default: pg } = await import('pg');
  const ssl = /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: url, ssl, max: 5 });
  const query = async (sql, params = []) => (await pool.query(sql, params)).rows;
  return {
    query,
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async (sql, params = []) => (await client.query(sql, params)).rows });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function openPglite(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  const wrap = (runner) => async (sql, params = []) => normalize((await runner.query(sql, params)).rows);
  return {
    query: wrap(pg),
    exec: (sql) => pg.exec(sql),
    tx: (fn) => pg.transaction((t) => fn({ query: wrap(t) })),
    close: () => pg.close(),
  };
}

// PGlite returns bytea as Uint8Array; pg returns Buffer. Normalize to Buffer.
function normalize(rows) {
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Uint8Array && !Buffer.isBuffer(v)) row[k] = Buffer.from(v);
    }
  }
  return rows;
}
