import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DB } from './database';
import { addShortlisted, addTouch, listEventPeople } from './event-people';
import { createEvent } from './events';
import { setLinkedinStatus } from './linkedin';
import { cleanConnections, connectedOnDate, parseConnections } from '../linkedin-export';
import { justAccepted, lastLinkedinSync, syncConnections } from './linkedin-sync';
import { getPerson } from './people';

const NOW = Date.UTC(2026, 9, 16, 3);
const EXPORT = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Rina,Wijaya,https://www.linkedin.com/in/rina-wijaya,,"Batavia Foods, Tbk",Head of Data,15 Oct 2026
Budi,Santoso,,,Nusantara Bank,CIO,14 Oct 2026
Old,Friend,https://www.linkedin.com/in/old-friend,,Elsewhere,CEO,02 Jan 2019
`;

describe('LinkedIn sync from the Connections export (D28)', () => {
	let db: DB;
	let eventId: string;
	const person = (name: string) =>
		getPerson(db, listEventPeople(db, eventId).find((r) => r.name === name)!.person_id!)!;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Fabric',
			venue: '',
			startsAt: Date.UTC(2026, 9, 20, 2),
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		const row = (name: string, linkedin: string | null) => ({
			name,
			company: 'Batavia Foods',
			jobTitle: '',
			email: null,
			phone: null,
			linkedin
		});
		addShortlisted(
			db,
			eventId,
			[
				row('Rina Wijaya', 'https://id.linkedin.com/in/Rina-Wijaya/?utm=x'),
				row('Budi Santoso', null),
				row('Citra Lestari', 'https://www.linkedin.com/in/citra')
			],
			{ source: 'typed' }
		);
		for (const name of ['Rina Wijaya', 'Budi Santoso', 'Citra Lestari'])
			setLinkedinStatus(db, person(name).id, 'requested', { by: 'Edmund' }, NOW - 5 * 86_400_000);
	});

	it('reads the export past its notes, with quoted commas and both date styles', () => {
		const rows = parseConnections(EXPORT)!;
		expect(rows).toHaveLength(3);
		expect(rows[0]).toEqual({
			name: 'Rina Wijaya',
			linkedin: 'https://www.linkedin.com/in/rina-wijaya',
			company: 'Batavia Foods, Tbk',
			connectedOn: Date.UTC(2026, 9, 15)
		});
		expect(rows[1].linkedin).toBeNull();
		expect(connectedOnDate('10/15/26')).toBe(Date.UTC(2026, 9, 15));
		expect(parseConnections('Name,Email\nRina,r@x.id')).toBeNull();
		// What the browser sends is checked again.
		expect(
			cleanConnections([rows[0], { name: '' }, 'x', { name: 'A', linkedin: 'evil.com/in/a' }])
		).toEqual([rows[0], { name: 'A', linkedin: null, company: '', connectedOn: null }]);
	});

	it('marks the accepted requests Connected, by link or by a unique waiting name', () => {
		const result = syncConnections(db, parseConnections(EXPORT)!, 'Edmund', NOW);
		expect(result.total).toBe(3);
		expect(result.connected.map((p) => p.name).sort()).toEqual(['Budi Santoso', 'Rina Wijaya']);
		expect(person('Rina Wijaya')).toMatchObject({
			linkedin_status: 'connected',
			linkedin_status_at: Date.UTC(2026, 9, 15)
		});
		// Matched by name, Budi gets the link LinkedIn has; Citra hasn't accepted yet.
		expect(person('Budi Santoso').linkedin_status).toBe('connected');
		expect(person('Citra Lestari').linkedin_status).toBe('requested');
		expect(lastLinkedinSync(db)).toBe(NOW);

		const again = syncConnections(db, parseConnections(EXPORT)!, 'Edmund', NOW + 1);
		expect(again.connected).toHaveLength(0);
		expect(again.already).toBe(2);
	});

	it('lists who accepted and has not been messaged since, newest first', () => {
		syncConnections(db, parseConnections(EXPORT)!, 'Edmund', NOW);
		const list = justAccepted(db, null, NOW);
		expect(list.map((a) => a.row.name)).toEqual(['Rina Wijaya', 'Budi Santoso']);
		expect(list[0].event.name).toBe('Fabric');

		const rina = listEventPeople(db, eventId).find((r) => r.name === 'Rina Wijaya')!;
		addTouch(db, eventId, rina.id, { kind: 'invitation', via: 'linkedin', by: 'Edmund' }, NOW);
		expect(justAccepted(db, null, NOW + 1).map((a) => a.row.name)).toEqual(['Budi Santoso']);
		// A fortnight on, nobody is "just" accepted any more.
		expect(justAccepted(db, null, NOW + 20 * 86_400_000)).toEqual([]);
	});
});
