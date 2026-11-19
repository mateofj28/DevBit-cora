import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.js';
import { createDb, type Db } from './db.js';
import { HttpError, registerErrorHandling } from './errors.js';
import { initSchema } from './schema.js';
import { hashPassword } from './security.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { projectRoutes } from './routes/projects.js';
import { incidentRoutes } from './routes/incidents.js';
import { catalogRoutes } from './routes/catalog.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireEditor: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    account: any;
  }
}

export async function buildApp(config: Config, existingDb?: Db) {
  const db =
    existingDb ??
    (await createDb({
      databaseUrl: config.databaseUrl,
      ssl: config.databaseSsl,
      dataDir: config.databaseUrl ? undefined : config.devDataDir,
    }));
  await initSchema(db);
  await ensureAdmin(db, config);

  const app = Fastify({
    logger: config.production ? true : false,
    trustProxy: true,
    ajv: { customOptions: { allErrors: true, coerceTypes: 'array', removeAdditional: true } },
  });

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorateRequest('account', null);
  registerErrorHandling(app);

  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret, cookie: { cookieName: 'token', signed: false } });
  await app.register(rateLimit, { global: false });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    let payload: { sub?: string };
    try {
      payload = await req.jwtVerify<{ sub?: string }>();
    } catch {
      throw new HttpError(401, 'Debes iniciar sesión para continuar.');
    }
    const [user] = await db.query('SELECT * FROM users WHERE id = $1', [Number(payload.sub)]);
    if (!user || !user.active) throw new HttpError(401, 'Tu sesión ya no es válida. Inicia sesión de nuevo.');
    req.account = user;
  });

  app.decorate('requireEditor', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (req.account.role !== 'editor') {
      throw new HttpError(403, 'Tu usuario es de solo lectura y no puede realizar esta acción.');
    }
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'DevBitácora API',
        description:
          'Catálogo de proyectos de software: stack, servicios, despliegue e incidentes. ' +
          'Inicia sesión con `POST /api/auth/login`; la sesión se guarda en una cookie httpOnly.',
        version: '1.0.0',
      },
      components: { securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token' } } },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
  });

  app.get('/api/health', { schema: { tags: ['Sistema'], summary: 'Estado del servicio' } }, async () => {
    await db.query('SELECT 1');
    return { status: 'ok' };
  });

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(catalogRoutes);
  await app.register(projectRoutes);
  await app.register(incidentRoutes);

  // Frontend compilado (si existe): lo sirve el mismo servicio para desplegar una sola pieza.
  const webDir = resolve(process.cwd(), config.webDir);
  const hasWeb = existsSync(resolve(webDir, 'index.html'));
  if (hasWeb) await app.register(fastifyStatic, { root: webDir });

  app.setNotFoundHandler((req, reply) => {
    if (hasWeb && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ statusCode: 404, message: `Ruta no encontrada: ${req.method} ${req.url}` });
  });

  app.addHook('onClose', async () => {
    if (!existingDb) await db.close();
  });

  return app;
}

/** Crea el primer editor desde ADMIN_EMAIL / ADMIN_PASSWORD si todavía no hay usuarios. */
async function ensureAdmin(db: Db, config: Config) {
  const [{ n }] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if (n > 0) return;
  if (!config.adminEmail || !config.adminPassword) {
    console.warn('No hay usuarios. Define ADMIN_EMAIL y ADMIN_PASSWORD para crear el primer editor.');
    return;
  }
  if (config.adminPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres.');
  }
  await db.query('INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4)', [
    config.adminEmail,
    'Administrador',
    'editor',
    await hashPassword(config.adminPassword),
  ]);
}
