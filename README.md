# DevBitácora

Catálogo de proyectos de software del equipo: descripción, stack, qué servicio vive dónde e historial de incidentes y mejoras.

- **Editores** crean y editan. **Consulta** solo lee.
- Historial de cambios: cada alta, edición, archivado e incidente queda registrado con quién y cuándo.
- Búsqueda por texto y filtros por tecnología, proveedor y estado.
- Marca "Bitácora" (papel cálido, títulos en serif y acento terracota; claro por defecto, con modo oscuro), buscador global con `Ctrl+K`, tabla de proyectos, diagrama de arquitectura por proyecto y línea de tiempo de incidentes.
- API documentada con OpenAPI/Swagger en `/api/docs`.

## Tecnología

| Capa | Herramientas |
|---|---|
| Backend | Node.js 22+, TypeScript, Fastify, validación con esquemas JSON (TypeBox) |
| Base de datos | PostgreSQL (en desarrollo y tests: PGlite, un PostgreSQL embebido, sin instalar nada) |
| Frontend | React, Vite, Tailwind CSS (diseño pensado primero para celular), TanStack Query (datos y caché), React Hook Form + Zod (formularios con errores por campo), Radix UI (desplegables, selector con búsqueda, interruptores) y Sonner (notificaciones) |
| Seguridad | Contraseñas con scrypt + sal, sesión en cookie `httpOnly`, límite de intentos de login, secretos en variables de entorno |
| Tests | Vitest: API y migraciones (32 pruebas) e interfaz con Testing Library (12 pruebas) |

En producción un solo servicio sirve la API y el frontend compilado.

## Puesta en marcha local

Requisitos: Node.js 22.9 o superior.

```powershell
npm run install:all                        # instala server/ y web/
Copy-Item server/.env.example server/.env  # y edita ADMIN_EMAIL / ADMIN_PASSWORD
npm run build                              # compila el frontend
npm start                                  # http://localhost:3000
```

Para cargar datos de ejemplo (3 proyectos y un usuario de consulta `consulta@ejemplo.com` / `consulta-123`):

```powershell
npm --prefix server run seed
```

Modo desarrollo con recarga (dos terminales):

```powershell
npm run dev:server   # API en :3000
npm run dev:web      # interfaz en :5173 (proxy hacia la API)
```

Sin `DATABASE_URL` los datos se guardan en `server/data/pglite`. Borra esa carpeta para empezar de cero.

## Tests

```powershell
npm test
```

Cubren: login y hash de contraseñas, permisos de editor y consulta (el usuario de consulta recibe 403 en cualquier escritura), alta de un proyecto completo, catálogo sin duplicados, archivado, validaciones y mensajes en español, incidentes, búsqueda y filtros (incluye "todos los proyectos que usan Firebase") y publicación de OpenAPI.

Por defecto los tests usan PGlite. Para correrlos contra un PostgreSQL real (como hace la CI), crea una base cuyo nombre contenga `test` y define:

```powershell
$env:TEST_DATABASE_URL = "postgresql://postgres:clave@localhost:5432/devbitacora_test"
npm test
```

Ese modo borra todas las tablas de la base indicada; por eso se niega a correr si el nombre no contiene `test`.

## Migraciones de base de datos

Los cambios de esquema viven en `server/migrations/NNN_nombre.sql`. Al arrancar, la app aplica en orden las que falten y las registra en la tabla `schema_migrations`. Cada archivo corre en una transacción.

- Para cambiar el esquema, crea un archivo nuevo con el siguiente número (por ejemplo `002_agrega_auditoria.sql`).
- Nunca edites una migración que ya se aplicó.

## Integración continua

`.github/workflows/ci.yml` ejecuta en cada push y pull request: typecheck y tests de la API contra PostgreSQL 17, y tests, typecheck y build de la interfaz.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL. Obligatoria en producción. |
| `JWT_SECRET` | Firma de sesiones. Obligatoria en producción, 32 caracteres o más. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Crean el primer editor al arrancar, solo si no hay usuarios. |
| `PORT` | Puerto (por defecto 3000; Railway lo define solo). |
| `LOGIN_RATE_LIMIT` | Intentos de login por minuto y por IP (por defecto 10). |
| `DATABASE_SSL` | `true` si tu PostgreSQL exige SSL. |

El archivo `.env` no se sube al repositorio.

## Despliegue en Railway

1. Sube el repositorio a GitHub.
2. En Railway: **New Project → Deploy from GitHub repo**.
3. En el mismo proyecto: **New → Database → PostgreSQL**.
4. En el servicio de la aplicación, pestaña **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET` = un valor aleatorio (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `ADMIN_EMAIL` y `ADMIN_PASSWORD`
   - `NODE_ENV` = `production`
5. En **Settings → Networking** pulsa **Generate Domain**.

`railway.json` ya define el build, el comando de arranque y el healthcheck (`/api/health`). Las tablas se crean solas en el primer arranque. Quita `ADMIN_PASSWORD` de las variables una vez creado el primer editor y cámbiala desde la aplicación.

## Cómo se usa

- **Editor**: *Proyectos → Nuevo proyecto*. En una sola pantalla se cargan datos generales, stack, servicios (pieza → proveedor) e incidentes. Las tecnologías, proveedores y responsables se autocompletan desde el catálogo; si escribes uno nuevo se agrega solo, sin duplicar por mayúsculas. Al elegir una tecnología conocida su tipo (lenguaje, framework, librería, base de datos, plataforma/servicio, herramienta) se completa solo.
- **Archivar**: desde el detalle del proyecto. No se borra; se oculta del listado y se ve con *Ver archivados*.
- **Usuarios**: sección *Usuarios* (solo editores). Las cuentas se crean por invitación; no hay registro abierto.
- **Consulta**: en el listado, el botón del proveedor (por ejemplo *Firebase*) filtra al instante.

## API

Documentación interactiva: `/api/docs`. Especificación JSON: `/api/docs/json`. Resumen:

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/logout`, `/api/auth/password` | público / sesión |
| GET | `/api/projects?q=&technology=&provider=&status=&archived=` | sesión |
| GET | `/api/projects/:id` | sesión |
| POST, PUT | `/api/projects`, `/api/projects/:id` | editor |
| POST | `/api/projects/:id/archive`, `/unarchive` | editor |
| POST | `/api/projects/:id/incidents` | editor |
| PUT, DELETE | `/api/incidents/:id` | editor |
| GET | `/api/projects/:id/history` | sesión |
| GET | `/api/audit` | editor |
| GET | `/api/catalog` | sesión |
| GET, POST, PATCH | `/api/users`, `/api/users/:id` | editor |

Los errores devuelven `{ statusCode, message, details? }` con mensajes en español; `details` lista cada campo inválido.

## Estructura

```
server/   API (src/routes, src/schemas.ts, src/schema.ts = tablas) y tests (test/)
web/      interfaz React (src/pages)
railway.json
```

## Fuera de alcance (primera versión)

Integraciones automáticas con AWS/GCP, métricas en vivo y notificaciones.
