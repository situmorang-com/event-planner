import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { seedMessageTemplates } from './message-templates.ts';
import { migrateToV2 } from './migrate-v2.ts';
import { SCHEMA, SCHEMA_TABLES_VERSION, TABLES, tableExists } from './schema.ts';
import {
	isCountry,
	recordConsentBoxesSince,
	schemaVersion,
	setSchemaVersion,
	type Country
} from './settings.ts';

export type DB = Database.Database;

export { SCHEMA } from './schema.ts';

export interface MigrateOptions {
	/** What existing events get as `phone_country`: DEFAULT_PHONE_COUNTRY in the app. */
	phoneCountry?: string;
}

// Each step takes a database at the previous version to its own. A failing step throws
// before schema_version changes, so the previous image can still run on the file. Steps past
// SCHEMA_TABLES_VERSION are data steps: SCHEMA gives a fresh file the tables, and they run on
// it just as on a migrated one.
const STEPS: { version: number; run: (db: DB, opts: MigrateOptions) => void }[] = [
	{ version: 2, run: migrateToV2 },
	{ version: 3, run: (db) => seedMessageTemplates(db) },
	// Version 4 ships the consent boxes (§4.7, §2.4 step 9): from this moment a check-in is
	// offered the future-events box, so a checkin-origin person created earlier without a tick
	// is "legacy" (§2.3). Stamped once; a fresh file gets it on creation.
	{ version: 4, run: (db) => recordConsentBoxesSince(db) }
];

/** The version a database is at once every step has run: the last step's, so it can't drift. */
export const SCHEMA_VERSION = STEPS[STEPS.length - 1].version;

/** Brings a database up to date. Safe to run on every start, and on a reused connection. */
export function migrate(db: DB, opts: MigrateOptions = {}) {
	db.exec(TABLES.settings);
	let version = schemaVersion(db);
	if (version === null) {
		// Databases before versioning have no key: the contacts table tells them from a fresh file.
		if (!tableExists(db, 'contacts')) {
			db.exec(SCHEMA);
			version = SCHEMA_TABLES_VERSION;
			setSchemaVersion(db, version);
		} else version = 1;
	}
	const country = isCountry(opts.phoneCountry) ? opts.phoneCountry : 'ID';
	for (const step of STEPS) {
		if (step.version <= version) continue;
		step.run(db, { phoneCountry: country satisfies Country });
		version = step.version;
		// Version 2 stamps itself inside its transaction; the data steps are stamped here.
		if (schemaVersion(db) !== version) setSchemaVersion(db, version);
	}
	db.exec(SCHEMA);
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
