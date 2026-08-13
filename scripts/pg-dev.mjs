/**
 * Userland PostgreSQL for local development.
 *
 * Boots a self-contained PostgreSQL 18 instance (via embedded-postgres) into
 * ./.pgdata on port 5433 — no Docker, no admin password, no system install.
 * Keeps running until you press Ctrl+C. In production you point DATABASE_URL at
 * a real managed Postgres (see docker-compose.yml).
 *
 *   npm run db:dev      # start & keep alive
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';

const DATA_DIR = './.pgdata';
const PORT = 5433;

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
});

const firstBoot = !existsSync(`${DATA_DIR}/PG_VERSION`);

if (firstBoot) {
  console.log('› Inicializando cluster PostgreSQL local (primeira vez)…');
  await pg.initialise();
}

console.log(`› Iniciando PostgreSQL em localhost:${PORT}…`);
await pg.start();

try {
  await pg.createDatabase('pulso');
  console.log('› Base de dados "pulso" criada.');
} catch {
  // already exists — fine
}

console.log('✔ PostgreSQL pronto:  postgresql://postgres:postgres@localhost:5433/pulso');
console.log('  (Ctrl+C para parar)');

const shutdown = async () => {
  console.log('\n› Parando PostgreSQL…');
  try { await pg.stop(); } catch { /* ignore */ }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// keep the process alive
await new Promise(() => {});
