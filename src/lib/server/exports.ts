// Every CSV leaves through here, so the one rule about locked people (D13, §8) cannot be
// forgotten by a route: name and company may go, email, mobile and LinkedIn never.
import { ORIGIN_LABEL } from '../people.ts';
import { logActivity } from './activity-log.ts';
import { toCsv } from './csv.ts';
import type { DB } from './database.ts';
import { listEventPeople, type EventPersonRow } from './event-people.ts';
import { listPeople, type PersonListRow } from './people.ts';
import { keptUntilPerson } from './retention.ts';
import { consentBoxesSince } from './settings.ts';

export interface ExportPerson {
	email: string | null;
	phone: string | null;
	linkedin?: string | null;
	locked_at: number | null;
}

/** The person as they may appear in a spreadsheet: a locked person's channels are blanked. */
export function exportRow<T extends ExportPerson>(person: T): T & { locked: boolean } {
	const locked = person.locked_at !== null;
	return locked
		? { ...person, email: null, phone: null, linkedin: null, locked }
		: { ...person, locked };
}

export const iso = (ts: number | null | undefined) => (ts ? new Date(ts).toISOString() : '');

export const POOL_HEADERS = [
	'Name',
	'Email',
	'Mobile',
	'LinkedIn',
	'Company',
	'Job title',
	'Origin',
	'Kept until (UTC)',
	'Locked',
	'Events attended',
	'Last event',
	'Last seen (UTC)',
	'First seen (UTC)'
];

export function poolRow(p: PersonListRow, since: number | null) {
	const r = exportRow(p);
	const kept = keptUntilPerson(p, { attendee: p.events_attended > 0, replied: !!p.replied, since });
	return [
		r.name,
		r.email,
		r.phone,
		r.linkedin,
		r.company,
		r.job_title,
		ORIGIN_LABEL[r.origin],
		kept === null ? 'until deleted' : iso(kept),
		r.locked ? 'yes' : '',
		r.events_attended,
		r.last_event_name,
		iso(r.last_seen_at),
		iso(r.created_at)
	];
}

/** The Contacts export (§4.5): the default list, or the prospects behind the chip. */
export function poolCsv(db: DB, { prospects = false } = {}) {
	const people = listPeople(db, { limit: 1_000_000, prospects });
	const since = consentBoxesSince(db);
	return {
		csv: toCsv(
			POOL_HEADERS,
			people.map((p) => poolRow(p, since))
		),
		count: people.length
	};
}

/* ───────────────────────── Partner export (D15, §8) ───────────────────────── */

/** "before" the event: who said yes or confirmed; "after": who checked in. */
export type PartnerVariant = 'before' | 'after';

export const isPartnerVariant = (v: unknown): v is PartnerVariant =>
	v === 'before' || v === 'after';

const PARTNER_HEADERS = ['Name', 'Company', 'Title'];
const PARTNER_COUNT_HEADERS = ['Company', 'Count'];

/**
 * Who is in the partner list at all, before the consent split. "Before" is everyone who said
 * yes or confirmed, whether or not they have since walked in: the list may be pulled again
 * once doors open and must not lose people to the check-in desk.
 */
function inPartnerList(
	row: Pick<EventPersonRow, 'stage' | 'reply' | 'confirmed_at' | 'skipped_at'>,
	variant: PartnerVariant
): boolean {
	if (row.skipped_at || row.stage === 'found') return false;
	if (variant === 'after') return row.stage === 'checked_in';
	return row.reply === 'yes' || row.confirmed_at !== null;
}

export interface PartnerRows {
	/** Name, company and title: only people who ticked the share box, never a locked person. */
	named: { name: string; company: string; job_title: string }[];
	/** Everyone else in the list, as a count per company. */
	counts: { company: string; count: number }[];
}

/**
 * Splits the list the way the co-hosts may see it (§8): a name travels only with the share
 * consent, and a locked person's never does (D13), so they are counted among the rest.
 */
export function partnerRows(rows: EventPersonRow[], variant: PartnerVariant): PartnerRows {
	const named: PartnerRows['named'] = [];
	const byCompany = new Map<string, number>();
	for (const r of rows) {
		if (!inPartnerList(r, variant)) continue;
		if (r.consent_share_at !== null && r.locked_at === null)
			named.push({ name: r.name, company: r.company, job_title: r.job_title });
		else byCompany.set(r.company, (byCompany.get(r.company) ?? 0) + 1);
	}
	const collate = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
	named.sort((a, b) => collate(a.company, b.company) || collate(a.name, b.name));
	const counts = [...byCompany]
		.map(([company, count]) => ({ company: company || '(no company)', count }))
		.sort((a, b) => collate(a.company, b.company));
	return { named, counts };
}

/** The partner CSV: the named section, a blank line, then the per-company counts; logged. */
export function partnerExport(
	db: DB,
	eventId: string,
	variant: PartnerVariant,
	{ by = '' }: { by?: string } = {},
	now = Date.now()
) {
	const { named, counts } = partnerRows(listEventPeople(db, eventId), variant);
	const counted = counts.reduce((n, c) => n + c.count, 0);
	const csv =
		toCsv(
			PARTNER_HEADERS,
			named.map((p) => [p.name, p.company, p.job_title])
		) +
		'\r\n' +
		toCsv(
			PARTNER_COUNT_HEADERS,
			counts.map((c) => [c.company, c.count])
		).replace(/^\uFEFF/, '');
	logActivity(
		db,
		{
			eventId,
			kind: 'export',
			who: by,
			what: { export: 'partners', variant, named: named.length, counted },
			rowCount: named.length + counted
		},
		now
	);
	return { csv, named: named.length, counted };
}
