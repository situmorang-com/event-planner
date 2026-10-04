import { error, fail } from '@sveltejs/kit';
import { ORG_NAME, PRIVACY_URL } from '$lib/server/config';
import { db, secret } from '$lib/server/db';
import type { EventRow } from '$lib/server/events';
import { formatWhen, languageFor, phoneCountryFor, rowLanguage } from '$lib/server/messaging';
import { allow } from '$lib/server/rate-limit';
import { isReply } from '$lib/invitations';
import type { RegistrationPageData } from '$lib/registration-page';
import { lookupRegistration, notMe, removeMe, submitRegistration } from '$lib/server/registration';
import {
	contactShown,
	readRegistrationForm,
	registrationMessage
} from '$lib/server/registration-form';
import type { Actions, PageServerLoad } from './$types';

/*
 * The personal registration link (§4.6, §7). The token names a row; everything else is read
 * at request time, so the page prefills the name and company and never the email or mobile.
 * Every request re-checks the token against the event's current end.
 */

function pageEvent(event: EventRow, language: 'id' | 'en' | 'ms') {
	return {
		name: event.name,
		venue: event.venue,
		when: event.starts_at === null ? null : formatWhen(event.starts_at, event.timezone, language),
		coHosts: event.co_hosts
	};
}

export const load: PageServerLoad = ({ params }): RegistrationPageData => {
	const found = lookupRegistration(db, secret, params.token);
	if (found.status === 'invalid') error(404, 'Link not found');
	const org = { name: ORG_NAME, privacyUrl: PRIVACY_URL };
	if (found.status === 'expired') {
		const language = languageFor(found.event);
		return {
			state: 'expired',
			mode: 'personal',
			language,
			token: params.token,
			org,
			event: pageEvent(found.event, language),
			prefill: null
		};
	}
	const { row, event } = found;
	const language = rowLanguage(row, event);
	return {
		state: 'form',
		mode: 'personal',
		language,
		token: params.token,
		org,
		event: pageEvent(event, language),
		prefill: { name: row.name, company: row.company }
	};
};

/** Resolves the link again for an action, in the page's language; throws for a bad link. */
function resolve(token: string) {
	const found = lookupRegistration(db, secret, token);
	if (found.status === 'invalid') error(404, 'Link not found');
	if (found.status === 'expired') error(410, 'This link has expired');
	return { ...found, language: rowLanguage(found.row, found.event) };
}

const limited = (ip: string) => !allow(`register:${ip}`, 30, 60_000);

export const actions: Actions = {
	submit: async ({ params, request, getClientAddress }) => {
		const { row, event, language } = resolve(params.token);
		if (limited(getClientAddress())) return fail(429, { reason: 'busy' as const });
		const form = await request.formData();
		const read = readRegistrationForm(form, {
			// The row's country (D14): the company's when set, else the event's.
			country: phoneCountryFor(event, { phone_country: row.company_phone_country }),
			language,
			needsName: false
		});
		const rsvp = read.values.rsvp;
		if (!isReply(rsvp) || rsvp === 'pending')
			read.errors.rsvp = registrationMessage(language, 'rsvp', ORG_NAME);
		if (Object.keys(read.errors).length)
			return fail(400, { reason: 'invalid' as const, errors: read.errors, values: read.values });

		const result = submitRegistration(
			db,
			{ row, event },
			{
				rsvp: rsvp as 'yes' | 'maybe' | 'no',
				email: read.email,
				phone: read.phone,
				note: read.note,
				consentFuture: read.consentFuture,
				consentShare: read.consentShare
			}
		);
		if (result.status === 'refused')
			return fail(409, { reason: 'refused' as const, values: read.values });
		return {
			done: {
				kind: rsvp as 'yes' | 'maybe' | 'no',
				name: row.name,
				contact: contactShown(read.phone, read.email)
			}
		};
	},

	notMe: async ({ params, getClientAddress }) => {
		const ctx = resolve(params.token);
		if (limited(getClientAddress())) return fail(429, { reason: 'busy' as const });
		notMe(db, ctx);
		return { done: { kind: 'notMe' as const, name: '', contact: null } };
	},

	removeMe: async ({ params, getClientAddress }) => {
		const ctx = resolve(params.token);
		if (limited(getClientAddress())) return fail(429, { reason: 'busy' as const });
		removeMe(db, ctx.row);
		return { done: { kind: 'removeMe' as const, name: '', contact: null } };
	}
};
