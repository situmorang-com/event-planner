import { describe, expect, it } from 'vitest';
import { listActivity } from './activity-log';
import { createDb } from './database';
import { lockPerson } from './do-not-contact';
import { addShortlisted, confirmRow, listEventPeople, setReply } from './event-people';
import { createEvent } from './events';
import { exportRow, partnerExport, partnerRows, poolCsv } from './exports';
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

describe('partnerExport', () => {
	const setup = () => {
		const db = createDb(':memory:');
		const eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: Date.UTC(2026, 10, 1),
			timezone: 'Asia/Jakarta',
			qrMode: 'static',
			coHosts: 'Microsoft'
		});
		const guest = (name: string, company: string) => ({
			name,
			company,
			jobTitle: `${name} title`,
			email: `${name.toLowerCase()}@x.id`,
			phone: null
		});
		addShortlisted(
			db,
			eventId,
			[
				guest('Rina', 'Batavia'),
				guest('Andi', 'Batavia'),
				guest('Budi', 'Batavia'),
				guest('Citra', 'Selat'),
				guest('Dewi', 'Selat'),
				guest('Eka', 'Selat'),
				guest('Fajar', 'Kopi')
			],
			{ source: 'typed' },
			1_000
		);
		const row = (name: string) => listEventPeople(db, eventId).find((r) => r.name === name)!;
		const share = (name: string) =>
			db.prepare(`UPDATE event_people SET consent_share_at = 2000 WHERE id = ?`).run(row(name).id);
		const checkedIn = (name: string) =>
			db.prepare(`UPDATE event_people SET stage = 'checked_in' WHERE id = ?`).run(row(name).id);
		// Rina: yes and shared. Andi: yes, no share. Budi: confirmed, shared, but locked.
		setReply(db, eventId, row('Rina').id, 'yes');
		share('Rina');
		setReply(db, eventId, row('Andi').id, 'yes');
		setReply(db, eventId, row('Budi').id, 'yes');
		confirmRow(db, eventId, row('Budi').id, 'registration');
		share('Budi');
		lockPerson(db, row('Budi').person_id!, { source: 'staff', reason: 'asked' });
		// Citra: maybe and shared (not in the before list). Dewi: declined. Eka: never replied.
		setReply(db, eventId, row('Citra').id, 'maybe');
		share('Citra');
		setReply(db, eventId, row('Dewi').id, 'no');
		// Fajar: checked in with the share box ticked; Rina, Citra and Eka also came.
		checkedIn('Fajar');
		share('Fajar');
		checkedIn('Rina');
		checkedIn('Citra');
		checkedIn('Eka');
		return { db, eventId };
	};

	it('names only those who agreed to share, and counts the rest per company (before)', () => {
		const { db, eventId } = setup();
		expect(partnerRows(listEventPeople(db, eventId), 'before')).toEqual({
			// Rina said yes and stays on the list after she walked in.
			named: [{ name: 'Rina', company: 'Batavia', job_title: 'Rina title' }],
			// Andi did not tick the box; Budi did, but a locked person is never named (D13).
			counts: [{ company: 'Batavia', count: 2 }]
		});
	});

	it('switches to who checked in (after)', () => {
		const { db, eventId } = setup();
		expect(partnerRows(listEventPeople(db, eventId), 'after')).toEqual({
			named: [
				{ name: 'Rina', company: 'Batavia', job_title: 'Rina title' },
				{ name: 'Fajar', company: 'Kopi', job_title: 'Fajar title' },
				{ name: 'Citra', company: 'Selat', job_title: 'Citra title' }
			],
			counts: [{ company: 'Selat', count: 1 }]
		});
	});

	it('writes two sections, no channels, and logs the variant with counts only', () => {
		const { db, eventId } = setup();
		const { csv, named, counted } = partnerExport(db, eventId, 'before', { by: 'Dewi' }, 9_000);
		expect({ named, counted }).toEqual({ named: 1, counted: 2 });
		expect(csv).toBe(
			'\uFEFFName,Company,Title\r\nRina,Batavia,Rina title\r\n\r\nCompany,Count\r\nBatavia,2\r\n'
		);
		expect(csv).not.toContain('@x.id');
		expect(csv).not.toContain('Budi');
		const [log] = listActivity(db, eventId);
		expect(log).toMatchObject({ kind: 'export', who: 'Dewi', at: 9_000, row_count: 3 });
		expect(JSON.parse(log.what)).toEqual({
			export: 'partners',
			variant: 'before',
			named: 1,
			counted: 2
		});
		expect(log.what).not.toContain('Rina');
	});
});
