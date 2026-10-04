import { companyKey, nameKey } from '../invitations.ts';
import { CHIPS, chipCounts, matchesChip, type Chip, type ChipRow, type Source } from '../people.ts';
import { logActivity } from './activity-log.ts';
import { ensureCompany, findCompany, isBlocked, noteCompanyOwner } from './companies.ts';
import type { DB } from './database.ts';
import { addEntry, check as doNotContact, lockPerson, type DncSource } from './do-not-contact.ts';
import {
	createPerson,
	findPerson,
	getPerson,
	touchLastEvent,
	updatePerson,
	type Origin,
	type PersonRow
} from './people.ts';
import type { Country } from './settings.ts';
import {
	applyChange,
	type ConfirmedVia,
	type Reply,
	type Stage,
	type Touch,
	type TouchKind,
	type Via
} from './stages.ts';

export type { Source };

/** One person on one event, with the person's current details (or the snapshot while found). */
export interface EventPersonRow {
	id: number;
	event_id: string;
	person_id: string | null;
	company_id: string | null;
	name: string;
	job_title: string;
	email: string | null;
	phone: string | null;
	linkedin: string | null;
	company: string;
	company_key: string;
	/** The company's own phone country (D14); null follows the event. */
	company_phone_country: Country | null;
	source_url: string | null;
	reason: string | null;
	/** JSON while found: D365 flags, owner note, is_customer. */
	extra: string | null;
	stage: Stage;
	skipped_at: number | null;
	skipped_by: string | null;
	source: Source;
	reply: Reply;
	replied_at: number | null;
	invited_at: number | null;
	invited_via: Via | null;
	last_contacted_at: number | null;
	confirmed_at: number | null;
	confirmed_via: ConfirmedVia | null;
	checkin_id: number | null;
	checked_in_at: number | null;
	consent_event_at: number | null;
	consent_share_at: number | null;
	owner: string | null;
	company_owner: string | null;
	next_action_at: number | null;
	next_action_kind: 'chase' | 'reminder' | null;
	next_action_overridden: 0 | 1;
	needs_review: 0 | 1;
	note: string;
	added_by: string;
	created_at: number;
	updated_at: number;
	/** From the person; null while found. */
	origin: Origin | null;
	locked_at: number | null;
	d365_suppressed: 0 | 1 | null;
	d365_no_email: 0 | 1 | null;
	d365_no_phone: 0 | 1 | null;
	is_customer: 0 | 1 | null;
	consent_future_at: number | null;
	country: Country | null;
	person_created_at: number | null;
	blocked_at: number | null;
	blocked_reason: string | null;
	touch_count: number;
	chase_count: number;
}

const ROW_SELECT = `SELECT ep.id, ep.event_id, ep.person_id,
	COALESCE(p.company_id, ep.company_id) AS company_id,
	COALESCE(p.name, ep.name, '') AS name,
	COALESCE(p.job_title, ep.job_title, '') AS job_title,
	COALESCE(p.email, ep.email) AS email,
	COALESCE(p.phone, ep.phone) AS phone,
	COALESCE(p.linkedin, ep.linkedin) AS linkedin,
	COALESCE(pco.name, rco.name, '') AS company,
	COALESCE(pco.key, rco.key, '') AS company_key,
	COALESCE(pco.phone_country, rco.phone_country) AS company_phone_country,
	COALESCE(p.source_url, ep.source_url) AS source_url,
	COALESCE(p.research_reason, ep.reason) AS reason,
	ep.extra, ep.stage, ep.skipped_at, ep.skipped_by, ep.source, ep.reply, ep.replied_at,
	ep.invited_at, ep.invited_via, ep.last_contacted_at, ep.confirmed_at, ep.confirmed_via,
	ep.checkin_id, c.checked_in_at, ep.consent_event_at, ep.consent_share_at, ep.owner,
	COALESCE(pco.owner, rco.owner) AS company_owner,
	ep.next_action_at, ep.next_action_kind, ep.next_action_overridden, ep.needs_review, ep.note,
	ep.added_by, ep.created_at, ep.updated_at,
	p.origin, p.locked_at, p.d365_suppressed, p.d365_no_email, p.d365_no_phone, p.is_customer,
	p.consent_future_at, p.country, p.created_at AS person_created_at,
	COALESCE(pco.never_invite_at, rco.never_invite_at) AS blocked_at,
	COALESCE(pco.never_invite_reason, rco.never_invite_reason) AS blocked_reason,
	(SELECT COUNT(*) FROM touches t WHERE t.event_person_id = ep.id) AS touch_count,
	(SELECT COUNT(*) FROM touches t WHERE t.event_person_id = ep.id AND t.kind = 'chase')
		AS chase_count
	FROM event_people ep
		LEFT JOIN people p ON p.id = ep.person_id
		LEFT JOIN companies pco ON pco.id = p.company_id
		LEFT JOIN companies rco ON rco.id = ep.company_id
		LEFT JOIN checkins c ON c.id = ep.checkin_id`;

export function listEventPeople(db: DB, eventId: string): EventPersonRow[] {
	return db
		.prepare(`${ROW_SELECT} WHERE ep.event_id = ? ORDER BY ep.id`)
		.all(eventId) as EventPersonRow[];
}

export function getEventPerson(db: DB, eventId: string, id: number): EventPersonRow | undefined {
	return db.prepare(`${ROW_SELECT} WHERE ep.event_id = ? AND ep.id = ?`).get(eventId, id) as
		EventPersonRow | undefined;
}

export function findRow(db: DB, eventId: string, personId: string): EventPersonRow | undefined {
	return db
		.prepare(`${ROW_SELECT} WHERE ep.event_id = ? AND ep.person_id = ?`)
		.get(eventId, personId) as EventPersonRow | undefined;
}

export function rowByCheckin(db: DB, checkinId: number): EventPersonRow | undefined {
	return db.prepare(`${ROW_SELECT} WHERE ep.checkin_id = ?`).get(checkinId) as
		EventPersonRow | undefined;
}

/** Live rows: a person on the list, at any stage past found. */
export const isLive = (row: Pick<EventPersonRow, 'stage'>) => row.stage !== 'found';

export function effectiveOwner(row: Pick<EventPersonRow, 'owner' | 'company_owner'>) {
	return row.owner ?? row.company_owner ?? null;
}

/* ───────────────────────── Chips (§4.2) ───────────────────────── */

// The chip rules are shared with the page (lib/people.ts); the event's end is decided here.
export { CHIPS, chipCounts, matchesChip, type Chip, type ChipRow };

type EventTimes = { starts_at: number | null; ends_at: number | null };

/** When the event is over: `ends_at`, else six hours after it starts. */
export function eventEnd(event: EventTimes): number | null {
	if (event.ends_at) return event.ends_at;
	return event.starts_at ? event.starts_at + 6 * 3_600_000 : null;
}

export function hasEnded(event: EventTimes, now = Date.now()): boolean {
	const end = eventEnd(event);
	return end !== null && now >= end;
}

/* ───────────────────────── Adding people ───────────────────────── */

export interface GuestInput {
	name: string;
	company: string;
	jobTitle: string;
	email: string | null;
	phone: string | null;
	linkedin?: string | null;
	reply?: Reply;
	note?: string;
	sourceUrl?: string | null;
	reason?: string | null;
	/** D365 import flags and notes, kept on the row while found and copied on Add. */
	extra?: RowExtra | null;
}

export interface RowExtra {
	doNotEmail?: boolean;
	doNotPhone?: boolean;
	suppressed?: boolean;
	isCustomer?: boolean;
	owner?: string;
	status?: string;
}

export interface AddOptions {
	source: Source;
	by?: string;
	/** The one-time "where did you get their details" answer (typed rows). */
	originDetail?: string;
}

export interface Refusal {
	name: string;
	reason: 'blocked company' | 'do not contact' | 'locked' | 'suppressed';
}

/** What a person added from this source counts as, for precedence and retention (D16). */
export function originFor(source: Source): Origin {
	switch (source) {
		case 'd365':
			return 'd365';
		case 'research':
			return 'research';
		case 'self_registered':
			return 'self_registered';
		case 'walk_in':
			return 'checkin';
		default:
			return 'typed';
	}
}

type Keyed = { name: string; company: string; email?: string | null; linkedin?: string | null };

/** Two entries are one person when the email or LinkedIn matches, or the name at one company. */
function identities(g: Keyed): string[] {
	const keys = [`name:${nameKey(g.name)}@${companyKey(g.company)}`];
	if (g.email) keys.push(`email:${g.email.toLowerCase()}`);
	if (g.linkedin) keys.push(`linkedin:${g.linkedin}`);
	return keys;
}

/** Whether someone is already on the event, found, skipped or live. */
export function onEventCheck(db: DB, eventId: string) {
	const seen = new Set(listEventPeople(db, eventId).flatMap(identities));
	return (g: Keyed) => identities(g).some((k) => seen.has(k));
}

function refusal(db: DB, guest: Keyed & { phone?: string | null }): Refusal['reason'] | null {
	if (isBlocked(findCompany(db, guest.company))) return 'blocked company';
	if (doNotContact(db, guest)) return 'do not contact';
	return null;
}

const INSERT_ROW = `INSERT INTO event_people (event_id, person_id, company_id, name, job_title, email,
	phone, linkedin, source_url, reason, extra, stage, skipped_at, skipped_by, source, note,
	added_by, created_at, updated_at)
VALUES (@eventId, @personId, @companyId, @name, @jobTitle, @email, @phone, @linkedin, @sourceUrl,
	@reason, @extra, @stage, @skippedAt, @skippedBy, @source, @note, @by, @now, @now)`;

/**
 * Found rows (D5, D6): snapshots that aren't people yet. Names already on the event, locked
 * people and blocked companies are left out, so re-running research only brings new names.
 */
export function addFound(
	db: DB,
	eventId: string,
	guests: GuestInput[],
	{ source, by = '' }: AddOptions,
	now = Date.now()
) {
	return db.transaction(() => {
		const seen = new Set(listEventPeople(db, eventId).flatMap(identities));
		const insert = db.prepare(INSERT_ROW);
		let added = 0;
		let skipped = 0;
		const refused: Refusal[] = [];
		for (const g of guests) {
			if (!nameKey(g.name)) {
				skipped++;
				continue;
			}
			const keys = identities(g);
			if (keys.some((k) => seen.has(k))) {
				skipped++;
				continue;
			}
			const reason = refusal(db, g) ?? (findPerson(db, g)?.locked_at ? 'locked' : null);
			if (reason) {
				refused.push({ name: g.name, reason });
				continue;
			}
			keys.forEach((k) => seen.add(k));
			const company = ensureCompany(db, g.company, {}, now);
			if (company && g.extra?.owner) noteCompanyOwner(db, company.id, g.extra.owner, now);
			insert.run({
				eventId,
				personId: null,
				companyId: company?.id ?? null,
				name: g.name,
				jobTitle: g.jobTitle,
				email: g.email,
				phone: g.phone,
				linkedin: g.linkedin ?? null,
				sourceUrl: g.sourceUrl ?? null,
				reason: g.reason ?? null,
				extra: g.extra ? JSON.stringify(g.extra) : null,
				stage: 'found',
				skippedAt: null,
				skippedBy: null,
				source,
				note: g.note ?? '',
				by,
				now
			});
			added++;
		}
		return { added, skipped, refused };
	})();
}

function personFromGuest(
	db: DB,
	eventId: string,
	g: GuestInput,
	opts: AddOptions,
	now: number
): { personId: string; created: boolean } | { duplicate: true } | { refused: Refusal['reason'] } {
	const refusedFor = refusal(db, g);
	if (refusedFor) return { refused: refusedFor };
	const hit = findPerson(db, g, eventId);
	if (hit && findRow(db, eventId, hit.id)) return { duplicate: true };
	if (hit?.locked_at) return { refused: 'locked' };
	if (hit?.d365_suppressed || g.extra?.suppressed) return { refused: 'suppressed' };
	const origin = originFor(opts.source);
	const details = {
		name: g.name,
		jobTitle: g.jobTitle,
		email: g.email,
		phone: g.phone,
		linkedin: g.linkedin ?? null,
		company: g.company
	};
	if (hit) {
		updatePerson(
			db,
			hit.id,
			details,
			{ origin, isCustomer: g.extra?.isCustomer, sourceUrl: g.sourceUrl, researchReason: g.reason },
			now
		);
		applyExtra(db, hit.id, g.extra, now);
		return { personId: hit.id, created: false };
	}
	const personId = createPerson(
		db,
		details,
		{
			origin,
			originDetail: opts.originDetail ?? (g.extra?.owner ? `D365 owner: ${g.extra.owner}` : ''),
			by: opts.by,
			sourceUrl: g.sourceUrl,
			researchReason: g.reason,
			isCustomer: g.extra?.isCustomer || opts.source === 'd365'
		},
		now
	);
	applyExtra(db, personId, g.extra, now);
	return { personId, created: true };
}

/** D365 flags stick to the person: a channel the customer refused stays refused. */
function applyExtra(db: DB, personId: string, extra: RowExtra | null | undefined, now: number) {
	if (!extra) return;
	db.prepare(
		`UPDATE people SET d365_no_email = MAX(d365_no_email, @noEmail),
			d365_no_phone = MAX(d365_no_phone, @noPhone), updated_at = @now
		WHERE id = @id`
	).run({
		id: personId,
		noEmail: extra.doNotEmail ? 1 : 0,
		noPhone: extra.doNotPhone ? 1 : 0,
		now
	});
	if (extra.owner) {
		const person = getPerson(db, personId);
		if (person?.company_id) noteCompanyOwner(db, person.company_id, extra.owner, now);
	}
}

/**
 * Shortlists people straight away (typed ≤10, pool picker, copy to event). Each one is matched
 * against the pool first (§3), so an attendee invited by name keeps their record.
 */
export function addShortlisted(
	db: DB,
	eventId: string,
	guests: GuestInput[],
	opts: AddOptions,
	now = Date.now()
) {
	return db.transaction(() => {
		const insert = db.prepare(INSERT_ROW);
		const added: string[] = [];
		const duplicates: string[] = [];
		const refused: Refusal[] = [];
		for (const g of guests) {
			if (!nameKey(g.name)) continue;
			const who = personFromGuest(db, eventId, g, opts, now);
			if ('duplicate' in who) {
				duplicates.push(g.name);
				continue;
			}
			if ('refused' in who) {
				refused.push({ name: g.name, reason: who.refused });
				continue;
			}
			const person = getPerson(db, who.personId)!;
			const { lastInsertRowid } = insert.run({
				eventId,
				personId: person.id,
				companyId: person.company_id,
				name: null,
				jobTitle: null,
				email: null,
				phone: null,
				linkedin: null,
				sourceUrl: null,
				reason: null,
				extra: null,
				stage: 'shortlisted',
				skippedAt: null,
				skippedBy: null,
				source: opts.source,
				note: g.note ?? '',
				by: opts.by ?? '',
				now
			});
			if (g.reply && g.reply !== 'pending')
				applyChange(db, Number(lastInsertRowid), { type: 'reply', reply: g.reply }, now);
			touchLastEvent(db, person.id, now);
			added.push(g.name);
		}
		return { added, duplicates, refused };
	})();
}

export type ShortlistResult =
	| { status: 'added'; personId: string; name: string }
	| { status: 'duplicate'; name: string }
	| { status: 'refused'; name: string; reason: Refusal['reason'] }
	| { status: 'missing' };

/** Add on a Found row: the snapshot becomes (or joins) a person and the row goes live. */
export function shortlistFound(
	db: DB,
	eventId: string,
	id: number,
	{ by = '' } = {},
	now = Date.now()
): ShortlistResult {
	return db.transaction((): ShortlistResult => {
		const row = getEventPerson(db, eventId, id);
		if (!row || row.stage !== 'found') return { status: 'missing' };
		const extra = parseExtra(row.extra);
		const guest: GuestInput = {
			name: row.name,
			company: row.company,
			jobTitle: row.job_title,
			email: row.email,
			phone: row.phone,
			linkedin: row.linkedin,
			sourceUrl: row.source_url,
			reason: row.reason,
			extra
		};
		const who = personFromGuest(
			db,
			eventId,
			guest,
			{ source: row.source, by, originDetail: extra?.owner ? `D365 owner: ${extra.owner}` : '' },
			now
		);
		if ('refused' in who) return { status: 'refused', name: row.name, reason: who.refused };
		if ('duplicate' in who) {
			// Someone put them on the list by hand since the research came in.
			db.prepare(`DELETE FROM event_people WHERE id = ?`).run(id);
			return { status: 'duplicate', name: row.name };
		}
		const person = getPerson(db, who.personId)!;
		db.prepare(
			`UPDATE event_people SET person_id = @personId, company_id = @companyId, name = NULL,
				job_title = NULL, email = NULL, phone = NULL, linkedin = NULL, source_url = NULL,
				reason = NULL, extra = NULL, added_by = CASE WHEN added_by = '' THEN @by ELSE added_by END,
				updated_at = @now
			WHERE id = @id`
		).run({ id, personId: person.id, companyId: person.company_id, by, now });
		applyChange(db, id, { type: 'shortlist' }, now);
		touchLastEvent(db, person.id, now);
		return { status: 'added', personId: person.id, name: row.name };
	})();
}

export function parseExtra(json: string | null): RowExtra | null {
	if (!json) return null;
	try {
		const v = JSON.parse(json);
		return v && typeof v === 'object' ? (v as RowExtra) : null;
	} catch {
		return null;
	}
}

/* ───────────────────────── Verbs on one row ───────────────────────── */

function owned(db: DB, eventId: string, id: number): number | null {
	const row = db
		.prepare(`SELECT id FROM event_people WHERE id = ? AND event_id = ?`)
		.get(id, eventId) as { id: number } | undefined;
	return row?.id ?? null;
}

export function skipRow(db: DB, eventId: string, id: number, { by = '' } = {}, now = Date.now()) {
	return owned(db, eventId, id) !== null && !!applyChange(db, id, { type: 'skip', by }, now);
}

export function unskipRow(db: DB, eventId: string, id: number, now = Date.now()) {
	return owned(db, eventId, id) !== null && !!applyChange(db, id, { type: 'unskip' }, now);
}

/** Found rows waiting at one company: what "Add all" and "Skip all" act on. */
function foundAt(db: DB, eventId: string, companyKey: string): number[] {
	return listEventPeople(db, eventId)
		.filter((r) => r.stage === 'found' && r.skipped_at === null && r.company_key === companyKey)
		.map((r) => r.id);
}

export function shortlistAll(
	db: DB,
	eventId: string,
	companyKey: string,
	{ by = '' } = {},
	now = Date.now()
): ShortlistResult[] {
	return db.transaction(() =>
		foundAt(db, eventId, companyKey).map((id) => shortlistFound(db, eventId, id, { by }, now))
	)();
}

export function skipAll(
	db: DB,
	eventId: string,
	companyKey: string,
	{ by = '' } = {},
	now = Date.now()
): number {
	return db.transaction(
		() =>
			foundAt(db, eventId, companyKey).filter((id) => skipRow(db, eventId, id, { by }, now)).length
	)();
}

/**
 * "Don't contact again" from a row: a live row locks its person everywhere (D13); a Found row
 * has no person yet, so its snapshot's channels are listed and the row is skipped.
 */
export function lockRow(
	db: DB,
	eventId: string,
	id: number,
	{ reason = '', by = '', source = 'staff' as DncSource } = {},
	now = Date.now()
): boolean {
	return db.transaction(() => {
		const row = getEventPerson(db, eventId, id);
		if (!row) return false;
		if (row.person_id) return lockPerson(db, row.person_id, { reason, source, by }, now);
		const entry = { reason, source, by };
		if (row.email) addEntry(db, { kind: 'email', value: row.email, ...entry }, now);
		if (row.phone) addEntry(db, { kind: 'phone', value: row.phone, ...entry }, now);
		addEntry(db, { kind: 'name_company', value: row.name, company: row.company, ...entry }, now);
		applyChange(db, id, { type: 'skip', by }, now);
		logActivity(
			db,
			{ eventId, kind: 'lock', who: by, what: { eventPersonId: id }, rowCount: 1 },
			now
		);
		return true;
	})();
}

/** Remove: the row goes, the person stays in the pool. Logged by id. */
/**
 * Deletes an event row. A row that holds a check-in is attendance, not a plan: it can only be
 * undone from the Check-ins tab (removeCheckin), which keeps every check-in paired with a row.
 */
export function removeRow(
	db: DB,
	eventId: string,
	id: number,
	{ by = '' } = {},
	now = Date.now()
): 'removed' | 'missing' | 'checked in' {
	return db.transaction(() => {
		const row = db
			.prepare(`SELECT person_id, checkin_id FROM event_people WHERE id = ? AND event_id = ?`)
			.get(id, eventId) as { person_id: string | null; checkin_id: number | null } | undefined;
		if (!row) return 'missing';
		if (row.checkin_id) return 'checked in';
		db.prepare(`DELETE FROM event_people WHERE id = ?`).run(id);
		if (row.person_id) touchLastEvent(db, row.person_id, now);
		logActivity(
			db,
			{ eventId, kind: 'delete', who: by, what: { eventPersonId: id }, rowCount: 1 },
			now
		);
		return 'removed';
	})();
}

export function setReply(db: DB, eventId: string, id: number, reply: Reply, now = Date.now()) {
	return owned(db, eventId, id) !== null && !!applyChange(db, id, { type: 'reply', reply }, now);
}

export function confirmRow(
	db: DB,
	eventId: string,
	id: number,
	via: ConfirmedVia,
	now = Date.now()
) {
	return owned(db, eventId, id) !== null && !!applyChange(db, id, { type: 'confirm', via }, now);
}

export function setNote(db: DB, eventId: string, id: number, note: string, now = Date.now()) {
	db.prepare(`UPDATE event_people SET note = ?, updated_at = ? WHERE id = ? AND event_id = ?`).run(
		note,
		now,
		id,
		eventId
	);
}

/** NULL means "the company's owner". */
export function setOwner(
	db: DB,
	eventId: string,
	id: number,
	owner: string | null,
	now = Date.now()
) {
	db.prepare(`UPDATE event_people SET owner = ?, updated_at = ? WHERE id = ? AND event_id = ?`).run(
		owner,
		now,
		id,
		eventId
	);
}

export interface Details {
	name: string;
	company: string;
	jobTitle: string;
	email: string | null;
	phone: string | null;
	linkedin?: string | null;
}

export type SetDetailsResult = 'saved' | 'missing' | 'do not contact';

/**
 * Edits from the row's form: the person for live rows, the snapshot while found. An edit that
 * would put a listed email, mobile or name on an unlocked person is refused: the add paths
 * check the list, and this is the only other way a channel reaches a live person (D13).
 */
export function setDetails(
	db: DB,
	eventId: string,
	id: number,
	d: Details,
	now = Date.now()
): SetDetailsResult {
	const row = getEventPerson(db, eventId, id);
	if (!row) return 'missing';
	if (row.person_id) {
		if (!row.locked_at && doNotContact(db, d)) return 'do not contact';
		// The organizer corrected it by hand, so it replaces what was there (typed rank).
		db.prepare(
			`UPDATE people SET name = @name, job_title = @jobTitle, email = @email, phone = @phone,
				linkedin = @linkedin, company_id = @companyId, updated_at = @now WHERE id = @id`
		).run({
			id: row.person_id,
			name: d.name,
			jobTitle: d.jobTitle,
			email: d.email?.toLowerCase() || null,
			phone: d.phone || null,
			linkedin: d.linkedin || null,
			companyId: ensureCompany(db, d.company, {}, now)?.id ?? null,
			now
		});
		db.prepare(
			`UPDATE event_people SET company_id = (SELECT company_id FROM people WHERE id = ?),
				updated_at = ? WHERE id = ?`
		).run(row.person_id, now, id);
	} else {
		db.prepare(
			`UPDATE event_people SET name = @name, job_title = @jobTitle, email = @email,
				phone = @phone, linkedin = @linkedin, company_id = @companyId, updated_at = @now
			WHERE id = @id`
		).run({
			id,
			name: d.name,
			jobTitle: d.jobTitle,
			email: d.email?.toLowerCase() || null,
			phone: d.phone || null,
			linkedin: d.linkedin || null,
			companyId: ensureCompany(db, d.company, {}, now)?.id ?? null,
			now
		});
	}
	return 'saved';
}

/**
 * Clears the D365 flags on the row's person (§6.1): a stale export suppressed them, or the
 * customer changed their mind. Explicit and logged, by id only.
 */
export function unflagRow(db: DB, eventId: string, id: number, { by = '' } = {}, now = Date.now()) {
	return db.transaction(() => {
		const row = getEventPerson(db, eventId, id);
		if (!row?.person_id) return false;
		db.prepare(
			`UPDATE people SET d365_no_email = 0, d365_no_phone = 0, d365_suppressed = 0,
				updated_at = ? WHERE id = ?`
		).run(now, row.person_id);
		logActivity(
			db,
			{ eventId, kind: 'unlock', who: by, what: { personId: row.person_id }, rowCount: 1 },
			now
		);
		return true;
	})();
}

/* ───────────────────────── Touches (D9) ───────────────────────── */

export interface TouchRow extends Touch {
	id: number;
	event_person_id: number;
	by: string;
}

export function listTouches(db: DB, rowId: number): TouchRow[] {
	return db
		.prepare(`SELECT * FROM touches WHERE event_person_id = ? ORDER BY at, id`)
		.all(rowId) as TouchRow[];
}

/** Records a message the organizer sent by hand; the stage follows (§5.3). */
export function addTouch(
	db: DB,
	eventId: string,
	id: number,
	{ kind, via, by = '' }: { kind: TouchKind; via: Via; by?: string },
	now = Date.now()
): number | null {
	return db.transaction(() => {
		const row = getEventPerson(db, eventId, id);
		if (!row || row.stage === 'found') return null;
		const { lastInsertRowid } = db
			.prepare(`INSERT INTO touches (event_person_id, kind, via, at, by) VALUES (?, ?, ?, ?, ?)`)
			.run(id, kind, via, now, by);
		applyChange(db, id, { type: 'touch', touch: { kind, via, at: now } }, now);
		return Number(lastInsertRowid);
	})();
}

/** "Invited via LinkedIn", or the bulk Mark invited: a touch without a message link. */
export function markInvited(
	db: DB,
	eventId: string,
	id: number,
	via: Via,
	{ by = '' } = {},
	now = Date.now()
) {
	return addTouch(db, eventId, id, { kind: 'invitation', via, by }, now);
}

/** The "Invited via LinkedIn" toggle going off: only its own touch may be undone. */
export function unmarkInvited(db: DB, eventId: string, id: number, via: Via, now = Date.now()) {
	return db.transaction(() => {
		const latest = listTouches(db, id).at(-1);
		if (!latest || latest.kind !== 'invitation' || latest.via !== via) return false;
		return clearLatestTouch(db, eventId, id, now);
	})();
}

/** The "chased ×N" pill: the latest touch was a mistake. Dates are recomputed from the rest. */
export function clearLatestTouch(db: DB, eventId: string, id: number, now = Date.now()) {
	return db.transaction(() => {
		if (owned(db, eventId, id) === null) return false;
		const latest = db
			.prepare(`SELECT id FROM touches WHERE event_person_id = ? ORDER BY at DESC, id DESC LIMIT 1`)
			.get(id) as { id: number } | undefined;
		if (!latest) return false;
		db.prepare(`DELETE FROM touches WHERE id = ?`).run(latest.id);
		applyChange(db, id, { type: 'recount', touches: listTouches(db, id) }, now);
		return true;
	})();
}

/* ───────────────────────── Check-ins ───────────────────────── */

/**
 * A check-in lands on the person's row, or creates one (`walk_in`) when they weren't on the
 * list: walk-ins are rows, not a separate list (§4.7).
 */
export function linkCheckin(
	db: DB,
	eventId: string,
	personId: string,
	checkinId: number,
	{
		consentAt,
		consentShareAt = null,
		by = ''
	}: { consentAt: number | null; consentShareAt?: number | null; by?: string },
	now = Date.now()
): number {
	return db.transaction(() => {
		let row = findRow(db, eventId, personId);
		if (!row) {
			const person = getPerson(db, personId);
			const { lastInsertRowid } = db.prepare(INSERT_ROW).run({
				eventId,
				personId,
				companyId: person?.company_id ?? null,
				name: null,
				jobTitle: null,
				email: null,
				phone: null,
				linkedin: null,
				sourceUrl: null,
				reason: null,
				extra: null,
				stage: 'shortlisted',
				skippedAt: null,
				skippedBy: null,
				source: 'walk_in',
				note: '',
				by,
				now
			});
			row = getEventPerson(db, eventId, Number(lastInsertRowid))!;
		}
		applyChange(db, row.id, { type: 'checkin', checkinId, consentAt }, now);
		if (consentShareAt)
			db.prepare(
				`UPDATE event_people SET consent_share_at = COALESCE(consent_share_at, ?) WHERE id = ?`
			).run(consentShareAt, row.id);
		touchLastEvent(db, personId, now);
		return row.id;
	})();
}

/** A removed check-in puts the row back where it was; a bare walk-in row goes with it. */
export function unlinkCheckin(db: DB, checkinId: number, now = Date.now()) {
	const row = rowByCheckin(db, checkinId);
	if (!row) return;
	applyChange(db, row.id, { type: 'checkout' }, now);
	if (row.source === 'walk_in' && row.reply === 'pending' && !row.touch_count && !row.note)
		db.prepare(`DELETE FROM event_people WHERE id = ?`).run(row.id);
}

/** Counts for the tab badge: live rows that aren't found or skipped. */
export function countLive(db: DB, eventId: string): number {
	return (
		db
			.prepare(`SELECT COUNT(*) AS n FROM event_people WHERE event_id = ? AND stage <> 'found'`)
			.get(eventId) as { n: number }
	).n;
}

export function countToReview(db: DB, eventId: string): number {
	return (
		db
			.prepare(
				`SELECT COUNT(*) AS n FROM event_people
				WHERE event_id = ? AND stage = 'found' AND skipped_at IS NULL`
			)
			.get(eventId) as { n: number }
	).n;
}

export type { PersonRow };
