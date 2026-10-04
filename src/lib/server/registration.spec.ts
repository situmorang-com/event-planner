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
import { createPerson, getPerson } from './people';
import {
	lookupRegistration,
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

		it('folds a pool record that the typed email names into the link’s person', () => {
			const other = createPerson(
				db,
				{ name: 'R. Wijaya', email: 'rina@batavia.co.id', phone: null, company: 'Batavia' },
				{ origin: 'checkin' },
				NOW - 2 * HOUR
			);
			const result = submitRegistration(db, ctx(), answer(), NOW);
			expect(result).toMatchObject({ status: 'saved', personId: row().person_id });
			expect(getPerson(db, other)).toBeUndefined();
			expect(listEventPeople(db, eventId)).toHaveLength(1);
			expect(row().email).toBe('rina@batavia.co.id');
			expect(listActivity(db, null).map((a) => a.kind)).toContain('merge');
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

		it('keeps the guest’s note beside the organizer’s', () => {
			db.prepare(`UPDATE event_people SET note = 'VIP' WHERE id = ?`).run(row().id);
			submitRegistration(db, ctx(), answer({ note: 'Bringing a colleague' }), NOW);
			expect(row().note).toBe('VIP · Bringing a colleague');
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
			notMe(db, ctx(), NOW);
			expect(row()).toMatchObject({ skipped_at: NOW, email: 'rina@batavia.co.id' });
			expect(listEntries(db)).toEqual([]);
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

		it('lands someone already on the event on their own row, without a review flag', () => {
			db.prepare(`UPDATE people SET email = 'rina@batavia.co.id'`).run();
			registerGeneric(
				db,
				event(),
				walkUp({ name: 'Rina', company: 'Batavia', email: 'rina@batavia.co.id' }),
				NOW
			);
			expect(listEventPeople(db, eventId)).toHaveLength(1);
			expect(row()).toMatchObject({ stage: 'confirmed', needs_review: 0, name: 'Rina' });
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
