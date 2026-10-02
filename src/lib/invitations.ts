import { mailtoHref } from './mailto.ts';
import { formatDate, formatTime } from './time.ts';

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
	const slug = LINKEDIN.exec(text.trim())?.[1];
	if (!slug) return null;
	let decoded: string;
	try {
		decoded = decodeURIComponent(slug);
	} catch {
		decoded = slug;
	}
	return `https://www.linkedin.com/in/${encodeURIComponent(decoded.toLowerCase())}`;
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

interface EventInfo {
	name: string;
	venue: string;
	starts_at: number | null;
	timezone: string;
}

/** The reply that fits where someone's answer stands. It opens in WhatsApp or email to edit. */
export function followUpMessage(reply: Reply, guestName: string, event: EventInfo): string {
	const hi = `Hi ${greetingName(guestName) || 'there'},`;
	const when = event.starts_at
		? `on ${formatDate(event.starts_at, event.timezone)} at ${formatTime(event.starts_at, event.timezone)}`
		: '';
	const where = event.venue ? (when ? event.venue : `at ${event.venue}`) : '';
	const details = [when, where].filter(Boolean).join(', ');
	const at = details ? `${event.name} ${details}` : event.name;

	switch (reply) {
		case 'yes':
			return `${hi} thank you for confirming! We look forward to seeing you at ${at}.`;
		case 'maybe':
			return `${hi} thanks for getting back to us. We've pencilled you in for ${at}. Just let us know once you're sure.`;
		case 'no':
			return `${hi} thank you for letting us know. We'll miss you at ${event.name}, and we hope to see you at the next one.`;
		default:
			return `${hi} we'd love to have you at ${at}. Will you be able to join us?`;
	}
}

export interface FollowUpLink {
	href: string;
	via: 'whatsapp' | 'email';
}

/** WhatsApp when the mobile is in international format, otherwise email, otherwise nothing. */
export function followUpLink(
	guest: { email: string | null; phone: string | null },
	subject: string,
	text: string
): FollowUpLink | null {
	if (guest.phone?.startsWith('+')) {
		const number = guest.phone.replace(/\D/g, '');
		return { via: 'whatsapp', href: `https://wa.me/${number}?text=${encodeURIComponent(text)}` };
	}
	if (guest.email) {
		const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
		return { via: 'email', href: `${mailtoHref(guest.email)}?${query}` };
	}
	return null;
}
