import { beforeEach, describe, expect, it } from 'vitest';
import { checkIn, removeCheckin } from './checkins';
import { createDb, type DB } from './database';
import { addShortlisted, listEventPeople, removeRow } from './event-people';
import { createEvent } from './events';

const meta = { method: 'form' as const, device: 'ios' as const, consent: true };

describe('removeRow', () => {
	let db: DB;
	let eventId: string;
	const rows = () => listEventPeople(db, eventId);

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
			[
				{
					name: 'Rina Wijaya',
					company: 'Batavia Foods',
					jobTitle: '',
					email: 'rina@batavia.co.id',
					phone: null
				}
			],
			{ source: 'typed' }
		);
	});

	it('deletes a planned row', () => {
		expect(removeRow(db, eventId, rows()[0].id)).toBe('removed');
		expect(rows()).toEqual([]);
		expect(removeRow(db, eventId, 999)).toBe('missing');
	});

	it('refuses a row that holds a check-in, so every check-in keeps its row', () => {
		checkIn(
			db,
			eventId,
			{ name: 'Rina Wijaya', email: 'rina@batavia.co.id', phone: null, company: '', jobTitle: '' },
			meta
		);
		const row = rows()[0];
		expect(row.stage).toBe('checked_in');
		expect(removeRow(db, eventId, row.id)).toBe('checked in');
		expect(rows()).toHaveLength(1);

		// The Check-ins tab is the way back: undoing the check-in keeps the planned row.
		removeCheckin(db, eventId, row.checkin_id!);
		expect(rows()[0].stage).not.toBe('checked_in');
		expect(removeRow(db, eventId, row.id)).toBe('removed');
	});
});
