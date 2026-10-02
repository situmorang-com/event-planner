import { beforeEach, describe, expect, it } from 'vitest';
import { checkIn, removeCheckin } from './checkins';
import { blockCompany, findCompany } from './companies';
import { createDb, type DB } from './database';
import {
	addFound,
	addShortlisted,
	addTouch,
	chipCounts,
	clearLatestTouch,
	confirmRow,
	getEventPerson,
	hasEnded,
	listEventPeople,
	listWalkIns,
	markInvited,
	rowKeptUntil,
	setReply,
	shortlistFound,
	skipRow,
	unskipRow,
	type GuestInput
} from './event-people';
import { createEvent } from './events';
import { getPerson } from './people';
import { nextState, type StageState } from './stages';

const guest = (name: string, extra: Partial<GuestInput> = {}): GuestInput => ({
	name,
	company: 'Batavia Foods',
	jobTitle: '',
	email: null,
	phone: null,
	...extra
});

const meta = { method: 'form' as const, device: 'ios' as const, consent: true };

describe('stage transitions', () => {
	let db: DB;
	let eventId: string;
	const row = () => listEventPeople(db, eventId)[0];

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: null,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		addShortlisted(
			db,
			eventId,
			[guest('Rina Wijaya', { email: 'rina@x.id' })],
			{ source: 'typed' },
			1_000
		);
	});

	it('goes shortlisted → invited → replied and back as the reply is cleared', () => {
		expect(row()).toMatchObject({ stage: 'shortlisted', invited_at: null });
		markInvited(db, eventId, row().id, 'whatsapp', {}, 2_000);
		expect(row()).toMatchObject({
			stage: 'invited',
			invited_at: 2_000,
			invited_via: 'whatsapp',
			last_contacted_at: 2_000
		});
		setReply(db, eventId, row().id, 'yes', 3_000);
		setReply(db, eventId, row().id, 'yes', 4_000);
		expect(row()).toMatchObject({ stage: 'replied', reply: 'yes', replied_at: 3_000 });
		setReply(db, eventId, row().id, 'pending', 5_000);
		expect(row()).toMatchObject({ stage: 'invited', reply: 'pending', replied_at: null });
	});

	it('treats a reply before any touch as an invitation by other means', () => {
		setReply(db, eventId, row().id, 'maybe', 2_000);
		expect(row()).toMatchObject({
			stage: 'replied',
			invited_at: 2_000,
			invited_via: 'other',
			replied_at: 2_000
		});
	});

	it('confirms a yes, and a later no takes the confirmation back', () => {
		confirmRow(db, eventId, row().id, 'registration', 2_000);
		expect(row()).toMatchObject({ stage: 'confirmed', reply: 'yes', confirmed_at: 2_000 });
		setReply(db, eventId, row().id, 'no', 3_000);
		expect(row()).toMatchObject({ stage: 'replied', reply: 'no', confirmed_at: null });
	});

	it('moves to checked_in on a check-in and back when it is removed', () => {
		setReply(db, eventId, row().id, 'yes', 2_000);
		const result = checkIn(
			db,
			eventId,
			{ name: 'Rina W', email: 'rina@x.id', phone: null, company: '', jobTitle: '' },
			meta,
			3_000
		);
		expect(result.personId).toBe(row().person_id);
		expect(row()).toMatchObject({
			stage: 'checked_in',
			checkin_id: result.checkinId,
			consent_event_at: 3_000,
			checked_in_at: 3_000
		});
		removeCheckin(db, eventId, result.checkinId, 4_000);
		expect(row()).toMatchObject({ stage: 'replied', checkin_id: null, reply: 'yes' });
		expect(listEventPeople(db, eventId)).toHaveLength(1);
	});

	it('puts a walk-in on its own row, which goes with the check-in', () => {
		const result = checkIn(
			db,
			eventId,
			{ name: 'Kevin Tan', email: 'kevin@x.id', phone: null, company: 'Kopi', jobTitle: '' },
			{ ...meta, method: 'staff', consent: false }
		);
		const [walkIn] = listWalkIns(db, eventId);
		expect(walkIn).toMatchObject({
			source: 'walk_in',
			stage: 'checked_in',
			consent_event_at: null
		});
		removeCheckin(db, eventId, result.checkinId);
		expect(listEventPeople(db, eventId)).toHaveLength(1);
	});
});

describe('nextState', () => {
	const base: StageState = {
		stage: 'checked_in',
		reply: 'yes',
		replied_at: 10,
		invited_at: 5,
		invited_via: 'email',
		last_contacted_at: 5,
		confirmed_at: 12,
		confirmed_via: 'reconfirm',
		checkin_id: 7,
		consent_event_at: 20,
		skipped_at: null,
		skipped_by: null,
		next_action_at: 30,
		next_action_kind: 'reminder'
	};

	it('returns to the stage the row came from', () => {
		expect(nextState(base, { type: 'checkout' }, 99)).toMatchObject({ stage: 'confirmed' });
		expect(nextState({ ...base, confirmed_at: null }, { type: 'checkout' }, 99)).toMatchObject({
			stage: 'replied'
		});
		expect(
			nextState({ ...base, confirmed_at: null, reply: 'pending' }, { type: 'checkout' }, 99)
		).toMatchObject({ stage: 'invited' });
		expect(
			nextState(
				{ ...base, confirmed_at: null, reply: 'pending', invited_at: null },
				{ type: 'checkout' },
				99
			)
		).toMatchObject({ stage: 'shortlisted' });
	});

	it('refuses what does not apply', () => {
		expect(nextState({ ...base, stage: 'found' }, { type: 'reply', reply: 'yes' }, 1)).toBeNull();
		expect(nextState({ ...base, stage: 'invited' }, { type: 'checkout' }, 1)).toBeNull();
		expect(nextState({ ...base, stage: 'found' }, { type: 'unskip' }, 1)).toBeNull();
	});
});

describe('touches', () => {
	it('recomputes the dates when the latest touch is cleared', () => {
		const db = createDb(':memory:');
		const eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
		addShortlisted(db, eventId, [guest('Rina')], { source: 'typed' });
		const id = listEventPeople(db, eventId)[0].id;
		const row = () => getEventPerson(db, eventId, id)!;

		addTouch(db, eventId, id, { kind: 'invitation', via: 'email' }, 1_000);
		addTouch(db, eventId, id, { kind: 'chase', via: 'whatsapp' }, 2_000);
		expect(row()).toMatchObject({
			stage: 'invited',
			invited_at: 1_000,
			last_contacted_at: 2_000,
			touch_count: 2,
			chase_count: 1
		});
		clearLatestTouch(db, eventId, id);
		expect(row()).toMatchObject({ last_contacted_at: 1_000, touch_count: 1, chase_count: 0 });
		clearLatestTouch(db, eventId, id);
		expect(row()).toMatchObject({
			stage: 'shortlisted',
			invited_at: null,
			invited_via: null,
			last_contacted_at: null
		});
		expect(clearLatestTouch(db, eventId, id)).toBe(false);
	});
});

describe('found rows', () => {
	let db: DB;
	let eventId: string;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: Date.UTC(2026, 10, 1),
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
	});

	it('skips names already on the event, then becomes a person on Add', () => {
		addShortlisted(db, eventId, [guest('Hendra Gunawan')], { source: 'typed' });
		const result = addFound(
			db,
			eventId,
			[
				guest('Rina Wijaya', { sourceUrl: 'https://batavia.co.id/team', reason: 'Leads finance.' }),
				guest('Bapak Hendra Gunawan'),
				guest('Rina Wijaya', { company: 'PT Batavia Foods' })
			],
			{ source: 'research' }
		);
		expect(result).toEqual({ added: 1, skipped: 2, refused: [] });

		const found = listEventPeople(db, eventId).find((r) => r.stage === 'found')!;
		expect(found).toMatchObject({ person_id: null, name: 'Rina Wijaya', company: 'Batavia Foods' });
		expect(rowKeptUntil(found, { starts_at: Date.UTC(2026, 10, 1) })).toBe(Date.UTC(2026, 10, 1));

		skipRow(db, eventId, found.id, { by: 'Edmund' }, 5_000);
		expect(getEventPerson(db, eventId, found.id)).toMatchObject({
			skipped_at: 5_000,
			skipped_by: 'Edmund'
		});
		expect(rowKeptUntil(getEventPerson(db, eventId, found.id)!, { starts_at: 1_000 })).toBe(
			1_000 + 90 * 86_400_000
		);
		unskipRow(db, eventId, found.id);

		const added = shortlistFound(db, eventId, found.id, { by: 'Edmund' });
		expect(added).toMatchObject({ status: 'added', name: 'Rina Wijaya' });
		const live = getEventPerson(db, eventId, found.id)!;
		expect(live).toMatchObject({ stage: 'shortlisted', source: 'research', name: 'Rina Wijaya' });
		expect(getPerson(db, live.person_id!)).toMatchObject({
			origin: 'research',
			source_url: 'https://batavia.co.id/team',
			research_reason: 'Leads finance.'
		});
		expect(shortlistFound(db, eventId, found.id)).toEqual({ status: 'missing' });
	});

	it('refuses blocked companies', () => {
		addShortlisted(db, eventId, [guest('Someone', { company: 'Kopi Kita' })], { source: 'typed' });
		blockCompany(db, findCompany(db, 'Kopi Kita')!.id, { reason: 'competitor' });
		expect(
			addFound(db, eventId, [guest('Dewi', { company: 'PT Kopi Kita' })], { source: 'research' })
		).toMatchObject({ added: 0, refused: [{ name: 'Dewi', reason: 'blocked company' }] });
		expect(
			addShortlisted(db, eventId, [guest('Eko', { company: 'Kopi Kita' })], { source: 'typed' })
		).toMatchObject({ added: [], refused: [{ name: 'Eko', reason: 'blocked company' }] });
	});
});

describe('chips', () => {
	it('counts each row under the chips it belongs to', () => {
		const db = createDb(':memory:');
		const startsAt = Date.UTC(2026, 9, 1, 2);
		const eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		addShortlisted(
			db,
			eventId,
			[
				guest('A'),
				guest('B', { reply: 'yes' }),
				guest('C', { reply: 'maybe' }),
				guest('D', { reply: 'no' }),
				guest('E', { email: 'e@x.id' })
			],
			{ source: 'typed' }
		);
		addFound(db, eventId, [guest('F'), guest('G')], { source: 'research' });
		const rows = listEventPeople(db, eventId);
		markInvited(db, eventId, rows[4].id, 'email');
		skipRow(db, eventId, rows[6].id);
		checkIn(
			db,
			eventId,
			{ name: 'E', email: 'e@x.id', phone: null, company: '', jobTitle: '' },
			meta
		);

		const event = { starts_at: startsAt, ends_at: null };
		expect(hasEnded(event, startsAt + 5 * 3_600_000)).toBe(false);
		expect(hasEnded(event, startsAt + 7 * 3_600_000)).toBe(true);
		const before = chipCounts(listEventPeople(db, eventId), false);
		expect(before).toMatchObject({
			review: 1,
			skipped: 1,
			shortlisted: 1,
			invited: 0,
			yes: 1,
			maybe: 1,
			no: 1,
			confirmed: 0,
			checked_in: 1,
			no_show: 0
		});
		expect(chipCounts(listEventPeople(db, eventId), true).no_show).toBe(2);
	});
});
