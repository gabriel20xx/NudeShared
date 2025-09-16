import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { query, closeDb, getDriver } from '../server/db/db.js';
import { ensureTestDb } from './utils/testDb.mjs';

async function tableExists(name){
  const driver = getDriver();
  if (driver === 'sqlite') {
    const { rows } = await query("PRAGMA table_info('"+name+"')");
    return Array.isArray(rows) && rows.length > 0;
  }
  if (driver === 'pg') {
    const { rows } = await query("SELECT to_regclass('public."+name+"') AS present");
    return rows?.[0]?.present !== null;
  }
  throw new Error('No driver');
}

describe('DB migrations + basic CRUD', () => {
  beforeAll(async () => {
  delete process.env.DATABASE_URL; delete process.env.PGHOST; delete process.env.PGDATABASE;
  await ensureTestDb({ memory: true, fresh: true });
  });
  afterAll(async () => { await closeDb(); });
  test('users table exists & insert/select works', async () => {
    expect(await tableExists('users')).toBe(true);
    const email='test@example.com';
    const { rows: ins } = await query('INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id,email', [email,'x:y']);
    expect(ins[0].email).toBe(email);
    const { rows } = await query('SELECT email FROM users WHERE email=$1', [email]);
    expect(rows[0].email).toBe(email);
  });
});
