import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';

let app: FastifyInstance;
let editorCookie: string;
let readerCookie: string;

const config = {
  ...loadConfig({}),
  adminEmail: 'admin@equipo.com',
  adminPassword: 'clave-segura-1',
  devDataDir: 'memory://',
  loginRateLimit: 1000,
  webDir: './no-existe',
};

async function login(email: string, password: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  const set = res.headers['set-cookie'];
  const raw = Array.isArray(set) ? set[0] : set;
  return { res, cookie: raw ? raw.split(';')[0] : '' };
}

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, cookie?: string, payload?: unknown) =>
  app.inject({ method, url, headers: cookie ? { cookie } : {}, payload: payload as any });

const projectBody = (over: Record<string, unknown> = {}) => ({
  name: 'Portal de clientes',
  summary: 'Portal web para consultar pedidos.',
  status: 'activo',
  owner: 'Ana Pérez',
  repoUrl: 'https://github.com/equipo/portal',
  productionUrl: 'https://portal.example.com',
  docsUrl: '',
  stack: [
    { name: 'React', kind: 'framework' },
    { name: 'TypeScript', kind: 'lenguaje' },
    { name: 'PostgreSQL', kind: 'base_de_datos' },
  ],
  services: [
    { name: 'Sitio web', component: 'frontend', provider: 'Firebase' },
    { name: 'API', component: 'backend', provider: 'AWS' },
    { name: 'Base de datos', component: 'base_de_datos', provider: 'Google Cloud' },
  ],
  incidents: [
    {
      title: 'Caída del login',
      manifestation: 'Los usuarios veían error 500 al entrar.',
      cause: 'Certificado vencido',
      resolution: 'Se renovó el certificado',
      improvement: 'Alerta de vencimiento 30 días antes',
      occurredOn: '2026-03-10',
    },
  ],
  ...over,
});

// Con TEST_DATABASE_URL los tests corren contra un PostgreSQL real (así lo hace la CI).
// Sin ella usan PGlite en memoria.
const testUrl = process.env.TEST_DATABASE_URL;
let testDb: Db | undefined;

beforeAll(async () => {
  if (testUrl) {
    // Protección: este bloque borra todas las tablas, así que solo se permite en bases cuyo nombre contenga "test".
    if (!/test/i.test(new URL(testUrl).pathname)) {
      throw new Error('TEST_DATABASE_URL debe apuntar a una base de datos cuyo nombre contenga "test".');
    }
    testDb = await createDb({ databaseUrl: testUrl });
    await testDb.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  app = await buildApp(config, testDb);
  editorCookie = (await login('admin@equipo.com', 'clave-segura-1')).cookie;
  await call('POST', '/api/users', editorCookie, {
    email: 'consulta@equipo.com',
    name: 'Consulta',
    role: 'lector',
    password: 'lectura-123',
  });
  readerCookie = (await login('consulta@equipo.com', 'lectura-123')).cookie;
});

afterAll(async () => {
  await app.close();
  await testDb?.close();
});

describe('autenticación', () => {
  it('rechaza credenciales incorrectas con un mensaje claro', async () => {
    const { res } = await login('admin@equipo.com', 'otra-clave');
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Correo o contraseña incorrectos.');
  });

  it('guarda la contraseña con hash, nunca en claro', async () => {
    const rows = await app.db.query('SELECT password_hash FROM users');
    for (const r of rows) {
      expect(r.password_hash).toMatch(/^scrypt\$/);
      expect(r.password_hash).not.toContain('clave-segura-1');
      expect(r.password_hash).not.toContain('lectura-123');
    }
  });

  it('exige sesión para consultar datos', async () => {
    expect((await call('GET', '/api/projects')).statusCode).toBe(401);
  });

  it('un usuario desactivado ya no puede entrar', async () => {
    const created = await call('POST', '/api/users', editorCookie, {
      email: 'baja@equipo.com', name: 'Baja', role: 'lector', password: 'password-1',
    });
    const { cookie } = await login('baja@equipo.com', 'password-1');
    await call('PATCH', `/api/users/${created.json().id}`, editorCookie, { active: false });
    expect((await call('GET', '/api/projects', cookie)).statusCode).toBe(401);
    expect((await login('baja@equipo.com', 'password-1')).res.statusCode).toBe(401);
  });
});

describe('roles', () => {
  it('el usuario de consulta no puede modificar nada', async () => {
    const created = await call('POST', '/api/projects', editorCookie, projectBody({ name: 'Solo lectura' }));
    const id = created.json().id;
    const attempts = [
      call('POST', '/api/projects', readerCookie, projectBody({ name: 'Intruso' })),
      call('PUT', `/api/projects/${id}`, readerCookie, projectBody({ name: 'Solo lectura' })),
      call('POST', `/api/projects/${id}/archive`, readerCookie),
      call('POST', `/api/projects/${id}/incidents`, readerCookie, projectBody().incidents[0]),
      call('DELETE', '/api/incidents/1', readerCookie),
      call('GET', '/api/users', readerCookie),
      call('POST', '/api/users', readerCookie, { email: 'x@x.com', name: 'X', role: 'editor', password: 'password-1' }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.statusCode).toBe(403);
    }
    const after = await call('GET', `/api/projects/${id}`, readerCookie);
    expect(after.json().name).toBe('Solo lectura');
    expect(after.json().archived).toBe(false);
  });

  it('el usuario de consulta sí puede leer', async () => {
    expect((await call('GET', '/api/projects', readerCookie)).statusCode).toBe(200);
  });
});

describe('proyectos', () => {
  it('registra un proyecto completo con stack, servicios e incidentes', async () => {
    const res = await call('POST', '/api/projects', editorCookie, projectBody());
    expect(res.statusCode).toBe(201);
    const p = res.json();
    expect(p.stack.map((s: any) => s.name)).toEqual(['PostgreSQL', 'React', 'TypeScript']);
    expect(p.services).toHaveLength(3);
    expect(p.services[0]).toMatchObject({ name: 'Sitio web', provider: 'Firebase' });
    expect(p.incidents[0]).toMatchObject({ title: 'Caída del login', occurredOn: '2026-03-10' });
    expect(p.docsUrl).toBeNull();
    expect(p.incidentCount).toBe(1);
  });

  it('no permite dos proyectos con el mismo nombre', async () => {
    const res = await call('POST', '/api/projects', editorCookie, projectBody({ name: 'portal de CLIENTES' }));
    expect(res.statusCode).toBe(409);
  });

  it('reutiliza el catálogo sin distinguir mayúsculas', async () => {
    await call('POST', '/api/projects', editorCookie, projectBody({
      name: 'Otro',
      stack: [{ name: 'react', kind: 'framework' }],
      services: [{ name: 'Web', component: 'frontend', provider: 'FIREBASE' }],
      incidents: [],
    }));
    const catalog = (await call('GET', '/api/catalog', readerCookie)).json();
    expect(catalog.providers.filter((p: string) => p.toLowerCase() === 'firebase')).toHaveLength(1);
    expect(catalog.technologies.filter((t: any) => t.name.toLowerCase() === 'react')).toHaveLength(1);
  });

  it('edita un proyecto y reemplaza su stack y servicios', async () => {
    const created = (await call('POST', '/api/projects', editorCookie, projectBody({ name: 'Editable', incidents: [] }))).json();
    const res = await call('PUT', `/api/projects/${created.id}`, editorCookie, {
      name: 'Editable v2',
      summary: 'Nuevo resumen',
      status: 'mantenimiento',
      owner: 'Luis',
      stack: [{ name: 'Python', kind: 'lenguaje' }],
      services: [{ name: 'API', component: 'backend', provider: 'Railway' }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Editable v2', status: 'mantenimiento' });
    expect(res.json().stack).toEqual([{ name: 'Python', kind: 'lenguaje' }]);
    expect(res.json().services).toHaveLength(1);
  });

  it('archiva sin borrar y permite restaurar', async () => {
    const created = (await call('POST', '/api/projects', editorCookie, projectBody({ name: 'Archivable', incidents: [] }))).json();
    await call('POST', `/api/projects/${created.id}/archive`, editorCookie);
    const visible = (await call('GET', '/api/projects?q=Archivable', readerCookie)).json();
    expect(visible).toHaveLength(0);
    const archived = (await call('GET', '/api/projects?archived=true&q=Archivable', readerCookie)).json();
    expect(archived).toHaveLength(1);
    await call('POST', `/api/projects/${created.id}/unarchive`, editorCookie);
    expect((await call('GET', '/api/projects?q=Archivable', readerCookie)).json()).toHaveLength(1);
  });

  it('devuelve 404 para un proyecto inexistente', async () => {
    const res = await call('GET', '/api/projects/99999', readerCookie);
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Proyecto no encontrado.');
  });
});

describe('validación', () => {
  it('informa cada campo inválido en español', async () => {
    const res = await call('POST', '/api/projects', editorCookie, {
      name: '   ',
      status: 'inventado',
      repoUrl: 'no-es-url',
      services: [{ name: 'API', component: 'backend' }],
    });
    expect(res.statusCode).toBe(400);
    const messages = res.json().details.map((d: any) => d.message).join(' | ');
    expect(messages).toContain('El campo "nombre" no puede estar vacío.');
    expect(messages).toContain('El campo "resumen" es obligatorio.');
    expect(messages).toContain('El campo "estado" debe ser uno de:');
    expect(messages).toContain('debe ser una URL que empiece por http:// o https://');
    expect(messages).toContain('proveedor');
  });

  it('rechaza fechas de incidente futuras', async () => {
    const created = (await call('POST', '/api/projects', editorCookie, projectBody({ name: 'Fechas', incidents: [] }))).json();
    const res = await call('POST', `/api/projects/${created.id}/incidents`, editorCookie, {
      ...projectBody().incidents[0],
      occurredOn: '2999-01-01',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('futuro');
  });

  it('rechaza JSON mal formado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      headers: { 'content-type': 'application/json' }, payload: '{malo',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('JSON');
  });
});

describe('incidentes', () => {
  it('registra, edita y elimina incidentes', async () => {
    const p = (await call('POST', '/api/projects', editorCookie, projectBody({ name: 'Con incidentes', incidents: [] }))).json();
    const created = await call('POST', `/api/projects/${p.id}/incidents`, editorCookie, projectBody().incidents[0]);
    expect(created.statusCode).toBe(201);
    const id = created.json().id;

    const updated = await call('PUT', `/api/incidents/${id}`, editorCookie, {
      ...projectBody().incidents[0],
      cause: 'Causa corregida',
      occurredOn: '2026-03-11',
    });
    expect(updated.json()).toMatchObject({ cause: 'Causa corregida', occurredOn: '2026-03-11' });

    expect((await call('DELETE', `/api/incidents/${id}`, editorCookie)).statusCode).toBe(204);
    expect((await call('GET', `/api/projects/${p.id}`, readerCookie)).json().incidents).toHaveLength(0);
  });
});

describe('búsqueda y filtros', () => {
  it('encuentra todos los proyectos que usan Firebase', async () => {
    await call('POST', '/api/projects', editorCookie, projectBody({
      name: 'Solo en Render',
      stack: [{ name: 'Django', kind: 'framework' }],
      services: [{ name: 'Todo', component: 'backend', provider: 'Render' }],
      incidents: [],
    }));
    const res = (await call('GET', '/api/projects?provider=Firebase', readerCookie)).json();
    const names = res.map((p: any) => p.name);
    expect(names).toContain('Portal de clientes');
    expect(names).not.toContain('Solo en Render');
    // la búsqueda de texto también encuentra proveedores
    const byText = (await call('GET', '/api/projects?q=firebase', readerCookie)).json();
    expect(byText.map((p: any) => p.name)).not.toContain('Solo en Render');
    expect(byText.length).toBe(res.length);
  });

  it('filtra por tecnología, estado y texto', async () => {
    const byTech = (await call('GET', '/api/projects?technology=django', readerCookie)).json();
    expect(byTech.map((p: any) => p.name)).toEqual(['Solo en Render']);

    const byStatus = (await call('GET', '/api/projects?status=mantenimiento', readerCookie)).json();
    expect(byStatus.every((p: any) => p.status === 'mantenimiento')).toBe(true);

    const byIncident = (await call('GET', '/api/projects?q=certificado', readerCookie)).json();
    expect(byIncident.map((p: any) => p.name)).toContain('Portal de clientes');

    const combined = (await call('GET', '/api/projects?provider=AWS&technology=React&q=portal', readerCookie)).json();
    expect(combined.map((p: any) => p.name)).toContain('Portal de clientes');
  });

  it('trata % y _ como texto literal', async () => {
    expect((await call('GET', '/api/projects?q=%25', readerCookie)).json()).toHaveLength(0);
  });
});

describe('auditoría', () => {
  it('registra quién hizo cada cambio sobre un proyecto', async () => {
    const p = (await call('POST', '/api/projects', editorCookie, projectBody({ name: 'Auditado', incidents: [] }))).json();
    await call('PUT', `/api/projects/${p.id}`, editorCookie, { ...projectBody({ name: 'Auditado' }), incidents: undefined });
    const inc = (await call('POST', `/api/projects/${p.id}/incidents`, editorCookie, projectBody().incidents[0])).json();
    await call('DELETE', `/api/incidents/${inc.id}`, editorCookie);
    await call('POST', `/api/projects/${p.id}/archive`, editorCookie);
    await call('POST', `/api/projects/${p.id}/unarchive`, editorCookie);

    // El usuario de consulta puede leer el historial.
    const res = await call('GET', `/api/projects/${p.id}/history`, readerCookie);
    expect(res.statusCode).toBe(200);
    const history = res.json();
    expect(history.map((h: any) => h.summary)).toEqual([
      'Restauró el proyecto "Auditado"',
      'Archivó el proyecto "Auditado"',
      'Eliminó el incidente "Caída del login"',
      'Registró el incidente "Caída del login"',
      'Editó el proyecto "Auditado"',
      'Creó el proyecto "Auditado"',
    ]);
    expect(history.every((h: any) => h.userName === 'Administrador')).toBe(true);
  });

  it('un cambio rechazado no deja rastro en el historial', async () => {
    const p = (await call('POST', '/api/projects', editorCookie, projectBody({ name: 'Sin rastro', incidents: [] }))).json();
    await call('POST', `/api/projects/${p.id}/incidents`, editorCookie, { ...projectBody().incidents[0], occurredOn: '2999-01-01' });
    await call('POST', `/api/projects/${p.id}/archive`, readerCookie);
    const history = (await call('GET', `/api/projects/${p.id}/history`, readerCookie)).json();
    expect(history).toHaveLength(1);
  });

  it('registra cambios de usuarios y solo los editores ven el registro global', async () => {
    const all = await call('GET', '/api/audit', editorCookie);
    expect(all.statusCode).toBe(200);
    expect(all.json().some((e: any) => e.entity === 'user' && e.summary.includes('consulta@equipo.com'))).toBe(true);
    expect((await call('GET', '/api/audit', readerCookie)).statusCode).toBe(403);
  });

  it('el historial de un proyecto inexistente da 404', async () => {
    expect((await call('GET', '/api/projects/99999/history', readerCookie)).statusCode).toBe(404);
  });
});

describe('documentación', () => {
  it('publica la especificación OpenAPI', async () => {
    const res = await call('GET', '/api/docs/json');
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths)).toContain('/api/projects');
  });
});

