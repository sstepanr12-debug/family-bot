/**
 * Switches the Prisma datasource provider between sqlite and postgresql.
 *
 * Prisma requires a literal provider in the schema, so a deployment that uses
 * PostgreSQL while local development stays on SQLite has to rewrite this one
 * line. Run as: node scripts/set-db-provider.mjs postgresql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'prisma',
  'schema.prisma',
);

const provider = process.argv[2];
if (!['sqlite', 'postgresql'].includes(provider)) {
  console.error('Usage: node scripts/set-db-provider.mjs <sqlite|postgresql>');
  process.exit(1);
}

const schema = readFileSync(SCHEMA, 'utf8');
const updated = schema.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${provider}"`);

if (updated === schema) {
  console.log(`Provider is already "${provider}".`);
} else {
  writeFileSync(SCHEMA, updated);
  console.log(`Provider set to "${provider}". Run "npm run db:push -w backend" next.`);
}
