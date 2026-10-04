import { error, fail, redirect } from '@sveltejs/kit';
import { ORG_NAME, PRIVACY_URL } from '$lib/server/config';
import { db, secret } from '$lib/server/db';
import { rowLanguage } from '$lib/server/messaging';
import { allow } from '$lib/server/rate-limit';
import type { RegistrationPageData } from '$lib/registration-page';
import { canReconfirm, lookupRegistration, reconfirm } from '$lib/server/registration';
import { registrationPageEvent } from '$lib/server/registration-form';
import type { Actions, PageServerLoad } from './$types';

/*
 * The one-tap reconfirm page behind a reminder (§4.6). The tap is a POST: WhatsApp and mail
 * clients fetch links for previews, and a GET that confirmed would count every preview. Only
 * a row that already said yes can be reconfirmed (§5.3); anyone else is sent to the full form,
 * where the answer and the consent box are explicit.
 */

export const load: PageServerLoad = ({ params }): RegistrationPageData => {
	const found = lookupRegistration(db, secret, params.token);
	if (found.status === 'invalid') error(404, 'Link not found');
	if (found.status === 'ok' && !canReconfirm(found.row)) redirect(303, `/r/${params.token}`);
	const { row, event } = found;
	const language = rowLanguage(row, event);
	return {
		state: found.status === 'ok' ? 'form' : 'expired',
		mode: 'reconfirm',
		language,
		token: params.token,
		org: { name: ORG_NAME, privacyUrl: PRIVACY_URL },
		event: registrationPageEvent(event, language),
		prefill: found.status === 'ok' ? { name: row.name, company: row.company } : null
	};
};

export const actions: Actions = {
	reconfirm: async ({ params, getClientAddress }) => {
		const found = lookupRegistration(db, secret, params.token);
		if (found.status === 'invalid') error(404, 'Link not found');
		if (found.status === 'expired') error(410, 'This link has expired');
		if (!allow(`register:${getClientAddress()}`, 30, 60_000))
			return fail(429, { reason: 'busy' as const });
		if (!reconfirm(db, found.row)) redirect(303, `/r/${params.token}`);
		return { done: { kind: 'reconfirm' as const, name: found.row.name, contact: null } };
	}
};
