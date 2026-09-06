import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const TEST_DB = path.resolve('prisma', 'test.db');

/** Recreates the throwaway test database schema once per run. */
export default function setup() {
  // Dropping the file is the reset: never point DATABASE_URL at anything else.
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-journal`, { force: true });

  execSync('npx prisma db push --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  });
}
