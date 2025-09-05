import assert from 'assert';
import { initDb, query, closeDb, getDriver } from '../server/db/db.js';
import { runMigrations } from '../server/db/migrate.js';

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

export async function run(){
  // Force SQLite by clearing PG env for this test
  delete process.env.DATABASE_URL; delete process.env.PGHOST; delete process.env.PGDATABASE;
  process.env.SQLITE_PATH = ':memory:';
  const { driver } = await initDb();
  assert.ok(driver === 'sqlite' || driver === 'pg', 'driver initialized');
  await runMigrations();
  assert.ok(await tableExists('users'), 'users table exists');
  // insert and read back
  const email = 'test@example.com';
  const { rows: ins } = await query('INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id, email', [email, 'x:y']);
  assert.equal(ins[0].email, email);
  const { rows } = await query('SELECT email FROM users WHERE email=$1', [email]);
  assert.equal(rows[0].email, email);
  await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(()=>{ console.log('db test passed'); }).catch((e)=>{ console.error(e); process.exit(1); });
}
