// The People page's view of an event (§4.2) and what its add form sends, kept out of the
// route so the shaping and the ≤10 / park / pool rules can be tested on a memory database.
import { isReply, linkedinProfile } from '../invitations.ts';
import {
	chipCounts,
	isDue,
	type Chip,
	type MessageKind,
	type PeopleRow,
	type RowMessage,
	type Today
} from '../people.ts';
import { endOfDay, startOfDay } from '../time.ts';
import type { DB } from './database.ts';
import {
	addFound,
	addShortlisted,
	hasEnded,
	listEventPeople,
	parseExtra,
	type EventPersonRow,
	type GuestInput,
	type Refusal,
	type RowExtra
} from './event-people.ts';
import type { EventRow } from './events.ts';
import { countryOf, type CountryOption } from './guest-list.ts';
import { contactPerson, registrationUrl, rowMessage, type MessagingEnv } from './messaging.ts';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from './normalize.ts';
import { contactBlock, type PersonRow } from './people.ts';
import { isLegacyIndonesian } from './retention.ts';
import { consentBoxesSince, type Country } from './settings.ts';
import { suggestedTouchKind } from './stages.ts';

/** Rows at one company; "No company" sorts last. */
export interface CompanyGroup {
	key: string;
	id: string | null;
	name: string;
	owner: string | null;
	/** The company's own phone country (D14); null follows the event. */
	phone_country: Country | null;
	blocked: boolean;
	blocked_reason: string | null;
	rows: PeopleRow[];
}

export interface PeopleView {
	rows: PeopleRow[];
	groups: CompanyGroup[];
	counts: Record<Chip, number>;
	ended: boolean;
	/** Yes replies against the target, with confirmations beside it (D8). */
	progress: { yes: number; confirmed: number; target: number | null };
	/** Today in the event's zone, so the page can tell due from overdue (§4.2). */
	today: Today;
	/** Rows due today or earlier (D20). */
	due: number;
}

/** The row's legacy state (§8) when its person is a legacy Indonesian attendee, else null. */
export function legacyOf(row: EventPersonRow, since: number | null): PeopleRow['legacy'] {
	const person = row.person_id === null ? null : contactPerson(row);
	if (!person || !isLegacyIndonesian({ ...person, legacy_kept_at: row.legacy_kept_at }, since))
		return null;
	return { notice_at: row.legacy_notice_at, kept_at: row.legacy_kept_at };
}

/**
 * The kind the row's buttons open first (§7): the invitation until they have one (for a
 * legacy attendee not yet told, the notice is the invitation, §8); then the reminder once the
 * rules say it is due, by `dueBy` (the end of today); otherwise what their answer calls for.
 * A yes two weeks out gets the thank-you, not a reminder sent early and then never again.
 */
export function suggestedKind(
	row: EventPersonRow,
	since: number | null,
	dueBy: number
): MessageKind {
	if (row.stage === 'shortlisted') {
		const legacy = legacyOf(row, since);
		return legacy && !legacy.notice_at && !legacy.kept_at ? 'legacy_notice' : 'invitation';
	}
	const due = row.next_action_at !== null && row.next_action_at <= dueBy;
	if (due && row.next_action_kind === 'reminder') return 'reminder';
	return suggestedTouchKind(row);
}

export function toView(
	row: EventPersonRow,
	since: number | null,
	dueBy: number,
	message: RowMessage | null = null,
	registrationLink: string | null = null
): PeopleRow {
	// A Found row has no person yet, so nothing can be closed to it except its company.
	const person = row.person_id === null ? null : contactPerson(row);
	const whatsapp = person ? contactBlock(person, 'whatsapp', since) : null;
	const email = person ? contactBlock(person, 'email', since) : null;
	return {
		id: row.id,
		person_id: row.person_id,
		company_id: row.company_id,
		name: row.name,
		job_title: row.job_title,
		email: row.email,
		phone: row.phone,
		linkedin: row.linkedin,
		linkedin_status: row.linkedin_status ?? 'none',
		linkedin_status_at: row.linkedin_status_at,
		linkedin_status_by: row.linkedin_status_by || null,
		company: row.company,
		company_key: row.company_key,
		company_phone_country: row.company_phone_country,
		source_url: row.source_url,
		reason: row.reason,
		stage: row.stage,
		skipped_at: row.skipped_at,
		source: row.source,
		reply: row.reply,
		replied_at: row.replied_at,
		invited_at: row.invited_at,
		invited_via: row.invited_via,
		last_contacted_at: row.last_contacted_at,
		confirmed_at: row.confirmed_at,
		checkin_id: row.checkin_id,
		checked_in_at: row.checked_in_at,
		consent_event_at: row.consent_event_at,
		owner: row.owner,
		company_owner: row.company_owner,
		note: row.note,
		locked_at: row.locked_at,
		blocked_at: row.blocked_at,
		blocked_reason: row.blocked_reason,
		// A Found row from D365 carries the flag in its snapshot until Add refuses it (§6.1).
		suppressed: !!row.d365_suppressed || !!parseExtra(row.extra)?.suppressed,
		d365_flagged: !!row.d365_suppressed || !!row.d365_no_email || !!row.d365_no_phone,
		chase_count: row.chase_count,
		touch_count: row.touch_count,
		contact: {
			whatsapp: !!person && whatsapp === null && !row.blocked_at,
			email: !!person && email === null && !row.blocked_at,
			reason: whatsapp && email ? whatsapp : null
		},
		message,
		needs_review: !!row.needs_review,
		registration_link: registrationLink,
		next_action_at: row.next_action_at,
		next_action_kind: row.next_action_kind,
		next_action_overridden: !!row.next_action_overridden,
		suggested_kind: suggestedKind(row, since, dueBy),
		legacy: legacyOf(row, since)
	};
}

export function groupRows(rows: PeopleRow[]): CompanyGroup[] {
	const groups = new Map<string, CompanyGroup>();
	for (const row of rows) {
		let group = groups.get(row.company_key);
		if (!group)
			groups.set(
				row.company_key,
				(group = {
					key: row.company_key,
					id: row.company_id,
					name: row.company,
					owner: row.company_owner,
					phone_country: row.company_phone_country,
					blocked: !!row.blocked_at,
					blocked_reason: row.blocked_reason,
					rows: []
				})
			);
		group.rows.push(row);
	}
	return [...groups.values()].sort((a, b) =>
		!a.key ? 1 : !b.key ? -1 : a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
	);
}

/**
 * Everything the People page shows. `env` renders each row's message (§7); without it the rows
 * carry no message, which is enough for counts and chips.
 */
export function peopleView(
	db: DB,
	event: EventRow,
	env: MessagingEnv | null = null,
	now = Date.now()
): PeopleView {
	const since = consentBoxesSince(db);
	const today = { start: startOfDay(now, event.timezone), end: endOfDay(now, event.timezone) };
	// A link needs the event's date (its expiry) and a person behind the row to answer for;
	// a blocked company's people get none (D13).
	const linkable = env && event.starts_at !== null;
	const rows = listEventPeople(db, event.id).map((r) =>
		toView(
			r,
			since,
			today.end,
			env
				? rowMessage(db, { row: r, event, since }, env, suggestedKind(r, since, today.end))
				: null,
			linkable && r.stage !== 'found' && !r.blocked_at ? registrationUrl(r, event, env) : null
		)
	);
	// A row skipped by "not me" is nobody's reply (D8).
	const live = rows.filter((r) => r.stage !== 'found' && !r.skipped_at);
	return {
		rows,
		groups: groupRows(rows),
		counts: chipCounts(rows, hasEnded(event, now)),
		ended: hasEnded(event, now),
		progress: {
			yes: live.filter((r) => r.reply === 'yes').length,
			confirmed: live.filter((r) => r.confirmed_at !== null).length,
			target: event.target_count
		},
		today,
		due: rows.filter((r) => isDue(r, today)).length
	};
}

/* ───────────────────────── The add form ───────────────────────── */

/** Typed lists up to this size are shortlisted at once; bigger pastes wait at Found (D5). */
export const FOUND_THRESHOLD = 10;

/**
 * Rows checked field by field in the add form, as JSON. Every field is cleaned again here;
 * returns the first problem as a message instead when a row can't be saved.
 */
export function reviewedGuests(
	raw: string,
	company: string,
	country: CountryOption
): GuestInput[] | string {
	let rows: unknown;
	try {
		rows = JSON.parse(raw);
	} catch {
		return 'Those rows didn’t arrive intact. Please try again.';
	}
	if (!Array.isArray(rows)) return 'Those rows didn’t arrive intact. Please try again.';
	const guests: GuestInput[] = [];
	for (const [i, row] of rows.slice(0, 1000).entries()) {
		const r = (row ?? {}) as Record<string, unknown>;
		const email = normalizeEmail(r.email);
		const linkedinText = cleanText(r.linkedin, 300);
		const extra = readExtra(r.extra);
		const rowCompany = cleanText(r.company, 120) || company;
		const guest: GuestInput = {
			name: cleanText(r.name, 100),
			company: rowCompany,
			jobTitle: cleanText(r.jobTitle, 120),
			email,
			phone: normalizePhone(r.phone, countryOf(country, rowCompany)),
			linkedin: linkedinProfile(linkedinText),
			reply: isReply(r.reply) ? r.reply : 'pending',
			note: cleanText(r.note, 300),
			...(extra ? { extra } : {})
		};
		const which = `Row ${i + 1}${guest.name ? ` (${guest.name})` : ''}`;
		if (!guest.name) return `${which} needs a name.`;
		if (email && !isValidEmail(email)) return `${which}: check the email.`;
		if (linkedinText && !guest.linkedin)
			return `${which}: that isn’t a LinkedIn profile link (linkedin.com/in/…).`;
		guests.push(guest);
	}
	return guests;
}

/** The D365 flags a reviewed row carries back from the review card, as booleans and short text. */
function readExtra(raw: unknown): RowExtra | null {
	if (!raw || typeof raw !== 'object') return null;
	const e = raw as Record<string, unknown>;
	return {
		isCustomer: !!e.isCustomer,
		doNotEmail: !!e.doNotEmail,
		doNotPhone: !!e.doNotPhone,
		suppressed: !!e.suppressed,
		owner: cleanText(e.owner, 100),
		status: cleanText(e.status, 60)
	};
}

export interface AddRequest {
	/** Typed, pasted or reviewed rows. */
	typed: GuestInput[];
	/** People picked from the pool. */
	picked: PersonRow[];
	/** The company typed in the form; a pick keeps its own when this is empty. */
	company: string;
	/** "Park as Found": typed rows wait for review instead of going live. */
	park: boolean;
	/** The one-time "where did you get their details" answer for typed rows (D16). */
	originDetail?: string;
	/** The rows came from a Dynamics 365 export: customers, stamped `d365` (D11, D16). */
	d365?: boolean;
}

export interface AddSummary {
	added: number;
	found: number;
	duplicates: string[];
	refused: Refusal[];
}

/**
 * Typed rows up to the threshold go straight to Shortlisted; parked ones and bigger pastes
 * land at Found with their snapshot (D5). Pool picks are always shortlisted: they are people
 * already.
 */
export function addPeople(
	db: DB,
	eventId: string,
	req: AddRequest,
	{ by = '' } = {},
	now = Date.now()
): AddSummary {
	return db.transaction((): AddSummary => {
		const summary: AddSummary = { added: 0, found: 0, duplicates: [], refused: [] };
		if (req.picked.length) {
			// The picker knows the person by id, so the lock is checked on the record itself: a
			// locked person with no channels and a new company would otherwise slip past the hashes.
			const picks: GuestInput[] = [];
			for (const p of req.picked) {
				if (p.locked_at) summary.refused.push({ name: p.name, reason: 'locked' });
				else if (p.d365_suppressed) summary.refused.push({ name: p.name, reason: 'suppressed' });
				else
					picks.push({
						name: p.name,
						company: req.company || p.company,
						jobTitle: p.job_title,
						email: p.email,
						phone: p.phone,
						linkedin: p.linkedin
					});
			}
			if (picks.length) {
				const r = addShortlisted(db, eventId, picks, { source: 'pool', by }, now);
				summary.added += r.added.length;
				summary.duplicates.push(...r.duplicates);
				summary.refused.push(...r.refused);
			}
		}
		if (req.typed.length) {
			const bigPaste = req.typed.length > FOUND_THRESHOLD;
			// D365 rows keep their source at any size, so the people they become are customers.
			const typed = req.typed.map((g) =>
				req.d365 ? { ...g, extra: { isCustomer: true, ...g.extra } } : g
			);
			if (req.park || bigPaste) {
				const r = addFound(
					db,
					eventId,
					typed,
					{
						source: req.d365 ? 'd365' : bigPaste ? 'paste' : 'typed',
						by,
						originDetail: req.originDetail
					},
					now
				);
				summary.found += r.added;
				summary.refused.push(...r.refused);
				if (r.skipped) summary.duplicates.push(`${r.skipped} already on the list`);
			} else {
				const r = addShortlisted(
					db,
					eventId,
					typed,
					{ source: req.d365 ? 'd365' : 'typed', by, originDetail: req.originDetail },
					now
				);
				summary.added += r.added.length;
				summary.duplicates.push(...r.duplicates);
				summary.refused.push(...r.refused);
			}
		}
		return summary;
	})();
}
