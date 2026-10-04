import { fromLocalInput, isValidTimeZone } from '$lib/time';
import { DEFAULT_PHONE_COUNTRY, DEFAULT_TIMEZONE } from './config';
import type { EventInput } from './events';
import { isLanguage } from './message-templates';
import { cleanText } from './normalize';
import { isCountry, type Country } from './settings';

export type EventFormValues = {
	name: string;
	venue: string;
	startsAt: string;
	/** Empty for six hours after the start (§2.2). */
	endsAt: string;
	timezone: string;
	qrMode: string;
	/** Empty for no target (D8). */
	targetCount: string;
	phoneCountry: string;
	/** Empty to follow the phone country (D14, D21). */
	language: string;
	/** Who the third consent box names (D15); empty hides the box. */
	coHosts: string;
};

/** What a new event's form starts with: the app's phone country, everything else blank. */
export function emptyEventForm(phoneCountry: Country): EventFormValues {
	return {
		name: '',
		venue: '',
		startsAt: '',
		endsAt: '',
		timezone: '',
		qrMode: 'rotating',
		targetCount: '',
		phoneCountry,
		language: '',
		coHosts: ''
	};
}

export function parseEventForm(form: FormData) {
	const values: EventFormValues = {
		name: String(form.get('name') ?? ''),
		venue: String(form.get('venue') ?? ''),
		startsAt: String(form.get('startsAt') ?? ''),
		endsAt: String(form.get('endsAt') ?? ''),
		timezone: String(form.get('timezone') ?? ''),
		qrMode: String(form.get('qrMode') ?? 'rotating'),
		targetCount: String(form.get('targetCount') ?? '').trim(),
		phoneCountry: String(form.get('phoneCountry') ?? '').toUpperCase(),
		language: String(form.get('language') ?? '').toLowerCase(),
		coHosts: String(form.get('coHosts') ?? '')
	};

	const timezone =
		isValidTimeZone(values.timezone) && values.timezone ? values.timezone : DEFAULT_TIMEZONE;
	const startsAt = values.startsAt ? fromLocalInput(values.startsAt, timezone) : null;
	const endsAt = values.endsAt ? fromLocalInput(values.endsAt, timezone) : null;
	const targetCount = values.targetCount ? Number(values.targetCount) : null;
	const errors: Partial<Record<keyof EventFormValues, string>> = {};

	const name = cleanText(values.name, 120);
	if (!name) errors.name = 'Give the event a name.';
	if (values.startsAt && startsAt === null) errors.startsAt = 'That date doesn’t look right.';
	if (values.endsAt && endsAt === null) errors.endsAt = 'That date doesn’t look right.';
	else if (endsAt !== null && startsAt === null) errors.endsAt = 'Set the start first.';
	else if (endsAt !== null && startsAt !== null && endsAt <= startsAt)
		errors.endsAt = 'The end comes before the start.';
	if (targetCount !== null && !(Number.isSafeInteger(targetCount) && targetCount >= 0))
		errors.targetCount = 'The target is a whole number of people.';

	const input: EventInput = {
		name,
		venue: cleanText(values.venue, 160),
		startsAt,
		endsAt,
		timezone,
		qrMode: values.qrMode === 'static' ? 'static' : 'rotating',
		targetCount: targetCount || null,
		phoneCountry: isCountry(values.phoneCountry)
			? values.phoneCountry
			: isCountry(DEFAULT_PHONE_COUNTRY)
				? DEFAULT_PHONE_COUNTRY
				: 'ID',
		// '' is "from the country": the form always says, so an explicit choice can be cleared.
		language: isLanguage(values.language) ? values.language : null,
		coHosts: cleanText(values.coHosts, 200)
	};

	return Object.keys(errors).length ? { errors, values } : { input, values };
}
