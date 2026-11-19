import type { Db } from './db.js';
import { runMigrations } from './migrate.js';

const SEED_TECHNOLOGIES: Array<[string, string]> = [
  ['JavaScript', 'lenguaje'], ['TypeScript', 'lenguaje'], ['Python', 'lenguaje'], ['Java', 'lenguaje'],
  ['C#', 'lenguaje'], ['Go', 'lenguaje'], ['PHP', 'lenguaje'], ['Kotlin', 'lenguaje'], ['Swift', 'lenguaje'],
  ['Dart', 'lenguaje'],
  ['React', 'framework'], ['Angular', 'framework'], ['Vue', 'framework'], ['Next.js', 'framework'],
  ['Node.js', 'framework'], ['Express', 'framework'], ['Fastify', 'framework'], ['NestJS', 'framework'],
  ['Django', 'framework'], ['FastAPI', 'framework'], ['Spring Boot', 'framework'], ['.NET', 'framework'],
  ['Laravel', 'framework'], ['Flutter', 'framework'],
  ['PostgreSQL', 'base_de_datos'], ['MySQL', 'base_de_datos'], ['MongoDB', 'base_de_datos'],
  ['Firestore', 'base_de_datos'], ['Redis', 'base_de_datos'], ['SQLite', 'base_de_datos'],
  ['SQL Server', 'base_de_datos'], ['DynamoDB', 'base_de_datos'],
];

const SEED_PROVIDERS = [
  'Firebase', 'AWS', 'Google Cloud', 'Azure', 'Railway', 'Render', 'Vercel', 'Netlify', 'Heroku',
  'DigitalOcean', 'Cloudflare',
];

export async function initSchema(db: Db): Promise<void> {
  await runMigrations(db);

  const [{ n }] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM technologies');
  if (n === 0) {
    await db.tx(async (q) => {
      for (const [name, kind] of SEED_TECHNOLOGIES) {
        await q.query('INSERT INTO technologies (name, kind) VALUES ($1, $2)', [name, kind]);
      }
      for (const name of SEED_PROVIDERS) {
        await q.query('INSERT INTO providers (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
      }
    });
  }
}
