import { fail, redirect } from '@sveltejs/kit';
import { DEFAULT_PHONE_COUNTRY } from '$lib/server/config';
import { db } from '$lib/server/db';
import { emptyEventForm, parseEventForm } from '$lib/server/event-form';
import { createEvent } from '$lib/server/events';
import { isCountry, phoneCountryDefault } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	values: emptyEventForm(
		phoneCountryDefault(db, isCountry(DEFAULT_PHONE_COUNTRY) ? DEFAULT_PHONE_COUNTRY : 'ID')
	)
});

export const actions: Actions = {
	default: async ({ request }) => {
		const parsed = parseEventForm(await request.formData());
		if (!parsed.input) return fail(400, { errors: parsed.errors, values: parsed.values });
		const id = createEvent(db, parsed.input);
		redirect(303, `/admin/events/${id}?created=1`);
	}
};
