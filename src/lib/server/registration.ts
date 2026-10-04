import { logActivity } from './activity-log.ts';
import { findCompany, isBlocked } from './companies.ts';
import type { DB } from './database.ts';
import { addEntry, check as doNotContact, lockPerson } from './do-not-contact.ts';
import {
	addRowForPerson,
	findRow,
	getEventPerson,
	hasEnded,
	listTouches,
	type EventPersonRow
} from './event-people.ts';
import { getEvent, type EventRow } from './events.ts';
import {
	createPerson,
	findPerson,
	mergeInto,
	setConsentFuture,
	touchLastEvent,
	updatePerson
} from './people.ts';
import { registrationRowId, verifyRegistrationToken } from './registration-token.ts';
import { applyChange, type Reply } from './stages.ts';

/*
 * What the public registration pages do (§4.6, D7, D15): a guest answers with their own
 * email and mobile, which merge into their record by §3 precedence (they typed it, so it
 * wins), and their consents land on the row and the person. Nothing here reads a request:
 * the routes parse and rate-limit, this module changes the database.
 */

export type Lookup =
	| { status: 'ok'; row: EventPersonRow; event: EventRow }
	| { status: 'expired'; event: EventRow }
	| { status: 'invalid' };

/**
 * The row and event behind a token, checked on every request against the event as it is
 * now: moving the date re-validates every link already sent (§7). A row whose person said
 * "not me" or is locked no longer answers to its link.
 */
export function lookupRegistration(
	db: DB,
	secret: string,
	token: string | null | undefined,
	now = Date.now()
): Lookup {
	const id = registrationRowId(token);
	if (id === null) return { status: 'invalid' };
	const bare = db.prepare(`SELECT event_id FROM event_people WHERE id = ?`).get(id) as
		{ event_id: string } | undefined;
	const event = bare && getEvent(db, bare.event_id);
	const row = event && getEventPerson(db, event.id, id);
	if (!event || !row || !row.person_id || event.starts_at === null) return { status: 'invalid' };
	// The signature is checked at a time inside the event, so a forged token can't learn
	// whether the event is over; the expiry is read separately below.
	if (!verifyRegistrationToken(secret, event, id, token, event.starts_at))
		return { status: 'invalid' };
	if (hasEnded(event, now)) return { status: 'expired', event };
	if (row.locked_at || row.skipped_at) return { status: 'invalid' };
	return { status: 'ok', row, event };
}

/** A registration can only be refused for a listed or blocked identity (D13). */
export type RegistrationResult =
	{ status: 'saved'; rowId: number; personId: string } | { status: 'refused' };

interface Consents {
	/** Box 2: future events. */
	consentFuture: boolean;
	/** Box 3: share with co-hosts; ignored unless the event has co-hosts. */
	consentShare: boolean;
}

export interface RegistrationInput extends Consents {
	rsvp: Exclude<Reply, 'pending'>;
	email: string | null;
	phone: string | null;
	note: string;
}

export interface GenericInput extends Consents {
	name: string;
	company: string;
	jobTitle: string;
	email: string | null;
	phone: string | null;
	note: string;
}

const REFUSED: RegistrationResult = { status: 'refused' };

/**
 * The personal link (§4.6): the reply and the typed email/mobile land on the row's person.
 * A yes confirms the row; maybe and no are replies (a no takes a confirmation back). When
 * the typed details name another record in the pool, that record folds into this one.
 */
export function submitRegistration(
	db: DB,
	{ row, event }: { row: EventPersonRow; event: EventRow },
	input: RegistrationInput,
	now = Date.now()
): RegistrationResult {
	return db.transaction((): RegistrationResult => {
		const personId = row.person_id!;
		if (doNotContact(db, { email: input.email, phone: input.phone })) return REFUSED;
		const details = {
			name: row.name,
			jobTitle: row.job_title,
			email: input.email,
			phone: input.phone,
			company: row.company
		};
		// §3 order finds the row's own person by name first; the typed email or mobile may still
		// name a second record of the same person in the pool, which folds into this one.
		const hit = findPerson(db, details, event.id);
		const twin =
			hit && hit.id !== personId ? hit : findPerson(db, { email: input.email, phone: input.phone });
		if (twin && twin.id !== personId) {
			if (twin.locked_at) return REFUSED;
			// The link's row survives, so the link keeps working after the merge.
			mergeInto(db, twin.id, personId, { by: 'registration' }, now);
		}
		updatePerson(db, personId, details, { origin: 'self_registered' }, now);
		answer(db, row.id, input.rsvp, 'registration', now);
		recordConsents(db, row.id, personId, event, input, now);
		if (input.note) appendNote(db, row.id, input.note, now);
		touchLastEvent(db, personId, now);
		return { status: 'saved', rowId: row.id, personId };
	})();
}

/**
 * The generic link (§4.6): no prefill, and registering is the yes. Someone already on the
 * event lands on their own row; anyone else gets a row the company owner must check
 * (`needs_review`), whether they were in the pool or are brand new (`self_registered`).
 */
export function registerGeneric(
	db: DB,
	event: EventRow,
	input: GenericInput,
	now = Date.now()
): RegistrationResult {
	return db.transaction((): RegistrationResult => {
		if (isBlocked(findCompany(db, input.company)) || doNotContact(db, input)) return REFUSED;
		const hit = findPerson(db, input, event.id);
		if (hit?.locked_at || hit?.d365_suppressed) return REFUSED;
		let personId: string;
		let rowId: number | null = null;
		if (hit) {
			personId = hit.id;
			updatePerson(db, personId, input, { origin: 'self_registered' }, now);
			const row = findRow(db, event.id, personId);
			if (row && !row.skipped_at) rowId = row.id;
		} else {
			personId = createPerson(db, input, { origin: 'self_registered' }, now);
		}
		if (rowId === null)
			rowId = addRowForPerson(
				db,
				event.id,
				personId,
				{ source: 'self_registered', note: input.note, needsReview: true },
				now
			);
		else if (input.note) appendNote(db, rowId, input.note, now);
		answer(db, rowId, 'yes', 'registration', now);
		recordConsents(db, rowId, personId, event, input, now);
		touchLastEvent(db, personId, now);
		return { status: 'saved', rowId, personId };
	})();
}

/** The one-tap page behind a reminder (§4.6): the row is confirmed again. */
export function reconfirm(db: DB, row: EventPersonRow, now = Date.now()): boolean {
	return !!applyChange(db, row.id, { type: 'confirm', via: 'reconfirm' }, now);
}

/**
 * "Not me" (§4.6): the invitation reached the wrong person, so the channel it went out on
 * (per the last touch) is listed and cleared from the person, and the row is skipped. Nothing
 * else about the person is touched: the name may still be right.
 */
export function notMe(
	db: DB,
	{ row, event }: { row: EventPersonRow; event: EventRow },
	now = Date.now()
): void {
	db.transaction(() => {
		const via =
			[...listTouches(db, row.id)].reverse().find((t) => t.via === 'whatsapp' || t.via === 'email')
				?.via ??
			(row.invited_via === 'whatsapp' || row.invited_via === 'email' ? row.invited_via : null);
		const channel = via === 'whatsapp' ? 'phone' : via === 'email' ? 'email' : null;
		const value = channel === 'phone' ? row.phone : channel === 'email' ? row.email : null;
		if (channel && value) {
			addEntry(db, { kind: channel, value, reason: 'Not me', source: 'not_me' }, now);
			db.prepare(`UPDATE people SET ${channel} = NULL, updated_at = ? WHERE id = ?`).run(
				now,
				row.person_id
			);
		}
		// A live row has no "skip" transition (§5.3); the person said so themselves, so it is set here.
		db.prepare(
			`UPDATE event_people SET skipped_at = ?, skipped_by = 'not me', next_action_at = NULL,
				next_action_kind = NULL, updated_at = ? WHERE id = ?`
		).run(now, now, row.id);
		logActivity(
			db,
			{
				eventId: event.id,
				kind: 'lock',
				who: '',
				what: { eventPersonId: row.id, channel },
				rowCount: 1
			},
			now
		);
	})();
}

/** "Remove me" (§4.6): every channel and the name are listed and the person is locked (D13). */
export function removeMe(db: DB, row: EventPersonRow, now = Date.now()): boolean {
	if (!row.person_id) return false;
	return db.transaction(() => {
		const done = lockPerson(
			db,
			row.person_id!,
			{ reason: 'Asked to be removed', source: 'remove_me' },
			now
		);
		if (done) applyChange(db, row.id, { type: 'lock' }, now);
		return done;
	})();
}

/* ───────────────────────── Helpers ───────────────────────── */

function answer(
	db: DB,
	rowId: number,
	rsvp: Exclude<Reply, 'pending'>,
	via: 'registration',
	now: number
) {
	// A yes is a confirmation (D3); the transition table turns anything else into a reply and
	// takes an earlier confirmation back for a no.
	if (rsvp === 'yes') applyChange(db, rowId, { type: 'confirm', via }, now);
	else applyChange(db, rowId, { type: 'reply', reply: rsvp }, now);
}

function recordConsents(
	db: DB,
	rowId: number,
	personId: string,
	event: Pick<EventRow, 'co_hosts'>,
	consents: Consents,
	now: number
) {
	// Box 1 is required to submit, so the submission is the tick; first ticks are kept.
	db.prepare(
		`UPDATE event_people SET consent_event_at = COALESCE(consent_event_at, @now),
			consent_share_at = CASE WHEN @share THEN COALESCE(consent_share_at, @now)
				ELSE consent_share_at END,
			updated_at = @now
		WHERE id = @id`
	).run({ id: rowId, now, share: consents.consentShare && event.co_hosts.trim() ? 1 : 0 });
	if (consents.consentFuture) setConsentFuture(db, personId, now, now);
}

function appendNote(db: DB, rowId: number, note: string, now: number) {
	db.prepare(
		`UPDATE event_people SET note = CASE WHEN note = '' THEN @note ELSE note || ' · ' || @note END,
			updated_at = @now WHERE id = @id`
	).run({ id: rowId, note, now });
}
