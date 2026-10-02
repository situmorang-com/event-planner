import { linkedinProfile, nameFromLinkedin, nameKey, type Reply } from '$lib/invitations';
import type { GuestInput } from './event-people';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from './normalize';

type Column =
	| 'name'
	| 'first'
	| 'middle'
	| 'last'
	| 'company'
	| 'jobTitle'
	| 'email'
	| 'phone'
	| 'linkedin'
	| 'reply'
	| 'note';

// Header cells squashed to letters and digits ("E-mail Address" → "emailaddress"). Earlier
// aliases win, so "Job Title" beats Outlook's "Title" (Mr, Ms) and a mobile beats a desk phone.
const HEADERS: Record<Column, string[]> = {
	name: ['name', 'fullname', 'nama', 'namalengkap', 'displayname', 'guest', 'guestname', 'invitee'],
	first: ['firstname', 'givenname', 'namadepan'],
	middle: ['middlename'],
	last: ['lastname', 'surname', 'familyname', 'namabelakang'],
	company: [
		'company',
		'companyname',
		'organization',
		'organisation',
		'perusahaan',
		'namaperusahaan',
		'instansi',
		'account',
		'accountname',
		'employer'
	],
	jobTitle: ['jobtitle', 'position', 'designation', 'jabatan', 'role', 'title'],
	email: ['email', 'emailaddress', 'workemail', 'businessemail', 'alamatemail'],
	phone: [
		'mobile',
		'mobilephone',
		'mobilenumber',
		'mobileno',
		'handphone',
		'hp',
		'nohp',
		'nomorhp',
		'whatsapp',
		'wa',
		'nowa',
		'phone',
		'phonenumber',
		'contactno',
		'contactnumber',
		'telephone',
		'tel',
		'telp',
		'notelp',
		'businessphone'
	],
	linkedin: ['linkedin', 'linkedinurl', 'linkedinprofile', 'linkedinlink', 'profile', 'profileurl'],
	reply: ['reply', 'rsvp', 'response', 'status', 'konfirmasi', 'kehadiran', 'attendance'],
	note: ['note', 'notes', 'remark', 'remarks', 'comment', 'comments', 'keterangan', 'catatan']
};

const REPLY_WORDS = new Map<string, Reply>();
const say = (reply: Reply, ...phrases: string[]) =>
	phrases.forEach((p) => REPLY_WORDS.set(p, reply));
say(
	'yes',
	'yes',
	'y',
	'ya',
	'iya',
	'attending',
	'attend',
	'will attend',
	'confirmed',
	'accepted',
	'going',
	'coming',
	'hadir',
	'akan hadir',
	'datang',
	'bisa'
);
say('maybe', 'maybe', 'tentative', 'tbc', 'not sure', 'unsure', 'mungkin', 'belum pasti');
say(
	'no',
	'no',
	'n',
	'tidak',
	'tdk',
	'tidak hadir',
	'tidak bisa',
	'declined',
	'decline',
	'not attending',
	'not coming',
	'unable',
	'regrets',
	'absent',
	'berhalangan'
);
say(
	'pending',
	'pending',
	'no reply',
	'no response',
	'awaiting',
	'awaiting reply',
	'invited',
	'sent',
	'belum',
	'belum konfirmasi',
	'-',
	'?'
);

/** "Yes", "Hadir", "Tentative", "Tidak hadir"… as a reply; null when it isn't one. */
export function parseReply(text: string): Reply | null {
	const phrase = text
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[.!]+$/, '');
	return REPLY_WORDS.get(phrase) ?? null;
}

const MAX_LINES = 1000;
// "S.Kom.", "M.M.", "Ph.D." after a name are degrees, not a job title.
const DEGREE = /^(?:\p{Lu}\p{L}{0,3}\.\s?)+(?:\p{Lu}\p{L}{0,3}\.?)?$/u;
const ROW_NUMBER = /^\d{1,4}[.)]?$/;
// Lists typed or pasted from WhatsApp and Word: "1. Rina", "2) Andi", "- Putri", "• Ahmad".
const LIST_MARKER = /^(?:\d{1,4}[.)]|[-*•·–])\s+/u;

/** Spreadsheet rows paste tab-separated; typed lines use commas. Quoted cells keep theirs. */
function splitCells(line: string): string[] {
	const tabbed = line.includes('\t');
	const cells: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quoted) {
			if (ch === '"' && line[i + 1] === '"') cell += line[++i];
			else if (ch === '"') quoted = false;
			else cell += ch;
		} else if (ch === '"' && !cell.trim()) quoted = true;
		else if (tabbed ? ch === '\t' : ch === ',' || ch === ';') {
			cells.push(cell);
			cell = '';
		} else cell += ch;
	}
	cells.push(cell);
	return cells.map((c) => cleanText(c, 300));
}

type Columns = Partial<Record<Column, number>>;

/** A first row naming a name column (and one more, unless it's the only cell) is a header. */
function readHeader(cells: string[]): Columns | null {
	const columns: Columns = {};
	const rank: Partial<Record<Column, number>> = {};
	cells.forEach((cell, index) => {
		const squashed = cell.toLowerCase().replace(/[^a-z0-9]/g, '');
		for (const column of Object.keys(HEADERS) as Column[]) {
			const r = HEADERS[column].indexOf(squashed);
			if (r >= 0 && r < (rank[column] ?? Infinity)) {
				columns[column] = index;
				rank[column] = r;
			}
		}
	});
	const named = ['name', 'first', 'last'].some((c) => c in columns);
	const found = Object.keys(columns).length;
	return named && (found >= 2 || cells.filter(Boolean).length === 1) ? columns : null;
}

type Row = Required<
	Pick<
		GuestInput,
		'name' | 'company' | 'jobTitle' | 'email' | 'phone' | 'linkedin' | 'reply' | 'note'
	>
>;

function fromColumns(cells: string[], columns: Columns, company: string, country: string): Row {
	const get = (c: Column) => {
		const i = columns[c];
		return i === undefined ? '' : (cells[i] ?? '');
	};
	const email = normalizeEmail(get('email'));
	const linkedin = linkedinProfile(get('linkedin'));
	const replyText = get('reply');
	const reply = replyText ? parseReply(replyText) : 'pending';
	return {
		name:
			get('name') ||
			[get('first'), get('middle'), get('last')].filter(Boolean).join(' ') ||
			(linkedin && nameFromLinkedin(linkedin)) ||
			'',
		company: get('company') || company,
		jobTitle: get('jobTitle'),
		email: email && isValidEmail(email) ? email : null,
		phone: normalizePhone(get('phone'), country),
		linkedin,
		reply: reply ?? 'pending',
		// A reply that isn't one of the usual words ("Yes, with a colleague") is kept as written.
		note: [get('note'), reply ? '' : replyText].filter(Boolean).join(' · ')
	};
}

const isPhoneLike = (cell: string) =>
	/^[+(]?[\d\s().\-/]+$/.test(cell) && cell.replace(/\D/g, '').length >= 6;

/** A typed line: a name, then a job title, email, mobile, LinkedIn link or reply in any order. */
function fromShape(cells: string[], company: string, country: string): Row {
	const row: Row = {
		name: '',
		company,
		jobTitle: '',
		email: null,
		phone: null,
		linkedin: null,
		reply: 'pending',
		note: ''
	};
	const titles: string[] = [];
	cells.forEach((cell, index) => {
		if (index === 0) cell = cell.replace(LIST_MARKER, '');
		if (!cell || (index === 0 && ROW_NUMBER.test(cell))) return;
		const email = cell.includes('@') ? normalizeEmail(cell) : null;
		const reply = row.name ? parseReply(cell) : null;
		const linkedin = linkedinProfile(cell);
		if (linkedin) row.linkedin ??= linkedin;
		else if (!row.email && email && isValidEmail(email)) row.email = email;
		else if (!row.phone && isPhoneLike(cell)) row.phone = normalizePhone(cell, country);
		else if (reply) row.reply = reply;
		else if (!row.name) row.name = cell;
		else if (!titles.length && DEGREE.test(cell)) row.name += `, ${cell}`;
		else titles.push(cell);
	});
	row.jobTitle = titles.join(', ');
	// Only a profile link to go on: the link usually spells out the name.
	if (!row.name && row.linkedin) row.name = nameFromLinkedin(row.linkedin) ?? '';
	return row;
}

export interface ParsedGuestList {
	guests: GuestInput[];
	/** Lines with no name to go on, as typed. */
	skipped: string[];
	/** Longer than one paste takes; the rest were ignored. */
	truncated: boolean;
}

/**
 * Reads a pasted or typed guest list: one person per line. A spreadsheet paste that starts
 * with its header row is read by column, so a company column overrides `company`.
 * `keepNameless` returns lines without a name as guests named '' (for review) instead of
 * skipping them.
 */
export function parseGuestList(
	text: string,
	{
		company,
		country,
		keepNameless = false
	}: { company: string; country: string; keepNameless?: boolean }
): ParsedGuestList {
	const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim());
	const rows = lines.slice(0, MAX_LINES).map((line) => ({ line, cells: splitCells(line) }));
	const columns = rows.length ? readHeader(rows[0].cells) : null;

	const guests: GuestInput[] = [];
	const skipped: string[] = [];
	for (const { line, cells } of columns ? rows.slice(1) : rows) {
		const row = columns
			? fromColumns(cells, columns, company, country)
			: fromShape(cells, company, country);
		if (!nameKey(row.name) && !keepNameless) {
			skipped.push(cleanText(line, 120));
			continue;
		}
		guests.push({
			...row,
			name: cleanText(row.name, 100),
			company: cleanText(row.company, 120),
			jobTitle: cleanText(row.jobTitle, 120),
			note: cleanText(row.note, 300)
		});
	}
	return { guests, skipped, truncated: lines.length > MAX_LINES };
}
