import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import { HttpError } from '../errors.js';
import { IdParams, IncidentInput, type IncidentBody } from '../schemas.js';
import { assertNotFuture, INCIDENT_SELECT, insertIncident, mapIncident } from './projects.js';

export async function incidentRoutes(app: FastifyInstance) {
  const security = [{ cookieAuth: [] }];

  app.post(
    '/api/projects/:id/incidents',
    {
      preHandler: app.requireEditor,
      schema: { tags: ['Incidentes'], summary: 'Registrar un incidente en un proyecto', security, params: IdParams, body: IncidentInput },
    },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const body = req.body as IncidentBody;
      const incidentId = await app.db.tx(async (q) => {
        const [project] = await q.query('SELECT id FROM projects WHERE id = $1', [id]);
        if (!project) throw new HttpError(404, 'Proyecto no encontrado.');
        const newId = await insertIncident(q, id, body);
        await audit(q, req.account, {
          action: 'create', entity: 'incident', entityId: newId, projectId: id,
          summary: `Registró el incidente "${body.title.trim()}"`,
        });
        return newId;
      });
      const [row] = await app.db.query(`${INCIDENT_SELECT} WHERE id = $1`, [incidentId]);
      return reply.status(201).send(mapIncident(row));
    },
  );

  app.put(
    '/api/incidents/:id',
    {
      preHandler: app.requireEditor,
      schema: { tags: ['Incidentes'], summary: 'Editar un incidente', security, params: IdParams, body: IncidentInput },
    },
    async (req) => {
      const { id } = req.params as { id: number };
      const i = req.body as IncidentBody;
      assertNotFuture(i.occurredOn);
      await app.db.tx(async (q) => {
        const rows = await q.query(
          `UPDATE incidents SET title = $1, manifestation = $2, cause = $3, resolution = $4, improvement = $5, occurred_on = $6
           WHERE id = $7 RETURNING project_id`,
          [i.title.trim(), i.manifestation.trim(), i.cause?.trim() ?? '', i.resolution?.trim() ?? '', i.improvement?.trim() ?? '', i.occurredOn, id],
        );
        if (!rows.length) throw new HttpError(404, 'Incidente no encontrado.');
        await audit(q, req.account, {
          action: 'update', entity: 'incident', entityId: id, projectId: rows[0].project_id,
          summary: `Editó el incidente "${i.title.trim()}"`,
        });
      });
      const [row] = await app.db.query(`${INCIDENT_SELECT} WHERE id = $1`, [id]);
      return mapIncident(row);
    },
  );

  app.delete(
    '/api/incidents/:id',
    {
      preHandler: app.requireEditor,
      schema: { tags: ['Incidentes'], summary: 'Eliminar un incidente', security, params: IdParams },
    },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      await app.db.tx(async (q) => {
        const rows = await q.query('DELETE FROM incidents WHERE id = $1 RETURNING project_id, title', [id]);
        if (!rows.length) throw new HttpError(404, 'Incidente no encontrado.');
        await audit(q, req.account, {
          action: 'delete', entity: 'incident', entityId: id, projectId: rows[0].project_id,
          summary: `Eliminó el incidente "${rows[0].title}"`,
        });
      });
      return reply.status(204).send();
    },
  );
}
