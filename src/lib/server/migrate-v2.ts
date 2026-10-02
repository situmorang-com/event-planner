import { existsSync, unlinkSync } from 'node:fs';
import { companyKey, nameKey } from '../invitations.ts';
import type { DB, MigrateOptions } from './database.ts';
import { shortId } from './ids.ts';
import { matchArrivals } from './match-arrivals.ts';
import {
	countryFromPhone,
	countryFromTimezone,
	createPerson,
	findPerson,
	mergeEventRows,
	updatePerson,
	type RowForMerge
} from './people.ts';
import { CHECKINS_INDEXES, checkinsTable, TABLES, tableExists } from './schema.ts';
import {
	CHASE_DEFAULTS,
	setChaseDefaults,
	setPhoneCountryDefault,
	setSchemaVersion
} from './settings.ts';

/*
 * Version 1 → 2 (§2.4): contacts become people, the guest list and suggestions become event
 * rows, target companies become event companies. checkins.contact_id references contacts with
 * ON DELETE CASCADE, so the table is rebuilt the way SQLite documents it: foreign keys off
 * outside the transaction, a new table beside the old, copy, drop, rename, then
 * foreign_key_check before the commit. A failure rolls everything back and the previous image
 * still runs on the file; the .pre-v2 copy is there if someone must roll back after a success.
 */

/** The spelling a company was written in most often; a tie goes to the one seen first. */
export function mostCommon(spellings: Map<string, number>): string {
	let best = '';
	let count = 0;
	for (const [spelling, n] of spellings) if (n > count) [best, count] = [spelling, n];
	return best;
}

type Contact = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	company: string;
	job_title: string;
	created_at: number;
	updated_at: number;
};

type Invitation = {
	id: number;
	event_id: string;
	name: string;
	company: string;
	job_title: string;
	email: string | null;
	phone: string | null;
	linkedin: string | null;
	reply: 'pending' | 'yes' | 'maybe' | 'no';
	note: string;
	replied_at: number | null;
	created_at: number;
	updated_at: number;
};

type Suggestion = {
	id: number;
	event_id: string;
	company: string;
	name: string;
	job_title: string;
	linkedin: string | null;
	source_url: string;
	reason: string;
	status: 'new' | 'added' | 'dismissed';
	created_at: number;
	decided_at: number | null;
};

const EVENT_COLUMNS: [string, string][] = [
	['ends_at', 'INTEGER'],
	['target_count', 'INTEGER'],
	['phone_country', `TEXT NOT NULL DEFAULT 'ID' CHECK (phone_country IN ('ID', 'MY'))`],
	['language', `TEXT CHECK (language IN ('id', 'en', 'ms'))`],
	['co_hosts', `TEXT NOT NULL DEFAULT ''`],
	['invitation_text', 'TEXT'],
	['chase_rules', 'TEXT'],
	['started_job_at', 'INTEGER'],
	['planning_purged_at', 'INTEGER']
];

function hasColumn(db: DB, table: string, column: string) {
	return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
		(c) => c.name === column
	);
}

/** A file copy beside the database: restoring it is the rollback. */
function backup(db: DB) {
	if (db.memory) return;
	const path = `${db.name}.pre-v2`;
	// A copy left by an earlier attempt holds the same version-1 data, so it is replaced.
	if (existsSync(path)) unlinkSync(path);
	db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
}

export function migrateToV2(db: DB, { phoneCountry = 'ID' }: MigrateOptions) {
	if (!tableExists(db, 'contacts')) return;
	backup(db);
	db.pragma('foreign_keys = OFF');
	try {
		db.transaction(() => {
			const now = Date.now();
			for (const [column, type] of EVENT_COLUMNS)
				if (!hasColumn(db, 'events', column))
					db.exec(`ALTER TABLE events ADD COLUMN ${column} ${type}`);
			db.prepare(`UPDATE events SET phone_country = ?`).run(phoneCountry);
			// Guest lists created before the LinkedIn column existed.
			if (!hasColumn(db, 'invitations', 'linkedin'))
				db.exec(`ALTER TABLE invitations ADD COLUMN linkedin TEXT`);

			db.exec(TABLES.companies);
			db.exec(TABLES.people);

			// 1. Companies: one per key, named by the most common spelling.
			const spellings = new Map<string, Map<string, number>>();
			const websites = new Map<string, string>();
			const remember = (name: string, website = '') => {
				const key = companyKey(name);
				if (!key) return;
				const m = spellings.get(key) ?? new Map<string, number>();
				m.set(name, (m.get(name) ?? 0) + 1);
				spellings.set(key, m);
				if (website && !websites.get(key)) websites.set(key, website);
			};
			for (const { company } of db.prepare(`SELECT company FROM contacts`).all() as {
				company: string;
			}[])
				remember(company);
			for (const { company } of db.prepare(`SELECT company FROM invitations`).all() as {
				company: string;
			}[])
				remember(company);
			for (const { company } of db.prepare(`SELECT company FROM suggestions`).all() as {
				company: string;
			}[])
				remember(company);
			for (const { name, website } of db
				.prepare(`SELECT name, website FROM target_companies`)
				.all() as { name: string; website: string }[])
				remember(name, website);
			const companyIds = new Map<string, string>();
			const insertCompany = db.prepare(
				`INSERT INTO companies (id, name, key, website, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)`
			);
			for (const [key, m] of spellings) {
				const id = shortId();
				insertCompany.run(id, mostCommon(m), key, websites.get(key) ?? '', now, now);
				companyIds.set(key, id);
			}
			const companyId = (name: string) => companyIds.get(companyKey(name)) ?? null;

			// 2. People from contacts, keeping ids so ea_me cookies still work.
			const insertPerson = db.prepare(
				`INSERT INTO people (id, name, job_title, email, phone, company_id, origin, country,
					last_event_at, created_at, updated_at)
				VALUES (@id, @name, @jobTitle, @email, @phone, @companyId, @origin, @country,
					@lastEventAt, @createdAt, @updatedAt)`
			);
			const attendance = db.prepare(
				`SELECT SUM(c.method <> 'staff') AS self, MAX(c.checked_in_at) AS last,
					(SELECT e.timezone FROM checkins c2 JOIN events e ON e.id = c2.event_id
						WHERE c2.contact_id = c.contact_id ORDER BY c2.checked_in_at DESC LIMIT 1) AS tz
				FROM checkins c WHERE c.contact_id = ?`
			);
			for (const c of db.prepare(`SELECT * FROM contacts`).all() as Contact[]) {
				const a = attendance.get(c.id) as {
					self: number | null;
					last: number | null;
					tz: string | null;
				};
				insertPerson.run({
					id: c.id,
					name: c.name,
					jobTitle: c.job_title,
					email: c.email,
					phone: c.phone,
					companyId: companyId(c.company),
					origin: a.self ? 'checkin' : 'typed',
					country: countryFromPhone(c.phone) ?? countryFromTimezone(a.tz),
					lastEventAt: a.last,
					createdAt: c.created_at,
					updatedAt: c.updated_at
				});
			}

			// 3. Check-ins now point at people.
			db.exec(checkinsTable('checkins_new'));
			db.exec(
				`INSERT INTO checkins_new (id, event_id, person_id, checked_in_at, method, device, consent_at)
				SELECT id, event_id, contact_id, checked_in_at, method, device, consent_at FROM checkins`
			);
			db.exec(`DROP TABLE checkins`);
			db.exec(`ALTER TABLE checkins_new RENAME TO checkins`);
			db.exec(CHECKINS_INDEXES);

			db.exec(TABLES.event_people);
			db.exec(TABLES.event_companies);
			db.exec(TABLES.touches);
			db.exec(TABLES.do_not_contact);
			db.exec(TABLES.message_templates);
			db.exec(TABLES.activity_log);

			// 4. Guest lists become event rows, paired with their check-ins.
			const createdHere = new Set<string>();
			const rowByKey = new Map<string, number>();
			const insertRow = db.prepare(
				`INSERT INTO event_people (event_id, person_id, company_id, stage, source, reply, replied_at,
					invited_at, invited_via, checkin_id, consent_event_at, note, created_at, updated_at)
				VALUES (@eventId, @personId, @companyId, @stage, 'typed', @reply, @repliedAt, @invitedAt,
					@invitedVia, @checkinId, @consentEventAt, @note, @createdAt, @updatedAt)`
			);
			const rowFor = db.prepare(
				`SELECT id, event_id, stage, reply, replied_at, invited_at, invited_via, last_contacted_at,
					confirmed_at, confirmed_via, checkin_id, consent_event_at, consent_share_at, owner, note,
					needs_review
				FROM event_people WHERE id = ?`
			);
			const existingRow = db.prepare(
				`SELECT id FROM event_people WHERE event_id = ? AND person_id = ?`
			);
			const eventIds = (
				db.prepare(`SELECT DISTINCT event_id FROM invitations ORDER BY event_id`).all() as {
					event_id: string;
				}[]
			).map((r) => r.event_id);
			for (const eventId of eventIds) {
				const invitations = db
					.prepare(`SELECT * FROM invitations WHERE event_id = ? ORDER BY id`)
					.all(eventId) as Invitation[];
				const checkins = db
					.prepare(
						`SELECT c.id AS checkin_id, c.person_id, c.consent_at, p.name, p.email, p.phone,
							COALESCE(co.name, '') AS company
						FROM checkins c JOIN people p ON p.id = c.person_id
							LEFT JOIN companies co ON co.id = p.company_id
						WHERE c.event_id = ?`
					)
					.all(eventId) as {
					checkin_id: number;
					person_id: string;
					consent_at: number | null;
					name: string;
					email: string | null;
					phone: string | null;
					company: string;
				}[];
				const { arrived } = matchArrivals(invitations, checkins);
				for (const inv of invitations) {
					const pair = arrived.get(inv.id);
					const details = {
						name: inv.name,
						jobTitle: inv.job_title,
						email: inv.email,
						phone: inv.phone,
						linkedin: inv.linkedin,
						company: inv.company
					};
					// The check-in's person wins over whoever findPerson would pick.
					const hit = pair ? { id: pair.person_id } : findPerson(db, details, eventId);
					let personId = hit?.id ?? '';
					if (hit) updatePerson(db, personId, details, { origin: 'typed' }, inv.updated_at);
					else {
						personId = createPerson(
							db,
							details,
							{ origin: 'typed', originDetail: 'migrated from guest list' },
							inv.created_at
						);
						createdHere.add(personId);
					}
					const replied = inv.reply !== 'pending';
					const { lastInsertRowid } = insertRow.run({
						eventId,
						// A second invitation for one person is inserted unlinked, then folded in.
						personId: existingRow.get(eventId, personId) ? null : personId,
						companyId: companyId(inv.company),
						stage: pair ? 'checked_in' : replied ? 'replied' : 'shortlisted',
						reply: inv.reply,
						repliedAt: inv.replied_at,
						invitedAt: replied ? inv.replied_at : null,
						invitedVia: replied ? 'other' : null,
						checkinId: pair?.checkin_id ?? null,
						consentEventAt: pair?.consent_at ?? null,
						note: inv.note,
						createdAt: inv.created_at,
						updatedAt: inv.updated_at
					});
					let rowId = Number(lastInsertRowid);
					const survivor = existingRow.get(eventId, personId) as { id: number } | undefined;
					if (survivor && survivor.id !== rowId) {
						mergeEventRows(
							db,
							rowFor.get(survivor.id) as RowForMerge,
							rowFor.get(rowId) as RowForMerge,
							now
						);
						rowId = survivor.id;
					}
					rowByKey.set(`${eventId}:${nameKey(inv.name)}@${companyKey(inv.company)}`, rowId);
				}
			}

			// 5. Suggestions: still-open ones become Found rows; accepted ones mark their row.
			const insertFound = db.prepare(
				`INSERT INTO event_people (event_id, company_id, name, job_title, linkedin, source_url,
					reason, stage, skipped_at, source, created_at, updated_at)
				VALUES (@eventId, @companyId, @name, @jobTitle, @linkedin, @sourceUrl, @reason, 'found',
					@skippedAt, 'research', @createdAt, @updatedAt)`
			);
			for (const s of db.prepare(`SELECT * FROM suggestions ORDER BY id`).all() as Suggestion[]) {
				if (s.status === 'added') {
					const rowId = rowByKey.get(`${s.event_id}:${nameKey(s.name)}@${companyKey(s.company)}`);
					if (!rowId) continue;
					db.prepare(`UPDATE event_people SET source = 'research' WHERE id = ?`).run(rowId);
					const { person_id } = db
						.prepare(`SELECT person_id FROM event_people WHERE id = ?`)
						.get(rowId) as { person_id: string };
					// Never downgrade an attendee or someone typed in earlier (D16).
					if (createdHere.has(person_id))
						db.prepare(
							`UPDATE people SET origin = 'research', source_url = ?, research_reason = ?
							WHERE id = ?`
						).run(s.source_url || null, s.reason || null, person_id);
					continue;
				}
				insertFound.run({
					eventId: s.event_id,
					companyId: companyId(s.company),
					name: s.name,
					jobTitle: s.job_title,
					linkedin: s.linkedin,
					sourceUrl: s.source_url || null,
					reason: s.reason || null,
					skippedAt: s.status === 'dismissed' ? (s.decided_at ?? now) : null,
					createdAt: s.created_at,
					updatedAt: s.decided_at ?? s.created_at
				});
			}

			// 6. Target companies.
			const insertTarget = db.prepare(
				`INSERT OR IGNORE INTO event_companies (event_id, company_id, focus, source, created_at)
				VALUES (?, ?, ?, 'typed', ?)`
			);
			for (const t of db.prepare(`SELECT * FROM target_companies ORDER BY id`).all() as {
				event_id: string;
				name: string;
				focus: string;
				created_at: number;
			}[]) {
				const id = companyId(t.name);
				if (id) insertTarget.run(t.event_id, id, t.focus, t.created_at);
			}

			// last_event_at per D18, now that rows and check-ins both exist.
			db.exec(
				`UPDATE people SET last_event_at = (
					SELECT MAX(t) FROM (
						SELECT MAX(e.starts_at) AS t FROM event_people ep JOIN events e ON e.id = ep.event_id
							WHERE ep.person_id = people.id
						UNION ALL SELECT MAX(checked_in_at) FROM checkins WHERE person_id = people.id
					)
				)`
			);

			// 7. The old tables go; settings get their defaults; the version is the last thing set.
			db.exec(`DROP TABLE invitations; DROP TABLE suggestions; DROP TABLE target_companies;
				DROP TABLE contacts;`);
			setChaseDefaults(db, CHASE_DEFAULTS);
			setPhoneCountryDefault(db, phoneCountry === 'MY' ? 'MY' : 'ID');
			setSchemaVersion(db, 2);

			const problems = db.pragma('foreign_key_check') as unknown[];
			if (problems.length)
				throw new Error(`Migration to schema 2 left ${problems.length} dangling references`);
		})();
	} finally {
		db.pragma('foreign_keys = ON');
	}
}
