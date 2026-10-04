import { error, fail } from '@sveltejs/kit';
import { ORG_NAME, PRIVACY_URL } from '$lib/server/config';
import { db } from '$lib/server/db';
import { hasEnded } from '$lib/server/event-people';
import { getEvent } from '$lib/server/events';
import { countryResolver, formatWhen, languageFor } from '$lib/server/messaging';
import { allow } from '$lib/server/rate-limit';
import type { RegistrationPageData } from '$lib/registration-page';
import { registerGeneric } from '$lib/server/registration';
import { contactShown, readRegistrationForm } from '$lib/server/registration-form';
import type { Actions, PageServerLoad } from './$types';

/*
 * The generic registration link (§4.6): no prefill, no RSVP field, registering is the yes.
 * Anyone with the link can register, so the row it creates waits for the company owner
 * (`needs_review`). Expires with the event like the personal links.
 */

function requireEvent(id: string) {
	const event = getEvent(db, id);
	// An event without a date has no expiry, so it issues no links (D17).
	if (!event || event.starts_at === null) error(404, 'Event not found');
	return event;
}

export const load: PageServerLoad = ({ params }): RegistrationPageData => {
	const event = requireEvent(params.eventId);
	const language = languageFor(event);
	return {
		state: hasEnded(event) ? 'expired' : 'form',
		mode: 'generic',
		language,
		token: null,
		org: { name: ORG_NAME, privacyUrl: PRIVACY_URL },
		event: {
			name: event.name,
			venue: event.venue,
			when: formatWhen(event.starts_at!, event.timezone, language),
			coHosts: event.co_hosts
		},
		prefill: null
	};
};

export const actions: Actions = {
	submit: async ({ params, request, getClientAddress }) => {
		const event = requireEvent(params.eventId);
		if (hasEnded(event)) error(410, 'This link has expired');
		if (!allow(`register:${getClientAddress()}`, 30, 60_000))
			return fail(429, { reason: 'busy' as const });
		const language = languageFor(event);
		const form = await request.formData();
		// The company typed decides the number's country when it is known (D14), else the event.
		const company = String(form.get('company') ?? '');
		const read = readRegistrationForm(form, {
			country: countryResolver(db, event)(company),
			language,
			needsName: true
		});
		if (Object.keys(read.errors).length)
			return fail(400, { reason: 'invalid' as const, errors: read.errors, values: read.values });

		const result = registerGeneric(db, event, {
			name: read.values.name,
			company: read.values.company,
			jobTitle: read.values.jobTitle,
			email: read.email,
			phone: read.phone,
			note: read.note,
			consentFuture: read.consentFuture,
			consentShare: read.consentShare
		});
		if (result.status === 'refused')
			return fail(409, { reason: 'refused' as const, values: read.values });
		return {
			done: {
				kind: 'yes' as const,
				name: read.values.name,
				contact: contactShown(read.phone, read.email)
			}
		};
	}
};
