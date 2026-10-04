import { beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from './activity-log';
import { checkIn, listAttendees } from './checkins';
import { createDb, type DB } from './database';
import { addShortlisted, findRow, listEventPeople, listTouches, markInvited } from './event-people';
import { createEvent } from './events';
import {
	contactBlock,
	countryOf,
	createPerson,
	findPerson,
	getPerson,
	listPeople,
	mergeInto,
	peopleAtCompany,
	searchPeople,
	updatePerson,
	type PersonDetails,
	type PersonRow
} from './people';

const newEvent = (db: DB, name = 'Launch') =>
	createEvent(db, { name, venue: '', startsAt: null, timezone: 'Asia/Jakarta', qrMode: 'static' });

const rina: PersonDetails = {
	name: 'Rina Wijaya',
	jobTitle: 'CFO',
	email: 'rina@batavia.co.id',
	phone: '+6281234567890',
	company: 'Batavia Foods'
};

describe('findPerson', () => {
	let db: DB;

	beforeEach(() => {
		db = createDb(':memory:');
	});

	it('matches by email first, whatever the case', () => {
		const id = createPerson(db, rina, { origin: 'typed' });
		createPerson(db, { name: 'Rina Wijaya', company: 'Selat Energy' }, { origin: 'typed' });
		expect(findPerson(db, { email: 'RINA@batavia.co.id', name: 'Someone Else' })?.id).toBe(id);
	});

	it('narrows a shared address by the other details, and gives up when nothing decides', () => {
		const a = createPerson(
			db,
			{ name: 'Andi Pratama', email: 'info@kopi.id' },
			{ origin: 'typed' }
		);
		const b = createPerson(
			db,
			{ name: 'Budi Santoso', email: 'info@kopi.id' },
			{ origin: 'typed' }
		);
		expect(findPerson(db, { email: 'info@kopi.id', name: 'Budi Santoso' })?.id).toBe(b);
		expect(findPerson(db, { email: 'info@kopi.id', name: 'Pak Andi Pratama' })?.id).toBe(a);
		expect(findPerson(db, { email: 'info@kopi.id', name: 'Citra Dewi' })).toBeUndefined();
	});

	it('matches by phone only when the emails do not contradict', () => {
		const id = createPerson(db, rina, { origin: 'typed' });
		expect(findPerson(db, { phone: rina.phone, name: 'R. Wijaya' })?.id).toBe(id);
		expect(findPerson(db, { phone: rina.phone, email: 'pa@batavia.co.id' })).toBeUndefined();
	});

	it('matches by LinkedIn profile', () => {
		const linkedin = 'https://www.linkedin.com/in/rina-wijaya-4a1b2c';
		const id = createPerson(db, { ...rina, linkedin }, { origin: 'research' });
		expect(findPerson(db, { linkedin, name: 'Rina W.', company: 'Elsewhere' })?.id).toBe(id);
	});

	it('matches by name when neither company, email nor phone contradicts', () => {
		const id = createPerson(db, rina, { origin: 'typed' });
		expect(findPerson(db, { name: 'Ibu Rina Wijaya' })?.id).toBe(id);
		expect(findPerson(db, { name: 'Rina Wijaya', company: 'PT Batavia Foods Tbk' })?.id).toBe(id);
		expect(findPerson(db, { name: 'Rina Wijaya', company: 'Selat Energy' })).toBeUndefined();
		expect(findPerson(db, { name: 'Rina Wijaya', email: 'other@x.id' })).toBeUndefined();
		expect(findPerson(db, { name: 'Rina Wijaya', phone: '+60123456789' })).toBeUndefined();
	});

	it('prefers the namesake at the same company, and makes an ambiguous name a new person', () => {
		createPerson(db, { name: 'Andi Pratama', company: 'Kopi Kita' }, { origin: 'typed' });
		const selat = createPerson(
			db,
			{ name: 'Andi Pratama', company: 'Selat Energy' },
			{ origin: 'typed' }
		);
		expect(findPerson(db, { name: 'Andi Pratama', company: 'PT Selat Energy' })?.id).toBe(selat);
		// Two namesakes and no company, email or phone to tell them apart: nobody is picked.
		expect(findPerson(db, { name: 'Andi Pratama' })).toBeUndefined();
		expect(findPerson(db, { name: 'Andi Pratama', company: 'Garuda' })).toBeUndefined();
	});

	it("tries the event's own rows first, by name alone at a non-contradicting company", () => {
		const eventId = newEvent(db);
		const other = createPerson(
			db,
			{ name: 'Hendra Gunawan', company: 'Selat Energy' },
			{ origin: 'typed' }
		);
		addShortlisted(
			db,
			eventId,
			[
				{
					name: 'Bapak Hendra Gunawan',
					company: 'Batavia Foods',
					jobTitle: '',
					email: null,
					phone: null
				}
			],
			{ source: 'typed' }
		);
		const onEvent = findRow(
			db,
			eventId,
			findPerson(db, { name: 'Hendra Gunawan', company: 'Batavia Foods' })!.id
		);
		expect(onEvent).toBeDefined();
		// On the day a different email does not stop the name pairing with the row (as today).
		const hit = findPerson(db, { name: 'Hendra Gunawan', email: 'hendra@gmail.com' }, eventId);
		expect(hit?.id).toBe(onEvent!.person_id);
		expect(hit?.id).not.toBe(other);
	});
});

describe('precedence', () => {
	let db: DB;

	beforeEach(() => {
		db = createDb(':memory:');
	});

	it('lets research fill blanks only, and typed values replace research', () => {
		const id = createPerson(
			db,
			{ name: 'Rina Wijaya', jobTitle: 'Finance Manager', company: 'Batavia Foods' },
			{ origin: 'research' }
		);
		updatePerson(
			db,
			id,
			{ name: 'R. Wijaya', jobTitle: 'CFO', email: 'r@x.id' },
			{ origin: 'research' }
		);
		expect(getPerson(db, id)).toMatchObject({
			name: 'Rina Wijaya',
			job_title: 'Finance Manager',
			email: 'r@x.id'
		});
		updatePerson(db, id, { name: 'Rina Wijaya', jobTitle: 'CFO' }, { origin: 'typed' });
		expect(getPerson(db, id)).toMatchObject({ job_title: 'CFO', origin: 'research' });
	});

	it("keeps what the person typed themselves over the organizer's version, but fills blanks", () => {
		const eventId = newEvent(db);
		const { personId } = checkIn(
			db,
			eventId,
			{
				name: 'Rina Wijaya',
				email: 'rina@batavia.co.id',
				phone: null,
				company: 'Batavia Foods',
				jobTitle: ''
			},
			{ method: 'form', device: 'ios', consent: true }
		);
		updatePerson(
			db,
			personId,
			{ name: 'Ibu Rina', jobTitle: 'CFO', phone: '+6281234567890', company: 'Selat' },
			{ origin: 'typed' }
		);
		expect(getPerson(db, personId)).toMatchObject({
			name: 'Rina Wijaya',
			job_title: 'CFO',
			phone: '+6281234567890',
			company: 'Batavia Foods'
		});
	});

	it('is sticky about customers and the first origin', () => {
		const id = createPerson(db, rina, { origin: 'typed' });
		updatePerson(db, id, rina, { origin: 'd365', isCustomer: true });
		updatePerson(db, id, rina, { origin: 'research' });
		expect(getPerson(db, id)).toMatchObject({ is_customer: 1, origin: 'typed' });
	});
});

describe('mergeInto', () => {
	it('moves rows, check-ins and consents to the survivor and deletes the loser', () => {
		const db = createDb(':memory:');
		const past = newEvent(db, 'Past');
		const next = newEvent(db, 'Next');
		const { personId: survivor } = checkIn(
			db,
			past,
			{
				name: 'Rina Wijaya',
				email: 'rina@batavia.co.id',
				phone: null,
				company: 'Batavia Foods',
				jobTitle: ''
			},
			{ method: 'form', device: 'ios', consent: true }
		);
		addShortlisted(
			db,
			next,
			[
				{
					name: 'R. Wijaya',
					company: 'Batavia',
					jobTitle: 'CFO',
					email: 'rw@gmail.com',
					phone: null,
					note: 'A'
				}
			],
			{ source: 'typed' }
		);
		const loser = findPerson(db, { email: 'rw@gmail.com' })!.id;
		const loserRow = findRow(db, next, loser)!;
		markInvited(db, next, loserRow.id, 'email');
		addShortlisted(
			db,
			next,
			[
				{
					...rina,
					jobTitle: 'CFO',
					company: 'Batavia Foods',
					email: rina.email!,
					phone: rina.phone!,
					note: 'B'
				}
			],
			{ source: 'typed' }
		);
		checkIn(
			db,
			past,
			{ name: 'R. Wijaya', email: 'rw@gmail.com', phone: null, company: '', jobTitle: '' },
			{ method: 'form', device: 'android', consent: true }
		);

		expect(mergeInto(db, loser, survivor, { by: 'Edmund' })).toBe(true);
		expect(getPerson(db, loser)).toBeUndefined();
		const merged = findRow(db, next, survivor)!;
		expect(merged).toMatchObject({ stage: 'invited', note: 'B · A', touch_count: 1 });
		expect(listTouches(db, merged.id)).toHaveLength(1);
		expect(listEventPeople(db, next)).toHaveLength(1);
		expect(listAttendees(db, past).map((a) => a.person_id)).toEqual([survivor]);
		expect(getPerson(db, survivor)).toMatchObject({
			job_title: 'CFO',
			email: 'rina@batavia.co.id'
		});
		expect(listActivity(db, null)[0]).toMatchObject({ kind: 'merge', who: 'Edmund' });
	});
});

describe('country and lists', () => {
	it('reads the country from the phone, then the event, else unknown', () => {
		expect(countryOf({ country: 'MY', phone: '+62812' })).toBe('MY');
		expect(countryOf({ country: null, phone: '+60123' })).toBe('MY');
		expect(countryOf({ country: null, phone: null }, 'Asia/Jakarta')).toBe('ID');
		expect(countryOf({ country: null, phone: null }, 'Europe/London')).toBeNull();
	});

	it('lists attendees and repliers by default, prospects behind the flag', () => {
		const db = createDb(':memory:');
		const eventId = newEvent(db);
		checkIn(
			db,
			eventId,
			{ name: 'Rina', email: 'rina@x.id', phone: null, company: '', jobTitle: '' },
			{ method: 'form', device: 'ios', consent: true }
		);
		addShortlisted(
			db,
			eventId,
			[
				{ name: 'Andi', company: 'Kopi', jobTitle: '', email: null, phone: null, reply: 'maybe' },
				{ name: 'Budi', company: 'Kopi', jobTitle: '', email: null, phone: null }
			],
			{ source: 'typed' }
		);
		expect(
			listPeople(db)
				.map((p) => p.name)
				.sort()
		).toEqual(['Andi', 'Rina']);
		expect(listPeople(db, { prospects: true }).map((p) => p.name)).toEqual(['Budi']);
	});
});

describe('contactable', () => {
	const base: Pick<
		PersonRow,
		| 'locked_at'
		| 'd365_suppressed'
		| 'd365_no_email'
		| 'd365_no_phone'
		| 'is_customer'
		| 'origin'
		| 'consent_future_at'
		| 'created_at'
		| 'country'
		| 'phone'
	> = {
		locked_at: null,
		d365_suppressed: 0,
		d365_no_email: 0,
		d365_no_phone: 0,
		is_customer: 0,
		origin: 'typed',
		consent_future_at: null,
		created_at: 1_000,
		country: null,
		phone: null
	};
	const since = 5_000;

	it('closes everything for a lock or a D365 suppression, one channel for a D365 flag', () => {
		expect(contactBlock(base, 'email', since)).toBeNull();
		expect(contactBlock({ ...base, locked_at: 1 }, 'whatsapp', since)).toBe('locked');
		expect(contactBlock({ ...base, d365_suppressed: 1 }, 'email', since)).toBe('suppressed');
		expect(contactBlock({ ...base, d365_no_email: 1 }, 'email', since)).toBe('channel refused');
		expect(contactBlock({ ...base, d365_no_email: 1 }, 'whatsapp', since)).toBeNull();
		expect(contactBlock({ ...base, d365_no_phone: 1 }, 'whatsapp', since)).toBe('channel refused');
	});

	it('holds legacy attendees outside Indonesia until they tick a box or become customers', () => {
		const legacy = { ...base, origin: 'checkin' as const };
		expect(contactBlock(legacy, 'email', since)).toBe('not contactable');
		expect(contactBlock({ ...legacy, phone: '+60123' }, 'email', since)).toBe('not contactable');
		expect(contactBlock({ ...legacy, phone: '+62812' }, 'email', since)).toBeNull();
		expect(contactBlock({ ...legacy, country: 'ID' }, 'email', since)).toBeNull();
		expect(contactBlock({ ...legacy, is_customer: 1 }, 'email', since)).toBeNull();
		expect(contactBlock({ ...legacy, consent_future_at: 9 }, 'email', since)).toBeNull();
		// Checked in after the boxes shipped without ticking "future events": a choice, not legacy.
		expect(contactBlock({ ...legacy, created_at: 6_000 }, 'email', since)).toBeNull();
	});
});

describe('pool lookups', () => {
	it('tells the default list from prospects at a company, and searches the whole pool', () => {
		const db = createDb(':memory:');
		const eventId = newEvent(db);
		createPerson(db, { name: 'Rina Wijaya', company: 'PT Batavia Foods' }, { origin: 'research' });
		checkIn(
			db,
			eventId,
			{
				name: 'Andi Pratama',
				email: 'andi@batavia.co.id',
				phone: null,
				company: 'Batavia Foods',
				jobTitle: ''
			},
			{ method: 'form', device: 'ios', consent: true }
		);
		expect(peopleAtCompany(db, 'Batavia Foods Tbk').map((p) => [p.name, p.is_default])).toEqual([
			['Andi Pratama', 1],
			['Rina Wijaya', 0]
		]);
		expect(searchPeople(db, 'wij').map((p) => p.name)).toEqual(['Rina Wijaya']);
		expect(searchPeople(db, 'batavia').map((p) => p.name)).toEqual(['Andi Pratama', 'Rina Wijaya']);
		expect(searchPeople(db, '  ')).toEqual([]);
	});
});
