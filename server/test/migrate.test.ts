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

describe('catálogo inicial (migración 003)', () => {
  it('en una base nueva carga tecnologías y proveedores con su clasificación', async () => {
    const db = await createDb({ dataDir: 'memory://' });
    await runMigrations(db);
    const kindOf = async (name: string) =>
      (await db.query('SELECT kind FROM technologies WHERE lower(name) = lower($1)', [name]))[0]?.kind;

    expect(await kindOf('React')).toBe('libreria');
    expect(await kindOf('Go')).toBe('lenguaje');
    expect(await kindOf('Supabase')).toBe('plataforma');
    expect(await kindOf('Firebase')).toBe('plataforma');
    expect(await kindOf('Firestore')).toBe('base_de_datos');
    expect(await kindOf('Node.js')).toBe('plataforma');
    expect(await kindOf('Docker')).toBe('herramienta');

    const providers = (await db.query('SELECT name FROM providers')).map((p) => p.name);
    expect(providers).toEqual(expect.arrayContaining(['Firebase', 'AWS', 'Google Cloud', 'Supabase', 'Railway']));
    await db.close();
  });

  it('en una base que ya tenía el catálogo viejo reclasifica y agrega sin duplicar', async () => {
    const db = await createDb({ dataDir: 'memory://' });
    await runMigrations(db);
    // Simula el estado anterior: React como framework y la migración 003 sin registrar.
    await db.query("UPDATE technologies SET kind = 'framework' WHERE name = 'React'");
    await db.query("DELETE FROM technologies WHERE name = 'Supabase'");
    await db.query("DELETE FROM schema_migrations WHERE name LIKE '003_%'");

    expect(await runMigrations(db)).toEqual(['003_catalogo_ampliado.sql']);
    expect((await db.query("SELECT kind FROM technologies WHERE name = 'React'"))[0].kind).toBe('libreria');
    expect(await db.query("SELECT 1 FROM technologies WHERE name = 'Supabase'")).toHaveLength(1);
    expect(await db.query("SELECT 1 FROM technologies WHERE lower(name) = 'react'")).toHaveLength(1);
    await db.close();
  });
});

describe('reclasificación de tecnologías registradas a mano (migración 004)', () => {
  it('corrige "supabase" y "Firebase" guardadas como otro, sin romper los proyectos que las usan', async () => {
    const db = await createDb({ dataDir: 'memory://' });
    await runMigrations(db);
    // Estado de producción antes del arreglo: alguien las creó a mano como "otro".
    await db.query("DELETE FROM schema_migrations WHERE name LIKE '004_%'");
    await db.query("DELETE FROM technologies WHERE lower(name) IN ('supabase', 'firebase')");
    await db.query("INSERT INTO technologies (name, kind) VALUES ('supabase', 'otro'), ('Firebase', 'otro')");
    await db.query("INSERT INTO projects (name, summary, status, owner) VALUES ('Turnos', 's', 'activo', 'o')");
    await db.query("INSERT INTO project_technologies SELECT 1, id FROM technologies WHERE lower(name) = 'supabase'");

    expect(await runMigrations(db)).toEqual(['004_reclasificar_tecnologias_conocidas.sql']);
    const rows = await db.query("SELECT name, kind FROM technologies WHERE lower(name) IN ('supabase', 'firebase') ORDER BY name");
    expect(rows).toEqual([{ name: 'Firebase', kind: 'plataforma' }, { name: 'Supabase', kind: 'plataforma' }]);
    const used = await db.query('SELECT t.name FROM project_technologies pt JOIN technologies t ON t.id = pt.technology_id WHERE pt.project_id = 1');
    expect(used).toEqual([{ name: 'Supabase' }]);
    await db.close();
  });

  it('no toca lo que alguien clasificó a propósito con otro tipo', async () => {
    const db = await createDb({ dataDir: 'memory://' });
    await runMigrations(db);
    await db.query("DELETE FROM schema_migrations WHERE name LIKE '004_%'");
    await db.query("UPDATE technologies SET kind = 'framework' WHERE name = 'Docker'");
    await runMigrations(db);
    expect((await db.query("SELECT kind FROM technologies WHERE name = 'Docker'"))[0].kind).toBe('framework');
    await db.close();
  });
});
