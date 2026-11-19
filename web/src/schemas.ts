import { z } from 'zod';

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label} es obligatorio.`).max(max, `${label} no puede superar ${max} caracteres.`);
const optionalText = (max: number) => z.string().max(max, `No puede superar ${max} caracteres.`);
const url = z.string().trim().refine((v) => v === '' || /^https?:\/\/\S+$/.test(v), 'Debe ser una URL que empiece por http:// o https://.');

export const incidentSchema = z.object({
  title: required('El título', 150),
  manifestation: required('Cómo se manifestó', 3000),
  cause: optionalText(3000),
  resolution: optionalText(3000),
  improvement: optionalText(3000),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica una fecha válida.')
    .refine((v) => v <= today(), 'La fecha no puede estar en el futuro.'),
});
export type IncidentValues = z.infer<typeof incidentSchema>;

export const emptyIncident = (): IncidentValues => ({
  title: '', manifestation: '', cause: '', resolution: '', improvement: '', occurredOn: today(),
});

// Las filas de stack y servicios que se dejan en blanco se descartan al enviar.
const stackRow = z.object({ name: z.string().max(60, 'Máximo 60 caracteres.'), kind: z.enum(['lenguaje', 'framework', 'base_de_datos', 'otro']) });

const serviceRow = z
  .object({
    name: z.string().max(80, 'Máximo 80 caracteres.'),
    component: z.enum(['frontend', 'backend', 'base_de_datos', 'almacenamiento', 'otro']),
    provider: z.string().max(60, 'Máximo 60 caracteres.'),
    url,
  })
  .superRefine((s, ctx) => {
    const used = s.name.trim() || s.provider.trim() || s.url.trim();
    if (!used) return;
    if (!s.name.trim()) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Indica la pieza (ej. Sitio web).' });
    if (!s.provider.trim()) ctx.addIssue({ code: 'custom', path: ['provider'], message: 'Indica el proveedor (ej. Firebase).' });
  });

export const projectSchema = z.object({
  name: required('El nombre', 120),
  summary: required('El resumen', 2000),
  status: z.enum(['activo', 'en_desarrollo', 'mantenimiento', 'pausado', 'finalizado']),
  owner: required('El responsable', 120),
  repoUrl: url,
  productionUrl: url,
  docsUrl: url,
  stack: z.array(stackRow).max(60),
  services: z.array(serviceRow).max(40),
  incidents: z.array(incidentSchema),
});
export type ProjectValues = z.infer<typeof projectSchema>;

export const userSchema = z.object({
  name: required('El nombre', 120),
  email: z.string().trim().email('Indica un correo válido.').max(200),
  role: z.enum(['editor', 'lector']),
  password: z.string().min(8, 'Mínimo 8 caracteres.').max(200),
});
export type UserValues = z.infer<typeof userSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Indica un correo válido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.'),
});
export type LoginValues = z.infer<typeof loginSchema>;
