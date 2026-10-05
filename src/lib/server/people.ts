import { randomUUID } from 'node:crypto';
import { companyKey, nameKey } from '../invitations.ts';
// The stage order comes from the shared module, not stages.ts, which would close a cycle
// through next-action.ts (stages → next-action → people → stages).
import { stageRank, type Stage } from '../people.ts';
import { logActivity } from './activity-log.ts';
import { ensureCompany } from './companies.ts';
import type { DB } from './database.ts';
import { SALUTATION_RANK } from '../salutation.ts';
import { linkedinRank } from './linkedin.ts';
import type { Country } from './settings.ts';

export type Origin = 'self_registered' | 'checkin' | 'd365' | 'typed' | 'research';

export interface PersonRow {
	id: string;
	name: string;
	job_title: string;
	email: string | null;
	phone: string | null;
	linkedin: string | null;
	company_id: string | null;
	/** Joined from companies, '' when none. */
	company: string;
	company_key: string;
	origin: Origin;
	origin_detail: string;
	source_url: string | null;
	research_reason: string | null;
	is_customer: 0 | 1;
	country: Country | null;
	consent_future_at: number | null;
	legacy_notice_at: number | null;
	legacy_kept_at: number | null;
	d365_no_email: 0 | 1;
	d365_no_phone: 0 | 1;
	d365_suppressed: 0 | 1;
	locked_at: number | null;
	lock_reason: string | null;
	linkedin_status: 'requested' | 'connected' | null;
	linkedin_status_at: number | null;
	linkedin_status_by: string;
	salutation: 'pak' | 'bu' | null;
	salutation_source: 'self' | 'team' | 'research' | null;
	salutation_note: string;
	call_name: string | null;
	last_event_at: number | null;
	created_by: string;
	created_at: number;
	updated_at: number;
}

/** What a form, a paste or a check-in tells us about someone. Blanks never erase anything. */
export interface PersonDetails {
	name: string;
	jobTitle?: string;
	email?: string | null;
	phone?: string | null;
	linkedin?: string | null;
	company?: string;
}

export interface Identity {
	name?: string | null;
	company?: string | null;
	email?: string | null;
	phone?: string | null;
	linkedin?: string | null;
}

export const PERSON_SELECT = `SELECT p.*, COALESCE(co.name, '') AS company,
	COALESCE(co.key, '') AS company_key
	FROM people p LEFT JOIN companies co ON co.id = p.company_id`;

export function getPerson(db: DB, id: string): PersonRow | undefined {
	return db.prepare(`${PERSON_SELECT} WHERE p.id = ?`).get(id) as PersonRow | undefined;
}

/** People by id, in the order asked for; unknown ids are dropped. */
export function getPeople(db: DB, ids: string[]): PersonRow[] {
	if (!ids.length) return [];
	const rows = db
		.prepare(`${PERSON_SELECT} WHERE p.id IN (SELECT value FROM json_each(?))`)
		.all(JSON.stringify(ids)) as PersonRow[];
	const byId = new Map(rows.map((r) => [r.id, r]));
	return ids.flatMap((id) => byId.get(id) ?? []);
}

const contradict = (a: string | null | undefined, b: string | null | undefined) =>
	!!a && !!b && a !== b;
const companiesAgree = (a: string | null | undefined, b: string | null | undefined) =>
	!contradict(companyKey(a ?? ''), companyKey(b ?? ''));

/**
 * Within a set of candidates: email, phone, LinkedIn, then name at a company that doesn't
 * contradict. A phone only ever counts when the emails don't contradict (a PA and their boss
 * share one); `strict` adds the pool guard that a name also needs emails and phones to agree.
 */
function pickMatch(
	input: Identity,
	candidates: PersonRow[],
	strict: boolean
): PersonRow | undefined {
	const email = input.email?.toLowerCase();
	if (email) {
		const hit = candidates.find((c) => c.email === email);
		if (hit) return hit;
	}
	if (input.phone) {
		const hit = candidates.find((c) => c.phone === input.phone && !contradict(c.email, email));
		if (hit) return hit;
	}
	if (input.linkedin) {
		const hit = candidates.find((c) => c.linkedin === input.linkedin);
		if (hit) return hit;
	}
	const key = input.name ? nameKey(input.name) : '';
	if (key) {
		const options = candidates.filter(
			(c) =>
				nameKey(c.name) === key &&
				companiesAgree(c.company, input.company) &&
				(!strict || (!contradict(c.email, email) && !contradict(c.phone, input.phone)))
		);
		const wanted = companyKey(input.company ?? '');
		const exact = options.find((c) => c.company_key === wanted);
		// Two namesakes and nothing to tell them apart: a new person beats a silent wrong pick.
		return exact ?? (options.length === 1 ? options[0] : undefined);
	}
	return undefined;
}

/**
 * Whether what someone typed could be this record: the name is the same, and the company,
 * email and phone don't contradict (one side empty is fine). The guard a public form applies
 * to a findPerson() hit before writing to it, since anyone can type a listed name.
 */
export function detailsAgree(
	person: Pick<PersonRow, 'name' | 'company' | 'email' | 'phone'>,
	input: Identity
): boolean {
	return (
		nameKey(person.name) === nameKey(input.name ?? '') &&
		companiesAgree(person.company, input.company) &&
		!contradict(person.email, input.email?.toLowerCase()) &&
		!contradict(person.phone, input.phone)
	);
}

/**
 * Who this is (§3): the event's own rows first, in arrival-matching order, then the pool
 * with the guards that stop two different people from merging. Undefined means a new person.
 */
export function findPerson(db: DB, input: Identity, eventId?: string): PersonRow | undefined {
	if (eventId) {
		const live = db
			.prepare(
				`${PERSON_SELECT} JOIN event_people ep ON ep.person_id = p.id WHERE ep.event_id = ?
				ORDER BY ep.id`
			)
			.all(eventId) as PersonRow[];
		const hit = pickMatch(input, live, false);
		if (hit) return hit;
	}

	const email = input.email?.toLowerCase();
	if (email) {
		const shared = db
			.prepare(`${PERSON_SELECT} WHERE p.email = ? ORDER BY p.updated_at DESC`)
			.all(email) as PersonRow[];
		if (shared.length === 1) return shared[0];
		// A shared info@ address: the other details decide, and nothing decisive means a new person.
		if (shared.length > 1) return pickMatch({ ...input, email: null }, shared, true);
	}
	if (input.phone) {
		const byPhone = db
			.prepare(`${PERSON_SELECT} WHERE p.phone = ? ORDER BY p.updated_at DESC`)
			.all(input.phone) as PersonRow[];
		const hit = byPhone.find((c) => !contradict(c.email, email));
		if (hit) return hit;
	}
	if (input.linkedin) {
		const hit = db
			.prepare(`${PERSON_SELECT} WHERE p.linkedin = ? ORDER BY p.updated_at DESC`)
			.get(input.linkedin) as PersonRow | undefined;
		if (hit) return hit;
	}
	if (input.name && nameKey(input.name)) {
		const all = db.prepare(`${PERSON_SELECT} ORDER BY p.updated_at DESC`).all() as PersonRow[];
		return pickMatch(
			{ name: input.name, company: input.company, email, phone: input.phone },
			all,
			true
		);
	}
	return undefined;
}

// Who typed the value decides whose version wins: the person themselves (a check-in or a
// registration) over the organizer (typed, D365), and research only ever fills blanks.
const RANK: Record<Origin, number> = {
	self_registered: 3,
	checkin: 3,
	d365: 2,
	typed: 2,
	research: 1
};

/** Checked in themselves at some event, so their stored details are their own words. */
function selfAttended(db: DB, personId: string): boolean {
	return !!db
		.prepare(`SELECT 1 FROM checkins WHERE person_id = ? AND method <> 'staff' LIMIT 1`)
		.get(personId);
}

export interface CreateOptions {
	origin: Origin;
	originDetail?: string;
	by?: string;
	sourceUrl?: string | null;
	researchReason?: string | null;
	isCustomer?: boolean;
	country?: Country | null;
}

export function createPerson(
	db: DB,
	details: PersonDetails,
	opts: CreateOptions,
	now = Date.now()
): string {
	const id = randomUUID();
	const company = ensureCompany(db, details.company ?? '', {}, now);
	db.prepare(
		`INSERT INTO people (id, name, job_title, email, phone, linkedin, company_id, origin,
			origin_detail, source_url, research_reason, is_customer, country, created_by, created_at,
			updated_at)
		VALUES (@id, @name, @jobTitle, @email, @phone, @linkedin, @companyId, @origin, @originDetail,
			@sourceUrl, @researchReason, @isCustomer, @country, @by, @now, @now)`
	).run({
		id,
		name: details.name,
		jobTitle: details.jobTitle ?? '',
		email: details.email?.toLowerCase() || null,
		phone: details.phone || null,
		linkedin: details.linkedin || null,
		companyId: company?.id ?? null,
		origin: opts.origin,
		originDetail: opts.originDetail ?? '',
		sourceUrl: opts.sourceUrl || null,
		researchReason: opts.researchReason || null,
		isCustomer: opts.isCustomer ? 1 : 0,
		country: opts.country ?? countryFromPhone(details.phone),
		by: opts.by ?? '',
		now
	});
	return id;
}

export interface UpdateOptions {
	/** Whose words the new values are, for precedence (§3). */
	origin: Origin;
	/** Who wins at equal rank: the newer values (default), or what is stored (a chosen survivor). */
	tieBreak?: 'incoming' | 'stored';
	isCustomer?: boolean;
	sourceUrl?: string | null;
	researchReason?: string | null;
}

/**
 * Merges details into a person by field precedence: a higher-ranked source overwrites, an
 * equal one is newer and wins, a lower one fills blanks only. Origin is never changed.
 */
export function updatePerson(
	db: DB,
	id: string,
	details: PersonDetails,
	opts: UpdateOptions,
	now = Date.now()
): boolean {
	const person = getPerson(db, id);
	if (!person) return false;
	const stored = Math.max(RANK[person.origin], selfAttended(db, id) ? 3 : 0);
	const incoming = RANK[opts.origin];
	const wins =
		opts.origin !== 'research' &&
		(opts.tieBreak === 'stored' ? incoming > stored : incoming >= stored);
	const choose = <T extends string | null | undefined>(current: T, next: T) =>
		!next ? current : !current || wins ? next : current;

	const company = details.company ? ensureCompany(db, details.company, {}, now) : null;
	db.prepare(
		`UPDATE people SET name = @name, job_title = @jobTitle, email = @email, phone = @phone,
			linkedin = @linkedin, company_id = @companyId,
			source_url = COALESCE(source_url, @sourceUrl),
			research_reason = COALESCE(research_reason, @researchReason),
			is_customer = MAX(is_customer, @isCustomer),
			country = COALESCE(country, @country),
			updated_at = @now
		WHERE id = @id`
	).run({
		id,
		name: choose(person.name, details.name),
		jobTitle: choose(person.job_title, details.jobTitle ?? '') ?? '',
		email: choose(person.email, details.email?.toLowerCase() || null),
		phone: choose(person.phone, details.phone || null),
		linkedin: choose(person.linkedin, details.linkedin || null),
		companyId: choose(person.company_id, company?.id ?? null),
		sourceUrl: opts.sourceUrl || null,
		researchReason: opts.researchReason || null,
		isCustomer: opts.isCustomer ? 1 : 0,
		country: countryFromPhone(details.phone),
		now
	});
	return true;
}

export function setPersonCountry(db: DB, id: string, country: Country | null, now = Date.now()) {
	db.prepare(`UPDATE people SET country = ?, updated_at = ? WHERE id = ?`).run(country, now, id);
}

export function setConsentFuture(db: DB, id: string, at: number | null, now = Date.now()) {
	db.prepare(
		`UPDATE people SET consent_future_at = COALESCE(consent_future_at, ?), updated_at = ? WHERE id = ?`
	).run(at, now, id);
}

/** `last_event_at`: the latest of their events' start times and check-ins (D18). */
export function touchLastEvent(db: DB, id: string, now = Date.now()) {
	db.prepare(
		`UPDATE people SET last_event_at = (
			SELECT MAX(t) FROM (
				SELECT MAX(e.starts_at) AS t FROM event_people ep JOIN events e ON e.id = ep.event_id
					WHERE ep.person_id = @id
				UNION ALL SELECT MAX(checked_in_at) FROM checkins WHERE person_id = @id
			)
		), updated_at = @now WHERE id = @id`
	).run({ id, now });
}

/* ───────────────────────── Country and retention ───────────────────────── */

export function countryFromPhone(phone: string | null | undefined): Country | null {
	if (!phone) return null;
	if (phone.startsWith('+62')) return 'ID';
	if (phone.startsWith('+60')) return 'MY';
	return null;
}

export function countryFromTimezone(tz: string | null | undefined): Country | null {
	if (!tz) return null;
	if (/^Asia\/(Jakarta|Pontianak|Makassar|Jayapura)$/.test(tz)) return 'ID';
	if (/^Asia\/(Kuala_Lumpur|Kuching)$/.test(tz)) return 'MY';
	return null;
}

/** §2.3: the stored country, else the phone's, else the last check-in's event; null = unknown. */
export function countryOf(
	person: Pick<PersonRow, 'country' | 'phone'>,
	lastEventTimezone: string | null = null
): Country | null {
	return person.country ?? countryFromPhone(person.phone) ?? countryFromTimezone(lastEventTimezone);
}

export type Channel = 'whatsapp' | 'email';

type ContactPerson = Pick<
	PersonRow,
	| 'locked_at'
	| 'd365_suppressed'
	| 'd365_no_email'
	| 'd365_no_phone'
	| 'is_customer'
	| 'origin'
	| 'consent_future_at'
	| 'created_at'
	| 'country'
	| 'phone'
>;

/** §2.3 legacy: checked in before the consent boxes existed and never ticked "future events". */
export function isLegacy(
	person: Pick<ContactPerson, 'origin' | 'consent_future_at' | 'created_at'>,
	consentBoxesSince: number | null
): boolean {
	return (
		person.origin === 'checkin' &&
		!person.consent_future_at &&
		person.created_at < (consentBoxesSince ?? Infinity)
	);
}

export type ContactBlock = 'locked' | 'suppressed' | 'channel refused' | 'not contactable';

/**
 * Why a channel is closed to this person, or null when they may be messaged on it (§2.3): a
 * lock or a D365 suppression closes everything, a D365 flag closes its channel, and a legacy
 * attendee outside Indonesia who is not a customer waits until they register (D15).
 */
export function contactBlock(
	person: ContactPerson,
	channel: Channel,
	consentBoxesSince: number | null
): ContactBlock | null {
	if (person.locked_at) return 'locked';
	if (person.d365_suppressed) return 'suppressed';
	if (channel === 'email' ? person.d365_no_email : person.d365_no_phone) return 'channel refused';
	if (
		isLegacy(person, consentBoxesSince) &&
		(countryOf(person) ?? 'MY') === 'MY' &&
		!person.is_customer
	)
		return 'not contactable';
	return null;
}

export const contactable = (
	person: ContactPerson,
	channel: Channel,
	consentBoxesSince: number | null
) => contactBlock(person, channel, consentBoxesSince) === null;

/* ───────────────────────── Lists ───────────────────────── */

export interface PersonListRow extends PersonRow {
	events_attended: number;
	last_seen_at: number | null;
	last_event_name: string | null;
	/** Said yes, maybe or no on some event. */
	replied: 0 | 1;
	/** On the default Contacts list (§2.3) rather than a prospect. */
	is_default: 0 | 1;
}

function likePattern(q: string) {
	return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// §2.3: attendees, anyone who replied, and the self-registered. Everyone else is a prospect.
const DEFAULT_LIST = `(EXISTS (SELECT 1 FROM checkins c WHERE c.person_id = p.id)
	OR EXISTS (SELECT 1 FROM event_people ep WHERE ep.person_id = p.id AND ep.reply <> 'pending')
	OR p.origin = 'self_registered')`;

export function listPeople(
	db: DB,
	{
		q = '',
		limit = 1000,
		prospects = false
	}: { q?: string; limit?: number; prospects?: boolean } = {}
): PersonListRow[] {
	const search = q.trim();
	return db
		.prepare(
			`SELECT p.*, COALESCE(co.name, '') AS company, COALESCE(co.key, '') AS company_key,
				COUNT(c.id) AS events_attended,
				MAX(c.checked_in_at) AS last_seen_at,
				(SELECT e.name FROM checkins c2 JOIN events e ON e.id = c2.event_id
					WHERE c2.person_id = p.id ORDER BY c2.checked_in_at DESC LIMIT 1) AS last_event_name,
				EXISTS (SELECT 1 FROM event_people ep WHERE ep.person_id = p.id AND ep.reply <> 'pending')
					AS replied,
				${DEFAULT_LIST} AS is_default
			FROM people p
				LEFT JOIN companies co ON co.id = p.company_id
				LEFT JOIN checkins c ON c.person_id = p.id
			WHERE ${DEFAULT_LIST} = @wanted
				AND (@q = '' OR p.name LIKE @like ESCAPE '\\' OR p.email LIKE @like ESCAPE '\\'
					OR co.name LIKE @like ESCAPE '\\' OR p.phone LIKE @like ESCAPE '\\')
			GROUP BY p.id
			ORDER BY COALESCE(MAX(c.checked_in_at), p.last_event_at, p.created_at) DESC
			LIMIT @limit`
		)
		.all({
			q: search,
			like: likePattern(search),
			limit,
			wanted: prospects ? 0 : 1
		}) as PersonListRow[];
}

export function countPeople(db: DB, prospects = false): number {
	return (
		db
			.prepare(`SELECT COUNT(*) AS n FROM people p WHERE ${DEFAULT_LIST} = ?`)
			.get(prospects ? 0 : 1) as { n: number }
	).n;
}

/** Everyone in the pool at one company, however they spelled it, flagged default or prospect. */
export function peopleAtCompany(db: DB, company: string): (PersonRow & { is_default: 0 | 1 })[] {
	const key = companyKey(company);
	if (!key) return [];
	return db
		.prepare(
			`${PERSON_SELECT.replace('FROM people', `, ${DEFAULT_LIST} AS is_default FROM people`)}
			WHERE co.key = ? ORDER BY p.name COLLATE NOCASE`
		)
		.all(key) as (PersonRow & { is_default: 0 | 1 })[];
}

/** A quick pool lookup by name, email or company, for picking a merge survivor. */
export function searchPeople(db: DB, q: string, limit = 20): PersonRow[] {
	const search = q.trim();
	if (!search) return [];
	return db
		.prepare(
			`${PERSON_SELECT} WHERE p.name LIKE @like ESCAPE '\\' OR p.email LIKE @like ESCAPE '\\'
				OR co.name LIKE @like ESCAPE '\\'
			ORDER BY p.name COLLATE NOCASE LIMIT @limit`
		)
		.all({ like: likePattern(search), limit }) as PersonRow[];
}

/* ───────────────────────── Deletion and merge ───────────────────────── */

/** Erasure: the person, their check-ins and every event row, logged by id only. */
export function deletePerson(db: DB, id: string, { by = '' } = {}, now = Date.now()): boolean {
	return db.transaction(() => {
		const rows = (
			db.prepare(`SELECT COUNT(*) AS n FROM event_people WHERE person_id = ?`).get(id) as {
				n: number;
			}
		).n;
		const { changes } = db.prepare(`DELETE FROM people WHERE id = ?`).run(id);
		if (!changes) return false;
		logActivity(db, { kind: 'delete', who: by, what: { personId: id }, rowCount: 1 + rows }, now);
		return true;
	})();
}

export type RowForMerge = {
	id: number;
	event_id: string;
	stage: Stage;
	reply: string;
	replied_at: number | null;
	invited_at: number | null;
	invited_via: string | null;
	last_contacted_at: number | null;
	confirmed_at: number | null;
	confirmed_via: string | null;
	checkin_id: number | null;
	consent_event_at: number | null;
	consent_share_at: number | null;
	owner: string | null;
	note: string;
	needs_review: number;
};

/** Folds the loser's event row into the survivor's on the same event; the loser row is deleted. */
export function mergeEventRows(
	db: DB,
	survivor: RowForMerge,
	loser: RowForMerge,
	now = Date.now()
) {
	// The one with a reply wins the reply fields; the further-along stage wins the stage.
	const replied =
		survivor.reply !== 'pending' ? survivor : loser.reply !== 'pending' ? loser : survivor;
	const ahead = stageRank(loser.stage) > stageRank(survivor.stage) ? loser : survivor;
	db.prepare(`UPDATE touches SET event_person_id = ? WHERE event_person_id = ?`).run(
		survivor.id,
		loser.id
	);
	db.prepare(
		`UPDATE event_people SET stage = @stage, reply = @reply, replied_at = @repliedAt,
			invited_at = @invitedAt, invited_via = @invitedVia, last_contacted_at = @lastContactedAt,
			confirmed_at = @confirmedAt, confirmed_via = @confirmedVia, checkin_id = @checkinId,
			consent_event_at = @consentEventAt, consent_share_at = @consentShareAt, owner = @owner,
			note = @note, needs_review = @needsReview, updated_at = @now
		WHERE id = @id`
	).run({
		id: survivor.id,
		stage: ahead.stage,
		reply: replied.reply,
		repliedAt: replied.replied_at,
		invitedAt: min(survivor.invited_at, loser.invited_at),
		invitedVia: survivor.invited_via ?? loser.invited_via,
		lastContactedAt: max(survivor.last_contacted_at, loser.last_contacted_at),
		confirmedAt: replied.confirmed_at ?? (replied.reply === 'yes' ? ahead.confirmed_at : null),
		confirmedVia: replied.confirmed_via ?? (replied.reply === 'yes' ? ahead.confirmed_via : null),
		checkinId: survivor.checkin_id ?? loser.checkin_id,
		consentEventAt: survivor.consent_event_at ?? loser.consent_event_at,
		consentShareAt: survivor.consent_share_at ?? loser.consent_share_at,
		owner: survivor.owner ?? loser.owner,
		note: [survivor.note, loser.note].filter(Boolean).join(' · '),
		needsReview: survivor.needs_review || loser.needs_review,
		now
	});
	db.prepare(`DELETE FROM event_people WHERE id = ?`).run(loser.id);
}

const min = (a: number | null, b: number | null) =>
	a === null ? b : b === null ? a : Math.min(a, b);
const max = (a: number | null, b: number | null) =>
	a === null ? b : b === null ? a : Math.max(a, b);

const ROW_FOR_MERGE = `SELECT id, event_id, stage, reply, replied_at, invited_at, invited_via,
	last_contacted_at, confirmed_at, confirmed_via, checkin_id, consent_event_at, consent_share_at,
	owner, note, needs_review FROM event_people`;

/**
 * Manual merge: the loser's details, event rows, check-ins and consents move to the survivor
 * by precedence, then the loser is deleted. Logged as `merge` with the two ids.
 */
export function mergeInto(
	db: DB,
	loserId: string,
	survivorId: string,
	{ by = '' } = {},
	now = Date.now()
): boolean {
	if (loserId === survivorId) return false;
	return db.transaction(() => {
		const loser = getPerson(db, loserId);
		const survivor = getPerson(db, survivorId);
		if (!loser || !survivor) return false;

		updatePerson(
			db,
			survivorId,
			{
				name: loser.name,
				jobTitle: loser.job_title,
				email: loser.email,
				phone: loser.phone,
				linkedin: loser.linkedin,
				company: loser.company
			},
			{
				origin: selfAttended(db, loserId) ? 'checkin' : loser.origin,
				tieBreak: 'stored',
				isCustomer: !!loser.is_customer,
				sourceUrl: loser.source_url,
				researchReason: loser.research_reason
			},
			now
		);
		db.prepare(
			`UPDATE people SET
				consent_future_at = COALESCE(consent_future_at, @consentFutureAt),
				legacy_notice_at = COALESCE(legacy_notice_at, @legacyNoticeAt),
				legacy_kept_at = COALESCE(legacy_kept_at, @legacyKeptAt),
				d365_no_email = MAX(d365_no_email, @noEmail),
				d365_no_phone = MAX(d365_no_phone, @noPhone),
				d365_suppressed = MAX(d365_suppressed, @suppressed),
				locked_at = COALESCE(locked_at, @lockedAt),
				lock_reason = COALESCE(lock_reason, @lockReason),
				origin_detail = CASE WHEN origin_detail = '' THEN @originDetail ELSE origin_detail END
			WHERE id = @id`
		).run({
			id: survivorId,
			consentFutureAt: loser.consent_future_at,
			legacyNoticeAt: loser.legacy_notice_at,
			legacyKeptAt: loser.legacy_kept_at,
			noEmail: loser.d365_no_email,
			noPhone: loser.d365_no_phone,
			suppressed: loser.d365_suppressed,
			lockedAt: loser.locked_at,
			lockReason: loser.lock_reason,
			originDetail: loser.origin_detail
		});
		// The further of the two LinkedIn statuses stays (D26): a connection is never lost to a
		// duplicate that only had a request, or none.
		if (linkedinRank(loser.linkedin_status) > linkedinRank(survivor.linkedin_status))
			db.prepare(
				`UPDATE people SET linkedin_status = ?, linkedin_status_at = ?, linkedin_status_by = ?
				WHERE id = ?`
			).run(loser.linkedin_status, loser.linkedin_status_at, loser.linkedin_status_by, survivorId);
		// Pak or Bu (D27): the stronger source's answer stays; a call name fills a blank.
		const rank = (p: PersonRow) => (p.salutation_source ? SALUTATION_RANK[p.salutation_source] : 0);
		if (loser.salutation && rank(loser) > rank(survivor))
			db.prepare(
				`UPDATE people SET salutation = ?, salutation_source = ?, salutation_note = ? WHERE id = ?`
			).run(loser.salutation, loser.salutation_source, loser.salutation_note, survivorId);
		if (loser.call_name && !survivor.call_name)
			db.prepare(`UPDATE people SET call_name = ? WHERE id = ?`).run(loser.call_name, survivorId);

		const loserRows = db
			.prepare(`${ROW_FOR_MERGE} WHERE person_id = ?`)
			.all(loserId) as RowForMerge[];
		const survivorRow = db.prepare(`${ROW_FOR_MERGE} WHERE person_id = ? AND event_id = ?`);
		for (const row of loserRows) {
			const mine = survivorRow.get(survivorId, row.event_id) as RowForMerge | undefined;
			if (mine) mergeEventRows(db, mine, row, now);
			else
				db.prepare(`UPDATE event_people SET person_id = ?, updated_at = ? WHERE id = ?`).run(
					survivorId,
					now,
					row.id
				);
		}

		// One check-in per event: where both came, the survivor's own scan stays.
		db.prepare(
			`DELETE FROM checkins WHERE person_id = @loser AND event_id IN
				(SELECT event_id FROM checkins WHERE person_id = @survivor)`
		).run({ loser: loserId, survivor: survivorId });
		db.prepare(`UPDATE checkins SET person_id = ? WHERE person_id = ?`).run(survivorId, loserId);
		db.prepare(
			`UPDATE event_people SET checkin_id = (
				SELECT c.id FROM checkins c WHERE c.event_id = event_people.event_id AND c.person_id = @id
			) WHERE person_id = @id AND checkin_id IS NULL`
		).run({ id: survivorId });

		db.prepare(`DELETE FROM people WHERE id = ?`).run(loserId);
		touchLastEvent(db, survivorId, now);
		logActivity(
			db,
			{ kind: 'merge', who: by, what: { survivorId, loserId }, rowCount: 1 + loserRows.length },
			now
		);
		return true;
	})();
}
