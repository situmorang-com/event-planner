import type { DB } from './database.ts';
import { linkCheckin, unlinkCheckin } from './event-people.ts';
import {
	createPerson,
	findPerson,
	setConsentFuture,
	touchLastEvent,
	updatePerson,
	type PersonRow
} from './people.ts';

export type Method = 'form' | 'picker' | 'returning' | 'staff';
export type Device = 'ios' | 'android' | 'desktop' | 'other';

export interface ContactInput {
	name: string;
	email: string | null;
	phone: string | null;
	company: string;
	jobTitle: string;
}

export type { PersonRow as ContactRow };

export interface CheckinResult {
	status: 'created' | 'existing';
	personId: string;
	checkinId: number;
	checkedInAt: number;
	/** Arrival position within the event: "you're attendee #42". */
	number: number;
	isNewContact: boolean;
}

export interface CheckinMeta {
	method: Method;
	device: Device;
	/** Box 1: attendance for this event. Staff adds record none. */
	consent: boolean;
	/** Box 2: future events (sticks to the person). */
	consentFuture?: boolean;
	/** Box 3: share with co-hosts (this event only). */
	consentShare?: boolean;
	by?: string;
}

/**
 * Finds or creates the person (§3), records the check-in once per event, and puts it on
 * their event row, or a walk-in row when they weren't on the list (§4.7).
 */
export function checkIn(
	db: DB,
	eventId: string,
	input: ContactInput,
	meta: CheckinMeta,
	now = Date.now()
): CheckinResult {
	return db.transaction((): CheckinResult => {
		// A staff add is the organizer's words, not the attendee's, so it ranks as typed.
		const origin = meta.method === 'staff' ? 'typed' : 'checkin';
		const hit = findPerson(db, input, eventId);
		let personId: string;
		if (hit) {
			personId = hit.id;
			updatePerson(db, personId, input, { origin }, now);
		} else {
			personId = createPerson(db, input, { origin, by: meta.by }, now);
		}

		const position = db.prepare(
			`SELECT COUNT(*) AS n FROM checkins WHERE event_id = ? AND id <= ?`
		);
		const existing = db
			.prepare(`SELECT id, checked_in_at FROM checkins WHERE event_id = ? AND person_id = ?`)
			.get(eventId, personId) as { id: number; checked_in_at: number } | undefined;
		if (existing) {
			const { n } = position.get(eventId, existing.id) as { n: number };
			return {
				status: 'existing',
				personId,
				checkinId: existing.id,
				checkedInAt: existing.checked_in_at,
				number: n,
				isNewContact: false
			};
		}

		// A staff add records no consent (§4.7): nobody ticked anything.
		const staff = meta.method === 'staff';
		const consentAt = meta.consent && !staff ? now : null;
		const consentShareAt = meta.consentShare && !staff ? now : null;
		const { lastInsertRowid } = db
			.prepare(
				`INSERT INTO checkins (event_id, person_id, checked_in_at, method, device, consent_at)
				VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(eventId, personId, now, meta.method, meta.device, consentAt);
		const checkinId = Number(lastInsertRowid);
		linkCheckin(db, eventId, personId, checkinId, { consentAt, consentShareAt, by: meta.by }, now);
		if (meta.consentFuture && !staff) setConsentFuture(db, personId, now, now);
		touchLastEvent(db, personId, now);

		const { n } = position.get(eventId, checkinId) as { n: number };
		return {
			status: 'created',
			personId,
			checkinId,
			checkedInAt: now,
			number: n,
			isNewContact: !hit
		};
	})();
}

export function removeCheckin(db: DB, eventId: string, checkinId: number, now = Date.now()) {
	db.transaction(() => {
		const row = db
			.prepare(`SELECT person_id FROM checkins WHERE id = ? AND event_id = ?`)
			.get(checkinId, eventId) as { person_id: string } | undefined;
		if (!row) return;
		unlinkCheckin(db, checkinId, now);
		db.prepare(`DELETE FROM checkins WHERE id = ?`).run(checkinId);
		touchLastEvent(db, row.person_id, now);
	})();
}

export interface AttendeeRow {
	checkin_id: number;
	person_id: string;
	name: string;
	email: string | null;
	phone: string | null;
	company: string;
	job_title: string;
	checked_in_at: number;
	method: Method;
	device: Device;
	consent_at: number | null;
	/** Attended an earlier event, i.e. was already in the database. */
	is_returning: 0 | 1;
	/** On the do-not-contact list: exports blank their channels (D13). */
	locked_at: number | null;
}

export function listAttendees(db: DB, eventId: string): AttendeeRow[] {
	return db
		.prepare(
			`SELECT c.id AS checkin_id, p.id AS person_id, p.name, p.email, p.phone,
				COALESCE(co.name, '') AS company, p.job_title, c.checked_in_at, c.method, c.device,
				c.consent_at, p.locked_at,
				EXISTS (
					SELECT 1 FROM checkins prev
					WHERE prev.person_id = c.person_id AND prev.event_id <> c.event_id
						AND prev.checked_in_at < c.checked_in_at
				) AS is_returning
			FROM checkins c JOIN people p ON p.id = c.person_id
				LEFT JOIN companies co ON co.id = p.company_id
			WHERE c.event_id = ?
			ORDER BY c.checked_in_at DESC`
		)
		.all(eventId) as AttendeeRow[];
}

export interface RecentArrival {
	id: number;
	name: string;
	company: string;
	at: number;
}

export function recentArrivals(db: DB, eventId: string, limit = 12): RecentArrival[] {
	return db
		.prepare(
			`SELECT c.id, p.name, COALESCE(co.name, '') AS company, c.checked_in_at AS at
			FROM checkins c JOIN people p ON p.id = c.person_id
				LEFT JOIN companies co ON co.id = p.company_id
			WHERE c.event_id = ? ORDER BY c.checked_in_at DESC, c.id DESC LIMIT ?`
		)
		.all(eventId, limit) as RecentArrival[];
}

export function countCheckins(db: DB, eventId: string): number {
	return (
		db.prepare(`SELECT COUNT(*) AS n FROM checkins WHERE event_id = ?`).get(eventId) as {
			n: number;
		}
	).n;
}
