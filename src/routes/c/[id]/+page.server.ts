import { error, fail, type Cookies } from '@sveltejs/kit';
import { publicName, firstName } from '$lib/names';
import { publish } from '$lib/server/bus';
import { checkIn, type Method } from '$lib/server/checkins';
import { ORG_NAME, PRIVACY_URL } from '$lib/server/config';
import { db, secret } from '$lib/server/db';
import { deviceFromUserAgent } from '$lib/server/device';
import { getEvent } from '$lib/server/events';
import { countryResolver } from '$lib/server/messaging';
import { getPerson } from '$lib/server/people';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from '$lib/server/normalize';
import { issuePass, PASS_TTL_MS, verifyPass, verifyQrToken } from '$lib/server/qr-token';
import { allow } from '$lib/server/rate-limit';
import { signValue, unsignValue } from '$lib/server/sign';
import type { Actions, PageServerLoad } from './$types';

/** Remembers the attendee on their own phone so the next event is a one-tap check-in. */
const ME_COOKIE = 'ea_me';
const passCookie = (eventId: string) => `ea_pass_${eventId}`;

function rememberedContact(cookies: Cookies) {
	const id = unsignValue(secret, cookies.get(ME_COOKIE));
	return (id && getPerson(db, id)) || null;
}

// Venue laptops often serve plain http on the LAN, where a Secure cookie (or a Secure delete
// header) is silently dropped, so every cookie follows the request's protocol.
function rememberMe(cookies: Cookies, url: URL, personId: string) {
	cookies.set(ME_COOKIE, signValue(secret, personId), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 400 * 86_400
	});
}

function forgetMe(cookies: Cookies, url: URL) {
	cookies.delete(ME_COOKIE, { path: '/', secure: url.protocol === 'https:' });
}

export const load: PageServerLoad = async ({ params, url, cookies, request, locals }) => {
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');

	const base = {
		event: {
			id: event.id,
			name: event.name,
			venue: event.venue,
			startsAt: event.starts_at,
			timezone: event.timezone,
			coHosts: event.co_hosts
		},
		org: { name: ORG_NAME, privacyUrl: PRIVACY_URL },
		platform: deviceFromUserAgent(request.headers.get('user-agent'))
	};

	if (!event.is_open) return { ...base, state: 'closed' as const };

	// Live-QR events need a fresh code from the entrance screen. A valid scan is exchanged for
	// a 30-minute pass (hidden field + cookie) so a slow typist or a Safari tab reload is fine.
	let pass: string | null = null;
	if (event.qr_mode === 'rotating') {
		const secure = url.protocol === 'https:';
		if (verifyQrToken(secret, event.id, url.searchParams.get('t')) || locals.admin) {
			pass = issuePass(secret, event.id);
			cookies.set(passCookie(event.id), pass, {
				path: `/c/${event.id}`,
				httpOnly: true,
				sameSite: 'lax',
				secure,
				maxAge: PASS_TTL_MS / 1000
			});
		} else {
			const saved = cookies.get(passCookie(event.id));
			if (verifyPass(secret, event.id, saved)) pass = saved!;
			else return { ...base, state: 'expired' as const };
		}
	}

	const me = rememberedContact(cookies);
	const already = me
		? (db
				.prepare(`SELECT id, checked_in_at FROM checkins WHERE event_id = ? AND person_id = ?`)
				.get(event.id, me.id) as { id: number; checked_in_at: number } | undefined)
		: undefined;

	if (me && already) {
		const { n } = db
			.prepare(`SELECT COUNT(*) AS n FROM checkins WHERE event_id = ? AND id <= ?`)
			.get(event.id, already.id) as { n: number };
		return {
			...base,
			state: 'done' as const,
			done: {
				status: 'existing' as const,
				name: me.name,
				company: me.company,
				number: n,
				checkedInAt: already.checked_in_at
			}
		};
	}

	return {
		...base,
		state: 'form' as const,
		pass,
		me: me && {
			name: me.name,
			email: me.email ?? '',
			phone: me.phone ?? '',
			company: me.company,
			jobTitle: me.job_title
		}
	};
};

const METHODS: Method[] = ['form', 'picker', 'returning'];

export const actions: Actions = {
	checkin: async ({ params, request, cookies, url, getClientAddress }) => {
		const event = getEvent(db, params.id);
		if (!event) error(404, 'Event not found');
		if (!event.is_open) return fail(403, { reason: 'closed' as const });

		const form = await request.formData();
		if (
			event.qr_mode === 'rotating' &&
			!verifyPass(secret, event.id, String(form.get('pass') ?? ''))
		)
			return fail(403, { reason: 'expired' as const });

		if (!allow(`checkin:${getClientAddress()}`, 120, 60_000))
			return fail(429, { reason: 'busy' as const });

		const raw = {
			name: String(form.get('name') ?? ''),
			email: String(form.get('email') ?? ''),
			phone: String(form.get('tel') ?? ''),
			company: String(form.get('organization') ?? ''),
			jobTitle: String(form.get('jobTitle') ?? '')
		};
		const company = cleanText(raw.company, 120);
		const input = {
			name: cleanText(raw.name, 100),
			email: normalizeEmail(raw.email),
			// The company's phone country when it has one, else the event's (D14, §4.7).
			phone: normalizePhone(raw.phone, countryResolver(db, event)(company)),
			company,
			jobTitle: cleanText(raw.jobTitle, 120)
		};
		const consent = form.get('consent') === 'on';
		// Boxes 2 and 3 (§4.7): the future-events tick sticks to the person, the co-host tick to
		// this row; neither is required.
		const consentFuture = form.get('consentFuture') === 'on';
		const consentShare = !!event.co_hosts.trim() && form.get('consentShare') === 'on';

		const errors: Partial<Record<'name' | 'email' | 'consent', string>> = {};
		if (!input.name) errors.name = 'Please add your name.';
		if (!input.email) errors.email = 'Please add your email.';
		else if (!isValidEmail(input.email)) errors.email = 'That email doesn’t look quite right.';
		if (!consent) errors.consent = 'Please tick this so we can record your attendance.';
		if (Object.keys(errors).length)
			return fail(400, { reason: 'invalid' as const, errors, values: raw });

		const methodField = String(form.get('method') ?? 'form') as Method;
		const result = checkIn(db, event.id, input, {
			method: METHODS.includes(methodField) ? methodField : 'form',
			device: deviceFromUserAgent(request.headers.get('user-agent')),
			consent,
			consentFuture,
			consentShare
		});

		if (form.get('remember') === 'on') rememberMe(cookies, url, result.personId);
		else forgetMe(cookies, url);

		if (result.status === 'created') {
			publish(event.id, {
				type: 'checkin',
				count: result.number,
				arrival: {
					id: result.checkinId,
					name: publicName(input.name),
					company: input.company,
					at: result.checkedInAt
				}
			});
		}

		return {
			done: {
				status: result.status,
				name: input.name,
				firstName: firstName(input.name),
				company: input.company,
				number: result.number,
				checkedInAt: result.checkedInAt
			}
		};
	},

	forget: async ({ cookies, url }) => {
		forgetMe(cookies, url);
		return { forgotten: true };
	}
};
