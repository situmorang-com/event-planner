import { beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from './activity-log';
import { checkIn, removeCheckin } from './checkins';
import { blockCompany, findCompany, renameCompany } from './companies';
import { deleteContact } from './contacts';
import { createDb, type DB } from './database';
import { listEntries, lockPerson } from './do-not-contact';
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
	lockRow,
	markInvited,
	setDetails,
	setReply,
	shortlistAll,
	shortlistFound,
	skipAll,
	skipRow,
	unflagRow,
	unmarkInvited,
	unskipRow,
	type GuestInput
} from './event-people';
import { createEvent } from './events';
import { createPerson, getPerson } from './people';
import { nextState, suggestedTouchKind, type StageState } from './stages';

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
		const walkIn = listEventPeople(db, eventId).find((r) => r.person_id === result.personId);
		expect(walkIn).toMatchObject({
			source: 'walk_in',
			stage: 'checked_in',
			consent_event_at: null
		});
		removeCheckin(db, eventId, result.checkinId);
		expect(listEventPeople(db, eventId)).toHaveLength(1);
	});
});

describe('adding people', () => {
	let db: DB;
	let eventId: string;
	const names = () => listEventPeople(db, eventId).map((r) => r.name);

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: null,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
	});

	it('skips people already on the list, however their name or company is written', () => {
		addShortlisted(
			db,
			eventId,
			[guest('Hendra Gunawan'), guest('Rina Wijaya', { email: 'rina@batavia.co.id' })],
			{ source: 'typed' }
		);
		const again = addShortlisted(
			db,
			eventId,
			[
				guest('Bapak Hendra Gunawan', { company: 'PT. Batavia Foods Tbk' }),
				guest('R. Wijaya', { email: 'rina@batavia.co.id' }),
				guest('Hendra Gunawan', { company: 'Selat Energy' })
			],
			{ source: 'typed' }
		);
		expect(again).toEqual({
			added: ['Hendra Gunawan'],
			duplicates: ['Bapak Hendra Gunawan', 'R. Wijaya'],
			refused: []
		});
		expect(names()).toHaveLength(3);
	});

	it('knows someone by their LinkedIn profile', () => {
		const linkedin = 'https://www.linkedin.com/in/rina-wijaya-4a1b2c';
		addShortlisted(db, eventId, [guest('Rina Wijaya', { linkedin })], { source: 'typed' });
		const again = addShortlisted(db, eventId, [guest('Rina W.', { company: 'Selat', linkedin })], {
			source: 'typed'
		});
		expect(again.duplicates).toEqual(['Rina W.']);
		expect(listEventPeople(db, eventId)[0].linkedin).toBe(linkedin);
	});

	it('only touches its own event', () => {
		const other = createEvent(db, {
			name: 'Other',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
		addShortlisted(db, other, [guest('Rina Wijaya')], { source: 'typed' });
		const [{ id }] = listEventPeople(db, other);
		setReply(db, eventId, id, 'yes');
		expect(listEventPeople(db, other)[0].reply).toBe('pending');
	});

	it('folds spellings of one company together and renames them as one', () => {
		addShortlisted(
			db,
			eventId,
			[
				guest('Ana', { company: 'Batavia Foods' }),
				guest('Budi', { company: 'PT Batavia Foods' }),
				guest('Dewi', { company: '' })
			],
			{ source: 'typed' }
		);
		const rows = listEventPeople(db, eventId);
		expect(rows.map((r) => r.company)).toEqual(['Batavia Foods', 'Batavia Foods', '']);
		renameCompany(db, rows[0].company_id!, 'Batavia Foods Group');
		expect(listEventPeople(db, eventId).map((r) => r.company)).toEqual([
			'Batavia Foods Group',
			'Batavia Foods Group',
			''
		]);
	});

	it('erases event rows along with the person they belong to', () => {
		const other = createEvent(db, {
			name: 'Other',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
		const { personId } = checkIn(
			db,
			eventId,
			{ name: 'Rina', email: 'rina@example.com', phone: null, company: '', jobTitle: '' },
			meta
		);
		addShortlisted(
			db,
			eventId,
			[guest('Rina Wijaya', { email: 'rina@example.com' }), guest('Andi')],
			{ source: 'typed' }
		);
		addShortlisted(db, other, [guest('Rina Wijaya', { email: 'rina@example.com' })], {
			source: 'typed'
		});

		deleteContact(db, personId);
		expect(names()).toEqual(['Andi']);
		expect(listEventPeople(db, other)).toEqual([]);
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

describe('row verbs', () => {
	let db: DB;
	let eventId: string;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
	});

	it('suggests the invitation first, then what fits the answer', () => {
		expect(suggestedTouchKind({ stage: 'shortlisted', reply: 'pending' })).toBe('invitation');
		expect(suggestedTouchKind({ stage: 'invited', reply: 'pending' })).toBe('chase');
		expect(suggestedTouchKind({ stage: 'replied', reply: 'yes' })).toBe('thanks_yes');
		expect(suggestedTouchKind({ stage: 'replied', reply: 'maybe' })).toBe('followup_maybe');
		expect(suggestedTouchKind({ stage: 'replied', reply: 'no' })).toBe('thanks_no');
		expect(suggestedTouchKind({ stage: 'confirmed', reply: 'yes' })).toBe('reminder');
	});

	it('undoes a LinkedIn mark only while it is the latest touch', () => {
		addShortlisted(db, eventId, [guest('Rina')], { source: 'typed' });
		const id = listEventPeople(db, eventId)[0].id;
		markInvited(db, eventId, id, 'linkedin', {}, 1_000);
		expect(getEventPerson(db, eventId, id)).toMatchObject({
			stage: 'invited',
			invited_via: 'linkedin'
		});
		addTouch(db, eventId, id, { kind: 'chase', via: 'email' }, 2_000);
		expect(unmarkInvited(db, eventId, id, 'linkedin')).toBe(false);
		clearLatestTouch(db, eventId, id);
		expect(unmarkInvited(db, eventId, id, 'linkedin')).toBe(true);
		expect(getEventPerson(db, eventId, id)).toMatchObject({
			stage: 'shortlisted',
			invited_via: null
		});
	});

	it("locks a live row's person everywhere, and lists a Found row's snapshot", () => {
		addShortlisted(db, eventId, [guest('Rina', { email: 'rina@x.id' })], { source: 'typed' });
		addFound(db, eventId, [guest('Found One', { phone: '+6281234567890' })], {
			source: 'research'
		});
		const [live, found] = listEventPeople(db, eventId);
		expect(lockRow(db, eventId, live.id, { reason: 'asked', by: 'Edmund' })).toBe(true);
		expect(getPerson(db, live.person_id!)).toMatchObject({ locked_at: expect.any(Number) });
		expect(lockRow(db, eventId, found.id, { reason: 'asked' })).toBe(true);
		expect(getEventPerson(db, eventId, found.id)).toMatchObject({
			stage: 'found',
			skipped_at: expect.any(Number)
		});
		expect(
			listEntries(db)
				.map((e) => e.kind)
				.sort()
		).toEqual(['email', 'name_company', 'name_company', 'phone']);
		expect(addShortlisted(db, eventId, [guest('Found One')], { source: 'typed' }).refused).toEqual([
			{ name: 'Found One', reason: 'do not contact' }
		]);
		expect(lockRow(db, eventId, 999)).toBe(false);
	});

	it('adds or skips every Found row at one company at once', () => {
		addFound(db, eventId, [guest('A'), guest('B'), guest('C', { company: 'Selat Energy' })], {
			source: 'research'
		});
		const key = listEventPeople(db, eventId)[0].company_key;
		skipRow(db, eventId, listEventPeople(db, eventId)[1].id);
		expect(shortlistAll(db, eventId, key, { by: 'Sari' }).map((r) => r.status)).toEqual(['added']);
		expect(listEventPeople(db, eventId).map((r) => [r.name, r.stage, r.added_by])).toEqual([
			['A', 'shortlisted', 'Sari'],
			['B', 'found', ''],
			['C', 'found', '']
		]);
		expect(skipAll(db, eventId, 'selat energy')).toBe(1);
		expect(skipAll(db, eventId, 'selat energy')).toBe(0);
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

		skipRow(db, eventId, found.id, { by: 'Edmund' }, 5_000);
		expect(getEventPerson(db, eventId, found.id)).toMatchObject({
			skipped_at: 5_000,
			skipped_by: 'Edmund'
		});
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

	it('refuses an edit that would put a listed channel on a live person', () => {
		const locked = createPerson(
			db,
			{ name: 'Dewi Lestari', email: 'dewi@x.id', phone: '+6281111111111' },
			{ origin: 'typed' }
		);
		lockPerson(db, locked, { source: 'staff', reason: 'asked' });
		addShortlisted(db, eventId, [guest('Rina Wijaya')], { source: 'typed' });
		const rina = listEventPeople(db, eventId).find((r) => r.name === 'Rina Wijaya')!;
		const edit = (email: string | null, phone: string | null = null) =>
			setDetails(db, eventId, rina.id, {
				name: 'Rina Wijaya',
				company: 'Batavia Foods',
				jobTitle: 'CFO',
				email,
				phone
			});
		expect(edit('dewi@x.id')).toBe('do not contact');
		expect(edit(null, '+6281111111111')).toBe('do not contact');
		expect(edit('rina@x.id')).toBe('saved');
		expect(getPerson(db, rina.person_id!)).toMatchObject({ email: 'rina@x.id', job_title: 'CFO' });
		expect(getPerson(db, rina.person_id!)?.locked_at).toBeNull();
		expect(setDetails(db, eventId, 9_999, { ...rina, jobTitle: '' })).toBe('missing');
	});

	it('clears the D365 flags explicitly, and logs it by id', () => {
		addShortlisted(
			db,
			eventId,
			[
				guest('Hendra Gunawan', { extra: { doNotEmail: true, doNotPhone: true, isCustomer: true } })
			],
			{ source: 'd365' }
		);
		const row = listEventPeople(db, eventId)[0];
		db.prepare(`UPDATE people SET d365_suppressed = 1 WHERE id = ?`).run(row.person_id);
		expect(unflagRow(db, eventId, row.id, { by: 'Edmund' })).toBe(true);
		expect(getPerson(db, row.person_id!)).toMatchObject({
			d365_no_email: 0,
			d365_no_phone: 0,
			d365_suppressed: 0,
			is_customer: 1
		});
		expect(listActivity(db, eventId)[0]).toMatchObject({
			kind: 'unlock',
			who: 'Edmund',
			what: JSON.stringify({ personId: row.person_id })
		});
		expect(unflagRow(db, eventId, 9_999)).toBe(false);
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
