import type { EventPersonRow } from './event-people.ts';
import type { EventRow } from './events.ts';
import { countryOf, isLegacy, type PersonRow } from './people.ts';

/*
 * The retention rules (§5.4, D10, D17, D18) as pure functions: when a person or a Found row
 * will be deleted by housekeeping. The jobs, the Settings table, the Contacts page and the
 * exports all read these, so the date shown is the date the job acts on, never a near copy.
 */

export const DAY = 86_400_000;
/** Found rows, skipped included, go this long after the event starts (D10). */
export const PLANNING_PURGE_DAYS = 90;
/** Research and typed prospects who never replied go this long after their last event (D18). */
export const PROSPECT_MONTHS = 12;
/** A legacy Indonesian attendee has this long to answer the notice (D15; builder's choice). */
export const LEGACY_NOTICE_DAYS = 30;

/** Calendar months on, so "12 months" lands on the same day of the month. */
export function addMonths(ts: number, months: number): number {
	const d = new Date(ts);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d.getTime();
}

/* ───────────────────────── People ───────────────────────── */

export type RetentionPerson = Pick<
	PersonRow,
	| 'origin'
	| 'is_customer'
	| 'consent_future_at'
	| 'legacy_notice_at'
	| 'legacy_kept_at'
	| 'last_event_at'
	| 'created_at'
	| 'country'
	| 'phone'
>;

/** What the person's own row can't say: whether they attended or replied, and when the boxes shipped. */
export interface PersonFacts {
	attendee: boolean;
	/** Said yes, maybe or no on some event. */
	replied: boolean;
	/** `consent_boxes_since`, which decides who is legacy (§2.3). */
	since: number | null;
}

export type PersonRule = 'legacy' | 'prospect' | 'kept';

export interface PersonRetention {
	rule: PersonRule;
	/** When the job deletes them; null means until deleted by hand (or, legacy, until noticed). */
	until: number | null;
}

type LegacyPerson = Pick<
	RetentionPerson,
	'origin' | 'consent_future_at' | 'created_at' | 'country' | 'phone' | 'legacy_kept_at'
>;

/** A past attendee in Indonesia the boxes never reached: they get one notice and 30 days (§8). */
export function isLegacyIndonesian(person: LegacyPerson, since: number | null): boolean {
	return isLegacy(person, since) && countryOf(person) === 'ID';
}

/** Still on the legacy clock: told or not, they haven't answered since. */
export function underLegacyRule(person: LegacyPerson, since: number | null): boolean {
	return isLegacyIndonesian(person, since) && !person.legacy_kept_at;
}

/**
 * Which rule holds a person and the date it acts on (§5.4). A legacy attendee is on the clock
 * from the notice unless they answered since; anyone with a relationship or a reply is kept
 * until deleted by hand; the rest are prospects on the twelve-month clock.
 */
export function personRetention(person: RetentionPerson, facts: PersonFacts): PersonRetention {
	if (underLegacyRule(person, facts.since))
		return {
			rule: 'legacy',
			until: person.legacy_notice_at ? person.legacy_notice_at + LEGACY_NOTICE_DAYS * DAY : null
		};
	const kept =
		facts.attendee ||
		facts.replied ||
		!!person.is_customer ||
		!!person.consent_future_at ||
		(person.origin !== 'research' && person.origin !== 'typed');
	if (kept) return { rule: 'kept', until: null };
	return {
		rule: 'prospect',
		until: addMonths(person.last_event_at ?? person.created_at, PROSPECT_MONTHS)
	};
}

/** When housekeeping will delete this person; null means until deleted by hand. */
export function keptUntilPerson(person: RetentionPerson, facts: PersonFacts): number | null {
	return personRetention(person, facts).until;
}

/* ───────────────────────── Rows and events ───────────────────────── */

export type RetentionEvent = Pick<EventRow, 'starts_at' | 'planning_purged_at'>;

/** When the planning purge runs for an event: 90 days after it starts; null without a date. */
export function planningKeptUntil(event: Pick<EventRow, 'starts_at'>): number | null {
	return event.starts_at === null ? null : event.starts_at + PLANNING_PURGE_DAYS * DAY;
}

/**
 * When a row goes on its own (§5.4): a Found row nobody approved at the event start, a skipped
 * one with the planning purge. A live row is the person's, so it follows the person's rule.
 */
export function keptUntilRow(
	row: Pick<EventPersonRow, 'stage' | 'skipped_at'>,
	event: Pick<EventRow, 'starts_at'>
): number | null {
	if (row.stage !== 'found' || event.starts_at === null) return null;
	return row.skipped_at === null ? event.starts_at : planningKeptUntil(event);
}

/* ───────────────────────── The table (§5.4) ───────────────────────── */

export type RetentionKey =
	'found_unapproved' | 'found_skipped' | 'prospect' | 'legacy' | 'kept' | 'logs' | 'dnc';

export interface RetentionRule {
	key: RetentionKey;
	what: string;
	until: string;
}

/** The retention table as Settings and the README print it; the counts come from housekeeping. */
export const RETENTION_RULES: RetentionRule[] = [
	{ key: 'found_unapproved', what: 'Research finds nobody approved', until: 'the event starts' },
	{
		key: 'found_skipped',
		what: 'Research finds that were skipped',
		until: `${PLANNING_PURGE_DAYS} days after the event starts, or Delete planning data`
	},
	{
		key: 'prospect',
		what: 'People found by research or typed in who never replied',
		until: `${PROSPECT_MONTHS} months after their last event`
	},
	{
		key: 'legacy',
		what: 'Past attendees in Indonesia who never ticked “future events”',
		until: `${LEGACY_NOTICE_DAYS} days after the notice, unless they reply`
	},
	{ key: 'kept', what: 'Attendees, customers and anyone who replied', until: 'deleted by hand' },
	{ key: 'logs', what: 'Touch and activity logs', until: 'with the row or the event' },
	{ key: 'dnc', what: 'Do-not-contact entries', until: 'forever; removed by hand, with a reason' }
];
