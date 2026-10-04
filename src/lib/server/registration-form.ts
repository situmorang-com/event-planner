import { fill } from '../consent.ts';
import type {
	RegistrationField,
	RegistrationFormResult,
	RegistrationValues
} from '../registration-page.ts';
import { REGISTRATION_TEXT, type RegistrationText } from '../registration-text.ts';
import type { Language } from '../consent.ts';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from './normalize.ts';

/*
 * Reads what the public registration forms post (§4.6). Every value is cleaned here, the
 * mobile is normalised for the country the route decides, and the first problem per field
 * comes back in the page's language. Nothing is trusted beyond its length and shape.
 */

export interface ReadForm {
	values: RegistrationValues;
	email: string | null;
	phone: string | null;
	note: string;
	consent: boolean;
	consentFuture: boolean;
	consentShare: boolean;
	errors: Partial<Record<RegistrationField, string>>;
}

export function readRegistrationForm(
	form: FormData,
	{ country, language, needsName }: { country: string; language: Language; needsName: boolean }
): ReadForm {
	const t = REGISTRATION_TEXT[language];
	const values: RegistrationValues = {
		rsvp: cleanText(form.get('rsvp'), 10),
		name: cleanText(form.get('name'), 100),
		company: cleanText(form.get('company'), 120),
		jobTitle: cleanText(form.get('jobTitle'), 120),
		email: cleanText(form.get('email'), 254),
		phone: cleanText(form.get('phone'), 40),
		note: cleanText(form.get('note'), 300)
	};
	const email = normalizeEmail(values.email);
	const phone = normalizePhone(values.phone, country);
	const errors: ReadForm['errors'] = {};
	if (needsName && !values.name) errors.name = t.errors.name;
	if (!email && !phone) errors.contact = t.errors.contact;
	else if (email && !isValidEmail(email)) errors.email = t.errors.email;
	const consent = form.get('consent') === 'on';
	if (!consent) errors.consent = t.errors.consent;
	return {
		values,
		email,
		phone,
		note: values.note,
		consent,
		consentFuture: form.get('consentFuture') === 'on',
		consentShare: form.get('consentShare') === 'on',
		errors
	};
}

/** The page's own wording for a refusal or a rate limit, with the organizer's name filled in. */
export function registrationMessage(
	language: Language,
	key: keyof RegistrationText['errors'],
	org: string
): string {
	return fill(REGISTRATION_TEXT[language].errors[key], { org });
}

/** What a guest sees afterwards: the mobile as it was saved, else the email (§4.6). */
export function contactShown(phone: string | null, email: string | null): string | null {
	return phone ?? email;
}

export type { RegistrationFormResult };
