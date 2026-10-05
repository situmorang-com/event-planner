export type Reply = 'pending' | 'yes' | 'maybe' | 'no';

/** Display order: the answers, then everyone still to hear from. */
export const REPLIES = ['yes', 'maybe', 'no', 'pending'] as const satisfies readonly Reply[];

export const REPLY_LABEL: Record<Reply, string> = {
	yes: 'Attending',
	maybe: 'Tentative',
	no: 'Declined',
	pending: 'No reply'
};

export function isReply(value: unknown): value is Reply {
	return REPLIES.includes(value as Reply);
}

/** One person on a guest list, as the planner shows them. */
export interface Guest {
	id: number;
	name: string;
	company: string;
	job_title: string;
	email: string | null;
	phone: string | null;
	/** Their LinkedIn profile, as https://www.linkedin.com/in/<slug>. */
	linkedin: string | null;
	reply: Reply;
	note: string;
	/** When they checked in at the event, if they have. */
	arrived_at: number | null;
}

// Titles that guest lists carry but people rarely type at check-in: "Bapak Hendra Gunawan"
// on the list is the "Hendra Gunawan" who scans the QR code.
const HONORIFICS = new Set([
	'mr',
	'mrs',
	'ms',
	'miss',
	'mdm',
	'madam',
	'dr',
	'prof',
	'ir',
	'drs',
	'dra',
	'bapak',
	'bpk',
	'pak',
	'ibu',
	'bu',
	'sdr',
	'sdri',
	'tuan',
	'puan',
	'encik',
	'en',
	'cik',
	'dato',
	'datuk',
	'datin',
	'haji',
	'hajah',
	'hajjah',
	'hj',
	'hjh'
]);

// Legal forms that come and go between spellings: "PT Batavia Foods Tbk" is "Batavia Foods".
const LEGAL_FORMS = new Set([
	'pt',
	'tbk',
	'cv',
	'persero',
	'sdn',
	'bhd',
	'berhad',
	'pte',
	'ltd',
	'limited',
	'inc',
	'llc',
	'plc'
]);

function words(s: string): string[] {
	return s
		.normalize('NFKD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.split(/[^\p{L}\p{N}&]+/u)
		.filter(Boolean);
}

/**
 * The part of a name that identifies someone: no title in front, no degrees after a comma
 * ("Dr. Budi Santoso, M.T." is "budi santoso"), case and accents folded.
 */
export function nameKey(name: string): string {
	const w = words(name.split(',')[0]);
	while (w.length > 1 && HONORIFICS.has(w[0])) w.shift();
	return w.join(' ');
}

/** "PT. Batavia Foods", "batavia foods" and "Batavia Foods Tbk" are one company. */
export function companyKey(company: string): string {
	const w = words(company);
	const core = w.filter((x) => !LEGAL_FORMS.has(x));
	return (core.length ? core : w).join(' ');
}

/** "Rina Wijaya" → "Rina", but "Bapak Hendra Gunawan" → "Bapak Hendra". */
export function greetingName(name: string): string {
	const parts = name.split(',')[0].trim().split(/\s+/);
	let i = 0;
	while (i < parts.length - 1 && HONORIFICS.has(words(parts[i])[0] ?? '')) i++;
	return parts.slice(0, i + 1).join(' ');
}

const LINKEDIN = /(?:^|[/.\s])linkedin\.com\/in\/([^/?#\s]+)/i;

/**
 * A LinkedIn profile link in any of the forms people paste it ("linkedin.com/in/rina",
 * "https://id.linkedin.com/in/rina/?utm…"), tidied to one canonical URL; null otherwise.
 */
export function linkedinProfile(text: string): string | null {
	const slug = profileSlug(text);
	return slug ? `https://www.linkedin.com/in/${encodeURIComponent(slug)}` : null;
}

/** The public name in a profile link ("rina-wijaya-4a1b2c"), lower-cased and decoded. */
function profileSlug(text: string): string | null {
	const slug = LINKEDIN.exec(text.trim())?.[1];
	if (!slug) return null;
	try {
		return decodeURIComponent(slug).toLowerCase();
	} catch {
		return slug.toLowerCase();
	}
}

/**
 * LinkedIn's new-message page addressed to the profile's owner. LinkedIn takes no message text
 * in a link, so the row copies the draft first and the organizer pastes it there.
 */
export function linkedinMessageUrl(profile: string): string | null {
	const slug = profileSlug(profile);
	return slug
		? `https://www.linkedin.com/messaging/compose/?recipient=${encodeURIComponent(slug)}`
		: null;
}

/**
 * The name a profile link spells out: ".../in/rina-wijaya-4a1b2c" is "Rina Wijaya". The link is
 * all there is to go on (LinkedIn doesn't allow fetching the profile), so a slug that isn't a
 * name, like "rinaw88", gives null and the organizer types it.
 */
export function nameFromLinkedin(url: string): string | null {
	const slug = decodeURIComponent(url.split('/in/')[1] ?? '');
	const parts = slug.split('-').filter(Boolean);
	// LinkedIn appends an id to common names: "-4a1b2c", "-12345678".
	while (parts.length && /\d/.test(parts[parts.length - 1])) parts.pop();
	if (parts.length < 2 || parts.some((p) => /\d/.test(p))) return null;
	return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
}
