import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Ejecuta uno o varios comandos SQL sin parámetros (por ejemplo, un archivo de migración). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Con DATABASE_URL usa PostgreSQL (producción). Sin ella usa PGlite, un
 * PostgreSQL embebido, para desarrollo y tests sin instalar nada.
 */
export async function createDb(opts: { databaseUrl?: string; ssl?: boolean; dataDir?: string }): Promise<Db> {
  if (opts.databaseUrl) {
    const pool = new pg.Pool({
      connectionString: opts.databaseUrl,
      ssl: opts.ssl ? { rejectUnauthorized: false } : undefined,
    });
    return {
      async query(sql, params = []) {
        return (await pool.query(sql, params as any[])).rows;
      },
      async exec(sql) {
        await pool.query(sql);
      },
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn({
            query: async (sql, params = []) => (await client.query(sql, params as any[])).rows,
            exec: async (sql) => {
              await client.query(sql);
            },
          });
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

  const releaseLock = opts.dataDir && !opts.dataDir.includes('://') ? acquireDirLock(opts.dataDir) : () => { };
  const lite = new PGlite(opts.dataDir);
  await lite.waitReady;
  return {
    async query(sql, params = []) {
      return (await lite.query(sql, params)).rows as any[];
    },
    async exec(sql) {
      await lite.exec(sql);
    },
    tx: (fn) =>
      lite.transaction((tx) =>
        fn({
          query: async (sql, params = []) => (await tx.query(sql, params)).rows as any[],
          exec: async (sql) => {
            await tx.exec(sql);
          },
        }),
      ),
    close: async () => {
      await lite.close();
      releaseLock();
    },
  };
}

/**
 * PGlite no admite dos procesos sobre la misma carpeta: la base se corrompe.
 * Este archivo de bloqueo hace que el segundo proceso falle con un mensaje claro.
 */
function acquireDirLock(dataDir: string): () => void {
  mkdirSync(dataDir, { recursive: true });
  const lockPath = `${dataDir}.lock`;
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0); // no envía nada: solo comprueba si el proceso existe
      alive = pid !== process.pid;
    } catch {
      alive = false; // el proceso ya no existe: el bloqueo quedó huérfano
    }
    if (alive) {
      throw new Error(
        `Otro proceso (PID ${pid}) ya está usando la base de datos de desarrollo en ${dataDir}. ` +
        'Ciérralo antes de iniciar otro: usar la misma carpeta desde dos procesos la corrompe.',
      );
    }
  }
  writeFileSync(lockPath, String(process.pid));
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try { unlinkSync(lockPath); } catch { /* ya no existe */ }
  };
  process.once('exit', release);
  return release;
}
