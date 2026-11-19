import type { Db } from './db.js';
import { runMigrations } from './migrate.js';

/**
 * Deja la base lista: aplica las migraciones pendientes.
 * El catálogo inicial de tecnologías y proveedores se carga desde las propias migraciones.
 */
export async function initSchema(db: Db): Promise<void> {
  await runMigrations(db);
}
