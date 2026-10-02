import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrateToV2 } from './migrate-v2.ts';
import { SCHEMA, SCHEMA_VERSION, TABLES, tableExists } from './schema.ts';
import {
	isCountry,
	recordConsentBoxesSince,
	schemaVersion,
	setSchemaVersion,
	type Country
} from './settings.ts';

export type DB = Database.Database;

export { SCHEMA, SCHEMA_VERSION } from './schema.ts';

export interface MigrateOptions {
	/** What existing events get as `phone_country`: DEFAULT_PHONE_COUNTRY in the app. */
	phoneCountry?: string;
}

// Each step takes a database at the previous version to its own. A failing step throws
// before schema_version changes, so the previous image can still run on the file.
const STEPS: { version: number; run: (db: DB, opts: MigrateOptions) => void }[] = [
	{ version: 2, run: migrateToV2 }
];

/** Brings a database up to date. Safe to run on every start, and on a reused connection. */
export function migrate(db: DB, opts: MigrateOptions = {}) {
	db.exec(TABLES.settings);
	let version = schemaVersion(db);
	if (version === null) {
		// Databases before versioning have no key: the contacts table tells them from a fresh file.
		if (!tableExists(db, 'contacts')) {
			db.exec(SCHEMA);
			setSchemaVersion(db, SCHEMA_VERSION);
			recordConsentBoxesSince(db);
			return;
		}
		version = 1;
	}
	const country = isCountry(opts.phoneCountry) ? opts.phoneCountry : 'ID';
	for (const step of STEPS) {
		if (step.version <= version) continue;
		step.run(db, { phoneCountry: country satisfies Country });
		version = step.version;
	}
	db.exec(SCHEMA);
	// Anyone checked in before this moment never saw the consent boxes (§2.4 step 9).
	recordConsentBoxesSince(db);
}

/** Opens (and migrates) a SQLite database. Pass ':memory:' for tests. */
export function createDb(path: string, opts: MigrateOptions = {}): DB {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new Database(path);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	migrate(db, opts);
	return db;
}
