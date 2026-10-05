import { describe, expect, it } from 'vitest';
import { isNew, newSince, NEW_DAYS, seenCookie } from '../recent';
import { DAY } from '../time';
import { createDb } from './database';
import { createPerson, listPeople, newSummary } from './people';

describe('what counts as new', () => {
	const now = Date.UTC(2026, 9, 5);

	it('is anything added since the page was last open, or in the last week the first time', () => {
		const lastVisit = now - 2 * DAY;
		expect(newSince(now, String(lastVisit))).toBe(lastVisit);
		expect(newSince(now, null)).toBe(now - NEW_DAYS * DAY);
		// A cookie that isn't a sensible time is ignored.
		expect(newSince(now, 'garbage')).toBe(now - NEW_DAYS * DAY);
		expect(newSince(now, String(now + DAY))).toBe(now - NEW_DAYS * DAY);
		const since = newSince(now, String(lastVisit));
		expect(isNew(now - DAY, since)).toBe(true);
		expect(isNew(lastVisit, since)).toBe(true);
		expect(isNew(lastVisit - 1, since)).toBe(false);
		expect(isNew(null, since)).toBe(false);
	});

	it('names one cookie per page', () => {
		expect(seenCookie('contacts')).toBe('ep_seen_contacts');
		expect(seenCookie('planning-2x44p2xw')).toBe('ep_seen_planning-2x44p2xw');
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
