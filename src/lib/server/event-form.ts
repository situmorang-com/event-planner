import { fromLocalInput, isValidTimeZone } from '$lib/time';
import { DEFAULT_PHONE_COUNTRY, DEFAULT_TIMEZONE } from './config';
import type { EventInput } from './events';
import { cleanText } from './normalize';
import { isCountry, type Country } from './settings';

export type EventFormValues = {
	name: string;
	venue: string;
	startsAt: string;
	timezone: string;
	qrMode: string;
	/** Empty for no target (D8). */
	targetCount: string;
	phoneCountry: string;
};

/** What a new event's form starts with: the app's phone country, everything else blank. */
export function emptyEventForm(phoneCountry: Country): EventFormValues {
	return {
		name: '',
		venue: '',
		startsAt: '',
		timezone: '',
		qrMode: 'rotating',
		targetCount: '',
		phoneCountry
	};
}

export function parseEventForm(form: FormData) {
	const values: EventFormValues = {
		name: String(form.get('name') ?? ''),
		venue: String(form.get('venue') ?? ''),
		startsAt: String(form.get('startsAt') ?? ''),
		timezone: String(form.get('timezone') ?? ''),
		qrMode: String(form.get('qrMode') ?? 'rotating'),
		targetCount: String(form.get('targetCount') ?? '').trim(),
		phoneCountry: String(form.get('phoneCountry') ?? '').toUpperCase()
	};

	const timezone =
		isValidTimeZone(values.timezone) && values.timezone ? values.timezone : DEFAULT_TIMEZONE;
	const startsAt = values.startsAt ? fromLocalInput(values.startsAt, timezone) : null;
	const targetCount = values.targetCount ? Number(values.targetCount) : null;
	const errors: Partial<Record<keyof EventFormValues, string>> = {};

	const name = cleanText(values.name, 120);
	if (!name) errors.name = 'Give the event a name.';
	if (values.startsAt && startsAt === null) errors.startsAt = 'That date doesn’t look right.';
	if (targetCount !== null && !(Number.isSafeInteger(targetCount) && targetCount >= 0))
		errors.targetCount = 'The target is a whole number of people.';

	const input: EventInput = {
		name,
		venue: cleanText(values.venue, 160),
		startsAt,
		timezone,
		qrMode: values.qrMode === 'static' ? 'static' : 'rotating',
		targetCount: targetCount || null,
		phoneCountry: isCountry(values.phoneCountry)
			? values.phoneCountry
			: isCountry(DEFAULT_PHONE_COUNTRY)
				? DEFAULT_PHONE_COUNTRY
				: 'ID'
	};

	return Object.keys(errors).length ? { errors, values } : { input, values };
}
