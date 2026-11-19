import type { FastifyInstance } from 'fastify';
import { HttpError } from '../errors.js';
import { hashPassword, verifyPassword } from '../security.js';
import { ChangePasswordInput, LoginInput } from '../schemas.js';
import { publicUser } from './users.js';

// Hash de una contraseña inexistente: se verifica igual cuando el correo no existe
// para que el tiempo de respuesta no revele qué correos están registrados.
const DUMMY_HASH = 'scrypt$16384$00000000000000000000000000000000$' + '00'.repeat(64);

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/api/auth/login',
    {
      config: { rateLimit: { max: app.config.loginRateLimit, timeWindow: '1 minute' } },
      schema: {
        tags: ['Autenticación'],
        summary: 'Iniciar sesión (guarda una cookie httpOnly)',
        body: LoginInput,
      },
    },
    async (req, reply) => {
      const { email, password } = req.body as { email: string; password: string };
      const [user] = await app.db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
      const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
      if (!user || !ok || !user.active) {
        throw new HttpError(401, 'Correo o contraseña incorrectos.');
      }
      const token = app.jwt.sign({ sub: String(user.id) }, { expiresIn: '8h' });
      reply.setCookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: app.config.cookieSecure,
        path: '/',
        maxAge: 8 * 3600,
      });
      return { user: publicUser(user) };
    },
  );

  app.post(
    '/api/auth/logout',
    { schema: { tags: ['Autenticación'], summary: 'Cerrar sesión' } },
    async (_req, reply) => {
      reply.clearCookie('token', { path: '/' });
      return { ok: true };
    },
  );

  app.get(
    '/api/auth/me',
    {
      preHandler: app.authenticate,
      schema: { tags: ['Autenticación'], summary: 'Usuario de la sesión actual', security: [{ cookieAuth: [] }] },
    },
    async (req) => ({ user: publicUser(req.account) }),
  );

  app.post(
    '/api/auth/password',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Autenticación'],
        summary: 'Cambiar la propia contraseña',
        security: [{ cookieAuth: [] }],
        body: ChangePasswordInput,
      },
    },
    async (req) => {
      const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
      if (!(await verifyPassword(currentPassword, req.account.password_hash))) {
        throw new HttpError(400, 'La contraseña actual no es correcta.');
      }
      await app.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        await hashPassword(newPassword),
        req.account.id,
      ]);
      return { ok: true };
    },
  );
}
