// The guest list as the Invitations page and its CSV know it, on top of event rows. A thin
// layer until the People page replaces that UI; new code should use event-people.ts directly.
import { companyKey, nameKey, type Reply } from '../invitations.ts';
import { companySuggestions as companies, renameCompanyByKey } from './companies.ts';
import type { DB } from './database.ts';
import {
	addShortlisted,
	listEventPeople,
	listWalkIns,
	onEventCheck,
	removeRow,
	rowByCheckin,
	setDetails,
	setNote as noteRow,
	setReply as replyRow,
	type EventPersonRow,
	type GuestInput
} from './event-people.ts';
import { peopleAtCompany, type PersonRow } from './people.ts';

export type { GuestInput };

export interface InvitationRow {
	id: number;
	event_id: string;
	name: string;
	company: string;
	job_title: string;
	email: string | null;
	phone: string | null;
	linkedin: string | null;
	reply: Reply;
	note: string;
	replied_at: number | null;
	created_at: number;
	updated_at: number;
	/** When they checked in at the event, if they have. */
	arrived_at: number | null;
}

export interface GuestDetails {
	name: string;
	company: string;
	jobTitle: string;
	email: string | null;
	phone: string | null;
	linkedin?: string | null;
}

const shape = (r: EventPersonRow): InvitationRow => ({
	id: r.id,
	event_id: r.event_id,
	name: r.name,
	company: r.company,
	job_title: r.job_title,
	email: r.email,
	phone: r.phone,
	linkedin: r.linkedin,
	reply: r.reply,
	note: r.note,
	replied_at: r.replied_at,
	created_at: r.created_at,
	updated_at: r.updated_at,
	arrived_at: r.checked_in_at
});

/** The guest list: live rows, except walk-ins nobody has given a reply yet (they list apart). */
function isGuest(r: EventPersonRow) {
	return r.stage !== 'found' && !(r.source === 'walk_in' && r.reply === 'pending');
}

export function listInvitations(db: DB, eventId: string): InvitationRow[] {
	return listEventPeople(db, eventId).filter(isGuest).map(shape);
}

export function countInvitations(db: DB, eventId: string): number {
	return listEventPeople(db, eventId).filter(isGuest).length;
}

/** Tells whether someone is already on an event, found or live. */
export function guestListCheck(db: DB, eventId: string) {
	return onEventCheck(db, eventId);
}

/** Adds everyone who isn't on the list yet; pasting the same list twice changes nothing. */
export function addInvitations(db: DB, eventId: string, guests: GuestInput[], now = Date.now()) {
	const { added, duplicates, refused } = addShortlisted(
		db,
		eventId,
		guests,
		{ source: 'typed' },
		now
	);
	return { added, duplicates: [...duplicates, ...refused.map((r) => r.name)] };
}

/** Someone who checked in without being invited, put on the list as attending. */
export function addWalkIn(db: DB, eventId: string, checkinId: number, now = Date.now()) {
	const row = rowByCheckin(db, checkinId);
	if (!row || row.event_id !== eventId) return null;
	if (row.reply === 'pending') replyRow(db, eventId, row.id, 'yes', now);
	return row.name;
}

export function setReply(db: DB, eventId: string, id: number, reply: Reply, now = Date.now()) {
	replyRow(db, eventId, id, reply, now);
}

export function setNote(db: DB, eventId: string, id: number, note: string, now = Date.now()) {
	noteRow(db, eventId, id, note, now);
}

export function updateInvitation(
	db: DB,
	eventId: string,
	id: number,
	details: GuestDetails,
	now = Date.now()
) {
	setDetails(db, eventId, id, details, now);
}

export function removeInvitation(db: DB, eventId: string, id: number) {
	removeRow(db, eventId, id);
}

/** Renames every spelling of one company, e.g. to fold "PT Batavia" into "Batavia Foods". */
export function renameCompany(
	db: DB,
	_eventId: string,
	fromKey: string,
	to: string,
	now = Date.now()
) {
	// Companies are global now (D4), so the rename reaches every event and the pool.
	renameCompanyByKey(db, fromKey, to, now);
}

export function mostCommon(spellings: Map<string, number>): string {
	let best = '';
	let count = 0;
	// Map order is first-seen order, so a tie goes to the spelling used first.
	for (const [spelling, n] of spellings) if (n > count) [best, count] = [spelling, n];
	return best;
}

export interface CompanyGroup<T> {
	/** companyKey(); '' for guests without a company. */
	key: string;
	name: string;
	guests: T[];
}

/** Guests by company, however each one's company was spelled. "No company" comes last. */
export function groupByCompany<T extends { company: string }>(guests: T[]): CompanyGroup<T>[] {
	const groups = new Map<string, { guests: T[]; spellings: Map<string, number> }>();
	for (const guest of guests) {
		const key = companyKey(guest.company);
		let group = groups.get(key);
		if (!group) groups.set(key, (group = { guests: [], spellings: new Map() }));
		group.guests.push(guest);
		if (key) group.spellings.set(guest.company, (group.spellings.get(guest.company) ?? 0) + 1);
	}
	return [...groups]
		.map(([key, { guests, spellings }]) => ({ key, name: mostCommon(spellings), guests }))
		.sort((a, b) =>
			!a.key ? 1 : !b.key ? -1 : a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
		);
}

/** Company names to suggest, with how many people in the pool work there. */
export function companySuggestions(db: DB) {
	return companies(db);
}

/** Everyone in the pool at one company, however they spelled it at check-in. */
export function contactsAtCompany(db: DB, company: string): PersonRow[] {
	return peopleAtCompany(db, company);
}

/** Check-ins that aren't on the list, as the page shows them. */
export function walkIns(db: DB, eventId: string) {
	return listWalkIns(db, eventId).map((r) => ({
		checkinId: r.checkin_id!,
		name: r.name,
		company: r.company,
		jobTitle: r.job_title,
		checkedInAt: r.checked_in_at!
	}));
}

type Person = { name: string; company: string; email: string | null; phone: string | null };

/**
 * Pairs invitees with their check-ins at the event. Email and mobile match exactly; a name
 * match only counts when the companies don't contradict it. Check-ins left over are walk-ins.
 * Live rows carry `checkin_id` now; this remains for the migration and for loose pairing.
 */
export function matchArrivals<
	I extends Person & { id: number },
	A extends Person & { checkin_id: number }
>(invitees: I[], checkins: A[]) {
	const arrived = new Map<number, A>();
	const taken = new Set<number>();

	const pair = (key: (p: Person) => string | null, fits: (i: I, a: A) => boolean = () => true) => {
		const index = new Map<string, A[]>();
		for (const a of checkins) {
			const k = taken.has(a.checkin_id) ? null : key(a);
			if (k) index.set(k, [...(index.get(k) ?? []), a]);
		}
		for (const i of invitees) {
			const k = arrived.has(i.id) ? null : key(i);
			if (!k) continue;
			const options = (index.get(k) ?? []).filter((a) => !taken.has(a.checkin_id) && fits(i, a));
			const best =
				options.find((a) => companyKey(a.company) === companyKey(i.company)) ?? options[0];
			if (best) {
				arrived.set(i.id, best);
				taken.add(best.checkin_id);
			}
		}
	};

	pair((p) => p.email);
	pair((p) => p.phone);
	pair(
		(p) => nameKey(p.name) || null,
		(i, a) => {
			const [x, y] = [companyKey(i.company), companyKey(a.company)];
			return !x || !y || x === y;
		}
	);

	return { arrived, walkIns: checkins.filter((a) => !taken.has(a.checkin_id)) };
}
