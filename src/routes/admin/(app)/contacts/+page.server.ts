import { fail } from '@sveltejs/kit';
import { countContacts, deleteContact, listContacts } from '$lib/server/contacts';
import { db } from '$lib/server/db';
import { check } from '$lib/server/do-not-contact';
import { recomputePerson } from '$lib/server/next-action';
import { cleanText } from '$lib/server/normalize';
import { mergeInto, newSummary, setPersonCountry } from '$lib/server/people';
import { newSince, seenCookie } from '$lib/recent';
import { personRetention } from '$lib/server/retention';
import { consentBoxesSince, isCountry } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, cookies }) => {
	const q = url.searchParams.get('q') ?? '';
	const now = Date.now();
	// "New": everyone added since this browser last left the page (src/lib/recent.ts),
	// contacts and prospects together.
	const fresh = url.searchParams.get('new') === '1';
	const seen = newSince(now, cookies.get(seenCookie('contacts')));
	const prospects = !fresh && url.searchParams.get('prospects') === '1';
	const since = consentBoxesSince(db);
	return {
		q,
		prospects,
		fresh,
		recent: newSummary(db, seen),
		newSince: seen,
		firstVisit: !cookies.get(seenCookie('contacts')),
		contacts: listContacts(db, q, 1000, prospects, fresh ? seen : null).map((c) => ({
			...c,
			// The rule that holds them and its date (§5.4), and for a locked person where the
			// do-not-contact entry came from (D13).
			kept: personRetention(c, { attendee: c.events_attended > 0, replied: !!c.replied, since }),
			lock_source: c.locked_at ? (check(db, c)?.source ?? null) : null
		})),
		total: countContacts(db),
		prospectTotal: countContacts(db, true),
		now
	};
};

export const actions: Actions = {
	// Right-to-erasure requests: removes the person, every check-in and every event row.
	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (id) deleteContact(db, id, locals.who);
		return { deleted: true };
	},

	// The country drives the consent rules (§2.3); an empty value means "unknown" again. It
	// can open or close a legacy attendee's channels, so their due dates follow.
	country: async ({ request }) => {
		const form = await request.formData();
		const id = cleanText(form.get('id'), 40);
		const country = form.get('country');
		if (id) {
			setPersonCountry(db, id, isCountry(country) ? country : null);
			recomputePerson(db, id);
		}
		return { country: id };
	},

	// Two records that turned out to be one person: the loser folds into the chosen survivor.
	merge: async ({ request, locals }) => {
		const form = await request.formData();
		const loser = cleanText(form.get('id'), 40);
		const survivor = cleanText(form.get('survivor'), 40);
		if (!loser || !survivor) return fail(400, { mergeError: 'Pick who to keep.' });
		if (!mergeInto(db, loser, survivor, { by: locals.who }))
			return fail(409, { mergeError: 'Those two can’t be merged.' });
		// The survivor may have gained a relationship or a lock; their rows follow.
		recomputePerson(db, survivor);
		return { merged: loser };
	}
};
