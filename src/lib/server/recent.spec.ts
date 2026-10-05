import { describe, expect, it } from 'vitest';
import { isNew, newSince, NEW_DAYS } from '../recent';
import { DAY } from '../time';
import { createDb } from './database';
import { createPerson, listPeople, newSummary } from './people';

describe('what counts as new', () => {
	const now = Date.UTC(2026, 9, 5);

	it('is anything added in the last week', () => {
		expect(NEW_DAYS).toBe(7);
		expect(isNew(now - DAY, now)).toBe(true);
		expect(isNew(now - 7 * DAY, now)).toBe(true);
		expect(isNew(now - 7 * DAY - 1, now)).toBe(false);
		expect(isNew(null, now)).toBe(false);
	});

	it('summarises and lists the newcomers, prospects included', () => {
		const db = createDb(':memory:');
		const old = createPerson(
			db,
			{ name: 'Old Timer', company: 'Batavia Foods' },
			{ origin: 'checkin' },
			now - 30 * DAY
		);
		const found = createPerson(
			db,
			{ name: 'Rina Wijaya', company: 'Selat Energy' },
			{ origin: 'research' },
			now - DAY
		);
		const typed = createPerson(
			db,
			{ name: 'Andi Putra', company: 'Selat Energy' },
			{ origin: 'typed' },
			now - 2 * DAY
		);
		const summary = newSummary(db, newSince(now));
		expect(summary).toMatchObject({ people: 2, prospects: 2, companies: 1 });
		expect(summary.byOrigin.map((o) => o.origin).sort()).toEqual(['research', 'typed']);

		// The default list holds attendees and repliers; "new" holds everyone added this week.
		const fresh = listPeople(db, { createdSince: newSince(now) }).map((p) => p.id);
		expect(fresh).toEqual([found, typed]);
		expect(fresh).not.toContain(old);
	});
});
