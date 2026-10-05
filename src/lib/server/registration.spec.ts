import { beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from './activity-log';
import { checkIn } from './checkins';
import { blockCompany, findCompany } from './companies';
import { createDb, type DB } from './database';
import { check, listEntries, lockPerson } from './do-not-contact';
import {
	addShortlisted,
	addTouch,
	countLive,
	getEventPerson,
	listEventPeople,
	type EventPersonRow
} from './event-people';
import { createEvent, getEvent, updateEvent, type EventRow } from './events';
import { rowMessage } from './messaging';
import { createPerson, getPerson } from './people';
import {
	lookupRegistration,
	NOTE_LIMIT,
	notMe,
	reconfirm,
	registerGeneric,
	removeMe,
	submitRegistration,
	type GenericInput,
	type RegistrationInput
} from './registration';
import { registrationToken } from './registration-token';

const SECRET = 'test-secret';
const ENV = {
	org: 'SRKK',
	privacyUrl: 'https://srkk.test/privacy',
	base: 'https://ep.test',
	secret: SECRET
};
const HOUR = 3_600_000;
const START = Date.UTC(2026, 9, 13, 2, 0);
const NOW = START - 5 * 86_400_000;

const answer = (over: Partial<RegistrationInput> = {}): RegistrationInput => ({
	rsvp: 'yes',
	email: 'rina@batavia.co.id',
	phone: '+6281234567890',
	note: '',
	consentFuture: false,
	consentShare: false,
	...over
});

const walkUp = (over: Partial<GenericInput> = {}): GenericInput => ({
	name: 'Dewi Lestari',
	company: 'Kopi Kita',
	jobTitle: 'CFO',
	email: 'dewi@kopikita.id',
	phone: null,
	note: '',
	consentFuture: false,
	consentShare: false,
	...over
});

describe('registration', () => {
	let db: DB;
	let eventId: string;
	const event = () => getEvent(db, eventId)!;
	const row = (i = 0) => listEventPeople(db, eventId)[i];
	const token = (r: EventPersonRow) => registrationToken(SECRET, eventId, r.id);
	const ctx = (r: EventPersonRow = row()) => ({
		row: getEventPerson(db, eventId, r.id)!,
		event: event()
	});

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: 'Jakarta',
			startsAt: START,
			timezone: 'Asia/Jakarta',
			qrMode: 'static',
			coHosts: 'Batavia Foods'
		});
		addShortlisted(
			db,
			eventId,
			[
				{ name: 'Rina Wijaya', company: 'Batavia Foods', jobTitle: 'CIO', email: null, phone: null }
			],
			{ source: 'typed', by: 'Sari' },
			NOW - HOUR
		);
	});

	describe('lookup', () => {
		it('answers to its own token while the event is on, by the event’s current end', () => {
			const t = token(row());
			const found = lookupRegistration(db, SECRET, t, NOW);
			expect(found.status).toBe('ok');
			if (found.status === 'ok') expect(found.row.id).toBe(row().id);
			expect(lookupRegistration(db, SECRET, t, START + 6 * HOUR).status).toBe('expired');
			// Moving the end re-validates the link already sent.
			updateEvent(db, eventId, {
				name: 'Launch',
				venue: 'Jakarta',
				startsAt: START,
				timezone: 'Asia/Jakarta',
				qrMode: 'static',
				endsAt: START + 10 * HOUR
			});
			expect(lookupRegistration(db, SECRET, t, START + 6 * HOUR).status).toBe('ok');
			expect(lookupRegistration(db, SECRET, t, START + 10 * HOUR).status).toBe('expired');
		});

		it('rejects forged, foreign and malformed tokens without saying whether the event is over', () => {
			const t = token(row());
			expect(lookupRegistration(db, SECRET, 'r.1.abcdefghijkl', NOW).status).toBe('invalid');
			expect(lookupRegistration(db, 'other', t, NOW).status).toBe('invalid');
			expect(lookupRegistration(db, SECRET, 'garbage', NOW).status).toBe('invalid');
			expect(lookupRegistration(db, SECRET, 'r.999.abcdefghijkl', NOW).status).toBe('invalid');
			expect(lookupRegistration(db, 'other', t, START + 7 * HOUR).status).toBe('invalid');
		});

		it('stops answering once the person said "not me" or asked to be removed', () => {
			const t = token(row());
			notMe(db, ctx(), NOW);
			expect(lookupRegistration(db, SECRET, t, NOW).status).toBe('invalid');
		});

		it('stops answering for a blocked company (D13)', () => {
			const t = token(row());
			blockCompany(db, findCompany(db, 'Batavia Foods')!.id, { reason: 'competitor' });
			expect(lookupRegistration(db, SECRET, t, NOW).status).toBe('invalid');
		});

		it('still names the row when the link has expired, so the page keeps its language', () => {
			const found = lookupRegistration(db, SECRET, token(row()), START + 6 * HOUR);
			expect(found.status).toBe('expired');
			if (found.status === 'expired') expect(found.row.id).toBe(row().id);
		});
	});

	describe('the personal link', () => {
		it('puts the typed email and mobile on the person and confirms a yes', () => {
			const result = submitRegistration(db, ctx(), answer({ consentFuture: true }), NOW);
			expect(result.status).toBe('saved');
			const r = row();
			expect(r).toMatchObject({
				stage: 'confirmed',
				reply: 'yes',
				replied_at: NOW,
				confirmed_at: NOW,
				confirmed_via: 'registration',
				consent_event_at: NOW,
				consent_share_at: null,
				email: 'rina@batavia.co.id',
				phone: '+6281234567890',
				needs_review: 0
			});
			const person = getPerson(db, r.person_id!)!;
			// Their own words outrank the organizer's, but the origin stays what it was (D16).
			expect(person).toMatchObject({
				origin: 'typed',
				consent_future_at: NOW,
				name: 'Rina Wijaya'
			});
		});

		it('counts the future-events tick before the answer: a maybe gets the relationship cap', () => {
			// Invitation and one chase: the cap for a stranger (2) is reached, for a relationship (3) not.
			const day = 86_400_000;
			addTouch(db, eventId, row().id, { kind: 'invitation', via: 'whatsapp' }, START - 9 * day);
			addTouch(db, eventId, row().id, { kind: 'chase', via: 'whatsapp' }, START - 8 * day);
			// Tuesday 6 Oct, 09:00 Jakarta: three working days land before the stop window.
			submitRegistration(
				db,
				ctx(),
				answer({ rsvp: 'maybe', consentFuture: true }),
				START - 7 * day
			);
			expect(row()).toMatchObject({
				reply: 'maybe',
				next_action_kind: 'chase',
				next_action_at: START - 4 * day
			});
		});

		it('records maybe and no as replies, and a no takes a confirmation back', () => {
			submitRegistration(db, ctx(), answer({ rsvp: 'maybe' }), NOW);
			expect(row()).toMatchObject({ stage: 'replied', reply: 'maybe', confirmed_at: null });
			submitRegistration(db, ctx(), answer(), NOW + 1);
			expect(row()).toMatchObject({ stage: 'confirmed', confirmed_at: NOW + 1 });
			submitRegistration(db, ctx(), answer({ rsvp: 'no' }), NOW + 2);
			expect(row()).toMatchObject({
				stage: 'replied',
				reply: 'no',
				replied_at: NOW + 2,
				confirmed_at: null,
				confirmed_via: null
			});
		});

		it('ticks the co-host box only when the event has co-hosts, and keeps the first ticks', () => {
			submitRegistration(db, ctx(), answer({ consentShare: true }), NOW);
			expect(row()).toMatchObject({ consent_event_at: NOW, consent_share_at: NOW });
			submitRegistration(db, ctx(), answer({ consentShare: true }), NOW + 5);
			expect(row()).toMatchObject({ consent_event_at: NOW, consent_share_at: NOW });

			updateEvent(db, eventId, {
				name: 'Launch',
				venue: 'Jakarta',
				startsAt: START,
				timezone: 'Asia/Jakarta',
				qrMode: 'static',
				coHosts: ''
			});
			addShortlisted(
				db,
				eventId,
				[{ name: 'Andi', company: 'Batavia Foods', jobTitle: '', email: null, phone: null }],
				{ source: 'typed' },
				NOW
			);
			submitRegistration(db, ctx(row(1)), answer({ email: 'andi@x.id', consentShare: true }), NOW);
			expect(row(1).consent_share_at).toBeNull();
		});

		it('leaves a pool record that the typed email names alone and flags the row to merge by hand', () => {
			const other = createPerson(
				db,
				{ name: 'R. Wijaya', email: 'rina@batavia.co.id', phone: null, company: 'Batavia' },
				{ origin: 'checkin' },
				NOW - 2 * HOUR
			);
			const result = submitRegistration(db, ctx(), answer(), NOW);
			expect(result).toMatchObject({ status: 'saved', personId: row().person_id });
			// A public form never merges: the twin survives untouched, the organizer decides (§3).
			expect(getPerson(db, other)).toMatchObject({
				name: 'R. Wijaya',
				email: 'rina@batavia.co.id'
			});
			expect(row()).toMatchObject({
				stage: 'confirmed',
				email: 'rina@batavia.co.id',
				needs_review: 1
			});
			expect(listActivity(db, null).map((a) => a.kind)).not.toContain('merge');
		});

		it('refuses an email or mobile that another guest on the event holds, and changes nothing', () => {
			addShortlisted(
				db,
				eventId,
				[
					{
						name: 'Budi Santoso',
						company: 'Kopi Kita',
						jobTitle: '',
						email: 'budi@kopikita.id',
						phone: '+6281111111111'
					}
				],
				{ source: 'typed' },
				NOW
			);
			const budi = row(1);
			const before = { person: getPerson(db, budi.person_id!), rows: listEventPeople(db, eventId) };
			expect(submitRegistration(db, ctx(), answer({ email: 'budi@kopikita.id' }), NOW).status).toBe(
				'refused'
			);
			expect(
				submitRegistration(db, ctx(), answer({ email: null, phone: '+6281111111111' }), NOW).status
			).toBe('refused');
			expect(getPerson(db, budi.person_id!)).toEqual(before.person);
			expect(listEventPeople(db, eventId)).toEqual(before.rows);
			expect(row()).toMatchObject({ stage: 'shortlisted', email: null, phone: null });
		});

		it('refuses an email or mobile on the do-not-contact list', () => {
			const locked = createPerson(
				db,
				{ name: 'Someone Else', email: 'stop@x.id', phone: null, company: '' },
				{ origin: 'typed' }
			);
			lockPerson(db, locked, { source: 'staff', reason: 'asked' });
			const result = submitRegistration(db, ctx(), answer({ email: 'stop@x.id' }), NOW);
			expect(result.status).toBe('refused');
			expect(row()).toMatchObject({ stage: 'shortlisted', email: null });
		});

		it('keeps the guest’s note beside the organizer’s, once, within a limit', () => {
			db.prepare(`UPDATE event_people SET note = 'VIP' WHERE id = ?`).run(row().id);
			submitRegistration(db, ctx(), answer({ note: 'Bringing a colleague' }), NOW);
			expect(row().note).toBe('VIP · Bringing a colleague');
			// Sending the form again doesn't repeat the note, and the note can't grow without end.
			submitRegistration(db, ctx(), answer({ note: 'Bringing a colleague' }), NOW + 1);
			expect(row().note).toBe('VIP · Bringing a colleague');
			for (let i = 0; i < 20; i++)
				submitRegistration(db, ctx(), answer({ note: `note ${i} `.repeat(30) }), NOW + 2 + i);
			expect(row().note.length).toBeLessThanOrEqual(NOTE_LIMIT);
		});
	});

	describe('not me and remove me', () => {
		it('"not me" lists only the channel the invitation went out on and skips the row', () => {
			db.prepare(`UPDATE people SET email = 'rina@batavia.co.id', phone = '+6281234567890'`).run();
			addTouch(db, eventId, row().id, { kind: 'invitation', via: 'whatsapp' }, NOW - 10);
			addTouch(db, eventId, row().id, { kind: 'chase', via: 'email' }, NOW - 5);
			notMe(db, ctx(), NOW);
			const r = row();
			expect(r).toMatchObject({ skipped_at: NOW, skipped_by: 'not me', email: null });
			expect(r.phone).toBe('+6281234567890');
			expect(listEntries(db).map((e) => [e.kind, e.source])).toEqual([['email', 'not_me']]);
			expect(check(db, { email: 'rina@batavia.co.id' })).not.toBeNull();
			expect(check(db, { phone: '+6281234567890' })).toBeNull();
			expect(getPerson(db, r.person_id!)!.locked_at).toBeNull();
			expect(countLive(db, eventId)).toBe(0);
			expect(listActivity(db, eventId).map((a) => a.kind)).toEqual(['lock']);
		});

		it('"not me" without a message on record skips the row and lists nothing', () => {
			db.prepare(`UPDATE people SET email = 'rina@batavia.co.id'`).run();
			expect(rowMessage(db, ctx(), ENV)?.email).toBeTruthy();
			notMe(db, ctx(), NOW);
			expect(row()).toMatchObject({ skipped_at: NOW, email: 'rina@batavia.co.id' });
			expect(listEntries(db)).toEqual([]);
			// The row is out of the chase: no message links, whatever the person still holds.
			expect(rowMessage(db, ctx(), ENV)).toBeNull();
		});

		it('"remove me" lists every channel and the name, and locks the person', () => {
			db.prepare(`UPDATE people SET email = 'rina@batavia.co.id', phone = '+6281234567890'`).run();
			expect(removeMe(db, ctx().row, NOW)).toBe(true);
			expect(
				listEntries(db)
					.map((e) => [e.kind, e.source])
					.sort()
			).toEqual([
				['email', 'remove_me'],
				['name_company', 'remove_me'],
				['phone', 'remove_me']
			]);
			expect(getPerson(db, row().person_id!)!.locked_at).toBe(NOW);
			expect(check(db, { name: 'Rina Wijaya', company: 'PT Batavia Foods Tbk' })?.source).toBe(
				'remove_me'
			);
			expect(listActivity(db, null).map((a) => a.kind)).toEqual(['lock']);
		});
	});

	describe('the generic link', () => {
		it('creates a confirmed row and a self-registered person the owner must check', () => {
			const result = registerGeneric(db, event(), walkUp({ consentFuture: true }), NOW);
			expect(result.status).toBe('saved');
			const r = row(1);
			expect(r).toMatchObject({
				name: 'Dewi Lestari',
				company: 'Kopi Kita',
				stage: 'confirmed',
				reply: 'yes',
				confirmed_via: 'registration',
				source: 'self_registered',
				needs_review: 1,
				consent_event_at: NOW
			});
			expect(getPerson(db, r.person_id!)).toMatchObject({
				origin: 'self_registered',
				consent_future_at: NOW,
				email: 'dewi@kopikita.id'
			});
		});

		it('lands someone already on the event on their own row, flagged for the owner', () => {
			registerGeneric(
				db,
				event(),
				walkUp({
					name: 'Rina Wijaya',
					company: 'PT Batavia Foods Tbk',
					email: 'rina@batavia.co.id'
				}),
				NOW
			);
			expect(listEventPeople(db, eventId)).toHaveLength(1);
			expect(row()).toMatchObject({
				stage: 'confirmed',
				needs_review: 1,
				name: 'Rina Wijaya',
				email: 'rina@batavia.co.id'
			});
		});

		it('flags someone from the pool who was not on this event', () => {
			const personId = createPerson(
				db,
				{ name: 'Dewi Lestari', email: 'dewi@kopikita.id', phone: null, company: 'Kopi Kita' },
				{ origin: 'checkin' }
			);
			registerGeneric(db, event(), walkUp(), NOW);
			expect(row(1)).toMatchObject({ person_id: personId, needs_review: 1, stage: 'confirmed' });
			expect(getPerson(db, personId)!.origin).toBe('checkin');
		});

		it('never rewrites a listed person: a name with a different email becomes a new person', () => {
			db.prepare(`UPDATE people SET email = 'rina@batavia.co.id', phone = '+6281234567890'`).run();
			const rina = getPerson(db, row().person_id!)!;
			const result = registerGeneric(
				db,
				event(),
				walkUp({
					name: 'Rina Wijaya',
					company: 'Batavia Foods',
					jobTitle: 'Hacker',
					email: 'attacker@evil.test',
					phone: '+60123456789',
					consentFuture: true
				}),
				NOW
			);
			expect(result.status).toBe('saved');
			expect(getPerson(db, rina.id)).toEqual(rina);
			expect(row()).toMatchObject({
				stage: 'shortlisted',
				needs_review: 0,
				consent_event_at: null
			});
			expect(row(1)).toMatchObject({
				name: 'Rina Wijaya',
				email: 'attacker@evil.test',
				source: 'self_registered',
				needs_review: 1,
				stage: 'confirmed'
			});
			expect(row(1).person_id).not.toBe(rina.id);
			expect(listEventPeople(db, eventId)).toHaveLength(2);
		});

		it('never rewrites a pool person: their email under another name becomes a new person', () => {
			const dewi = createPerson(
				db,
				{ name: 'Dewi Lestari', email: 'dewi@kopikita.id', phone: null, company: 'Kopi Kita' },
				{ origin: 'checkin' }
			);
			const before = getPerson(db, dewi)!;
			registerGeneric(
				db,
				event(),
				walkUp({
					name: 'Mallory Evil',
					company: 'Evil Corp',
					phone: '+60123456789',
					consentFuture: true
				}),
				NOW
			);
			expect(getPerson(db, dewi)).toEqual(before);
			expect(row(1)).toMatchObject({ name: 'Mallory Evil', needs_review: 1 });
			expect(row(1).person_id).not.toBe(dewi);
			expect(getPerson(db, row(1).person_id!)!.consent_future_at).toBe(NOW);
		});

		it('refuses a row its person disowned with "not me" instead of reviving it', () => {
			db.prepare(`UPDATE people SET email = 'rina@batavia.co.id'`).run();
			addTouch(db, eventId, row().id, { kind: 'invitation', via: 'email' }, NOW - 10);
			notMe(db, ctx(), NOW);
			expect(
				registerGeneric(
					db,
					event(),
					walkUp({ name: 'Rina Wijaya', company: 'Batavia Foods', email: 'rina2@batavia.co.id' }),
					NOW + 1
				).status
			).toBe('refused');
			expect(listEventPeople(db, eventId)).toHaveLength(1);
			expect(row().skipped_at).toBe(NOW);
		});

		it('refuses blocked companies and listed people (D13)', () => {
			findCompany(db, 'Batavia Foods');
			blockCompany(db, findCompany(db, 'Batavia Foods')!.id, { reason: 'competitor' });
			expect(registerGeneric(db, event(), walkUp({ company: 'Batavia Foods' }), NOW).status).toBe(
				'refused'
			);
			const locked = createPerson(
				db,
				{ name: 'Dewi Lestari', email: 'dewi@kopikita.id', phone: null, company: 'Kopi Kita' },
				{ origin: 'typed' }
			);
			lockPerson(db, locked, { source: 'staff' });
			expect(registerGeneric(db, event(), walkUp(), NOW).status).toBe('refused');
			expect(listEventPeople(db, eventId)).toHaveLength(1);
		});
	});

	describe('reconfirm', () => {
		it('confirms the row again with its own via, and keeps a checked-in row checked in', () => {
			submitRegistration(db, ctx(), answer(), NOW);
			expect(reconfirm(db, ctx().row, NOW + HOUR)).toBe(true);
			expect(row()).toMatchObject({
				stage: 'confirmed',
				confirmed_at: NOW + HOUR,
				confirmed_via: 'reconfirm',
				replied_at: NOW
			});
			checkIn(
				db,
				eventId,
				{
					name: 'Rina Wijaya',
					email: 'rina@batavia.co.id',
					phone: null,
					company: '',
					jobTitle: ''
				},
				{ method: 'form', device: 'ios', consent: true },
				START + HOUR
			);
			reconfirm(db, ctx().row, START + 2 * HOUR);
			expect(row()).toMatchObject({ stage: 'checked_in', confirmed_via: 'reconfirm' });
		});

		it('only re-confirms a yes: a pending or declined row is left for the full form (§5.3)', () => {
			expect(reconfirm(db, ctx().row, NOW)).toBe(false);
			expect(row()).toMatchObject({ stage: 'shortlisted', reply: 'pending', confirmed_at: null });
			submitRegistration(db, ctx(), answer({ rsvp: 'no' }), NOW);
			expect(reconfirm(db, ctx().row, NOW + 1)).toBe(false);
			expect(row()).toMatchObject({ stage: 'replied', reply: 'no', confirmed_at: null });
		});
	});
});

describe('an event without a date', () => {
	it('never answers to a link', () => {
		const db = createDb(':memory:');
		const eventId = createEvent(db, {
			name: 'Someday',
			venue: '',
			startsAt: null,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		addShortlisted(
			db,
			eventId,
			[{ name: 'Rina', company: '', jobTitle: '', email: null, phone: null }],
			{ source: 'typed' }
		);
		const r = listEventPeople(db, eventId)[0];
		const event: EventRow = getEvent(db, eventId)!;
		expect(event.starts_at).toBeNull();
		expect(lookupRegistration(db, SECRET, registrationToken(SECRET, eventId, r.id)).status).toBe(
			'invalid'
		);
	});
});
