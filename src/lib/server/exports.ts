// Every CSV leaves through here, so the one rule about locked people (D13, §8) cannot be
// forgotten by a route: name and company may go, email, mobile and LinkedIn never.
import { ORIGIN_LABEL } from '../people.ts';
import { toCsv } from './csv.ts';
import type { DB } from './database.ts';
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
