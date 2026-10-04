// The three consent boxes (§8, D15) as the registration page and the check-in page show them.
// Pure text, shared by server and browser; the server decides which language a page is in.

export type Language = 'id' | 'en' | 'ms';

export interface ConsentText {
	/** Box 1, required: this event. */
	event: string;
	/** Box 2, optional: future events (sticks to the person). */
	future: string;
	/** Box 3, only when the event has co-hosts: share name, company and title with them. */
	share: string;
	/** The privacy-policy link beside box 1. */
	privacy: string;
}

export const CONSENT_TEXT: Record<Language, ConsentText> = {
	en: {
		event:
			'I agree that {org} may keep these details to record my attendance and follow up about this event.',
		future: '{org} may invite me to future events.',
		share: 'Share my name, company and title with {co_hosts}.',
		privacy: 'Privacy policy'
	},
	id: {
		event:
			'Saya setuju {org} menyimpan data ini untuk mencatat kehadiran saya dan menindaklanjuti acara ini.',
		future: '{org} boleh mengundang saya ke acara mendatang.',
		share: 'Bagikan nama, perusahaan, dan jabatan saya dengan {co_hosts}.',
		privacy: 'Kebijakan privasi'
	},
	ms: {
		event:
			'Saya bersetuju {org} menyimpan butiran ini untuk merekodkan kehadiran saya dan membuat susulan tentang acara ini.',
		future: '{org} boleh menjemput saya ke acara akan datang.',
		share: 'Kongsi nama, syarikat dan jawatan saya dengan {co_hosts}.',
		privacy: 'Dasar privasi'
	}
};

/** Fills `{org}`-style slots; an unknown slot is left as written. */
export function fill(text: string, values: Record<string, string>): string {
	return text.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}
