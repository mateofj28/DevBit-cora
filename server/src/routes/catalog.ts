import type { FastifyInstance } from 'fastify';

export async function catalogRoutes(app: FastifyInstance) {
  app.get(
    '/api/catalog',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Catálogo'],
        summary: 'Tecnologías y proveedores conocidos (para autocompletar y filtros)',
        security: [{ cookieAuth: [] }],
      },
    },
    async () => ({
      technologies: await app.db.query('SELECT name, kind FROM technologies ORDER BY lower(name)'),
      providers: (await app.db.query('SELECT name FROM providers ORDER BY lower(name)')).map((p) => p.name as string),
      // Responsables ya usados en proyectos y personas con cuenta activa, sin repetir por mayúsculas.
      owners: (
        await app.db.query(
          `SELECT name FROM (
             SELECT DISTINCT ON (lower(n)) n AS name
             FROM (SELECT owner AS n FROM projects UNION ALL SELECT name FROM users WHERE active) x
             ORDER BY lower(n), n
           ) y ORDER BY lower(name)`,
        )
      ).map((o) => o.name as string),
    }),
  );
}
