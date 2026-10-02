import { env } from '$env/dynamic/private';
import { DB_PATH, DEFAULT_PHONE_COUNTRY } from './config';
import { createDb, migrate, type DB } from './database';
import { loadSecret } from './sign';

// Survives Vite HMR in dev so we don't pile up open connections.
const g = globalThis as typeof globalThis & { __attendanceDb?: DB };

const opts = { phoneCountry: DEFAULT_PHONE_COUNTRY };
export const db = (g.__attendanceDb ??= createDb(DB_PATH, opts));
// A dev server reuses that connection across edits, so new columns are added here too.
migrate(db, opts);
export const secret = loadSecret(db, env.SESSION_SECRET);

// adapter-node emits this once the server has stopped (SIGTERM on a deploy). Closing here
// checkpoints the WAL, so no -wal file is left beside the database in the volume.
process.once('sveltekit:shutdown', () => db.close());
