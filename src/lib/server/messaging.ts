import { greetingName } from '../invitations.ts';
import { mailtoHref } from '../mailto.ts';
import type { RowMessage } from '../people.ts';
import { formatDate, formatTime } from '../time.ts';
import { findCompany } from './companies.ts';
import type { DB } from './database.ts';
import type { EventPersonRow } from './event-people.ts';
import type { EventRow, Language } from './events.ts';
import { OPT_OUT_LINE, SOURCE_LINE, templateBody, type MessageKind } from './message-templates.ts';
import { contactBlock, type Channel } from './people.ts';
import { reconfirmUrl, registrationUrl } from './registration-token.ts';
import { consentBoxesSince, type Country } from './settings.ts';
import { suggestedTouchKind } from './stages.ts';

/*
 * Messages the organizer sends by hand (D7, D9, §7): the app renders the text for the row's
 * language and opens WhatsApp or mail with it. Resolution: the event's own invitation text
 * (invitations only) → the stored template → the built-in wording. The research source line
 * and the opt-out line are appended here, never stored, so an edit can't drop them.
 */

/** What rendering needs from the deployment; messaging-env.ts builds it from config. */
export interface MessagingEnv {
	/** ORG_NAME: {org}. */
	org: string;
	/** PRIVACY_URL: the research source line links it; empty means research finds can't be messaged. */
	privacyUrl: string;
	/** Where {link} points, e.g. https://checkin.example.com. */
	base: string;
	secret: string;
}

export { registrationUrl };

/* ───────────────────────── Country and language (§2.3, D14) ───────────────────────── */

type CountryCompany = { phone_country: Country | null } | null | undefined;

/** The country local numbers are read in: the company's choice, else the event's. */
export function phoneCountryFor(
	event: Pick<EventRow, 'phone_country'>,
	company?: CountryCompany
): Country {
	return company?.phone_country ?? event.phone_country;
}

/**
 * The language a row is written to in: an explicit choice on the event wins, else the phone
 * country decides (ID → Indonesian, MY → Malay). English is only ever an explicit choice.
 */
export function languageFor(
	event: Pick<EventRow, 'language' | 'phone_country'>,
	company?: CountryCompany
): Language {
	if (event.language) return event.language;
	return phoneCountryFor(event, company) === 'MY' ? 'ms' : 'id';
}

/** Looks a company up by the name typed, for forms that normalise one number at a time. */
export function countryResolver(db: DB, event: Pick<EventRow, 'phone_country'>) {
	return (company: string): Country => phoneCountryFor(event, findCompany(db, company));
}

/* ───────────────────────── Rendering (§7) ───────────────────────── */

/** The row fields rendering reads; EventPersonRow carries them all. */
export type MessageRow = Pick<
	EventPersonRow,
	| 'id'
	| 'name'
	| 'email'
	| 'phone'
	| 'origin'
	| 'source_url'
	| 'company_phone_country'
	| 'blocked_at'
	| 'locked_at'
	| 'd365_suppressed'
	| 'd365_no_email'
	| 'd365_no_phone'
	| 'is_customer'
	| 'consent_future_at'
	| 'person_created_at'
	| 'country'
	| 'stage'
	| 'reply'
	| 'skipped_at'
>;

export type MessageEvent = Pick<
	EventRow,
	| 'id'
	| 'name'
	| 'venue'
	| 'starts_at'
	| 'ends_at'
	| 'timezone'
	| 'phone_country'
	| 'language'
	| 'invitation_text'
>;

export interface MessageContext {
	row: MessageRow;
	event: MessageEvent;
	/** `consent_boxes_since`, when the caller already read it for a whole page of rows. */
	since?: number | null;
}

const LOCALE: Record<Language, string> = { id: 'id-ID', en: 'en-GB', ms: 'ms-MY' };

/** "{date}": day and time in the event's zone, in the reader's language. */
export function formatWhen(ts: number, timeZone: string, language: Language): string {
	if (language === 'en') return `${formatDate(ts, timeZone)} at ${formatTime(ts, timeZone)}`;
	return new Intl.DateTimeFormat(LOCALE[language], {
		timeZone,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	})
		.format(ts)
		.replace(/[  ]/g, ' ');
}

/**
 * After the placeholders are filled, an empty one leaves "on {date}, ." or "here: " behind;
 * the stray comma, colon and spaces go so the sentence still reads.
 */
export function tidy(text: string): string {
	return text
		.replace(/[ \t]+([,.;:!?])/g, '$1')
		.replace(/[,;:](?=[,.;:!?])/g, '')
		.replace(/[,;:]\s*$/, '.')
		.replace(/ {2,}/g, ' ')
		.trim();
}

export function fillPlaceholders(body: string, values: Record<string, string>): string {
	return tidy(body.replace(/\{(name|event|date|venue|link|org)\}/g, (_, key) => values[key] ?? ''));
}

export const rowLanguage = (row: Pick<MessageRow, 'company_phone_country'>, event: MessageEvent) =>
	languageFor(event, { phone_country: row.company_phone_country });

/** Why a message can't be rendered for this row, or null. */
export function renderBlock(
	row: Pick<MessageRow, 'origin'>,
	env: Pick<MessagingEnv, 'privacyUrl'>
) {
	// D10: a research find must be told where their details came from and how data is handled.
	if (row.origin === 'research' && !env.privacyUrl) return 'no privacy url' as const;
	return null;
}

/**
 * The full text for one kind: the body for the row's language, then (research finds) the
 * source line, then, last, the opt-out line. Null when the row can't be messaged (§6.2).
 */
export function renderMessage(
	db: DB,
	kind: MessageKind,
	{ row, event }: MessageContext,
	env: MessagingEnv
): string | null {
	if (renderBlock(row, env)) return null;
	const language = rowLanguage(row, event);
	const body =
		(kind === 'invitation' && event.invitation_text?.trim()) || templateBody(db, kind, language);
	const text = fillPlaceholders(body, {
		name: greetingName(row.name) || '',
		event: event.name,
		date: event.starts_at === null ? '' : formatWhen(event.starts_at, event.timezone, language),
		venue: event.venue,
		// A reminder links the one-tap reconfirm page; everything else the full form (§4.6).
		link:
			event.starts_at === null
				? ''
				: kind === 'reminder'
					? reconfirmUrl(row, event, env)
					: registrationUrl(row, event, env),
		org: env.org
	});
	const parts = [text];
	if (row.origin === 'research') {
		const s = SOURCE_LINE[language];
		const found = row.source_url ? s.withUrl.replace('{source_url}', row.source_url) : s.found;
		parts.push(`${found}. ${s.privacy.replace('{privacy_url}', env.privacyUrl)}`);
	}
	parts.push(OPT_OUT_LINE[language]);
	return parts.join('\n\n');
}

/* ───────────────────────── Links ───────────────────────── */

/** The person behind a row, as contactBlock() reads them; null while found. */
export function contactPerson(row: MessageRow) {
	if (row.origin === null) return null;
	return {
		locked_at: row.locked_at,
		d365_suppressed: row.d365_suppressed ?? 0,
		d365_no_email: row.d365_no_email ?? 0,
		d365_no_phone: row.d365_no_phone ?? 0,
		is_customer: row.is_customer ?? 0,
		origin: row.origin,
		consent_future_at: row.consent_future_at,
		created_at: row.person_created_at ?? 0,
		country: row.country,
		phone: row.phone
	};
}

export function whatsappHref(phone: string, text: string): string {
	return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function emailHref(email: string, subject: string, text: string): string {
	return `${mailtoHref(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

/**
 * What a row's buttons open (§7): the message for the kind the rules suggest (or the one
 * asked for), on each channel open to the person. Null for a Found row (there is no person
 * yet) and for a skipped one: "not me" took the person out of the chase (§4.6).
 */
export function rowMessage(
	db: DB,
	ctx: MessageContext,
	env: MessagingEnv,
	kind: MessageKind = suggestedTouchKind(ctx.row)
): RowMessage | null {
	const { row, event } = ctx;
	const person = contactPerson(row);
	if (!person || row.stage === 'found' || row.skipped_at) return null;
	const since = ctx.since === undefined ? consentBoxesSince(db) : ctx.since;
	const open = (channel: Channel) =>
		!row.blocked_at && contactBlock(person, channel, since) === null;
	const text = renderMessage(db, kind, ctx, env);
	const international = !!row.phone?.startsWith('+');
	return {
		kind,
		text,
		whatsapp:
			text !== null && row.phone && international && open('whatsapp')
				? whatsappHref(row.phone, text)
				: null,
		email:
			text !== null && row.email && open('email') ? emailHref(row.email, event.name, text) : null,
		hint:
			renderBlock(row, env) === 'no privacy url'
				? 'Set PRIVACY_URL to message people found by research.'
				: null
	};
}

export interface MessageLink {
	via: 'whatsapp' | 'email';
	href: string;
}

/**
 * One link to open: WhatsApp when the mobile is international, else email; null when
 * contactable() says no, nothing usable is stored, or the message can't be rendered.
 */
export function messageLink(
	db: DB,
	kind: MessageKind,
	ctx: MessageContext,
	env: MessagingEnv
): MessageLink | null {
	const m = rowMessage(db, ctx, env, kind);
	if (m?.whatsapp) return { via: 'whatsapp', href: m.whatsapp };
	if (m?.email) return { via: 'email', href: m.email };
	return null;
}
