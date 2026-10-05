import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, migrate, SCHEMA_VERSION, type DB } from './database';
import { addFound, addShortlisted, listEventPeople, shortlistFound } from './event-people';
import { createEvent } from './events';
import { linkedinRank, setLinkedinStatus } from './linkedin';
import { createPerson, getPerson, mergeInto } from './people';
import { peopleView } from './people-page';
import { schemaVersion, setSchemaVersion } from './settings';

const START = Date.UTC(2026, 10, 1, 2);
const PROFILE = 'https://www.linkedin.com/in/rina-wijaya';

describe('LinkedIn connection status (D26)', () => {
	let db: DB;
	let eventId: string;
	let personId: string;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: START,
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
					jobTitle: 'Head of Data',
					email: null,
					phone: null,
					linkedin: PROFILE
				}
			],
			{ source: 'typed' }
		);
		personId = listEventPeople(db, eventId)[0].person_id!;
	});

	const status = () => getPerson(db, personId)!;

	it('starts as not connected and moves through request sent to connected', () => {
		expect(status().linkedin_status).toBeNull();
		expect(setLinkedinStatus(db, personId, 'requested', { by: 'Edmund' }, 1_000)).toBe(true);
		expect(status()).toMatchObject({
			linkedin_status: 'requested',
			linkedin_status_at: 1_000,
			linkedin_status_by: 'Edmund'
		});
		expect(setLinkedinStatus(db, personId, 'connected', { by: 'Sari' }, 2_000)).toBe(true);
		expect(status()).toMatchObject({
			linkedin_status: 'connected',
			linkedin_status_at: 2_000,
			linkedin_status_by: 'Sari'
		});
		// Setting what is already there changes nothing, not even the date.
		expect(setLinkedinStatus(db, personId, 'connected', { by: 'Edmund' }, 3_000)).toBe(false);
		expect(status().linkedin_status_at).toBe(2_000);
	});

	it('clears the date and who when set back to not connected', () => {
		setLinkedinStatus(db, personId, 'requested', { by: 'Edmund' }, 1_000);
		expect(setLinkedinStatus(db, personId, 'none', { by: 'Edmund' }, 2_000)).toBe(true);
		expect(status()).toMatchObject({
			linkedin_status: null,
			linkedin_status_at: null,
			linkedin_status_by: ''
		});
	});

	it('records a request when the profile is opened, but never undoes one or a connection', () => {
		const opened = (now: number) =>
			setLinkedinStatus(db, personId, 'requested', { by: 'Edmund', ifNone: true }, now);
		expect(opened(1_000)).toBe(true);
		expect(status()).toMatchObject({ linkedin_status: 'requested', linkedin_status_at: 1_000 });
		// Opening it again keeps the first date: the request went out then.
		expect(opened(2_000)).toBe(false);
		expect(status().linkedin_status_at).toBe(1_000);
		setLinkedinStatus(db, personId, 'connected', {}, 3_000);
		expect(opened(4_000)).toBe(false);
		expect(status().linkedin_status).toBe('connected');
	});

	it('shows on the People page row, and as not connected while someone is only found', () => {
		addFound(
			db,
			eventId,
			[
				{
					name: 'Andi Saputra',
					company: 'Batavia Foods',
					jobTitle: 'BI Manager',
					email: null,
					phone: null,
					linkedin: 'https://www.linkedin.com/in/andi-saputra'
				}
			],
			{ source: 'research' }
		);
		setLinkedinStatus(db, personId, 'requested', { by: 'Edmund' }, 1_000);
		const event = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId) as never;
		const rows = peopleView(db, event, null, START - 86_400_000).rows;
		const rina = rows.find((r) => r.name === 'Rina Wijaya')!;
		const andi = rows.find((r) => r.name === 'Andi Saputra')!;
		expect(rina).toMatchObject({
			linkedin_status: 'requested',
			linkedin_status_at: 1_000,
			linkedin_status_by: 'Edmund'
		});
		expect(andi).toMatchObject({ stage: 'found', linkedin_status: 'none' });

		// Once added, the found row is a person, and the status is theirs from then on.
		shortlistFound(db, eventId, andi.id);
		const added = listEventPeople(db, eventId).find((r) => r.name === 'Andi Saputra')!;
		expect(added.person_id).not.toBeNull();
		expect(added.linkedin_status).toBeNull();
	});

	it('keeps the further status when two records of one person are merged', () => {
		const other = createPerson(
			db,
			{ name: 'Rina W.', company: 'Batavia Foods', linkedin: PROFILE },
			{ origin: 'typed' },
			500
		);
		setLinkedinStatus(db, other, 'connected', { by: 'Sari' }, 900);
		setLinkedinStatus(db, personId, 'requested', { by: 'Edmund' }, 1_000);
		mergeInto(db, other, personId, { by: 'Edmund' });
		expect(status()).toMatchObject({
			linkedin_status: 'connected',
			linkedin_status_at: 900,
			linkedin_status_by: 'Sari'
		});

		// The other way round, a request does not overwrite the survivor's connection.
		const third = createPerson(
			db,
			{ name: 'Rina Wijaya', company: 'Batavia Foods' },
			{ origin: 'typed' },
			500
		);
		setLinkedinStatus(db, third, 'requested', { by: 'Edmund' }, 5_000);
		mergeInto(db, third, personId, { by: 'Edmund' });
		expect(status()).toMatchObject({ linkedin_status: 'connected', linkedin_status_at: 900 });
	});

	it('ranks the statuses for merging', () => {
		expect(linkedinRank(null)).toBe(0);
		expect(linkedinRank('requested')).toBeGreaterThan(linkedinRank(null));
		expect(linkedinRank('connected')).toBeGreaterThan(linkedinRank('requested'));
	});

	it('adds the columns to a file from before version 6, once', () => {
		db.exec(`ALTER TABLE people DROP COLUMN linkedin_status_by`);
		db.exec(`ALTER TABLE people DROP COLUMN linkedin_status_at`);
		db.exec(`ALTER TABLE people DROP COLUMN linkedin_status`);
		setSchemaVersion(db, 5);
		migrate(db);
		expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
		expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(6);
		const columns = (db.prepare(`PRAGMA table_info(people)`).all() as { name: string }[]).map(
			(c) => c.name
		);
		expect(columns).toEqual(
			expect.arrayContaining(['linkedin_status', 'linkedin_status_at', 'linkedin_status_by'])
		);
		// Existing people come through as not connected, and the check still holds.
		expect(status().linkedin_status).toBeNull();
		expect(() =>
			db.prepare(`UPDATE people SET linkedin_status = 'maybe' WHERE id = ?`).run(personId)
		).toThrow(/CHECK/);
		migrate(db);
		expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
	});
});
