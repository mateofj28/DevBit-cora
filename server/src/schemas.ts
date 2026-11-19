import { Type, type Static } from '@sinclair/typebox';

export const STATUSES = ['activo', 'en_desarrollo', 'mantenimiento', 'pausado', 'finalizado'] as const;
export const COMPONENTS = ['frontend', 'backend', 'base_de_datos', 'almacenamiento', 'otro'] as const;
export const KINDS = ['lenguaje', 'framework', 'base_de_datos', 'otro'] as const;
export const ROLES = ['editor', 'lector'] as const;

const literalUnion = <T extends readonly string[]>(values: T) =>
  Type.Unsafe<T[number]>({ type: 'string', enum: [...values] });

/** Texto obligatorio: no vacío ni solo espacios. */
const required = (max: number, description?: string) =>
  Type.String({ pattern: '\\S', maxLength: max, description });

const optionalText = (max: number, description?: string) =>
  Type.Optional(Type.String({ maxLength: max, description }));

const optionalUrl = (description: string) =>
  Type.Optional(Type.String({ pattern: '^(https?://\\S+)?$', maxLength: 500, description }));

export const StackItem = Type.Object(
  {
    name: required(60, 'Nombre de la tecnología (ej. React). Si no existe en el catálogo se crea.'),
    kind: literalUnion(KINDS),
  },
  { additionalProperties: false },
);

export const ServiceInput = Type.Object(
  {
    name: required(80, 'Pieza del proyecto (ej. "Sitio web")'),
    component: literalUnion(COMPONENTS),
    provider: required(60, 'Proveedor donde vive (ej. Firebase). Si no existe en el catálogo se crea.'),
    url: optionalUrl('URL del servicio desplegado'),
    notes: optionalText(500),
  },
  { additionalProperties: false },
);

export const IncidentInput = Type.Object(
  {
    title: required(150),
    manifestation: required(3000, 'Cómo se manifestó el error'),
    cause: optionalText(3000, 'Causa del error'),
    resolution: optionalText(3000, 'Cómo se resolvió'),
    improvement: optionalText(3000, 'Qué se mejoró para que no se repita'),
    occurredOn: Type.String({ format: 'date', description: 'Fecha del incidente (AAAA-MM-DD)' }),
  },
  { additionalProperties: false },
);

const projectFields = {
  name: required(120),
  summary: required(2000, 'Resumen de qué trata el proyecto'),
  status: literalUnion(STATUSES),
  owner: required(120, 'Responsable del proyecto'),
  repoUrl: optionalUrl('Enlace al repositorio'),
  productionUrl: optionalUrl('Enlace a producción'),
  docsUrl: optionalUrl('Enlace a la documentación'),
  stack: Type.Optional(Type.Array(StackItem, { maxItems: 60 })),
  services: Type.Optional(Type.Array(ServiceInput, { maxItems: 40 })),
};

export const ProjectUpdateInput = Type.Object(projectFields, { additionalProperties: false });
export const ProjectCreateInput = Type.Object(
  { ...projectFields, incidents: Type.Optional(Type.Array(IncidentInput, { maxItems: 100 })) },
  { additionalProperties: false },
);

export const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

export const ProjectQuery = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 100, description: 'Texto a buscar en nombre, resumen, responsable, stack, proveedores e incidentes' })),
  technology: Type.Optional(Type.String({ maxLength: 60, description: 'Nombre exacto de una tecnología' })),
  provider: Type.Optional(Type.String({ maxLength: 60, description: 'Nombre exacto de un proveedor' })),
  status: Type.Optional(literalUnion(STATUSES)),
  archived: Type.Optional(Type.Boolean({ description: 'true para ver solo archivados (por defecto se ocultan)' })),
});

export const LoginInput = Type.Object(
  {
    email: Type.String({ format: 'email', maxLength: 200 }),
    password: Type.String({ pattern: '\\S', maxLength: 200 }),
  },
  { additionalProperties: false },
);

export const ChangePasswordInput = Type.Object(
  {
    currentPassword: Type.String({ pattern: '\\S', maxLength: 200 }),
    newPassword: Type.String({ minLength: 8, maxLength: 200 }),
  },
  { additionalProperties: false },
);

export const UserCreateInput = Type.Object(
  {
    email: Type.String({ format: 'email', maxLength: 200 }),
    name: required(120),
    role: literalUnion(ROLES),
    password: Type.String({ minLength: 8, maxLength: 200, description: 'Contraseña inicial (mínimo 8 caracteres)' }),
  },
  { additionalProperties: false },
);

export const UserUpdateInput = Type.Object(
  {
    name: Type.Optional(required(120)),
    role: Type.Optional(literalUnion(ROLES)),
    active: Type.Optional(Type.Boolean()),
    password: Type.Optional(Type.String({ minLength: 8, maxLength: 200 })),
  },
  { additionalProperties: false },
);

export type ProjectCreate = Static<typeof ProjectCreateInput>;
export type ProjectUpdate = Static<typeof ProjectUpdateInput>;
export type IncidentBody = Static<typeof IncidentInput>;
export type ProjectQueryT = Static<typeof ProjectQuery>;
