import { countContacts } from '$lib/server/contacts';
import { db } from '$lib/server/db';
import { listEvents } from '$lib/server/events';
import { countDue } from '$lib/server/next-action';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const now = Date.now();
	// "Due today" counts what the rules stored (D20); the daily pass keeps it fresh.
	const events = listEvents(db).map((e) => ({ ...e, due: countDue(db, e, now) }));
	return {
		events,
		contacts: countContacts(db),
		checkins: events.reduce((sum, e) => sum + e.checkins, 0),
		now
	};
};
