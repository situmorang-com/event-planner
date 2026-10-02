import { fail } from '@sveltejs/kit';
import { countContacts, deleteContact, listContacts } from '$lib/server/contacts';
import { db } from '$lib/server/db';
import { keptUntil, mergeInto } from '$lib/server/people';
import { cleanText } from '$lib/server/normalize';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const prospects = url.searchParams.get('prospects') === '1';
	return {
		q,
		prospects,
		contacts: listContacts(db, q, 1000, prospects).map((c) => ({
			...c,
			kept_until: keptUntil(c, { attendee: c.events_attended > 0, replied: !!c.replied })
		})),
		total: countContacts(db),
		prospectTotal: countContacts(db, true),
		now: Date.now()
	};
};

export const actions: Actions = {
	// Right-to-erasure requests: removes the person, every check-in and every event row.
	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (id) deleteContact(db, id, locals.who);
		return { deleted: true };
	},

	// Two records that turned out to be one person: the loser folds into the chosen survivor.
	merge: async ({ request, locals }) => {
		const form = await request.formData();
		const loser = cleanText(form.get('id'), 40);
		const survivor = cleanText(form.get('survivor'), 40);
		if (!loser || !survivor) return fail(400, { mergeError: 'Pick who to keep.' });
		if (!mergeInto(db, loser, survivor, { by: locals.who }))
			return fail(409, { mergeError: 'Those two can’t be merged.' });
		return { merged: loser };
	}
};
