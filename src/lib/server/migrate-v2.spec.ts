import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listAttendees } from './checkins';
import { migrate, SCHEMA_VERSION, type DB } from './database';
import { countLive, listEventPeople } from './event-people';
import { getPerson } from './people';
import { listTargets } from './planning';
import { consentBoxesSince, schemaVersion } from './settings';

// The version-1 schema as shipped at main@0dba76a (src/lib/server/database.ts), so this test
// keeps building the database the migration must take over.
const SCHEMA_V1 = `
	CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS events (
		id TEXT PRIMARY KEY, name TEXT NOT NULL, venue TEXT NOT NULL DEFAULT '', starts_at INTEGER,
		timezone TEXT NOT NULL DEFAULT 'UTC',
		qr_mode TEXT NOT NULL DEFAULT 'rotating' CHECK (qr_mode IN ('rotating', 'static')),
		is_open INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
	);
	CREATE TABLE IF NOT EXISTS contacts (
		id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT,
		company TEXT NOT NULL DEFAULT '', job_title TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
	CREATE TABLE IF NOT EXISTS checkins (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
		checked_in_at INTEGER NOT NULL, method TEXT NOT NULL, device TEXT NOT NULL, consent_at INTEGER,
		UNIQUE (event_id, contact_id)
	);
	CREATE INDEX IF NOT EXISTS idx_checkins_event ON checkins(event_id, checked_in_at);
	CREATE INDEX IF NOT EXISTS idx_checkins_contact ON checkins(contact_id);
	CREATE TABLE IF NOT EXISTS invitations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', job_title TEXT NOT NULL DEFAULT '',
		email TEXT, phone TEXT, linkedin TEXT,
		reply TEXT NOT NULL DEFAULT 'pending' CHECK (reply IN ('pending', 'yes', 'maybe', 'no')),
		note TEXT NOT NULL DEFAULT '', replied_at INTEGER, created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_invitations_event ON invitations(event_id);
	CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
	CREATE TABLE IF NOT EXISTS invite_briefs (
		event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
		goal TEXT NOT NULL DEFAULT '', roles TEXT NOT NULL DEFAULT '', seniority TEXT NOT NULL DEFAULT '[]',
		departments TEXT NOT NULL DEFAULT '[]', per_company INTEGER NOT NULL DEFAULT 3,
		avoid TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
	);
	CREATE TABLE IF NOT EXISTS target_companies (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		name TEXT NOT NULL, website TEXT NOT NULL DEFAULT '', focus TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_targets_event ON target_companies(event_id);
	CREATE TABLE IF NOT EXISTS suggestions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		company TEXT NOT NULL, name TEXT NOT NULL, job_title TEXT NOT NULL DEFAULT '', linkedin TEXT,
		source_url TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'added', 'dismissed')),
		created_at INTEGER NOT NULL, decided_at INTEGER
	);
	CREATE INDEX IF NOT EXISTS idx_suggestions_event ON suggestions(event_id, status);
	CREATE TABLE IF NOT EXISTS api_tokens (
		id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, hash TEXT NOT NULL UNIQUE,
		created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER
	);
`;

const countTemplates = (db: DB) =>
	(db.prepare(`SELECT COUNT(*) AS n FROM message_templates`).get() as { n: number }).n;

const T0 = Date.UTC(2026, 5, 1);
const DAY = 86_400_000;

/** An empty version-1 database. */
function bareV1(): DB {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	db.exec(SCHEMA_V1);
	db.prepare(`INSERT INTO settings (key, value) VALUES ('secret', 'abc')`).run();
	return db;
}

const INSERT_EVENT = `INSERT INTO events (id, name, venue, starts_at, timezone, qr_mode, is_open,
	created_at) VALUES (?, ?, '', ?, 'Asia/Jakarta', 'static', 1, ?)`;
const INSERT_CONTACT = `INSERT INTO contacts (id, name, email, phone, company, job_title, created_at,
	updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
const INSERT_CHECKIN = `INSERT INTO checkins (event_id, contact_id, checked_in_at, method, device,
	consent_at) VALUES (?, ?, ?, 'form', 'ios', ?)`;
const INSERT_INVITE = `INSERT INTO invitations (event_id, name, company, job_title, email, phone,
	reply, replied_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** A production-shaped version-1 database: a past event with a guest list, an upcoming one. */
function buildV1(path = ':memory:'): DB {
	const db = new Database(path);
	db.pragma('foreign_keys = ON');
	db.exec(SCHEMA_V1);
	db.prepare(`INSERT INTO settings (key, value) VALUES ('secret', 'abc')`).run();
	const event = db.prepare(
		`INSERT INTO events (id, name, venue, starts_at, timezone, qr_mode, is_open, created_at)
		VALUES (?, ?, ?, ?, ?, 'static', 1, ?)`
	);
	event.run('past', 'Partner Summit', 'Jakarta', T0, 'Asia/Jakarta', T0 - 30 * DAY);
	event.run('next', 'Customer Dinner', 'KL', T0 + 60 * DAY, 'Asia/Kuala_Lumpur', T0);

	const contact = db.prepare(
		`INSERT INTO contacts (id, name, email, phone, company, job_title, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	);
	contact.run(
		'c-rina',
		'Rina Wijaya',
		'rina@batavia.co.id',
		'+6281234567890',
		'Batavia Foods',
		'CFO',
		T0,
		T0
	);
	contact.run('c-hendra', 'Hendra Gunawan', null, '+6281111111111', 'PT Batavia Foods', '', T0, T0);
	contact.run('c-dewi', 'Dewi Lestari', 'dewi@selat.my', null, 'Selat Energy', 'CIO', T0, T0);
	contact.run('c-budi', 'Budi Santoso', 'budi@kopi.id', null, 'Kopi Kita', '', T0 - 200 * DAY, T0);

	const checkin = db.prepare(
		`INSERT INTO checkins (event_id, contact_id, checked_in_at, method, device, consent_at)
		VALUES (?, ?, ?, ?, ?, ?)`
	);
	checkin.run('past', 'c-rina', T0 + 1_000, 'form', 'ios', T0 + 1_000);
	checkin.run('past', 'c-hendra', T0 + 2_000, 'staff', 'other', null);
	checkin.run('past', 'c-dewi', T0 + 3_000, 'picker', 'android', T0 + 3_000);

	const invite = db.prepare(
		`INSERT INTO invitations (event_id, name, company, job_title, email, phone, linkedin, reply, note,
			replied_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	const added = T0 - 20 * DAY;
	invite.run(
		'past',
		'Rina Wijaya',
		'Batavia Foods',
		'',
		'rina@batavia.co.id',
		null,
		null,
		'yes',
		'',
		added + DAY,
		added,
		added + DAY
	);
	invite.run(
		'past',
		'Bapak Hendra Gunawan',
		'Batavia Foods',
		'IT Manager',
		null,
		null,
		null,
		'pending',
		'',
		null,
		added,
		added
	);
	invite.run(
		'past',
		'Andi Pratama',
		'Batavia Foods',
		'COO',
		null,
		null,
		'https://www.linkedin.com/in/andi-p',
		'no',
		'Overseas',
		added + 2 * DAY,
		added,
		added + 2 * DAY
	);
	invite.run(
		'past',
		'Siti Aminah',
		'Kopi Kita',
		'',
		null,
		null,
		null,
		'pending',
		'A',
		null,
		added,
		added
	);
	invite.run(
		'past',
		'Ibu Siti Aminah',
		'PT Kopi Kita',
		'CFO',
		'siti@kopi.id',
		null,
		null,
		'yes',
		'B',
		added + 3 * DAY,
		added,
		added + 3 * DAY
	);
	invite.run(
		'next',
		'Budi Santoso',
		'Kopi Kita',
		'',
		null,
		null,
		null,
		'maybe',
		'',
		T0 + DAY,
		T0,
		T0 + DAY
	);

	const suggest = db.prepare(
		`INSERT INTO suggestions (event_id, company, name, job_title, linkedin, source_url, reason, status,
			created_at, decided_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	suggest.run(
		'past',
		'Batavia Foods',
		'Andi Pratama',
		'COO',
		null,
		'https://batavia.co.id/team',
		'Runs ops.',
		'added',
		added - DAY,
		added
	);
	suggest.run(
		'past',
		'Batavia Foods',
		'Rina Wijaya',
		'CFO',
		null,
		'https://batavia.co.id/team',
		'Finance.',
		'added',
		added - DAY,
		added
	);
	suggest.run(
		'past',
		'Selat Energy',
		'Kevin Tan',
		'CTO',
		'https://www.linkedin.com/in/kevin-tan',
		'https://selat.my/leadership',
		'Tech lead.',
		'new',
		added,
		null
	);
	suggest.run(
		'past',
		'Selat Energy',
		'Maya Anggraini',
		'CMO',
		null,
		'',
		'Marketing.',
		'dismissed',
		added,
		added + DAY
	);

	const target = db.prepare(
		`INSERT INTO target_companies (event_id, name, website, focus, created_at) VALUES (?, ?, ?, ?, ?)`
	);
	target.run('past', 'PT Batavia Foods Tbk', 'bataviafoods.co.id', 'finance team', added);
	target.run('past', 'Selat Energy', '', '', added);
	db.prepare(`INSERT INTO api_tokens (label, hash, created_at) VALUES ('mac', 'h', ?)`).run(T0);
	return db;
}

const tables = (db: DB) =>
	(
		db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as {
			name: string;
		}[]
	).map((t) => t.name);

describe('migration to schema version 2', () => {
	let dir: string | null = null;
	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = null;
	});

	it('moves everything over without losing a check-in', () => {
		const db = buildV1();
		const before = db.prepare(`SELECT COUNT(*) AS n FROM checkins`).get() as { n: number };
		migrate(db, { phoneCountry: 'MY' });

		expect(db.pragma('foreign_key_check')).toEqual([]);
		// Step 2 rebuilds the tables; step 3 then seeds the message templates (§7).
		expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
		expect(countTemplates(db)).toBe(21);
		expect(tables(db)).not.toContain('contacts');
		expect(tables(db)).not.toContain('invitations');
		expect(tables(db)).not.toContain('suggestions');
		expect(tables(db)).not.toContain('target_companies');
		expect(db.prepare(`SELECT COUNT(*) AS n FROM checkins`).get()).toEqual(before);
		expect(db.prepare(`SELECT phone_country FROM events WHERE id = 'past'`).get()).toEqual({
			phone_country: 'MY'
		});
		expect(db.prepare(`SELECT COUNT(*) AS n FROM api_tokens`).get()).toEqual({ n: 1 });

		// Step 2: people keep their ids; origin and country follow their check-ins.
		expect(getPerson(db, 'c-rina')).toMatchObject({
			origin: 'checkin',
			country: 'ID',
			company: 'Batavia Foods'
		});
		expect(getPerson(db, 'c-hendra')).toMatchObject({ origin: 'typed', country: 'ID' });
		expect(getPerson(db, 'c-dewi')).toMatchObject({
			origin: 'checkin',
			country: 'ID',
			last_event_at: T0 + 3_000
		});
		expect(getPerson(db, 'c-budi')).toMatchObject({ origin: 'typed', country: null });
		expect(
			listAttendees(db, 'past')
				.map((a) => a.person_id)
				.sort()
		).toEqual(['c-dewi', 'c-hendra', 'c-rina']);

		// Step 4: the guest list, paired with check-ins, stages and invited_at backfilled.
		const rows = listEventPeople(db, 'past');
		const byName = (name: string) => rows.find((r) => r.name === name)!;
		expect(byName('Rina Wijaya')).toMatchObject({
			person_id: 'c-rina',
			stage: 'checked_in',
			reply: 'yes',
			checkin_id: 1,
			consent_event_at: T0 + 1_000,
			invited_at: T0 - 19 * DAY,
			invited_via: 'other'
		});
		// Typed over typed, the newer record wins (§3): the contact was saved after the guest
		// list, so its spelling stays and the invitation only fills the blank title.
		expect(rows.find((r) => r.person_id === 'c-hendra')).toMatchObject({
			name: 'Hendra Gunawan',
			source: 'typed',
			stage: 'checked_in',
			checkin_id: 2,
			consent_event_at: null,
			job_title: 'IT Manager'
		});
		expect(getPerson(db, 'c-hendra')?.updated_at).toBe(T0);
		// Checked in without ever being on the list: a walk-in row, as the live app writes it.
		expect(rows.find((r) => r.person_id === 'c-dewi')).toMatchObject({
			stage: 'checked_in',
			source: 'walk_in',
			checkin_id: 3,
			consent_event_at: T0 + 3_000,
			reply: 'pending',
			created_at: T0 + 3_000
		});
		expect(byName('Andi Pratama')).toMatchObject({
			stage: 'replied',
			reply: 'no',
			invited_at: T0 - 18 * DAY,
			invited_via: 'other',
			note: 'Overseas',
			linkedin: 'https://www.linkedin.com/in/andi-p'
		});
		// Two invitations for one person on one event: the reply survives, notes join.
		const siti = rows.filter((r) => r.name.includes('Siti'));
		expect(siti).toHaveLength(1);
		expect(siti[0]).toMatchObject({
			stage: 'replied',
			reply: 'yes',
			note: 'A · B',
			email: 'siti@kopi.id'
		});
		expect(getPerson(db, siti[0].person_id!)).toMatchObject({
			origin: 'typed',
			origin_detail: 'migrated from guest list'
		});
		expect(listEventPeople(db, 'next')[0]).toMatchObject({
			person_id: 'c-budi',
			stage: 'replied',
			reply: 'maybe'
		});

		// Step 5: the research-origin rule.
		expect(byName('Andi Pratama').source).toBe('research');
		expect(getPerson(db, byName('Andi Pratama').person_id!)).toMatchObject({
			origin: 'research',
			source_url: 'https://batavia.co.id/team'
		});
		expect(byName('Rina Wijaya').source).toBe('research');
		expect(getPerson(db, 'c-rina')?.origin).toBe('checkin');
		expect(byName('Kevin Tan')).toMatchObject({
			stage: 'found',
			person_id: null,
			source: 'research',
			skipped_at: null,
			company: 'Selat Energy',
			linkedin: 'https://www.linkedin.com/in/kevin-tan'
		});
		expect(byName('Maya Anggraini')).toMatchObject({ stage: 'found', skipped_at: T0 - 19 * DAY });
		expect(rows).toHaveLength(7);
		expect(countLive(db, 'past')).toBe(5);

		// Steps 1 and 6: companies by most common spelling, targets with their website.
		expect(listTargets(db, 'past').map((t) => [t.name, t.website, t.focus])).toEqual([
			['Batavia Foods', 'bataviafoods.co.id', 'finance team'],
			['Selat Energy', '', '']
		]);
		expect(
			db.prepare(`SELECT value FROM settings WHERE key = 'phone_country_default'`).get()
		).toEqual({
			value: 'MY'
		});
		// Version 4 stamps when the consent boxes shipped, so "legacy" has a date (§2.4 step 9).
		expect(consentBoxesSince(db)).not.toBeNull();
	});

	it('gives a fresh database the current version straight away', () => {
		const db = new Database(':memory:');
		migrate(db);
		expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
		expect(consentBoxesSince(db)).not.toBeNull();
		expect(tables(db)).toContain('people');
		expect(countTemplates(db)).toBe(21);
		expect(tables(db)).not.toContain('contacts');
		migrate(db);
		expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
	});

	it('gives every check-in at an event without a guest list a walk-in row', () => {
		const db = bareV1();
		db.prepare(INSERT_EVENT).run('solo', 'Open Day', T0, T0 - DAY);
		db.prepare(INSERT_CONTACT).run('a', 'Ani', 'ani@x.id', null, 'Kopi Kita', '', T0, T0);
		db.prepare(INSERT_CONTACT).run('b', 'Bima', null, '+6281234567890', '', '', T0, T0);
		db.prepare(INSERT_CHECKIN).run('solo', 'a', T0 + 1_000, T0 + 1_000);
		db.prepare(INSERT_CHECKIN).run('solo', 'b', T0 + 2_000, null);
		migrate(db);
		expect(db.pragma('foreign_key_check')).toEqual([]);
		const rows = listEventPeople(db, 'solo');
		expect(
			rows.map((r) => [r.person_id, r.stage, r.source, r.checkin_id, r.consent_event_at])
		).toEqual([
			['a', 'checked_in', 'walk_in', 1, T0 + 1_000],
			['b', 'checked_in', 'walk_in', 2, null]
		]);
		expect(rows[0]).toMatchObject({ company: 'Kopi Kita', created_at: T0 + 1_000 });
		expect(countLive(db, 'solo')).toBe(2);
		expect(getPerson(db, 'a')).toMatchObject({ origin: 'checkin', last_event_at: T0 + 1_000 });
	});

	it('migrates a file from before the planning tables existed', () => {
		const db = bareV1();
		db.exec(`DROP TABLE suggestions; DROP TABLE target_companies; DROP TABLE invite_briefs;
			DROP TABLE api_tokens;`);
		db.prepare(INSERT_EVENT).run('old', 'Breakfast', T0, T0 - DAY);
		db.prepare(INSERT_CONTACT).run('a', 'Ani', 'ani@x.id', null, 'Kopi Kita', '', T0, T0);
		db.prepare(INSERT_CHECKIN).run('old', 'a', T0 + 1_000, T0 + 1_000);
		db.prepare(INSERT_INVITE).run(
			'old',
			'Ani',
			'Kopi Kita',
			'',
			'ani@x.id',
			null,
			'yes',
			T0 - DAY,
			T0 - 2 * DAY,
			T0 - DAY
		);
		migrate(db);
		expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
		expect(tables(db)).not.toContain('suggestions');
		expect(tables(db)).toContain('invite_briefs');
		expect(listEventPeople(db, 'old')).toMatchObject([
			{ person_id: 'a', stage: 'checked_in', reply: 'yes', source: 'typed' }
		]);
	});

	it('keeps an invitee apart from a stranger on a shared address, flagged for review', () => {
		const db = bareV1();
		db.prepare(INSERT_EVENT).run('e', 'Summit', T0, T0 - DAY);
		db.prepare(INSERT_CONTACT).run(
			'rina',
			'Rina Maharani',
			'info@batavia.co.id',
			null,
			'Batavia Foods',
			'',
			T0 - 30 * DAY,
			T0 - 30 * DAY
		);
		db.prepare(INSERT_CHECKIN).run('e', 'rina', T0 + 1_000, T0 + 1_000);
		db.prepare(INSERT_INVITE).run(
			'e',
			'Pak Hendra Gunawan',
			'Batavia Foods',
			'CIO',
			'info@batavia.co.id',
			null,
			'yes',
			T0 - DAY,
			T0 - 2 * DAY,
			T0 - DAY
		);
		db.prepare(INSERT_INVITE).run(
			'e',
			'R. Maharani',
			'Batavia Foods',
			'CFO',
			'info@batavia.co.id',
			null,
			'pending',
			null,
			T0 - 2 * DAY,
			T0 - 2 * DAY
		);
		migrate(db);
		expect(getPerson(db, 'rina')).toMatchObject({ name: 'Rina Maharani', job_title: 'CFO' });
		expect(db.prepare(`SELECT COUNT(*) AS n FROM people`).get()).toEqual({ n: 2 });
		const rows = listEventPeople(db, 'e');
		expect(rows.find((r) => r.person_id === 'rina')).toMatchObject({
			stage: 'checked_in',
			checkin_id: 1,
			needs_review: 0
		});
		expect(rows.find((r) => r.name === 'Pak Hendra Gunawan')).toMatchObject({
			stage: 'replied',
			reply: 'yes',
			needs_review: 1,
			email: 'info@batavia.co.id'
		});
		expect(
			getPerson(db, rows.find((r) => r.name === 'Pak Hendra Gunawan')!.person_id!)
		).toMatchObject({ origin: 'typed', origin_detail: 'migrated from guest list' });
	});

	it('dates a reply whose replied_at was lost, and keeps a first origin across events', () => {
		const db = bareV1();
		db.prepare(INSERT_EVENT).run('a', 'First', T0, T0 - DAY);
		db.prepare(INSERT_EVENT).run('b', 'Second', T0 + 30 * DAY, T0);
		db.prepare(INSERT_INVITE).run(
			'a',
			'Lestari Kusuma',
			'Kopi Kita',
			'',
			'lestari@kopi.id',
			null,
			'maybe',
			null,
			T0 - 2 * DAY,
			T0 - DAY
		);
		db.prepare(INSERT_INVITE).run(
			'b',
			'Lestari Kusuma',
			'Kopi Kita',
			'',
			null,
			null,
			'pending',
			null,
			T0,
			T0
		);
		db.prepare(
			`INSERT INTO suggestions (event_id, company, name, source_url, reason, status, created_at,
				decided_at) VALUES ('b', 'Kopi Kita', 'Lestari Kusuma', 'https://kopi.id/team', 'Ops.',
				'added', ?, ?)`
		).run(T0 - 1_000, T0);
		migrate(db);
		const [first] = listEventPeople(db, 'a');
		expect(first).toMatchObject({
			stage: 'replied',
			reply: 'maybe',
			replied_at: T0 - DAY,
			invited_at: T0 - DAY,
			invited_via: 'other',
			source: 'typed'
		});
		const [second] = listEventPeople(db, 'b');
		expect(second.person_id).toBe(first.person_id);
		expect(second.source).toBe('research');
		expect(getPerson(db, first.person_id!)).toMatchObject({ origin: 'typed', source_url: null });
	});

	it('runs once: a second migrate() changes nothing', () => {
		const db = buildV1();
		migrate(db);
		const snapshot = () => ({
			people: db.prepare(`SELECT * FROM people ORDER BY id`).all(),
			rows: db.prepare(`SELECT * FROM event_people ORDER BY id`).all(),
			checkins: db.prepare(`SELECT * FROM checkins ORDER BY id`).all()
		});
		const first = snapshot();
		migrate(db);
		migrate(db);
		expect(snapshot()).toEqual(first);
		expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
	});

	it('keeps a .pre-v2 copy beside a file database', () => {
		dir = mkdtempSync(join(tmpdir(), 'ep-migrate-'));
		const path = join(dir, 'attendance.db');
		const db = buildV1(path);
		migrate(db);
		db.close();
		expect(existsSync(`${path}.pre-v2`)).toBe(true);
		const copy = new Database(`${path}.pre-v2`, { readonly: true });
		expect(tables(copy)).toContain('contacts');
		expect(copy.prepare(`SELECT COUNT(*) AS n FROM invitations`).get()).toEqual({ n: 6 });
		copy.close();
	});

	it('leaves the old tables untouched when a step fails', () => {
		const db = buildV1();
		// A guest list row pointing at a deleted event: the rebuilt tables would dangle.
		db.pragma('foreign_keys = OFF');
		db.prepare(
			`INSERT INTO invitations (event_id, name, created_at, updated_at) VALUES ('gone', 'X', 1, 1)`
		).run();
		db.pragma('foreign_keys = ON');
		expect(() => migrate(db)).toThrow(/dangling/);
		expect(tables(db)).toContain('contacts');
		expect(tables(db)).toContain('invitations');
		expect(tables(db)).not.toContain('people');
		expect(schemaVersion(db)).toBeNull();
		expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
	});
});
