import { readdirSync, readFileSync } from 'node:fs';
import db from './database.js';
import path from 'node:path';

db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
`);

const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(r => r.name)
);

const migrationsDir = path.resolve('migrations');

const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
    if (applied.has(file)) continue;

    const migration = readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(migration);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
}