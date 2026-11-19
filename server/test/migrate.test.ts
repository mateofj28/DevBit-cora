import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDb } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';

const tempDir = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'migraciones-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
};

describe('migraciones', () => {
  it('aplica los archivos en orden y no repite los ya aplicados', async () => {
    const db = await createDb({ dataDir: 'memory://' });
    const dir = tempDir({
      '002_agrega_columna.sql': 'ALTER TABLE t ADD COLUMN extra TEXT;',
      '001_crea_tabla.sql': 'CREATE TABLE t (id INTEGER PRIMARY KEY);',
      'notas.txt': 'se ignora',
    });

    expect(await runMigrations(db, dir)).toEqual(['001_crea_tabla.sql', '002_agrega_columna.sql']);
    expect(await runMigrations(db, dir)).toEqual([]);

    await db.query('INSERT INTO t (id, extra) VALUES (1, $1)', ['ok']);
    const rows = await db.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(['001_crea_tabla.sql', '002_agrega_columna.sql']);
    await db.close();
  });

  it('una migración que falla se revierte completa y no queda registrada', async () => {
    const db = await createDb({ dataDir: 'memory://' });
    const dir = tempDir({
      '001_mala.sql': 'CREATE TABLE a (id INTEGER); SELECT * FROM tabla_que_no_existe;',
    });

    await expect(runMigrations(db, dir)).rejects.toThrow();
    expect(await db.query('SELECT 1 FROM schema_migrations')).toHaveLength(0);
    await expect(db.query('SELECT * FROM a')).rejects.toThrow();
    await db.close();
  });

  it('la migración inicial real crea todas las tablas del catálogo', async () => {
    const db = await createDb({ dataDir: 'memory://' });
    await runMigrations(db);
    const tables = (await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    )).map((r) => r.table_name);
    for (const t of ['users', 'projects', 'technologies', 'providers', 'project_technologies', 'services', 'incidents']) {
      expect(tables).toContain(t);
    }
    await db.close();
  });
});
