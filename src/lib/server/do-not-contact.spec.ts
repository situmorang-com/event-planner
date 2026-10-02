import { beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from './activity-log';
import { findCompany, renameCompany } from './companies';
import { createDb, type DB } from './database';
import {
	addEntry,
	blockByHand,
	check,
	hashEmail,
	hashName,
	hashNameCompany,
	listEntries,
	lockPerson,
	maskEmail,
	maskName,
	maskPhone,
	removeEntry
} from './do-not-contact';
import { addFound, addShortlisted, listEventPeople } from './event-people';
import { createEvent } from './events';
import { createPerson, getPerson } from './people';

describe('hashes and labels', () => {
	it('hashes the normalised value, so spelling does not matter', () => {
		expect(hashEmail(' Rina@Batavia.co.id ')).toBe(hashEmail('rina@batavia.co.id'));
		expect(hashName('Bapak Hendra Gunawan, S.E.')).toBe(hashName('hendra gunawan'));
		expect(hashNameCompany(hashName('Rina'), 'batavia foods')).toHaveLength(64);
	});

	it('masks what the settings page shows', () => {
		expect(maskEmail('rina@batavia.co.id')).toBe('r***@batavia.co.id');
		expect(maskPhone('+6281234567890')).toBe('+62***890');
		expect(maskName('Hendra Gunawan', 'Batavia Foods')).toBe('H*** G*** @ Batavia Foods');
		expect(maskName('Dewi', '')).toBe('D***');
	});
});

describe('locking', () => {
	let db: DB;
	let eventId: string;
	let personId: string;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
		personId = createPerson(
			db,
			{
				name: 'Rina Wijaya',
				email: 'rina@batavia.co.id',
				phone: '+6281234567890',
				company: 'Batavia Foods'
			},
			{ origin: 'typed' }
		);
	});

	it('lists every channel, marks the person and refuses them everywhere', () => {
		addShortlisted(
			db,
			eventId,
			[{ name: 'Rina Wijaya', company: 'Batavia Foods', jobTitle: '', email: null, phone: null }],
			{ source: 'typed' }
		);
		db.prepare(`UPDATE event_people SET next_action_at = 1, next_action_kind = 'chase'`).run();

		expect(
			lockPerson(db, personId, { reason: 'asked to stop', source: 'stop_reply', by: 'Edmund' })
		).toBe(true);
		expect(listEntries(db).map((e) => [e.kind, e.label])).toEqual([
			['name_company', 'R*** W*** @ Batavia Foods'],
			['phone', '+62***890'],
			['email', 'r***@batavia.co.id']
		]);
		expect(getPerson(db, personId)).toMatchObject({
			locked_at: expect.any(Number),
			lock_reason: 'asked to stop'
		});
		expect(listEventPeople(db, eventId)[0].next_action_at).toBeNull();
		expect(listActivity(db, null)[0]).toMatchObject({
			kind: 'lock',
			what: JSON.stringify({ personId })
		});

		expect(check(db, { email: 'RINA@batavia.co.id' })).toMatchObject({ kind: 'email' });
		expect(check(db, { phone: '+6281234567890' })).toMatchObject({ kind: 'phone' });
		expect(check(db, { name: 'Ibu Rina Wijaya', company: 'PT Batavia Foods Tbk' })).toMatchObject({
			kind: 'name_company'
		});
		expect(check(db, { name: 'Rina Wijaya', company: 'Selat Energy' })).toBeNull();

		const other = createEvent(db, {
			name: 'Other',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
		expect(
			addShortlisted(
				db,
				other,
				[
					{ name: 'R. Wijaya', company: '', jobTitle: '', email: 'rina@batavia.co.id', phone: null }
				],
				{ source: 'typed' }
			)
		).toMatchObject({ added: [], refused: [{ name: 'R. Wijaya', reason: 'do not contact' }] });
		expect(
			addFound(
				db,
				other,
				[
					{
						name: 'Rina Wijaya',
						company: 'Batavia Foods',
						jobTitle: 'CFO',
						email: null,
						phone: null
					}
				],
				{ source: 'research' }
			)
		).toMatchObject({ added: 0, refused: [{ name: 'Rina Wijaya', reason: 'do not contact' }] });
	});

	it('typed on the settings page, locks whoever it matches and logs a count only', () => {
		const other = createPerson(
			db,
			{ name: 'Dewi Lestari', email: 'dewi@selat.co.id', company: 'Selat Energy' },
			{ origin: 'typed' }
		);
		expect(
			blockByHand(db, { kind: 'email', value: 'RINA@batavia.co.id', reason: 'asked', by: 'Sari' })
		).toEqual({ id: expect.any(Number), locked: 1 });
		expect(getPerson(db, personId)).toMatchObject({
			locked_at: expect.any(Number),
			lock_reason: 'asked'
		});
		expect(getPerson(db, other)?.locked_at).toBeNull();
		expect(listEntries(db)).toMatchObject([
			{ kind: 'email', label: 'r***@batavia.co.id', source: 'staff', by: 'Sari', reason: 'asked' }
		]);
		expect(listActivity(db, null)[0]).toMatchObject({ kind: 'lock', who: 'Sari', row_count: 1 });
		expect(listActivity(db, null)[0].what).not.toContain('rina');

		expect(
			blockByHand(db, { kind: 'name_company', value: 'Dewi Lestari', company: 'PT Selat Energy' })
		).toMatchObject({ locked: 1 });
		expect(getPerson(db, other)?.locked_at).not.toBeNull();
		expect(blockByHand(db, { kind: 'phone', value: '   ' })).toBeNull();
	});

	it('is removed by staff with a reason, which unlocks people nothing else lists', () => {
		lockPerson(db, personId, { source: 'staff' });
		const [, , email] = listEntries(db);
		expect(removeEntry(db, email.id, { by: 'Edmund', reason: 'wrong person' })).toBe(true);
		expect(getPerson(db, personId)?.locked_at).not.toBeNull();
		for (const e of listEntries(db))
			removeEntry(db, e.id, { by: 'Edmund', reason: 'wrong person' });
		expect(getPerson(db, personId)?.locked_at).toBeNull();
		expect(listEntries(db)).toEqual([]);
		expect(listEntries(db, true)).toHaveLength(3);
		expect(listActivity(db, null)[0]).toMatchObject({ kind: 'unlock' });
		expect(removeEntry(db, email.id, { reason: 'again' })).toBe(false);
	});

	it('follows a company rename, so the name still hits under the new spelling', () => {
		addEntry(db, {
			kind: 'name_company',
			value: 'Hendra Gunawan',
			company: 'Batavia Foods',
			source: 'staff'
		});
		renameCompany(db, findCompany(db, 'Batavia Foods')!.id, 'Batavia Group');
		expect(check(db, { name: 'Hendra Gunawan', company: 'Batavia Group' })).not.toBeNull();
		expect(check(db, { name: 'Hendra Gunawan', company: 'Batavia Foods' })).toBeNull();
		expect(listEntries(db)[0].company_key).toBe('batavia group');
	});
});
