export interface Config {
  production: boolean;
  port: number;
  databaseUrl?: string;
  databaseSsl: boolean;
  /** Carpeta de datos de la base embebida (solo desarrollo, cuando no hay DATABASE_URL). */
  devDataDir: string;
  jwtSecret: string;
  cookieSecure: boolean;
  adminEmail?: string;
  adminPassword?: string;
  loginRateLimit: number;
  webDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? '';

  if (production) {
    if (jwtSecret.length < 32) {
      throw new Error('JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.');
    }
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL es obligatorio en producción.');
    }
  }

  return {
    production,
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL || undefined,
    databaseSsl: env.DATABASE_SSL === 'true',
    devDataDir: env.DEV_DATA_DIR ?? './data/pglite',
    jwtSecret: jwtSecret || 'solo-para-desarrollo-local-cambiar-en-produccion',
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    adminEmail: env.ADMIN_EMAIL || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    loginRateLimit: Number(env.LOGIN_RATE_LIMIT ?? 10),
    webDir: env.WEB_DIR ?? '../web/dist',
  };
}
