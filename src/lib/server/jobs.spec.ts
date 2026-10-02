import { beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from './activity-log';
import { createDb, type DB } from './database';
import { addFound, addShortlisted, listEventPeople, skipRow } from './event-people';
import { createEvent, getEvent } from './events';
import { runEventStart } from './jobs';

const START = Date.UTC(2026, 10, 1, 2);

describe('runEventStart', () => {
	let db: DB;
	let eventId: string;
	const stages = () => listEventPeople(db, eventId).map((r) => [r.name, r.stage, !!r.skipped_at]);

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: START,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		const g = (name: string) => ({
			name,
			company: 'Batavia',
			jobTitle: '',
			email: null,
			phone: null
		});
		addShortlisted(db, eventId, [g('Rina')], { source: 'typed' });
		addFound(db, eventId, [g('Andi'), g('Budi')], { source: 'research' });
		skipRow(db, eventId, listEventPeople(db, eventId).find((r) => r.name === 'Budi')!.id);
	});

	it('deletes unapproved Found rows once the event has started, and only once', () => {
		expect(runEventStart(db, eventId, START - 1)).toBeNull();
		expect(stages()).toHaveLength(3);

		expect(runEventStart(db, eventId, START)).toBe(1);
		expect(stages()).toEqual([
			['Rina', 'shortlisted', false],
			['Budi', 'found', true]
		]);
		expect(getEvent(db, eventId)!.started_job_at).toBe(START);
		expect(listActivity(db, eventId)).toEqual([
			expect.objectContaining({ kind: 'purge', row_count: 1, what: '{"job":"event_start"}' })
		]);

		// Research that lands later is the POST's problem (§5.4); the job never runs again.
		addFound(
			db,
			eventId,
			[{ name: 'Citra', company: 'Batavia', jobTitle: '', email: null, phone: null }],
			{
				source: 'research'
			}
		);
		expect(runEventStart(db, eventId, START + 1)).toBeNull();
		expect(stages()).toHaveLength(3);
	});

	it('waits for a date', () => {
		db.prepare(`UPDATE events SET starts_at = NULL WHERE id = ?`).run(eventId);
		expect(runEventStart(db, eventId, START + 1)).toBeNull();
		expect(stages()).toHaveLength(3);
	});
});
