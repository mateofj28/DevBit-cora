import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/**
 * Aplica en orden los archivos `migrations/NNN_nombre.sql` que todavía no se hayan
 * ejecutado y los registra en `schema_migrations`.
 *
 * Reglas para escribir migraciones:
 *  - Nunca edites una migración ya aplicada: crea una nueva con el siguiente número.
 *  - Cada archivo corre dentro de una transacción; si falla, no queda a medias.
 */
export async function runMigrations(db: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];

  for (const file of files) {
    await db.tx(async (q) => {
      // Evita que dos instancias migren a la vez (en PostgreSQL el bloqueo se libera al terminar la transacción).
      await q.query('SELECT pg_advisory_xact_lock(727274)');
      const done = await q.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (done.length) return;
      await q.exec(readFileSync(`${dir}/${file}`, 'utf8'));
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      applied.push(file);
    });
  }
  return applied;
}
