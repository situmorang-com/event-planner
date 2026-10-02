import { beforeEach, describe, expect, it } from 'vitest';
import { markers } from '../people';
import { checkIn } from './checkins';
import { blockCompany, findCompany, setCompanyOwner } from './companies';
import { createDb, type DB } from './database';
import { lockPerson } from './do-not-contact';
import {
	addShortlisted,
	addTouch,
	confirmRow,
	listEventPeople,
	setOwner,
	setReply,
	type GuestInput
} from './event-people';
import { createEvent, updateEvent } from './events';
import { createPerson, getPeople } from './people';
import { addPeople, FOUND_THRESHOLD, peopleView, reviewedGuests } from './people-page';
import { setTeamNames } from './settings';

const guest = (name: string, extra: Partial<GuestInput> = {}): GuestInput => ({
	name,
	company: 'Batavia Foods',
	jobTitle: '',
	email: null,
	phone: null,
	...extra
});

const START = Date.UTC(2026, 10, 1, 2);

function newEvent(db: DB) {
	return createEvent(db, {
		name: 'Launch',
		venue: '',
		startsAt: START,
		timezone: 'Asia/Jakarta',
		qrMode: 'static',
		targetCount: 10
	});
}

describe('peopleView', () => {
	let db: DB;
	let eventId: string;
	const event = () => db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId) as never;
	const view = (now = START - 86_400_000) => peopleView(db, event(), now);

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = newEvent(db);
		setTeamNames(db, ['Edmund', 'Sari']);
	});

	it('groups rows by company with the owner inherited from it', () => {
		addShortlisted(
			db,
			eventId,
			[
				guest('Ana', { email: 'ana@x.id' }),
				guest('Budi', { company: 'PT Batavia Foods', phone: '+6281234567890' }),
				guest('Citra', { company: 'Selat Energy' }),
				guest('Dewi', { company: '' })
			],
			{ source: 'typed' }
		);
		setCompanyOwner(db, findCompany(db, 'Batavia Foods')!.id, 'Sari');
		const rows = listEventPeople(db, eventId);
		setOwner(db, eventId, rows[1].id, 'Edmund');

		const { groups } = view();
		expect(groups.map((g) => [g.name, g.owner, g.rows.map((r) => r.name)])).toEqual([
			['Batavia Foods', 'Sari', ['Ana', 'Budi']],
			['Selat Energy', null, ['Citra']],
			['', null, ['Dewi']]
		]);
		expect(groups[0].rows.map((r) => [r.owner, r.company_owner])).toEqual([
			[null, 'Sari'],
			['Edmund', 'Sari']
		]);
	});

	it('counts Yes replies against the target and confirmations beside it', () => {
		addShortlisted(
			db,
			eventId,
			[guest('A', { reply: 'yes' }), guest('B', { reply: 'yes' }), guest('C', { reply: 'maybe' })],
			{ source: 'typed' }
		);
		const rows = listEventPeople(db, eventId);
		confirmRow(db, eventId, rows[0].id, 'registration');
		expect(view().progress).toEqual({ yes: 2, confirmed: 1, target: 10 });
		expect(view().counts).toMatchObject({ yes: 2, maybe: 1, confirmed: 1, shortlisted: 0 });
		expect(view().ended).toBe(false);
		expect(view(START + 7 * 3_600_000)).toMatchObject({ ended: true });
		expect(view(START + 7 * 3_600_000).counts.no_show).toBe(3);
	});

	it('closes the message buttons for locked, blocked and flagged people', () => {
		addShortlisted(
			db,
			eventId,
			[
				guest('Rina', { email: 'rina@x.id', phone: '+6281234567890' }),
				guest('Kopi', { company: 'Kopi Kita', email: 'k@kopi.id' }),
				guest('Nomail', { email: 'n@x.id', phone: '+6281111111111' })
			],
			{ source: 'typed' }
		);
		const [rina, kopi, nomail] = listEventPeople(db, eventId);
		lockPerson(db, rina.person_id!, { source: 'staff', reason: 'asked' });
		blockCompany(db, findCompany(db, 'Kopi Kita')!.id, { reason: 'competitor' });
		db.prepare(`UPDATE people SET d365_no_email = 1 WHERE id = ?`).run(nomail.person_id);

		const rows = view().rows;
		expect(rows.map((r) => r.contact)).toEqual([
			{ whatsapp: false, email: false, reason: 'locked' },
			{ whatsapp: false, email: false, reason: null },
			{ whatsapp: true, email: false, reason: null }
		]);
		const day = () => '2 Oct';
		expect(markers(rows[0], day).map((m) => m.key)).toEqual(['locked']);
		expect(markers(rows[1], day).map((m) => m.key)).toEqual(['blocked']);
		expect(markers(rows[2], day)).toEqual([]);
		void kopi;
	});

	it('marks what a row still needs and how often it was chased', () => {
		addShortlisted(db, eventId, [guest('Rina'), guest('Andi', { email: 'a@x.id' })], {
			source: 'typed'
		});
		const [rina, andi] = listEventPeople(db, eventId);
		addTouch(db, eventId, andi.id, { kind: 'invitation', via: 'linkedin' }, 1_000);
		addTouch(db, eventId, andi.id, { kind: 'chase', via: 'email' }, 2_000);
		checkIn(
			db,
			eventId,
			{ name: 'Rina', email: null, phone: null, company: 'Batavia Foods', jobTitle: '' },
			{ method: 'staff', device: 'other', consent: false }
		);

		const rows = view().rows;
		const day = (ts: number) => `day ${ts}`;
		expect(markers(rows[0], day).map((m) => m.label)).toEqual([
			'Needs details',
			'No consent recorded'
		]);
		expect(markers(rows[1], day).map((m) => m.label)).toEqual([
			'Chased ×1, last day 2000',
			'Via LinkedIn'
		]);
		void rina;
	});

	it('shows a legacy Malaysian attendee as not contactable until they register', () => {
		const since = db
			.prepare(`SELECT value FROM settings WHERE key = 'consent_boxes_since'`)
			.get() as { value: string };
		const personId = createPerson(
			db,
			{ name: 'Mei Ling', email: 'mei@x.my', phone: '+60123456789', company: 'Selat' },
			{ origin: 'checkin' },
			Number(since.value) - 1
		);
		addShortlisted(
			db,
			eventId,
			[...getPeople(db, [personId])].map((p) =>
				guest(p.name, {
					company: p.company,
					email: p.email,
					phone: p.phone
				})
			),
			{ source: 'pool' }
		);
		const [row] = view().rows;
		expect(row.person_id).toBe(personId);
		expect(row.contact).toEqual({ whatsapp: false, email: false, reason: 'not contactable' });
		expect(markers(row, () => '').map((m) => m.key)).toEqual(['contact']);

		setReply(db, eventId, row.id, 'yes');
		db.prepare(`UPDATE people SET consent_future_at = 1 WHERE id = ?`).run(personId);
		expect(view().rows[0].contact).toEqual({ whatsapp: true, email: true, reason: null });
	});
});

describe('addPeople', () => {
	let db: DB;
	let eventId: string;
	const rows = () => listEventPeople(db, eventId);

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = newEvent(db);
	});

	it('shortlists a short typed list and parks a long paste at Found', () => {
		const few = addPeople(db, eventId, {
			typed: [guest('Rina'), guest('Andi')],
			picked: [],
			company: 'Batavia Foods',
			park: false,
			originDetail: 'expo cards'
		});
		expect(few).toEqual({ added: 2, found: 0, duplicates: [], refused: [] });
		expect(rows().map((r) => [r.stage, r.source])).toEqual([
			['shortlisted', 'typed'],
			['shortlisted', 'typed']
		]);
		expect(getPeople(db, [rows()[0].person_id!])[0].origin_detail).toBe('expo cards');

		const many = Array.from({ length: FOUND_THRESHOLD + 1 }, (_, i) => guest(`Person ${i}`));
		const big = addPeople(db, eventId, { typed: many, picked: [], company: '', park: false });
		expect(big).toMatchObject({ added: 0, found: FOUND_THRESHOLD + 1 });
		expect(
			rows()
				.filter((r) => r.stage === 'found')
				.map((r) => r.source)
		).toEqual(many.map(() => 'paste'));
	});

	it('parks typed rows on request, keeping the typed source', () => {
		const result = addPeople(db, eventId, {
			typed: [guest('Rina')],
			picked: [],
			company: '',
			park: true
		});
		expect(result).toMatchObject({ added: 0, found: 1 });
		expect(rows()[0]).toMatchObject({ stage: 'found', source: 'typed', person_id: null });
	});

	it('shortlists pool picks under the typed company, and reports what it could not add', () => {
		// Typed by the organizer before, so the company typed now may replace it (§3 precedence).
		const id = createPerson(
			db,
			{ name: 'Hendra Gunawan', email: 'hendra@x.id', company: 'Old Spelling' },
			{ origin: 'typed' }
		);
		const locked = createPerson(db, { name: 'Dewi', email: 'dewi@x.id' }, { origin: 'typed' });
		lockPerson(db, locked, { source: 'staff' });
		addShortlisted(db, eventId, [guest('Rina')], { source: 'typed' });

		const result = addPeople(db, eventId, {
			typed: [guest('Rina'), guest('Dewi', { email: 'dewi@x.id' })],
			picked: getPeople(db, [id]),
			company: 'Batavia Foods',
			park: false
		});
		expect(result).toEqual({
			added: 1,
			found: 0,
			duplicates: ['Rina'],
			refused: [{ name: 'Dewi', reason: 'do not contact' }]
		});
		const hendra = rows().find((r) => r.person_id === id)!;
		expect(hendra).toMatchObject({
			stage: 'shortlisted',
			source: 'pool',
			company: 'Batavia Foods'
		});
	});
});

describe('reviewedGuests', () => {
	it('cleans every field and names the first row that cannot be saved', () => {
		const ok = reviewedGuests(
			JSON.stringify([
				{
					name: ' Rina  Wijaya ',
					company: '',
					jobTitle: 'CFO',
					email: 'RINA@x.id',
					phone: '0812 3456 7890',
					linkedin: 'linkedin.com/in/Rina-Wijaya',
					reply: 'yes',
					note: 'VIP'
				}
			]),
			'Batavia Foods',
			'ID'
		);
		expect(ok).toEqual([
			{
				name: 'Rina Wijaya',
				company: 'Batavia Foods',
				jobTitle: 'CFO',
				email: 'rina@x.id',
				phone: '+6281234567890',
				linkedin: 'https://www.linkedin.com/in/rina-wijaya',
				reply: 'yes',
				note: 'VIP'
			}
		]);
		expect(reviewedGuests('[{"name": ""}]', '', 'ID')).toBe('Row 1 needs a name.');
		expect(reviewedGuests('[{"name": "A", "email": "nope"}]', '', 'ID')).toBe(
			'Row 1 (A): check the email.'
		);
		expect(reviewedGuests('[{"name": "A", "linkedin": "x.com/a"}]', '', 'ID')).toMatch(
			/isn’t a LinkedIn profile link/
		);
		expect(reviewedGuests('not json', '', 'ID')).toMatch(/didn’t arrive intact/);
	});
});

describe('target and phone country on the event', () => {
	it('keeps the target when the form leaves it out and clears it when sent empty', () => {
		const db = createDb(':memory:');
		const id = newEvent(db);
		const base = {
			name: 'Launch',
			venue: '',
			startsAt: START,
			timezone: 'UTC',
			qrMode: 'static' as const
		};
		updateEvent(db, id, { ...base, phoneCountry: 'MY' });
		expect(db.prepare(`SELECT target_count, phone_country FROM events`).get()).toEqual({
			target_count: 10,
			phone_country: 'MY'
		});
		updateEvent(db, id, { ...base, targetCount: null });
		expect(db.prepare(`SELECT target_count FROM events`).get()).toEqual({ target_count: null });
	});
});
