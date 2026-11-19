import type { Queryable } from './db.js';

export type AuditAction = 'create' | 'update' | 'archive' | 'restore' | 'delete';

export interface AuditEvent {
  action: AuditAction;
  entity: 'project' | 'incident' | 'user';
  entityId: number;
  /** Proyecto al que pertenece el cambio, para mostrarlo en su historial. */
  projectId?: number | null;
  summary: string;
}

/** Registra un cambio. Llámalo con el mismo `Queryable` de la transacción para que se guarde o se revierta junto al cambio. */
export async function audit(q: Queryable, actor: { id: number; name: string }, e: AuditEvent): Promise<void> {
  await q.query(
    `INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, project_id, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actor.id, actor.name, e.action, e.entity, e.entityId, e.projectId ?? null, e.summary],
  );
}

export const mapAudit = (r: any) => ({
  id: r.id,
  userName: r.user_name,
  action: r.action,
  entity: r.entity,
  entityId: r.entity_id,
  projectId: r.project_id,
  summary: r.summary,
  createdAt: r.created_at,
});
