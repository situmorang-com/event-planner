import type Database from 'better-sqlite3';

type DB = Database.Database;

/** The version SCHEMA alone gives a fresh file: the data steps after it run on it too. */
export const SCHEMA_TABLES_VERSION = 2;

/** The check-ins table, by name, so the v2 migration can build its replacement beside the old one. */
export function checkinsTable(name: string) {
	return `
	CREATE TABLE IF NOT EXISTS ${name} (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
		checked_in_at INTEGER NOT NULL,
		method TEXT NOT NULL,
		device TEXT NOT NULL,
		consent_at INTEGER,
		UNIQUE (event_id, person_id)
	);`;
}

export const CHECKINS_INDEXES = `
	CREATE INDEX IF NOT EXISTS idx_checkins_event ON checkins(event_id, checked_in_at);
	CREATE INDEX IF NOT EXISTS idx_checkins_person ON checkins(person_id);
`;

export const TABLES = {
	settings: `
	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);`,

	events: `
	CREATE TABLE IF NOT EXISTS events (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		venue TEXT NOT NULL DEFAULT '',
		starts_at INTEGER,
		-- NULL means six hours after the start: link expiry and no-shows both read it that way.
		ends_at INTEGER,
		timezone TEXT NOT NULL DEFAULT 'UTC',
		qr_mode TEXT NOT NULL DEFAULT 'rotating' CHECK (qr_mode IN ('rotating', 'static')),
		is_open INTEGER NOT NULL DEFAULT 1,
		target_count INTEGER,
		phone_country TEXT NOT NULL DEFAULT 'ID' CHECK (phone_country IN ('ID', 'MY')),
		language TEXT CHECK (language IN ('id', 'en', 'ms')),
		co_hosts TEXT NOT NULL DEFAULT '',
		invitation_text TEXT,
		chase_rules TEXT,
		started_job_at INTEGER,
		planning_purged_at INTEGER,
		created_at INTEGER NOT NULL
	);`,

	companies: `
	CREATE TABLE IF NOT EXISTS companies (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		key TEXT NOT NULL UNIQUE,
		website TEXT NOT NULL DEFAULT '',
		owner TEXT,
		phone_country TEXT CHECK (phone_country IN ('ID', 'MY')),
		never_invite_at INTEGER,
		never_invite_reason TEXT,
		never_invite_by TEXT,
		is_customer INTEGER NOT NULL DEFAULT 0,
		d365_note TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);`,

	// The cross-event pool: attendees and prospects alike. Email is not unique on purpose:
	// shared info@ addresses exist, and findPerson() narrows within them.
	people: `
	CREATE TABLE IF NOT EXISTS people (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		job_title TEXT NOT NULL DEFAULT '',
		email TEXT,
		phone TEXT,
		linkedin TEXT,
		company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
		origin TEXT NOT NULL
			CHECK (origin IN ('self_registered', 'checkin', 'd365', 'typed', 'research')),
		origin_detail TEXT NOT NULL DEFAULT '',
		source_url TEXT,
		research_reason TEXT,
		is_customer INTEGER NOT NULL DEFAULT 0,
		country TEXT CHECK (country IN ('ID', 'MY')),
		consent_future_at INTEGER,
		legacy_notice_at INTEGER,
		legacy_kept_at INTEGER,
		d365_no_email INTEGER NOT NULL DEFAULT 0,
		d365_no_phone INTEGER NOT NULL DEFAULT 0,
		d365_suppressed INTEGER NOT NULL DEFAULT 0,
		locked_at INTEGER,
		lock_reason TEXT,
		-- Whether the team is connected with them on LinkedIn (D26); NULL means not yet.
		linkedin_status TEXT CHECK (linkedin_status IN ('requested', 'connected')),
		linkedin_status_at INTEGER,
		linkedin_status_by TEXT NOT NULL DEFAULT '',
		-- Pak or Bu and who said so (D27); NULL means the name's guess, or Bapak/Ibu.
		salutation TEXT CHECK (salutation IN ('pak', 'bu')),
		salutation_source TEXT CHECK (salutation_source IN ('self', 'team', 'research')),
		salutation_note TEXT NOT NULL DEFAULT '',
		-- The name after Pak or Bu when it isn't the first given name (D27).
		call_name TEXT,
		last_event_at INTEGER,
		created_by TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_people_email ON people(email);
	CREATE INDEX IF NOT EXISTS idx_people_phone ON people(phone);
	CREATE INDEX IF NOT EXISTS idx_people_linkedin ON people(linkedin);
	CREATE INDEX IF NOT EXISTS idx_people_company ON people(company_id);`,

	checkins: checkinsTable('checkins') + CHECKINS_INDEXES,

	// One person on one event, from first sighting to the door. While person_id is NULL the
	// row is a "found" snapshot that hasn't entered the pool yet (D6).
	event_people: `
	CREATE TABLE IF NOT EXISTS event_people (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
		company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
		name TEXT,
		job_title TEXT,
		email TEXT,
		phone TEXT,
		linkedin TEXT,
		source_url TEXT,
		reason TEXT,
		extra TEXT,
		stage TEXT NOT NULL
			CHECK (stage IN ('found', 'shortlisted', 'invited', 'replied', 'confirmed', 'checked_in')),
		skipped_at INTEGER,
		skipped_by TEXT,
		source TEXT NOT NULL CHECK (source IN
			('typed', 'paste', 'd365', 'pool', 'research', 'self_registered', 'walk_in', 'copied')),
		reply TEXT NOT NULL DEFAULT 'pending' CHECK (reply IN ('pending', 'yes', 'maybe', 'no')),
		replied_at INTEGER,
		invited_at INTEGER,
		invited_via TEXT CHECK (invited_via IN ('whatsapp', 'email', 'linkedin', 'other')),
		last_contacted_at INTEGER,
		confirmed_at INTEGER,
		confirmed_via TEXT CHECK (confirmed_via IN ('registration', 'reconfirm')),
		checkin_id INTEGER REFERENCES checkins(id) ON DELETE SET NULL,
		consent_event_at INTEGER,
		consent_share_at INTEGER,
		owner TEXT,
		next_action_at INTEGER,
		next_action_kind TEXT CHECK (next_action_kind IN ('chase', 'reminder')),
		next_action_overridden INTEGER NOT NULL DEFAULT 0,
		needs_review INTEGER NOT NULL DEFAULT 0,
		note TEXT NOT NULL DEFAULT '',
		added_by TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_event_people_stage ON event_people(event_id, stage);
	CREATE INDEX IF NOT EXISTS idx_event_people_person ON event_people(person_id);
	CREATE INDEX IF NOT EXISTS idx_event_people_due ON event_people(event_id, next_action_at);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_event_people_unique
		ON event_people(event_id, person_id) WHERE person_id IS NOT NULL;`,

	event_companies: `
	CREATE TABLE IF NOT EXISTS event_companies (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
		focus TEXT NOT NULL DEFAULT '',
		-- NULL: research when fewer people than the brief asks for are known; 0/1: an explicit tick.
		research INTEGER,
		research_requested_at INTEGER,
		researched_at INTEGER,
		source TEXT CHECK (source IN ('typed', 'copied', 'd365')),
		created_at INTEGER NOT NULL,
		UNIQUE (event_id, company_id)
	);`,

	touches: `
	CREATE TABLE IF NOT EXISTS touches (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_person_id INTEGER NOT NULL REFERENCES event_people(id) ON DELETE CASCADE,
		kind TEXT NOT NULL CHECK (kind IN ('invitation', 'chase', 'reminder', 'thanks_yes',
			'followup_maybe', 'thanks_no', 'legacy_notice', 'manual')),
		via TEXT NOT NULL CHECK (via IN ('whatsapp', 'email', 'linkedin', 'other')),
		at INTEGER NOT NULL,
		by TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX IF NOT EXISTS idx_touches_row ON touches(event_person_id, at);`,

	// Plain SHA-256 of the normalised value, so the list survives a SESSION_SECRET change.
	// name_company rows also keep the name's own hash, so a company rename can re-hash them.
	do_not_contact: `
	CREATE TABLE IF NOT EXISTS do_not_contact (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		kind TEXT NOT NULL CHECK (kind IN ('email', 'phone', 'name_company')),
		hash TEXT NOT NULL,
		name_hash TEXT,
		company_key TEXT,
		label TEXT NOT NULL,
		reason TEXT NOT NULL DEFAULT '',
		source TEXT NOT NULL CHECK (source IN ('staff', 'stop_reply', 'not_me', 'remove_me')),
		by TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL,
		removed_at INTEGER,
		removed_by TEXT,
		removed_reason TEXT,
		UNIQUE (kind, hash)
	);`,

	message_templates: `
	CREATE TABLE IF NOT EXISTS message_templates (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		kind TEXT NOT NULL CHECK (kind IN ('invitation', 'chase', 'reminder', 'thanks_yes',
			'followup_maybe', 'thanks_no', 'legacy_notice')),
		language TEXT NOT NULL CHECK (language IN ('id', 'en', 'ms')),
		body TEXT NOT NULL,
		updated_at INTEGER NOT NULL,
		updated_by TEXT NOT NULL DEFAULT '',
		UNIQUE (kind, language)
	);`,

	// Ids and counts only: this table is shown in the app and must never carry a name.
	activity_log: `
	CREATE TABLE IF NOT EXISTS activity_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
		kind TEXT NOT NULL CHECK (kind IN
			('export', 'delete', 'purge', 'import', 'merge', 'bulk', 'lock', 'unlock')),
		who TEXT NOT NULL DEFAULT '',
		at INTEGER NOT NULL,
		what TEXT NOT NULL DEFAULT '{}',
		row_count INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX IF NOT EXISTS idx_activity_event ON activity_log(event_id, at);`,

	// Who an event is for, answered on the planning page; it briefs the research agent.
	invite_briefs: `
	CREATE TABLE IF NOT EXISTS invite_briefs (
		event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
		goal TEXT NOT NULL DEFAULT '',
		roles TEXT NOT NULL DEFAULT '',
		seniority TEXT NOT NULL DEFAULT '[]',
		departments TEXT NOT NULL DEFAULT '[]',
		per_company INTEGER NOT NULL DEFAULT 3,
		avoid TEXT NOT NULL DEFAULT '',
		updated_at INTEGER NOT NULL
	);`,

	// Bearer tokens for the research API. Only a hash is kept; the token is shown once.
	api_tokens: `
	CREATE TABLE IF NOT EXISTS api_tokens (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		label TEXT NOT NULL,
		hash TEXT NOT NULL UNIQUE,
		created_at INTEGER NOT NULL,
		last_used_at INTEGER,
		revoked_at INTEGER
	);`
};

/** The current schema, and nothing older: migrate() brings earlier databases up to it. */
export const SCHEMA = Object.values(TABLES).join('\n');

export function tableExists(db: DB, name: string): boolean {
	return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}
