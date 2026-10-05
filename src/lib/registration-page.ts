import type { Language } from './consent';

// What the public registration pages (/r/…) load and what their actions answer, shared by
// the three routes and the component that renders them.

export type RegistrationMode = 'personal' | 'generic' | 'reconfirm';

export interface RegistrationPageData {
	state: 'form' | 'expired';
	mode: RegistrationMode;
	language: Language;
	/** The token in the URL, so the reconfirm page can link to the full form. */
	token: string | null;
	org: { name: string; privacyUrl: string };
	event: { name: string; venue: string; when: string | null; coHosts: string };
	/** The personal link's name and company (never email or mobile, §7), and Pak or Bu only
	 * when they gave it themselves before (D27): a guess is never put to them as their answer. */
	prefill: { name: string; company: string; salutation?: 'pak' | 'bu' | null } | null;
}

export type DoneKind = 'yes' | 'maybe' | 'no' | 'notMe' | 'removeMe' | 'reconfirm';

export interface RegistrationValues {
	rsvp: string;
	name: string;
	company: string;
	jobTitle: string;
	email: string;
	phone: string;
	note: string;
	salutation: string;
}

export type RegistrationField = 'rsvp' | 'name' | 'contact' | 'email' | 'consent';

export type RegistrationFormResult =
	| { done: { kind: DoneKind; name: string; contact: string | null } }
	| { reason: 'busy' | 'refused'; values?: RegistrationValues }
	| {
			reason: 'invalid';
			errors: Partial<Record<RegistrationField, string>>;
			values: RegistrationValues;
	  }
	| null
	| undefined;
