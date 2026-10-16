import { fail } from '@sveltejs/kit';
import { cleanConnections } from '$lib/linkedin-export';
import { countContacts } from '$lib/server/contacts';
import { db } from '$lib/server/db';
import { listEvents } from '$lib/server/events';
import { justAccepted, lastLinkedinSync, syncConnections } from '$lib/server/linkedin-sync';
import { messagingEnv } from '$lib/server/messaging-env';
import { countDue } from '$lib/server/next-action';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const now = Date.now();
	// "Due today" counts what the rules stored (D20); the daily pass keeps it fresh.
	const events = listEvents(db).map((e) => ({ ...e, due: countDue(db, e, now) }));
	return {
		events,
		contacts: countContacts(db),
		checkins: events.reduce((sum, e) => sum + e.checkins, 0),
		// Accepted on LinkedIn and not messaged since (D28), with each one's draft ready.
		accepted: justAccepted(db, messagingEnv(url), now),
		linkedinSyncedAt: lastLinkedinSync(db),
		now
	};
};

export const actions: Actions = {
	// One chunk of the Connections export, read in the browser (D28).
	linkedinSync: async ({ request, locals }) => {
		const form = await request.formData();
		let json: unknown;
		try {
			json = JSON.parse(String(form.get('connections') ?? ''));
		} catch {
			return fail(400, { syncError: true });
		}
		const result = syncConnections(db, cleanConnections(json), locals.who);
		return { synced: result };
	}
};
