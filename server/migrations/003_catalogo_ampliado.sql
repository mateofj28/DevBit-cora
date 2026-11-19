-- Catálogo ampliado de tecnologías y proveedores, y nuevos tipos de tecnología.
-- Desde esta migración el catálogo inicial vive aquí (antes se sembraba desde el código).
-- Todo es idempotente: en bases que ya tenían catálogo solo se agregan las que faltan.

-- Tipos: se agregan "libreria" (React, Redux...), "plataforma" (Firebase, Supabase, Node.js...) y "herramienta" (Docker, Git...).
ALTER TABLE technologies DROP CONSTRAINT IF EXISTS technologies_kind_check;
ALTER TABLE technologies ADD CONSTRAINT technologies_kind_check
  CHECK (kind IN ('lenguaje', 'framework', 'libreria', 'base_de_datos', 'plataforma', 'herramienta', 'otro'));

INSERT INTO technologies (name, kind) VALUES
  -- Lenguajes
  ('JavaScript', 'lenguaje'), ('TypeScript', 'lenguaje'), ('Python', 'lenguaje'), ('Java', 'lenguaje'),
  ('C#', 'lenguaje'), ('Go', 'lenguaje'), ('PHP', 'lenguaje'), ('Kotlin', 'lenguaje'), ('Swift', 'lenguaje'),
  ('Dart', 'lenguaje'), ('C', 'lenguaje'), ('C++', 'lenguaje'), ('Rust', 'lenguaje'), ('Ruby', 'lenguaje'),
  ('Scala', 'lenguaje'), ('Elixir', 'lenguaje'), ('R', 'lenguaje'), ('SQL', 'lenguaje'), ('Bash', 'lenguaje'),
  ('Lua', 'lenguaje'), ('HTML', 'lenguaje'), ('CSS', 'lenguaje'), ('Solidity', 'lenguaje'), ('Objective-C', 'lenguaje'),
  -- Frameworks
  ('Angular', 'framework'), ('Vue', 'framework'), ('Next.js', 'framework'), ('Express', 'framework'),
  ('Fastify', 'framework'), ('NestJS', 'framework'), ('Django', 'framework'), ('FastAPI', 'framework'),
  ('Spring Boot', 'framework'), ('.NET', 'framework'), ('Laravel', 'framework'), ('Flutter', 'framework'),
  ('Svelte', 'framework'), ('SvelteKit', 'framework'), ('Nuxt', 'framework'), ('Remix', 'framework'),
  ('Astro', 'framework'), ('Flask', 'framework'), ('Ruby on Rails', 'framework'), ('ASP.NET Core', 'framework'),
  ('Quarkus', 'framework'), ('Gin', 'framework'), ('Fiber', 'framework'), ('Phoenix', 'framework'),
  ('Symfony', 'framework'), ('Ionic', 'framework'), ('React Native', 'framework'), ('Expo', 'framework'),
  ('Electron', 'framework'), ('Tauri', 'framework'), ('Hono', 'framework'), ('Koa', 'framework'),
  ('Strapi', 'framework'), ('AdonisJS', 'framework'), ('Qwik', 'framework'), ('Tailwind CSS', 'framework'),
  ('Bootstrap', 'framework'),
  -- Librerías
  ('React', 'libreria'), ('jQuery', 'libreria'), ('Redux', 'libreria'), ('Zustand', 'libreria'),
  ('TanStack Query', 'libreria'), ('React Router', 'libreria'), ('Axios', 'libreria'), ('Prisma', 'libreria'),
  ('TypeORM', 'libreria'), ('Sequelize', 'libreria'), ('Drizzle', 'libreria'), ('Mongoose', 'libreria'),
  ('Zod', 'libreria'), ('RxJS', 'libreria'), ('Lodash', 'libreria'), ('D3.js', 'libreria'), ('Three.js', 'libreria'),
  ('Socket.IO', 'libreria'), ('Material UI', 'libreria'), ('Chakra UI', 'libreria'), ('shadcn/ui', 'libreria'),
  ('Radix UI', 'libreria'), ('Framer Motion', 'libreria'), ('SolidJS', 'libreria'), ('Preact', 'libreria'),
  ('Pandas', 'libreria'), ('NumPy', 'libreria'), ('TensorFlow', 'libreria'), ('PyTorch', 'libreria'),
  ('scikit-learn', 'libreria'), ('Jest', 'libreria'), ('Vitest', 'libreria'), ('Playwright', 'libreria'),
  ('Cypress', 'libreria'), ('Pytest', 'libreria'),
  -- Bases de datos
  ('PostgreSQL', 'base_de_datos'), ('MySQL', 'base_de_datos'), ('MongoDB', 'base_de_datos'),
  ('Firestore', 'base_de_datos'), ('Redis', 'base_de_datos'), ('SQLite', 'base_de_datos'),
  ('SQL Server', 'base_de_datos'), ('DynamoDB', 'base_de_datos'), ('MariaDB', 'base_de_datos'),
  ('Oracle Database', 'base_de_datos'), ('Cassandra', 'base_de_datos'), ('Elasticsearch', 'base_de_datos'),
  ('Neo4j', 'base_de_datos'), ('CockroachDB', 'base_de_datos'), ('Firebase Realtime Database', 'base_de_datos'),
  ('InfluxDB', 'base_de_datos'), ('ClickHouse', 'base_de_datos'), ('Memcached', 'base_de_datos'),
  ('Couchbase', 'base_de_datos'), ('Pinecone', 'base_de_datos'),
  -- Plataformas y servicios (backend como servicio, entornos de ejecución, autenticación, pagos...)
  ('Firebase', 'plataforma'), ('Supabase', 'plataforma'), ('Appwrite', 'plataforma'), ('PocketBase', 'plataforma'),
  ('Hasura', 'plataforma'), ('Parse', 'plataforma'), ('AWS Amplify', 'plataforma'), ('Node.js', 'plataforma'),
  ('Deno', 'plataforma'), ('Bun', 'plataforma'), ('Auth0', 'plataforma'), ('Clerk', 'plataforma'),
  ('Stripe', 'plataforma'), ('Twilio', 'plataforma'),
  -- Herramientas
  ('Docker', 'herramienta'), ('Kubernetes', 'herramienta'), ('Git', 'herramienta'), ('GitHub Actions', 'herramienta'),
  ('GitLab CI', 'herramienta'), ('Terraform', 'herramienta'), ('Nginx', 'herramienta'), ('Webpack', 'herramienta'),
  ('Vite', 'herramienta'), ('ESLint', 'herramienta'), ('Prettier', 'herramienta'), ('Jenkins', 'herramienta'),
  ('Ansible', 'herramienta'), ('Postman', 'herramienta'), ('OpenAPI', 'herramienta'), ('Storybook', 'herramienta'),
  -- Protocolos y estándares
  ('GraphQL', 'otro'), ('gRPC', 'otro'), ('WebSocket', 'otro'), ('JWT', 'otro'), ('OAuth', 'otro')
ON CONFLICT DO NOTHING;

-- Reclasificar lo que ya estaba cargado con otro tipo.
UPDATE technologies SET kind = 'libreria' WHERE lower(name) = 'react';
UPDATE technologies SET kind = 'plataforma' WHERE lower(name) = 'node.js';

INSERT INTO providers (name) VALUES
  ('Firebase'), ('AWS'), ('Google Cloud'), ('Azure'), ('Railway'), ('Render'), ('Vercel'), ('Netlify'),
  ('Heroku'), ('DigitalOcean'), ('Cloudflare'), ('Supabase'), ('Neon'), ('Fly.io'), ('Hetzner'),
  ('Oracle Cloud'), ('MongoDB Atlas'), ('GitHub Pages'), ('Linode'), ('Appwrite Cloud'), ('Upstash')
ON CONFLICT DO NOTHING;
