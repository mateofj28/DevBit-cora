import type { FastifyInstance } from 'fastify';
import { audit, mapAudit } from '../audit.js';
import type { Queryable } from '../db.js';
import { HttpError } from '../errors.js';
import {
  IdParams,
  ProjectCreateInput,
  ProjectQuery,
  ProjectUpdateInput,
  type IncidentBody,
  type ProjectCreate,
  type ProjectQueryT,
  type ProjectUpdate,
} from '../schemas.js';

const norm = (s: string | undefined | null) => (s?.trim() ? s.trim() : null);

// ---------- Catálogo: buscar o crear (sin distinguir mayúsculas) ----------

async function ensureTechnology(q: Queryable, name: string, kind: string): Promise<number> {
  const [found] = await q.query('SELECT id FROM technologies WHERE lower(name) = lower($1)', [name]);
  if (found) return found.id;
  const [row] = await q.query('INSERT INTO technologies (name, kind) VALUES ($1, $2) RETURNING id', [name, kind]);
  return row.id;
}

async function ensureProvider(q: Queryable, name: string): Promise<number> {
  const [found] = await q.query('SELECT id FROM providers WHERE lower(name) = lower($1)', [name]);
  if (found) return found.id;
  const [row] = await q.query('INSERT INTO providers (name) VALUES ($1) RETURNING id', [name]);
  return row.id;
}

async function replaceStack(q: Queryable, projectId: number, stack: ProjectCreate['stack']) {
  await q.query('DELETE FROM project_technologies WHERE project_id = $1', [projectId]);
  const seen = new Set<number>();
  for (const item of stack ?? []) {
    const techId = await ensureTechnology(q, item.name.trim(), item.kind);
    if (seen.has(techId)) continue;
    seen.add(techId);
    await q.query('INSERT INTO project_technologies (project_id, technology_id) VALUES ($1, $2)', [projectId, techId]);
  }
}

async function replaceServices(q: Queryable, projectId: number, services: ProjectCreate['services']) {
  await q.query('DELETE FROM services WHERE project_id = $1', [projectId]);
  for (const s of services ?? []) {
    const providerId = await ensureProvider(q, s.provider.trim());
    await q.query(
      'INSERT INTO services (project_id, name, component, provider_id, url, notes) VALUES ($1, $2, $3, $4, $5, $6)',
      [projectId, s.name.trim(), s.component, providerId, norm(s.url), norm(s.notes)],
    );
  }
}

export function assertNotFuture(date: string) {
  if (date > new Date().toISOString().slice(0, 10)) {
    throw new HttpError(400, 'La fecha del incidente no puede estar en el futuro.', [
      { field: 'occurredOn', message: 'La fecha del incidente no puede estar en el futuro.' },
    ]);
  }
}

export async function insertIncident(q: Queryable, projectId: number, i: IncidentBody) {
  assertNotFuture(i.occurredOn);
  const [row] = await q.query(
    `INSERT INTO incidents (project_id, title, manifestation, cause, resolution, improvement, occurred_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [projectId, i.title.trim(), i.manifestation.trim(), i.cause?.trim() ?? '', i.resolution?.trim() ?? '', i.improvement?.trim() ?? '', i.occurredOn],
  );
  return row.id as number;
}

// ---------- Lectura ----------

const PROJECT_COLUMNS = `p.id, p.name, p.summary, p.status, p.owner, p.repo_url, p.production_url, p.docs_url,
  p.archived, p.created_at, p.updated_at,
  (SELECT count(*)::int FROM incidents i WHERE i.project_id = p.id) AS incident_count`;

const mapProject = (r: any) => ({
  id: r.id,
  name: r.name,
  summary: r.summary,
  status: r.status,
  owner: r.owner,
  repoUrl: r.repo_url,
  productionUrl: r.production_url,
  docsUrl: r.docs_url,
  archived: r.archived,
  incidentCount: r.incident_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapService = (r: any) => ({
  id: r.id,
  name: r.name,
  component: r.component,
  provider: r.provider,
  url: r.url,
  notes: r.notes,
});

const mapIncident = (r: any) => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  manifestation: r.manifestation,
  cause: r.cause,
  resolution: r.resolution,
  improvement: r.improvement,
  occurredOn: r.occurred_on,
  createdAt: r.created_at,
});

const SERVICE_SELECT = `SELECT s.id, s.project_id, s.name, s.component, v.name AS provider, s.url, s.notes
  FROM services s JOIN providers v ON v.id = s.provider_id`;
const STACK_SELECT = `SELECT pt.project_id, t.name, t.kind
  FROM project_technologies pt JOIN technologies t ON t.id = pt.technology_id`;
export const INCIDENT_SELECT = `SELECT id, project_id, title, manifestation, cause, resolution, improvement,
  to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, created_at FROM incidents`;

async function loadDetails(q: Queryable, rows: any[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const marks = ids.map((_, i) => `$${i + 1}`).join(',');
  const stack = await q.query(`${STACK_SELECT} WHERE pt.project_id IN (${marks}) ORDER BY lower(t.name)`, ids);
  const services = await q.query(`${SERVICE_SELECT} WHERE s.project_id IN (${marks}) ORDER BY s.id`, ids);
  return rows.map((r) => ({
    ...mapProject(r),
    stack: stack.filter((s) => s.project_id === r.id).map((s) => ({ name: s.name, kind: s.kind })),
    services: services.filter((s) => s.project_id === r.id).map(mapService),
  }));
}

export async function getProjectDetail(q: Queryable, id: number) {
  const [row] = await q.query(`SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = $1`, [id]);
  if (!row) throw new HttpError(404, 'Proyecto no encontrado.');
  const [project] = await loadDetails(q, [row]);
  const incidents = await q.query(`${INCIDENT_SELECT} WHERE project_id = $1 ORDER BY occurred_on DESC, id DESC`, [id]);
  return { ...project, incidents: incidents.map(mapIncident) };
}

export { mapIncident };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function listProjects(q: Queryable, f: ProjectQueryT) {
  const params: unknown[] = [];
  const ph = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = [`p.archived = ${ph(f.archived ?? false)}`];

  if (f.status) where.push(`p.status = ${ph(f.status)}`);
  if (f.technology?.trim()) {
    where.push(`EXISTS (SELECT 1 FROM project_technologies pt JOIN technologies t ON t.id = pt.technology_id
      WHERE pt.project_id = p.id AND lower(t.name) = lower(${ph(f.technology.trim())}))`);
  }
  if (f.provider?.trim()) {
    where.push(`EXISTS (SELECT 1 FROM services s JOIN providers v ON v.id = s.provider_id
      WHERE s.project_id = p.id AND lower(v.name) = lower(${ph(f.provider.trim())}))`);
  }
  if (f.q?.trim()) {
    const like = ph(`%${escapeLike(f.q.trim())}%`);
    where.push(`(
      p.name ILIKE ${like} OR p.summary ILIKE ${like} OR p.owner ILIKE ${like}
      OR EXISTS (SELECT 1 FROM project_technologies pt JOIN technologies t ON t.id = pt.technology_id
                 WHERE pt.project_id = p.id AND t.name ILIKE ${like})
      OR EXISTS (SELECT 1 FROM services s JOIN providers v ON v.id = s.provider_id
                 WHERE s.project_id = p.id AND (v.name ILIKE ${like} OR s.name ILIKE ${like}))
      OR EXISTS (SELECT 1 FROM incidents i
                 WHERE i.project_id = p.id AND (i.title ILIKE ${like} OR i.manifestation ILIKE ${like} OR i.cause ILIKE ${like}))
    )`);
  }

  const rows = await q.query(
    `SELECT ${PROJECT_COLUMNS} FROM projects p WHERE ${where.join(' AND ')} ORDER BY lower(p.name)`,
    params,
  );
  return loadDetails(q, rows);
}

// ---------- Rutas ----------

export async function projectRoutes(app: FastifyInstance) {
  const security = [{ cookieAuth: [] }];
  const read = { preHandler: app.authenticate };
  const write = { preHandler: app.requireEditor };

  async function assertNameFree(q: Queryable, name: string, exceptId?: number) {
    const [dup] = await q.query('SELECT id FROM projects WHERE lower(name) = lower($1) AND id <> $2', [
      name.trim(),
      exceptId ?? 0,
    ]);
    if (dup) {
      throw new HttpError(409, 'Ya existe un proyecto con ese nombre.', [
        { field: 'name', message: 'Ya existe un proyecto con ese nombre.' },
      ]);
    }
  }

  app.get(
    '/api/projects',
    {
      ...read,
      schema: {
        tags: ['Proyectos'],
        summary: 'Buscar y filtrar proyectos',
        description: 'Ejemplo: `/api/projects?provider=Firebase` devuelve los proyectos con algún servicio en Firebase.',
        security,
        querystring: ProjectQuery,
      },
    },
    async (req) => listProjects(app.db, req.query as ProjectQueryT),
  );

  app.get(
    '/api/projects/:id',
    { ...read, schema: { tags: ['Proyectos'], summary: 'Ver un proyecto con stack, servicios e incidentes', security, params: IdParams } },
    async (req) => getProjectDetail(app.db, (req.params as { id: number }).id),
  );

  app.get(
    '/api/projects/:id/history',
    {
      ...read,
      schema: { tags: ['Proyectos'], summary: 'Historial de cambios de un proyecto (más reciente primero, máximo 100)', security, params: IdParams },
    },
    async (req) => {
      const { id } = req.params as { id: number };
      const [project] = await app.db.query('SELECT id FROM projects WHERE id = $1', [id]);
      if (!project) throw new HttpError(404, 'Proyecto no encontrado.');
      const rows = await app.db.query('SELECT * FROM audit_log WHERE project_id = $1 ORDER BY id DESC LIMIT 100', [id]);
      return rows.map(mapAudit);
    },
  );

  app.get(
    '/api/audit',
    {
      ...write,
      schema: { tags: ['Usuarios'], summary: 'Últimos 200 cambios de todo el sistema (solo editores)', security },
    },
    async () => (await app.db.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200')).map(mapAudit),
  );

  app.post(
    '/api/projects',
    {
      ...write,
      schema: { tags: ['Proyectos'], summary: 'Crear un proyecto completo (stack, servicios e incidentes opcionales)', security, body: ProjectCreateInput },
    },
    async (req, reply) => {
      const b = req.body as ProjectCreate;
      const id = await app.db.tx(async (q) => {
        await assertNameFree(q, b.name);
        const [row] = await q.query(
          `INSERT INTO projects (name, summary, status, owner, repo_url, production_url, docs_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [b.name.trim(), b.summary.trim(), b.status, b.owner.trim(), norm(b.repoUrl), norm(b.productionUrl), norm(b.docsUrl)],
        );
        await replaceStack(q, row.id, b.stack);
        await replaceServices(q, row.id, b.services);
        for (const inc of b.incidents ?? []) await insertIncident(q, row.id, inc);
        await audit(q, req.account, {
          action: 'create', entity: 'project', entityId: row.id, projectId: row.id,
          summary: `Creó el proyecto "${b.name.trim()}"`,
        });
        return row.id as number;
      });
      return reply.status(201).send(await getProjectDetail(app.db, id));
    },
  );

  app.put(
    '/api/projects/:id',
    {
      ...write,
      schema: {
        tags: ['Proyectos'],
        summary: 'Editar un proyecto (reemplaza su stack y servicios por los enviados)',
        security,
        params: IdParams,
        body: ProjectUpdateInput,
      },
    },
    async (req) => {
      const { id } = req.params as { id: number };
      const b = req.body as ProjectUpdate;
      await app.db.tx(async (q) => {
        const [exists] = await q.query('SELECT id FROM projects WHERE id = $1', [id]);
        if (!exists) throw new HttpError(404, 'Proyecto no encontrado.');
        await assertNameFree(q, b.name, id);
        await q.query(
          `UPDATE projects SET name = $1, summary = $2, status = $3, owner = $4, repo_url = $5,
             production_url = $6, docs_url = $7, updated_at = now() WHERE id = $8`,
          [b.name.trim(), b.summary.trim(), b.status, b.owner.trim(), norm(b.repoUrl), norm(b.productionUrl), norm(b.docsUrl), id],
        );
        await replaceStack(q, id, b.stack);
        await replaceServices(q, id, b.services);
        await audit(q, req.account, {
          action: 'update', entity: 'project', entityId: id, projectId: id,
          summary: `Editó el proyecto "${b.name.trim()}"`,
        });
      });
      return getProjectDetail(app.db, id);
    },
  );

  for (const [action, value, summary] of [
    ['archive', true, 'Archivar un proyecto (no se borra, deja de aparecer en el listado)'],
    ['unarchive', false, 'Restaurar un proyecto archivado'],
  ] as const) {
    app.post(
      `/api/projects/:id/${action}`,
      { ...write, schema: { tags: ['Proyectos'], summary, security, params: IdParams } },
      async (req) => {
        const { id } = req.params as { id: number };
        await app.db.tx(async (q) => {
          const rows = await q.query('UPDATE projects SET archived = $1, updated_at = now() WHERE id = $2 RETURNING name', [value, id]);
          if (!rows.length) throw new HttpError(404, 'Proyecto no encontrado.');
          await audit(q, req.account, {
            action: value ? 'archive' : 'restore', entity: 'project', entityId: id, projectId: id,
            summary: `${value ? 'Archivó' : 'Restauró'} el proyecto "${rows[0].name}"`,
          });
        });
        return getProjectDetail(app.db, id);
      },
    );
  }
}
