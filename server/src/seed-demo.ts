/**
 * Carga datos de ejemplo para la demo. Uso: npm --prefix server run seed
 * Funciona con la base configurada (DATABASE_URL o la embebida de desarrollo).
 * No hay que ejecutarlo en producción real: crea un usuario de consulta con clave conocida.
 */
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp(config);

const existing = await app.db.query('SELECT count(*)::int AS n FROM projects');
if (existing[0].n > 0) {
  console.log('Ya hay proyectos; no se cargan datos de ejemplo.');
  await app.close();
  process.exit(0);
}

const projects = [
  {
    name: 'Portal de clientes',
    summary: 'Portal web donde los clientes consultan pedidos y facturas.',
    status: 'activo', owner: 'Ana Pérez',
    repoUrl: 'https://github.com/equipo/portal', productionUrl: 'https://portal.example.com',
    stack: [{ name: 'React', kind: 'libreria' }, { name: 'TypeScript', kind: 'lenguaje' }, { name: 'Node.js', kind: 'plataforma' }, { name: 'PostgreSQL', kind: 'base_de_datos' }],
    services: [
      { name: 'Sitio web', component: 'frontend', provider: 'Firebase' },
      { name: 'API', component: 'backend', provider: 'AWS' },
      { name: 'Base de datos', component: 'base_de_datos', provider: 'Google Cloud' },
    ],
    incidents: [{
      title: 'Caída del login', occurredOn: '2026-03-10',
      manifestation: 'Los usuarios veían error 500 al iniciar sesión.',
      cause: 'Certificado TLS del API vencido.', resolution: 'Se renovó el certificado.',
      improvement: 'Alerta automática 30 días antes del vencimiento.',
    }],
  },
  {
    name: 'App de inventario',
    summary: 'Aplicación móvil para el control de stock en bodega.',
    status: 'en_desarrollo', owner: 'Luis Gómez',
    stack: [{ name: 'Flutter', kind: 'framework' }, { name: 'Dart', kind: 'lenguaje' }, { name: 'Firebase', kind: 'plataforma' }, { name: 'Firestore', kind: 'base_de_datos' }],
    services: [
      { name: 'Backend y datos', component: 'backend', provider: 'Firebase' },
    ],
    incidents: [],
  },
  {
    name: 'Reportes internos',
    summary: 'Generación de reportes mensuales para finanzas.',
    status: 'mantenimiento', owner: 'Marta Ruiz',
    stack: [{ name: 'Python', kind: 'lenguaje' }, { name: 'Django', kind: 'framework' }, { name: 'MySQL', kind: 'base_de_datos' }],
    services: [{ name: 'Aplicación', component: 'backend', provider: 'Railway' }],
    incidents: [{
      title: 'Reporte con totales duplicados', occurredOn: '2026-02-02',
      manifestation: 'El total mensual aparecía duplicado.', cause: 'Join sin deduplicar facturas con varias líneas.',
      resolution: 'Se corrigió la consulta.', improvement: 'Test automático con facturas de varias líneas.',
    }],
  },
];

const login = await app.inject({
  method: 'POST', url: '/api/auth/login',
  payload: { email: config.adminEmail, password: config.adminPassword },
});
if (login.statusCode !== 200) {
  console.error('No se pudo iniciar sesión con ADMIN_EMAIL/ADMIN_PASSWORD; revisa tu .env.');
  process.exit(1);
}
const cookie = String(login.headers['set-cookie']).split(';')[0];

for (const p of projects) {
  const res = await app.inject({ method: 'POST', url: '/api/projects', headers: { cookie }, payload: p });
  console.log(`${res.statusCode === 201 ? 'OK ' : 'ERR'} ${p.name}`);
}
await app.inject({
  method: 'POST', url: '/api/users', headers: { cookie },
  payload: { email: 'consulta@ejemplo.com', name: 'Usuario de consulta', role: 'lector', password: 'consulta-123' },
});
console.log('Usuario de consulta: consulta@ejemplo.com / consulta-123');
await app.close();
