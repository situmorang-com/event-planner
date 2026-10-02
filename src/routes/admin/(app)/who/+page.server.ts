import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { setWho } from '$lib/server/who';
import type { Actions, PageServerLoad } from './$types';

function safeNext(value: unknown) {
	const next = String(value ?? '');
	return next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
}

/** There is no page here: the header's picker posts to it from wherever the organizer is. */
export const load: PageServerLoad = () => {
	redirect(303, '/admin/settings');
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		setWho(db, cookies, String(form.get('who') ?? ''), url);
		redirect(303, safeNext(form.get('next')));
	}
};
