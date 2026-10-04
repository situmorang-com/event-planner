import { error, fail } from '@sveltejs/kit';
import { ORG_NAME, PRIVACY_URL } from '$lib/server/config';
import { db, secret } from '$lib/server/db';
import { formatWhen, languageFor, rowLanguage } from '$lib/server/messaging';
import { allow } from '$lib/server/rate-limit';
import type { RegistrationPageData } from '$lib/registration-page';
import { lookupRegistration, reconfirm } from '$lib/server/registration';
import type { Actions, PageServerLoad } from './$types';

/*
 * The one-tap reconfirm page behind a reminder (§4.6). The tap is a POST: WhatsApp and mail
 * clients fetch links for previews, and a GET that confirmed would count every preview.
 */

export const load: PageServerLoad = ({ params }): RegistrationPageData => {
	const found = lookupRegistration(db, secret, params.token);
	if (found.status === 'invalid') error(404, 'Link not found');
	const event = found.event;
	const language = found.status === 'ok' ? rowLanguage(found.row, event) : languageFor(event);
	return {
		state: found.status === 'ok' ? 'form' : 'expired',
		mode: 'reconfirm',
		language,
		token: params.token,
		org: { name: ORG_NAME, privacyUrl: PRIVACY_URL },
		event: {
			name: event.name,
			venue: event.venue,
			when: event.starts_at === null ? null : formatWhen(event.starts_at, event.timezone, language),
			coHosts: event.co_hosts
		},
		prefill: found.status === 'ok' ? { name: found.row.name, company: found.row.company } : null
	};
};

export const actions: Actions = {
	reconfirm: async ({ params, getClientAddress }) => {
		const found = lookupRegistration(db, secret, params.token);
		if (found.status === 'invalid') error(404, 'Link not found');
		if (found.status === 'expired') error(410, 'This link has expired');
		if (!allow(`register:${getClientAddress()}`, 30, 60_000))
			return fail(429, { reason: 'busy' as const });
		reconfirm(db, found.row);
		return { done: { kind: 'reconfirm' as const, name: found.row.name, contact: null } };
	}
};
