import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pool from './pg-database.js';
import { info } from '../utils/logger.js';

await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
`);

const { rows } = await pool.query<{ name: string }>('SELECT name FROM _migrations');
const applied = new Set(rows.map(r => r.name));

const migrationsDir = path.resolve('migrations');

const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
    if (applied.has(file)) continue;

    const migration = readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(migration);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);

    info(`Applied: ${file}`);
}

info('Migrations complete.');