import { describe, expect, it } from 'vitest';
import { createDb } from './database';
import { lockPerson } from './do-not-contact';
import { addShortlisted, setReply } from './event-people';
import { createEvent } from './events';
import { exportRow, poolCsv } from './exports';
import { createPerson } from './people';

describe('exportRow', () => {
	it('blanks every channel of a locked person and nothing of anyone else', () => {
		const open = { name: 'Rina', email: 'r@x.id', phone: '+62812', linkedin: 'l', locked_at: null };
		expect(exportRow(open)).toEqual({ ...open, locked: false });
		expect(exportRow({ ...open, locked_at: 1 })).toEqual({
			name: 'Rina',
			email: null,
			phone: null,
			linkedin: null,
			locked_at: 1,
			locked: true
		});
	});
});

describe('poolCsv', () => {
	it('exports the default list with origin and kept-until, prospects apart, locked stripped', () => {
		const db = createDb(':memory:');
		const eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: Date.UTC(2026, 10, 1),
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		addShortlisted(
			db,
			eventId,
			[
				{ name: 'Rina', company: 'Batavia', jobTitle: '', email: 'rina@x.id', phone: null },
				{ name: 'Andi', company: 'Batavia', jobTitle: '', email: 'andi@x.id', phone: null }
			],
			{ source: 'typed' },
			1_000
		);
		const [rina, andi] = db.prepare(`SELECT id, person_id FROM event_people ORDER BY id`).all() as {
			id: number;
			person_id: string;
		}[];
		setReply(db, eventId, rina.id, 'yes');
		setReply(db, eventId, andi.id, 'no');
		lockPerson(db, andi.person_id, { source: 'staff', reason: 'asked' });
		createPerson(db, { name: 'Budi', email: 'budi@x.id' }, { origin: 'research' }, 2_000);

		const main = poolCsv(db);
		expect(main.count).toBe(2);
		const [header, ...rows] = main.csv.trim().split('\r\n');
		expect(header).toContain('Origin,Kept until (UTC),Locked');
		expect(rows.find((r) => r.startsWith('Rina'))).toContain('rina@x.id');
		expect(rows.find((r) => r.startsWith('Rina'))).toContain('Typed,until deleted,,');
		const locked = rows.find((r) => r.startsWith('Andi'))!;
		expect(locked).not.toContain('andi@x.id');
		expect(locked).toContain(',yes,');

		const prospects = poolCsv(db, { prospects: true });
		expect(prospects.count).toBe(1);
		// Twelve months after their only date, the moment they were created.
		const budi = prospects.csv.trim().split('\r\n')[1];
		expect(budi).toContain('Research,1971-01-01T00:00:02.000Z');
	});
});
