import { eventEnd } from './event-people.ts';
import { hmac, safeEqual } from './sign.ts';

/*
 * The personal registration link (§7, D7): `r.<eventPersonId>.<hmac12>`. The token carries
 * only the row id; the page reads the name and company at request time, so no personal data
 * ever sits in a URL. It expires with the event's current end, so moving the date re-validates
 * every link already sent.
 */

type TokenEvent = { id: string; starts_at: number | null; ends_at: number | null };

const signature = (secret: string, eventId: string, rowId: number) =>
	hmac(secret, `reg:${eventId}:${rowId}`).slice(0, 12);

export function registrationToken(secret: string, eventId: string, rowId: number): string {
	return `r.${rowId}.${signature(secret, eventId, rowId)}`;
}

/** The row id a token names, before any signature check; null when it isn't shaped like one. */
export function registrationRowId(token: string | null | undefined): number | null {
	const m = /^r\.(\d{1,15})\.[A-Za-z0-9_-]{12}$/.exec(token ?? '');
	if (!m) return null;
	const id = Number(m[1]);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Whether the token was issued for this row on this event and the event hasn't ended. An
 * event without a date never issued a link, so one for it never verifies.
 */
export function verifyRegistrationToken(
	secret: string,
	event: TokenEvent,
	rowId: number,
	token: string | null | undefined,
	now = Date.now()
): boolean {
	if (!token || registrationRowId(token) !== rowId) return false;
	if (event.starts_at === null) return false;
	const end = eventEnd(event);
	if (end === null || now >= end) return false;
	return safeEqual(token, registrationToken(secret, event.id, rowId));
}

/** `{link}` in a message: the row's own registration page. */
export function registrationUrl(
	row: { id: number },
	event: { id: string },
	{ base, secret }: { base: string; secret: string }
): string {
	return `${base.replace(/\/+$/, '')}/r/${registrationToken(secret, event.id, row.id)}`;
}

/** `{link}` in a reminder: the one-tap reconfirm page behind the same token (§4.6). */
export function reconfirmUrl(
	row: { id: number },
	event: { id: string },
	env: { base: string; secret: string }
): string {
	return `${registrationUrl(row, event, env)}/ok`;
}

/** The generic link for an event: no prefill, registering is the yes (§4.6). */
export function genericRegistrationUrl(event: { id: string }, base: string): string {
	return `${base.replace(/\/+$/, '')}/r/e/${event.id}`;
}
