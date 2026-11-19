import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import { HttpError } from '../errors.js';
import { hashPassword } from '../security.js';
import { IdParams, UserCreateInput, UserUpdateInput } from '../schemas.js';

export function publicUser(u: any) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, active: u.active };
}

export async function userRoutes(app: FastifyInstance) {
  const guard = { preHandler: app.requireEditor, security: [{ cookieAuth: [] }] };

  app.get(
    '/api/users',
    {
      preHandler: guard.preHandler,
      schema: { tags: ['Usuarios'], summary: 'Listar usuarios (solo editores)', security: guard.security },
    },
    async () => (await app.db.query('SELECT * FROM users ORDER BY lower(name)')).map(publicUser),
  );

  app.post(
    '/api/users',
    {
      preHandler: guard.preHandler,
      schema: {
        tags: ['Usuarios'],
        summary: 'Crear usuario por invitación (solo editores)',
        security: guard.security,
        body: UserCreateInput,
      },
    },
    async (req, reply) => {
      const b = req.body as { email: string; name: string; role: string; password: string };
      const exists = await app.db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [b.email]);
      if (exists.length) throw new HttpError(409, 'Ya existe un usuario con ese correo.');
      const passwordHash = await hashPassword(b.password);
      const user = await app.db.tx(async (q) => {
        const [created] = await q.query(
          'INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
          [b.email.trim(), b.name.trim(), b.role, passwordHash],
        );
        await audit(q, req.account, {
          action: 'create', entity: 'user', entityId: created.id,
          summary: `Creó el usuario ${created.email} con rol ${created.role}`,
        });
        return created;
      });
      return reply.status(201).send(publicUser(user));
    },
  );

  app.patch(
    '/api/users/:id',
    {
      preHandler: guard.preHandler,
      schema: {
        tags: ['Usuarios'],
        summary: 'Editar rol, estado, nombre o contraseña (solo editores)',
        security: guard.security,
        params: IdParams,
        body: UserUpdateInput,
      },
    },
    async (req) => {
      const { id } = req.params as { id: number };
      const b = req.body as { name?: string; role?: string; active?: boolean; password?: string };
      const [user] = await app.db.query('SELECT * FROM users WHERE id = $1', [id]);
      if (!user) throw new HttpError(404, 'Usuario no encontrado.');
      if (id === req.account.id && (b.active === false || (b.role && b.role !== 'editor'))) {
        throw new HttpError(400, 'No puedes desactivarte ni quitarte el rol de editor a ti mismo.');
      }
      const passwordHash = b.password ? await hashPassword(b.password) : user.password_hash;
      const changes = [
        b.name !== undefined && b.name.trim() !== user.name && 'nombre',
        b.role !== undefined && b.role !== user.role && `rol (${user.role} → ${b.role})`,
        b.active !== undefined && b.active !== user.active && (b.active ? 'activación' : 'desactivación'),
        b.password && 'contraseña',
      ].filter(Boolean);
      const updated = await app.db.tx(async (q) => {
        const [row] = await q.query(
          `UPDATE users SET name = $1, role = $2, active = $3, password_hash = $4 WHERE id = $5 RETURNING *`,
          [b.name?.trim() ?? user.name, b.role ?? user.role, b.active ?? user.active, passwordHash, id],
        );
        if (changes.length) {
          await audit(q, req.account, {
            action: 'update', entity: 'user', entityId: id,
            summary: `Modificó al usuario ${row.email}: ${changes.join(', ')}`,
          });
        }
        return row;
      });
      return publicUser(updated);
    },
  );
}
