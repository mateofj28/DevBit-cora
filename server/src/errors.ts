import type { FastifyError, FastifyInstance } from 'fastify';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
}

const FIELD_LABELS: Record<string, string> = {
  name: 'nombre',
  summary: 'resumen',
  status: 'estado',
  owner: 'responsable',
  repoUrl: 'enlace del repositorio',
  productionUrl: 'enlace de producción',
  docsUrl: 'enlace de documentación',
  stack: 'stack',
  kind: 'tipo de tecnología',
  services: 'servicios',
  component: 'componente',
  provider: 'proveedor',
  url: 'URL',
  notes: 'notas',
  incidents: 'incidentes',
  title: 'título',
  manifestation: 'cómo se manifestó',
  cause: 'causa',
  resolution: 'resolución',
  improvement: 'mejora',
  occurredOn: 'fecha',
  email: 'correo',
  password: 'contraseña',
  currentPassword: 'contraseña actual',
  newPassword: 'contraseña nueva',
  role: 'rol',
  active: 'activo',
  technology: 'tecnología',
  q: 'búsqueda',
  archived: 'archivado',
};

interface AjvIssue {
  instancePath: string;
  keyword: string;
  params: Record<string, any>;
  message?: string;
}

function labelFor(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return 'datos';
  const label = FIELD_LABELS[last] ?? last;
  // Para elementos de listas ("/services/0/name") indica la posición.
  const idx = parts.findIndex((p) => /^\d+$/.test(p));
  if (idx >= 0 && !/^\d+$/.test(last)) {
    const parent = FIELD_LABELS[parts[idx - 1]] ?? parts[idx - 1];
    return `${label} (${parent} #${Number(parts[idx]) + 1})`;
  }
  return label;
}

function issueMessage(issue: AjvIssue): { field: string; message: string } {
  const path =
    issue.keyword === 'required'
      ? `${issue.instancePath}/${issue.params.missingProperty}`
      : issue.instancePath;
  const label = labelFor(path);
  const p = issue.params;
  let message: string;
  switch (issue.keyword) {
    case 'required':
      message = `El campo "${label}" es obligatorio.`;
      break;
    case 'minLength':
      message =
        p.limit === 1
          ? `El campo "${label}" no puede estar vacío.`
          : `El campo "${label}" debe tener al menos ${p.limit} caracteres.`;
      break;
    case 'maxLength':
      message = `El campo "${label}" no puede superar ${p.limit} caracteres.`;
      break;
    case 'maxItems':
      message = `El campo "${label}" admite como máximo ${p.limit} elementos.`;
      break;
    case 'enum':
      message = `El campo "${label}" debe ser uno de: ${(p.allowedValues as string[]).join(', ')}.`;
      break;
    case 'format':
      message =
        p.format === 'email'
          ? `El campo "${label}" debe ser un correo válido.`
          : p.format === 'date'
            ? `El campo "${label}" debe ser una fecha válida con formato AAAA-MM-DD.`
            : `El campo "${label}" no tiene un formato válido.`;
      break;
    case 'pattern':
      message = String(p.pattern).includes('https?')
        ? `El campo "${label}" debe ser una URL que empiece por http:// o https://.`
        : `El campo "${label}" no puede estar vacío.`;
      break;
    case 'type':
      message = `El campo "${label}" tiene un tipo de dato inválido (se esperaba ${p.type}).`;
      break;
    case 'additionalProperties':
      message = `El campo "${p.additionalProperty}" no está permitido.`;
      break;
    default:
      message = `El campo "${label}" no es válido.`;
  }
  return { field: path.split('/').filter(Boolean).join('.') || 'datos', message };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | HttpError, _req, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    const fe = error as FastifyError;
    if (fe.validation) {
      const details = (fe.validation as unknown as AjvIssue[]).map(issueMessage);
      return reply.status(400).send({
        statusCode: 400,
        message: details.length === 1 ? details[0].message : 'Hay datos inválidos. Revisa los campos indicados.',
        details,
      });
    }

    const status = fe.statusCode ?? 500;
    if (status === 429) {
      return reply.status(429).send({ statusCode: 429, message: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.' });
    }
    if (fe.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || fe.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
      return reply.status(400).send({ statusCode: 400, message: 'El cuerpo de la solicitud no es un JSON válido.' });
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send({ statusCode: status, message: fe.message });
    }

    app.log.error(error);
    return reply.status(500).send({ statusCode: 500, message: 'Error interno del servidor. Inténtalo de nuevo más tarde.' });
  });
}
