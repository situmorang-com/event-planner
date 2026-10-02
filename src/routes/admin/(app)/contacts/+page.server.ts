import { countContacts, deleteContact, listContacts } from '$lib/server/contacts';
import { db } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	return { q, contacts: listContacts(db, q), total: countContacts(db), now: Date.now() };
};

export const actions: Actions = {
	// Right-to-erasure requests: removes the person and every check-in they made.
	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (id) deleteContact(db, id, locals.who);
		return { deleted: true };
	}
};
