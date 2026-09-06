import { defineConfig } from 'vitest/config';

// Tests run against a throwaway SQLite file so eventService can be exercised
// against real Prisma queries rather than a hand-written mock.
process.env.DATABASE_URL = 'file:./test.db';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.BOT_TOKEN = '';

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    hookTimeout: 60_000,
    testTimeout: 20_000,
    // Every suite seeds the same SQLite file, so files must not overlap or they
    // wipe each other's fixtures mid-run.
    fileParallelism: false,
  },
});
