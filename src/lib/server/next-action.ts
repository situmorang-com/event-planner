import type { MessageKind, NextActionKind, Reply, Stage } from '../people.ts';
import { DAY, endOfDay } from '../time.ts';
import type { DB } from './database.ts';
import { contactBlock, isLegacy, type PersonRow } from './people.ts';
import {
	chaseDefaults,
	consentBoxesSince,
	mergeChaseRules,
	parseChaseOverride,
	type ChaseRules
} from './settings.ts';

/*
 * The chase rules (D20, §5.2): what each live row is due next, a chase or a reminder, and
 * when. computeNextAction() is pure, so the table in next-action.spec.ts covers every branch
 * without a database; the recompute functions below store its answer on event_people after
 * every write to a row, its touches or its event, and the daily job runs them for everyone.
 */

export type NextAction = { kind: NextActionKind; at: number } | null;

/** The touch kinds the rules count; `manual` and the thank-yous never advance a clock. */
type TouchKind = MessageKind | 'manual';

/** What the rules read off an event row. */
export interface RuleRow {
	stage: Stage;
	reply: Reply;
	replied_at: number | null;
	invited_at: number | null;
	last_contacted_at: number | null;
	confirmed_at: number | null;
	skipped_at: number | null;
	next_action_at: number | null;
	next_action_kind: NextActionKind | null;
	next_action_overridden: 0 | 1;
	/** Every touch on the row, any order. */
	touches: { kind: TouchKind; at: number }[];
}

/** The person behind the row, with the one fact the row can't tell: whether they ever attended. */
export type RulePerson = Pick<
	PersonRow,
	| 'locked_at'
	| 'd365_suppressed'
	| 'd365_no_email'
	| 'd365_no_phone'
	| 'is_customer'
	| 'origin'
	| 'consent_future_at'
	| 'legacy_notice_at'
	| 'legacy_kept_at'
	| 'created_at'
	| 'country'
	| 'phone'
> & { attendee: boolean };

export type RuleCompany = { never_invite_at: number | null } | null;
export type RuleEvent = { starts_at: number | null; timezone: string };

const weekdayFormat = new Map<string, Intl.DateTimeFormat>();

function weekday(ts: number, timeZone: string): string {
	let f = weekdayFormat.get(timeZone);
	if (!f)
		weekdayFormat.set(
			timeZone,
			(f = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }))
		);
	return f.format(ts);
}

function isWorkingDay(ts: number, timeZone: string): boolean {
	const day = weekday(ts, timeZone);
	return day !== 'Sat' && day !== 'Sun';
}

/**
 * `n` working days (Mon–Fri in the event's zone; public holidays are not modelled) after
 * `ts`, at the same time of day. From a weekend, Monday is the first working day counted.
 */
export function addWorkingDays(ts: number, n: number, timeZone: string): number {
	let t = ts;
	for (let left = Math.max(0, Math.round(n)); left > 0; left--) {
		t += DAY;
		while (!isWorkingDay(t, timeZone)) t += DAY;
	}
	return t;
}

/** §2.3: a customer, an attendee or someone who ticked "future events" gets the longer cap. */
function hasRelationship(
	person: Pick<RulePerson, 'is_customer' | 'consent_future_at' | 'attendee'>
): boolean {
	return !!person.is_customer || person.attendee || !!person.consent_future_at;
}

/**
 * The kinds that count against the cap on each path (§5.2). The legacy notice is a legacy
 * attendee's invitation (§8), so it counts as one.
 */
const CHASE_TOUCHES: TouchKind[] = ['invitation', 'chase', 'legacy_notice'];
const MAYBE_TOUCHES: TouchKind[] = ['invitation', 'chase', 'followup_maybe', 'legacy_notice'];

/** The organizer's own date is a date only: the kind follows the row's answer (§4.2). */
export function overrideKind(row: Pick<RuleRow, 'reply' | 'stage'>): NextActionKind {
	return row.reply === 'yes' || row.stage === 'confirmed' ? 'reminder' : 'chase';
}

/** An override only holds while the organizer's date and its kind are both still stored. */
const overrideHolds = (
	row: Pick<RuleRow, 'next_action_overridden' | 'next_action_at' | 'next_action_kind'>
) => !!row.next_action_overridden && row.next_action_at !== null && !!row.next_action_kind;

/**
 * §5.2, line by line. `consentBoxesSince` feeds contactable(); `now` floors the reminder and
 * ends everything once the event has begun.
 */
export function computeNextAction(
	row: RuleRow,
	person: RulePerson | null,
	company: RuleCompany,
	event: RuleEvent,
	rules: ChaseRules,
	now: number,
	consentBoxesSince: number | null = null
): NextAction {
	const { starts_at } = event;
	if (!person || starts_at === null || now >= starts_at) return null;
	if (person.locked_at || company?.never_invite_at || person.d365_suppressed) return null;
	if (
		contactBlock(person, 'whatsapp', consentBoxesSince) &&
		contactBlock(person, 'email', consentBoxesSince)
	)
		return null;
	if (row.stage === 'found' || row.stage === 'checked_in' || row.skipped_at) return null;
	if (row.reply === 'no') return null;
	// A legacy attendee gets one message, the notice, and is kept only if they answer it (§8):
	// nothing is due until they do.
	if (isLegacy(person, consentBoxesSince) && person.legacy_notice_at && !person.legacy_kept_at)
		return null;

	if (overrideHolds(row)) return { kind: overrideKind(row), at: row.next_action_at! };

	const cap = rules.maxTouches[hasRelationship(person) ? 'relationship' : 'none'];
	const stop = starts_at - rules.stopDaysBeforeEvent * DAY;
	const chase = (counted: TouchKind[], from: number): NextAction => {
		if (row.touches.filter((t) => counted.includes(t.kind)).length >= cap) return null;
		const at = addWorkingDays(from, rules.chaseAfterWorkingDays, event.timezone);
		return at >= stop ? null : { kind: 'chase', at };
	};

	if (row.stage === 'shortlisted') return null;
	if (row.stage === 'invited')
		return chase(CHASE_TOUCHES, row.last_contacted_at ?? row.invited_at ?? now);
	if (row.reply === 'maybe' && !row.confirmed_at) {
		// The clock starts at the reply and restarts at each counted follow-up sent since; a
		// manual note or a thank-you doesn't move it.
		const sent = row.touches.filter((t) => MAYBE_TOUCHES.includes(t.kind)).map((t) => t.at);
		return chase(MAYBE_TOUCHES, Math.max(row.replied_at ?? 0, ...sent) || now);
	}
	if (row.reply === 'yes' || row.stage === 'confirmed') {
		if (row.touches.some((t) => t.kind === 'reminder')) return null;
		return { kind: 'reminder', at: Math.max(now, starts_at - rules.reminderDaysBefore * DAY) };
	}
	return null;
}

/* ───────────────────────── Rules per event ───────────────────────── */

type RulesEvent = { chase_rules: string | null };

/** The settings defaults with the event's own fields over them (§5.1). */
export function rulesFor(db: DB, event: RulesEvent): ChaseRules {
	return mergeChaseRules(chaseDefaults(db), parseChaseOverride(event.chase_rules));
}

/* ───────────────────────── Storing the answer ───────────────────────── */

interface StoredRow extends Omit<RuleRow, 'touches'> {
	id: number;
	event_id: string;
	person_id: string | null;
	locked_at: number | null;
	d365_suppressed: 0 | 1 | null;
	d365_no_email: 0 | 1 | null;
	d365_no_phone: 0 | 1 | null;
	is_customer: 0 | 1 | null;
	origin: PersonRow['origin'] | null;
	consent_future_at: number | null;
	legacy_notice_at: number | null;
	legacy_kept_at: number | null;
	person_created_at: number | null;
	country: PersonRow['country'];
	phone: string | null;
	attendee: 0 | 1;
	never_invite_at: number | null;
	/** JSON array of {kind, at}. */
	touches_json: string;
}

interface StoredEvent extends RuleEvent, RulesEvent {
	id: string;
}

const ROW_SELECT = `SELECT ep.id, ep.event_id, ep.person_id, ep.stage, ep.reply, ep.replied_at,
	ep.invited_at, ep.last_contacted_at, ep.confirmed_at, ep.skipped_at, ep.next_action_at,
	ep.next_action_kind, ep.next_action_overridden,
	p.locked_at, p.d365_suppressed, p.d365_no_email, p.d365_no_phone, p.is_customer, p.origin,
	p.consent_future_at, p.legacy_notice_at, p.legacy_kept_at, p.created_at AS person_created_at,
	p.country, p.phone,
	EXISTS (SELECT 1 FROM checkins c WHERE c.person_id = p.id) AS attendee,
	co.never_invite_at,
	(SELECT json_group_array(json_object('kind', t.kind, 'at', t.at)) FROM touches t
		WHERE t.event_person_id = ep.id) AS touches_json
	FROM event_people ep
		LEFT JOIN people p ON p.id = ep.person_id
		LEFT JOIN companies co ON co.id = COALESCE(p.company_id, ep.company_id)`;

const EVENT_SELECT = `SELECT id, starts_at, timezone, chase_rules FROM events`;

function personOf(r: StoredRow): RulePerson | null {
	if (!r.person_id || !r.origin) return null;
	return {
		locked_at: r.locked_at,
		d365_suppressed: r.d365_suppressed ?? 0,
		d365_no_email: r.d365_no_email ?? 0,
		d365_no_phone: r.d365_no_phone ?? 0,
		is_customer: r.is_customer ?? 0,
		origin: r.origin,
		consent_future_at: r.consent_future_at,
		legacy_notice_at: r.legacy_notice_at,
		legacy_kept_at: r.legacy_kept_at,
		created_at: r.person_created_at ?? 0,
		country: r.country,
		phone: r.phone,
		attendee: !!r.attendee
	};
}

const UPDATE = `UPDATE event_people SET next_action_at = @at, next_action_kind = @kind,
	next_action_overridden = @overridden WHERE id = @id`;

/** Computes and stores one row's answer. Returns what was stored. */
function storeRow(
	db: DB,
	r: StoredRow,
	event: StoredEvent,
	rules: ChaseRules,
	since: number | null,
	now: number
): NextAction {
	const touches = JSON.parse(r.touches_json) as RuleRow['touches'];
	const next = computeNextAction({ ...r, touches }, personOf(r), r, event, rules, now, since);
	// The flag survives only when the organizer's date was actually kept: a stale flag beside a
	// nulled date (a lock since lifted) must not turn the rules' own answer into an override.
	const overridden = next && overrideHolds(r) ? 1 : 0;
	const unchanged =
		(next?.at ?? null) === r.next_action_at &&
		(next?.kind ?? null) === r.next_action_kind &&
		overridden === r.next_action_overridden;
	// A reminder floored to "now" would move with every recompute; once it is due it stays put.
	const settled =
		next?.kind === 'reminder' &&
		r.next_action_kind === 'reminder' &&
		r.next_action_at !== null &&
		r.next_action_at <= now &&
		next.at === now;
	if (unchanged || settled) return next;
	db.prepare(UPDATE).run({
		id: r.id,
		at: next?.at ?? null,
		kind: next?.kind ?? null,
		overridden
	});
	return next;
}

/** After a write to one row or its touches: its stored next action follows. */
export function recomputeRow(db: DB, rowId: number, now = Date.now()): NextAction {
	const r = db.prepare(`${ROW_SELECT} WHERE ep.id = ?`).get(rowId) as StoredRow | undefined;
	if (!r) return null;
	const event = db.prepare(`${EVENT_SELECT} WHERE id = ?`).get(r.event_id) as
		StoredEvent | undefined;
	if (!event) return null;
	return storeRow(db, r, event, rulesFor(db, event), consentBoxesSince(db), now);
}

/**
 * After a write to the person that every row of theirs reads (a lock lifted, a country, a
 * consent, a check-in elsewhere, a merge): each of their rows follows.
 */
export function recomputePerson(db: DB, personId: string, now = Date.now()) {
	const rows = db.prepare(`SELECT id FROM event_people WHERE person_id = ?`).all(personId) as {
		id: number;
	}[];
	for (const { id } of rows) recomputeRow(db, id, now);
}

/** After a write to the event (date, rules) or to something many rows share: every row. */
export function recomputeEvent(db: DB, eventId: string, now = Date.now()): number {
	const event = db.prepare(`${EVENT_SELECT} WHERE id = ?`).get(eventId) as StoredEvent | undefined;
	if (!event) return 0;
	return db.transaction(() => {
		// Once the event has begun nothing is due; one statement does it without reading rows.
		if (event.starts_at === null || now >= event.starts_at) {
			db.prepare(
				`UPDATE event_people SET next_action_at = NULL, next_action_kind = NULL,
					next_action_overridden = 0
				WHERE event_id = ? AND (next_action_at IS NOT NULL OR next_action_overridden = 1)`
			).run(eventId);
			return 0;
		}
		const rules = rulesFor(db, event);
		const since = consentBoxesSince(db);
		const rows = db.prepare(`${ROW_SELECT} WHERE ep.event_id = ?`).all(eventId) as StoredRow[];
		let due = 0;
		for (const r of rows) if (storeRow(db, r, event, rules, since, now)) due++;
		return due;
	})();
}

/** The daily pass (§5.4), and after the chase defaults change: every event. */
export function recomputeAll(db: DB, now = Date.now()) {
	const events = db.prepare(`SELECT id FROM events`).all() as { id: string }[];
	for (const { id } of events) recomputeEvent(db, id, now);
}

/* ───────────────────────── Override and counts ───────────────────────── */

/**
 * The organizer's own date on a row (§4.2): kept until cleared, whatever the rules say,
 * unless they say "none" for good (a no, a lock, a check-in). Null restores the computed one.
 */
export function setNextActionOverride(
	db: DB,
	eventId: string,
	rowId: number,
	at: number | null,
	now = Date.now()
): NextAction {
	return db.transaction(() => {
		const r = db
			.prepare(`SELECT reply, stage FROM event_people WHERE id = ? AND event_id = ?`)
			.get(rowId, eventId) as Pick<StoredRow, 'reply' | 'stage'> | undefined;
		if (!r) return null;
		if (at === null) db.prepare(UPDATE).run({ id: rowId, at: null, kind: null, overridden: 0 });
		else db.prepare(UPDATE).run({ id: rowId, at, kind: overrideKind(r), overridden: 1 });
		return recomputeRow(db, rowId, now);
	})();
}

/**
 * Rows due by the end of today in the event's zone (D20): the card's "Due today k". Reads
 * what the rules stored, so an event that has begun since the last pass counts nothing.
 */
export function countDue(
	db: DB,
	event: { id: string; timezone: string; starts_at: number | null },
	now = Date.now()
) {
	if (event.starts_at === null || now >= event.starts_at) return 0;
	return (
		db
			.prepare(
				`SELECT COUNT(*) AS n FROM event_people
				WHERE event_id = ? AND skipped_at IS NULL AND next_action_at IS NOT NULL
					AND next_action_at <= ?`
			)
			.get(event.id, endOfDay(now, event.timezone)) as { n: number }
	).n;
}
