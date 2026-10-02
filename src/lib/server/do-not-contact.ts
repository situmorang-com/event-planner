import { createHash } from 'node:crypto';
import { companyKey, nameKey } from '../invitations.ts';
import { logActivity } from './activity-log.ts';
import type { DB } from './database.ts';

export type DncKind = 'email' | 'phone' | 'name_company';
export type DncSource = 'staff' | 'stop_reply' | 'not_me' | 'remove_me';

export interface DncRow {
	id: number;
	kind: DncKind;
	hash: string;
	name_hash: string | null;
	company_key: string | null;
	label: string;
	reason: string;
	source: DncSource;
	by: string;
	created_at: number;
	removed_at: number | null;
	removed_by: string | null;
	removed_reason: string | null;
}

/*
 * Plain SHA-256, unsalted: the list must outlive a SESSION_SECRET change and be checkable
 * against anything pasted later. A name+company entry hashes the name's hash with the company
 * key, so a company rename can re-hash it without ever storing the name.
 */
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const hashEmail = (email: string) => sha(email.trim().toLowerCase());
export const hashPhone = (phone: string) => sha(phone.replace(/[^\d+]/g, ''));
export const hashName = (name: string) => sha(nameKey(name));
export const hashNameCompany = (nameHash: string, key: string) => sha(`${nameHash}@${key}`);

export function maskEmail(email: string): string {
	// Masked the way it is hashed, so the label matches whatever spelling arrives later.
	const [user, domain] = email.trim().toLowerCase().split('@');
	return `${user.slice(0, 1)}***@${domain ?? ''}`;
}

export function maskPhone(phone: string): string {
	const digits = phone.replace(/\D/g, '');
	return `${phone.startsWith('+') ? '+' : ''}${digits.slice(0, 2)}***${digits.slice(-3)}`;
}

export function maskName(name: string, company: string): string {
	const initials = name
		.split(',')[0]
		.trim()
		.split(/\s+/)
		.map((w) => `${w.slice(0, 1).toUpperCase()}***`)
		.join(' ');
	return company ? `${initials} @ ${company}` : initials;
}

export interface Identity {
	email?: string | null;
	phone?: string | null;
	name?: string | null;
	company?: string | null;
}

/** One entry per channel, so a "not me" on email can leave the phone alone. */
export interface EntryInput {
	kind: DncKind;
	value: string;
	/** For name_company: the company as written (may be empty). */
	company?: string;
	reason?: string;
	source: DncSource;
	by?: string;
}

function hashes(input: EntryInput) {
	switch (input.kind) {
		case 'email':
			return { hash: hashEmail(input.value), name_hash: null, company_key: null };
		case 'phone':
			return { hash: hashPhone(input.value), name_hash: null, company_key: null };
		case 'name_company': {
			const name_hash = hashName(input.value);
			const company_key = companyKey(input.company ?? '');
			return { hash: hashNameCompany(name_hash, company_key), name_hash, company_key };
		}
	}
}

function label(input: EntryInput) {
	switch (input.kind) {
		case 'email':
			return maskEmail(input.value);
		case 'phone':
			return maskPhone(input.value);
		case 'name_company':
			return maskName(input.value, input.company ?? '');
	}
}

/** Adds (or revives) an entry. Returns its id, or null when there was nothing to hash. */
export function addEntry(db: DB, input: EntryInput, now = Date.now()): number | null {
	const value = input.value.trim();
	if (!value || (input.kind === 'name_company' && !nameKey(value))) return null;
	const h = hashes({ ...input, value });
	const existing = db
		.prepare(`SELECT id FROM do_not_contact WHERE kind = ? AND hash = ?`)
		.get(input.kind, h.hash) as { id: number } | undefined;
	if (existing) {
		db.prepare(
			`UPDATE do_not_contact SET removed_at = NULL, removed_by = NULL, removed_reason = NULL,
				reason = CASE WHEN @reason <> '' THEN @reason ELSE reason END, source = @source, by = @by
			WHERE id = @id`
		).run({
			id: existing.id,
			reason: input.reason ?? '',
			source: input.source,
			by: input.by ?? ''
		});
		return existing.id;
	}
	const { lastInsertRowid } = db
		.prepare(
			`INSERT INTO do_not_contact (kind, hash, name_hash, company_key, label, reason, source, by,
				created_at)
			VALUES (@kind, @hash, @name_hash, @company_key, @label, @reason, @source, @by, @now)`
		)
		.run({
			kind: input.kind,
			...h,
			label: label({ ...input, value }),
			reason: input.reason ?? '',
			source: input.source,
			by: input.by ?? '',
			now
		});
	return Number(lastInsertRowid);
}

/** The live entry that matches any of these details, or null. */
export function check(db: DB, who: Identity): DncRow | null {
	const probes: [DncKind, string][] = [];
	if (who.email) probes.push(['email', hashEmail(who.email)]);
	if (who.phone) probes.push(['phone', hashPhone(who.phone)]);
	if (who.name && nameKey(who.name))
		probes.push([
			'name_company',
			hashNameCompany(hashName(who.name), companyKey(who.company ?? ''))
		]);
	const find = db.prepare(
		`SELECT * FROM do_not_contact WHERE kind = ? AND hash = ? AND removed_at IS NULL`
	);
	for (const [kind, hash] of probes) {
		const row = find.get(kind, hash) as DncRow | undefined;
		if (row) return row;
	}
	return null;
}

export function listEntries(db: DB, includeRemoved = false): DncRow[] {
	return db
		.prepare(
			`SELECT * FROM do_not_contact WHERE @all = 1 OR removed_at IS NULL
			ORDER BY created_at DESC, id DESC`
		)
		.all({ all: includeRemoved ? 1 : 0 }) as DncRow[];
}

type LockedPerson = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	company: string;
};

const PERSON_DETAILS = `SELECT p.id, p.name, p.email, p.phone, COALESCE(co.name, '') AS company
	FROM people p LEFT JOIN companies co ON co.id = p.company_id`;

/**
 * "Don't contact again": every channel the person has is listed, the person is marked locked
 * and their pending actions are dropped. Partial locks (one channel) go through addEntry().
 */
export function lockPerson(
	db: DB,
	personId: string,
	{ reason = '', source, by = '' }: { reason?: string; source: DncSource; by?: string },
	now = Date.now()
): boolean {
	const person = db.prepare(`${PERSON_DETAILS} WHERE p.id = ?`).get(personId) as
		LockedPerson | undefined;
	if (!person) return false;
	db.transaction(() => {
		if (person.email) addEntry(db, { kind: 'email', value: person.email, reason, source, by }, now);
		if (person.phone) addEntry(db, { kind: 'phone', value: person.phone, reason, source, by }, now);
		addEntry(
			db,
			{ kind: 'name_company', value: person.name, company: person.company, reason, source, by },
			now
		);
		markLocked(db, personId, reason, now);
		logActivity(db, { kind: 'lock', who: by, what: { personId }, rowCount: 1 }, now);
	})();
	return true;
}

/**
 * An entry typed on the settings page. Anyone in the pool it matches is locked straight away,
 * so the list and the markers never disagree; the activity log gets ids and a count only.
 */
export function blockByHand(
	db: DB,
	input: Omit<EntryInput, 'source'>,
	now = Date.now()
): { id: number; locked: number } | null {
	return db.transaction(() => {
		const id = addEntry(db, { ...input, source: 'staff' }, now);
		if (id === null) return null;
		const reason = input.reason ?? '';
		const people = db
			.prepare(`${PERSON_DETAILS} WHERE p.locked_at IS NULL`)
			.all() as LockedPerson[];
		const hit = people.filter((p) => check(db, p)?.id === id);
		for (const p of hit) markLocked(db, p.id, reason, now);
		logActivity(
			db,
			{
				kind: 'lock',
				who: input.by,
				what: { entryId: id, kind: input.kind },
				rowCount: hit.length
			},
			now
		);
		return { id, locked: hit.length };
	})();
}

/** Mirrors a do-not-contact hit onto the person and clears whatever was due for them. */
export function markLocked(db: DB, personId: string, reason: string, now = Date.now()) {
	db.prepare(
		`UPDATE people SET locked_at = COALESCE(locked_at, @now), lock_reason = @reason,
			updated_at = @now WHERE id = @id`
	).run({ id: personId, reason, now });
	db.prepare(
		`UPDATE event_people SET next_action_at = NULL, next_action_kind = NULL, updated_at = ?
		WHERE person_id = ?`
	).run(now, personId);
}

/** Staff removal of an erroneous entry, with a reason. People it alone locked are unlocked. */
export function removeEntry(
	db: DB,
	id: number,
	{ by = '', reason }: { by?: string; reason: string },
	now = Date.now()
): boolean {
	const entry = db
		.prepare(`SELECT * FROM do_not_contact WHERE id = ? AND removed_at IS NULL`)
		.get(id) as DncRow | undefined;
	if (!entry) return false;
	db.transaction(() => {
		db.prepare(
			`UPDATE do_not_contact SET removed_at = ?, removed_by = ?, removed_reason = ? WHERE id = ?`
		).run(now, by, reason, id);
		const locked = db
			.prepare(`${PERSON_DETAILS} WHERE p.locked_at IS NOT NULL`)
			.all() as LockedPerson[];
		const unlock = db.prepare(
			`UPDATE people SET locked_at = NULL, lock_reason = NULL, updated_at = ? WHERE id = ?`
		);
		for (const p of locked) if (!check(db, p)) unlock.run(now, p.id);
		logActivity(db, { kind: 'unlock', who: by, what: { entryId: id, reason }, rowCount: 1 }, now);
	})();
	return true;
}

/** After a company rename or merge: name+company entries follow the company to its new key. */
export function rehashCompany(db: DB, fromKey: string, toKey: string) {
	if (fromKey === toKey) return;
	const rows = db
		.prepare(
			`SELECT id, name_hash FROM do_not_contact WHERE kind = 'name_company' AND company_key = ?`
		)
		.all(fromKey) as { id: number; name_hash: string }[];
	// OR REPLACE: an entry that already exists under the new key wins over the re-hashed one.
	const update = db.prepare(
		`UPDATE OR REPLACE do_not_contact SET hash = ?, company_key = ? WHERE id = ?`
	);
	for (const r of rows) update.run(hashNameCompany(r.name_hash, toKey), toKey, r.id);
}
