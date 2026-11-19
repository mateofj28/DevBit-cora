export type Status = 'activo' | 'en_desarrollo' | 'mantenimiento' | 'pausado' | 'finalizado';
export type Component = 'frontend' | 'backend' | 'base_de_datos' | 'almacenamiento' | 'otro';
export type Kind = 'lenguaje' | 'framework' | 'libreria' | 'base_de_datos' | 'plataforma' | 'herramienta' | 'otro';
export type Role = 'editor' | 'lector';

export interface User { id: number; email: string; name: string; role: Role; active: boolean }
export interface StackItem { name: string; kind: Kind }
export interface Service { id?: number; name: string; component: Component; provider: string; url?: string | null; notes?: string | null }
export interface Incident {
  id: number; projectId: number; title: string; manifestation: string;
  cause: string; resolution: string; improvement: string; occurredOn: string;
}
export interface Project {
  id: number; name: string; summary: string; status: Status; owner: string;
  repoUrl: string | null; productionUrl: string | null; docsUrl: string | null;
  archived: boolean; incidentCount: number; updatedAt: string;
  stack: StackItem[]; services: Service[]; incidents?: Incident[];
}
export interface HistoryEntry { id: number; userName: string; summary: string; createdAt: string }
export interface Catalog { technologies: StackItem[]; providers: string[]; owners?: string[] }

export const STATUS_LABEL: Record<Status, string> = {
  activo: 'Activo', en_desarrollo: 'En desarrollo', mantenimiento: 'Mantenimiento', pausado: 'Pausado', finalizado: 'Finalizado',
};
export const COMPONENT_LABEL: Record<Component, string> = {
  frontend: 'Frontend', backend: 'Backend', base_de_datos: 'Base de datos', almacenamiento: 'Almacenamiento', otro: 'Otro',
};
export const KIND_LABEL: Record<Kind, string> = {
  lenguaje: 'Lenguaje', framework: 'Framework', libreria: 'Librería', base_de_datos: 'Base de datos',
  plataforma: 'Plataforma / servicio', herramienta: 'Herramienta', otro: 'Otro',
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public details: Array<{ field: string; message: string }> = []) {
    super(message);
  }
}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión.', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message ?? 'Ocurrió un error inesperado.', res.status, data.details);
  return data as T;
}
