import { linkedinProfile, nameFromLinkedin, nameKey, type Reply } from '$lib/invitations';
import type { GuestInput, RowExtra } from './event-people';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from './normalize';

export type Column =
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
	| 'note'
	| 'owner'
	| 'doNotEmail'
	| 'doNotPhone'
	| 'marketing'
	| 'd365Status';

/** Every column the mapping control can point a header at, in the order it lists them. */
export const COLUMNS: Column[] = [
	'name',
	'first',
	'middle',
	'last',
	'company',
	'jobTitle',
	'email',
	'phone',
	'linkedin',
	'reply',
	'note',
	'owner',
	'doNotEmail',
	'doNotPhone',
	'marketing',
	'd365Status'
];

export const COLUMN_LABEL: Record<Column, string> = {
	name: 'Name',
	first: 'First name',
	middle: 'Middle name',
	last: 'Last name',
	company: 'Company',
	jobTitle: 'Job title',
	email: 'Email',
	phone: 'Mobile',
	linkedin: 'LinkedIn',
	reply: 'Reply',
	note: 'Note',
	owner: 'Owner (D365)',
	doNotEmail: 'Do not email (D365)',
	doNotPhone: 'Do not phone (D365)',
	marketing: 'Marketing materials (D365)',
	d365Status: 'Status (D365)'
};

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
		'parentcustomer',
		'employer'
	],
	jobTitle: ['jobtitle', 'position', 'designation', 'jabatan', 'role', 'title'],
	email: ['email', 'emailaddress', 'emailaddress1', 'workemail', 'businessemail', 'alamatemail'],
	phone: [
		'mobile',
		'mobilephone',
		'mobilephone1',
		'mobilenumber',
		'mobileno',
		'handphone',
		'hp',
		'nohp',
		'nomorhp',
		'telefonbimbit',
		'whatsapp',
		'wa',
		'nowa',
		'phone',
		'phonenumber',
		'contactno',
		'contactnumber',
		'telephone',
		'telephone1',
		'tel',
		'telp',
		'notelp',
		'businessphone'
	],
	linkedin: ['linkedin', 'linkedinurl', 'linkedinprofile', 'linkedinlink', 'profile', 'profileurl'],
	reply: ['reply', 'rsvp', 'response', 'status', 'konfirmasi', 'kehadiran', 'attendance'],
	note: ['note', 'notes', 'remark', 'remarks', 'comment', 'comments', 'keterangan', 'catatan'],
	owner: ['owner', 'ownerid'],
	doNotEmail: ['donotallowemails', 'donotemail'],
	doNotPhone: ['donotallowphonecalls', 'donotphone'],
	marketing: ['sendmarketingmaterials', 'donotsendmm'],
	d365Status: ['statecode', 'statusreason']
};

// Headers only a Dynamics 365 export carries: seeing one means the rows are customers (D11).
const D365_ALIASES = new Set([
	'parentcustomer',
	'emailaddress1',
	'mobilephone1',
	'telephone1',
	'telefonbimbit',
	...HEADERS.owner,
	...HEADERS.doNotEmail,
	...HEADERS.doNotPhone,
	...HEADERS.marketing,
	...HEADERS.d365Status
]);

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

/**
 * Whether a D365 preference cell refuses the channel. "Do Not Allow" and "Send" say so by
 * themselves; a bare Yes / No depends on whether the column is "Send …" or "Do not …".
 */
function refuses(text: string, positiveColumn: boolean): boolean {
	const t = text.toLowerCase().replace(/\s+/g, ' ').trim();
	if (!t) return false;
	if (/^(do ?not|don't|tidak|jangan)\b/.test(t)) return true;
	if (/^(allow|send|boleh)\b/.test(t)) return false;
	const yes = /^(yes|true|1|y|ya)\b/.test(t);
	const no = /^(no|false|0|n)\b/.test(t);
	if (!yes && !no) return false;
	return positiveColumn ? no : yes;
}

const MAX_LINES = 1000;
// "S.Kom.", "M.M.", "Ph.D." after a name are degrees, not a job title.
const DEGREE = /^(?:\p{Lu}\p{L}{0,3}\.\s?)+(?:\p{Lu}\p{L}{0,3}\.?)?$/u;
const ROW_NUMBER = /^\d{1,4}[.)]?$/;
// Lists typed or pasted from WhatsApp and Word: "1. Rina", "2) Andi", "- Putri", "• Ahmad".
const LIST_MARKER = /^(?:\d{1,4}[.)]|[-*•·–])\s+/u;
// Static worksheet exports from D365 lead with hidden "(Do Not Modify) …" columns: a row id,
// a checksum and a modified-on stamp. They carry nothing about the person.
const DO_NOT_MODIFY = /^\(do not modify\)/i;
const GUID = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

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

export type Columns = Partial<Record<Column, number>>;

const squash = (cell: string) => cell.toLowerCase().replace(/[^a-z0-9]/g, '');

/** How many leading columns are D365's hidden ones: by their header, or by a GUID in the data. */
function hiddenLeading(header: string[], firstRow: string[] | undefined): number {
	let n = 0;
	while (
		n < header.length &&
		(DO_NOT_MODIFY.test(header[n]) || (firstRow !== undefined && GUID.test(firstRow[n] ?? '')))
	)
		n++;
	return n;
}

interface HeaderMatch {
	columns: Columns;
	/** The alias each column matched, so "status" can be told from "rsvp" later. */
	alias: Partial<Record<Column, string>>;
}

/** Which column each header cell names, by alias rank; cells naming nothing are left out. */
function matchHeader(cells: string[]): HeaderMatch {
	const columns: Columns = {};
	const alias: Partial<Record<Column, string>> = {};
	const rank: Partial<Record<Column, number>> = {};
	cells.forEach((cell, index) => {
		const squashed = squash(cell);
		for (const column of COLUMNS) {
			const r = HEADERS[column].indexOf(squashed);
			if (r >= 0 && r < (rank[column] ?? Infinity)) {
				columns[column] = index;
				alias[column] = squashed;
				rank[column] = r;
			}
		}
	});
	return { columns, alias };
}

/** A first row naming a name column (and one more, unless it's the only cell) is a header. */
function isHeader(cells: string[], columns: Columns): boolean {
	const named = ['name', 'first', 'last'].some((c) => c in columns);
	const found = Object.keys(columns).length;
	return named && (found >= 2 || cells.filter(Boolean).length === 1);
}

type Row = Required<
	Pick<
		GuestInput,
		'name' | 'company' | 'jobTitle' | 'email' | 'phone' | 'linkedin' | 'reply' | 'note'
	>
> & { extra: RowExtra | null };

function fromColumns(
	cells: string[],
	columns: Columns,
	{ company, country, d365, invertedMarketing }: Shape
): Row {
	const get = (c: Column) => {
		const i = columns[c];
		return i === undefined ? '' : (cells[i] ?? '');
	};
	const email = normalizeEmail(get('email'));
	const linkedin = linkedinProfile(get('linkedin'));
	const replyText = get('reply');
	const reply = replyText ? parseReply(replyText) : 'pending';
	let extra: RowExtra | null = null;
	if (d365) {
		const status = get('d365Status');
		const inactive = /^(inactive|1)$/i.test(status.trim());
		extra = {
			isCustomer: true,
			doNotEmail: refuses(get('doNotEmail'), false),
			doNotPhone: refuses(get('doNotPhone'), false),
			// "Do Not Send MM = Yes" and "Send Marketing Materials = No" both refuse (§6.1).
			suppressed: refuses(get('marketing'), !invertedMarketing) || inactive,
			owner: cleanText(get('owner'), 100),
			status: cleanText(status, 60)
		};
	}
	const rowCompany = get('company') || company;
	return {
		name:
			get('name') ||
			[get('first'), get('middle'), get('last')].filter(Boolean).join(' ') ||
			(linkedin && nameFromLinkedin(linkedin)) ||
			'',
		company: rowCompany,
		jobTitle: get('jobTitle'),
		email: email && isValidEmail(email) ? email : null,
		phone: normalizePhone(get('phone'), countryOf(country, rowCompany)),
		linkedin,
		reply: reply ?? 'pending',
		// A reply that isn't one of the usual words ("Yes, with a colleague") is kept as written.
		note: [get('note'), reply ? '' : replyText].filter(Boolean).join(' · '),
		extra
	};
}

const isPhoneLike = (cell: string) =>
	/^[+(]?[\d\s().\-/]+$/.test(cell) && cell.replace(/\D/g, '').length >= 6;

/** A typed line: a name, then a job title, email, mobile, LinkedIn link or reply in any order. */
function fromShape(cells: string[], company: string, country: CountryOption): Row {
	// A typed line names one company (the form's), so its country is known up front.
	const rowCountry = countryOf(country, company);
	const row: Row = {
		name: '',
		company,
		jobTitle: '',
		email: null,
		phone: null,
		linkedin: null,
		reply: 'pending',
		note: '',
		extra: null
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
		else if (!row.phone && isPhoneLike(cell)) row.phone = normalizePhone(cell, rowCountry);
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

interface Shape {
	company: string;
	country: CountryOption;
	d365: boolean;
	/** The marketing column says "do not send" rather than "send". */
	invertedMarketing: boolean;
}

export interface ParsedGuestList {
	guests: GuestInput[];
	/** Lines with no name to go on, as typed. */
	skipped: string[];
	/** Longer than one paste takes; the rest were ignored. */
	truncated: boolean;
	/** The first line's cells, hidden D365 columns dropped, for the column-mapping control. */
	headers: string[];
	/** Whether the first line was read as a header row rather than a person. */
	header: boolean;
	/** The mapping the rows were read with (empty when read by shape). */
	columns: Columns;
	/** Rows from a Dynamics 365 export: customers, with the D365 flags on each row (D11). */
	d365: boolean;
}

/** One country for every row, or one looked up per company (D14). */
export type CountryOption = string | ((company: string) => string);

export const countryOf = (country: CountryOption, company: string) =>
	typeof country === 'string' ? country : country(company);

export interface ParseOptions {
	company: string;
	country: CountryOption;
	/** Return lines without a name as guests named '' (for review) instead of skipping them. */
	keepNameless?: boolean;
	/** The organizer's own column mapping; the first line is then a header unless `header` is false. */
	columns?: Columns;
	header?: boolean;
}

/**
 * Reads a pasted or typed guest list: one person per line. A spreadsheet paste that starts
 * with its header row is read by column, so a company column overrides `company`.
 */
export function parseGuestList(text: string, opts: ParseOptions): ParsedGuestList {
	const { company, country, keepNameless = false } = opts;
	const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim());
	let rows = lines.slice(0, MAX_LINES).map((line) => ({ line, cells: splitCells(line) }));

	const hidden = rows.length ? hiddenLeading(rows[0].cells, rows[1]?.cells) : 0;
	if (hidden) rows = rows.map((r) => ({ ...r, cells: r.cells.slice(hidden) }));
	const headers = rows[0]?.cells ?? [];

	const detected = rows.length ? matchHeader(headers) : { columns: {}, alias: {} };
	let columns: Columns | null;
	let header: boolean;
	if (opts.columns) {
		columns = { ...opts.columns };
		header = opts.header !== false;
	} else {
		header = isHeader(headers, detected.columns);
		columns = header ? detected.columns : null;
	}
	const aliases = Object.values(detected.alias);
	const d365 = hidden > 0 || aliases.some((a) => D365_ALIASES.has(a));

	const data = header ? rows.slice(1) : rows;
	// A plain "Status" column is a reply only when it reads as one; Active / Inactive is D365's.
	// A mapping the organizer chose by hand is taken as it is.
	if (!opts.columns && columns?.reply !== undefined && detected.alias.reply === 'status') {
		const index = columns.reply;
		const values = data.map((r) => r.cells[index] ?? '').filter(Boolean);
		if (values.length && !values.every((v) => parseReply(v))) {
			columns.d365Status ??= index;
			delete columns.reply;
		}
	}

	const shape: Shape = {
		company,
		country,
		d365,
		invertedMarketing: detected.alias.marketing === 'donotsendmm'
	};
	const guests: GuestInput[] = [];
	const skipped: string[] = [];
	for (const { line, cells } of data) {
		const row = columns ? fromColumns(cells, columns, shape) : fromShape(cells, company, country);
		if (!nameKey(row.name) && !keepNameless) {
			skipped.push(cleanText(line, 120));
			continue;
		}
		const { extra, ...fields } = row;
		guests.push({
			...fields,
			name: cleanText(row.name, 100),
			company: cleanText(row.company, 120),
			jobTitle: cleanText(row.jobTitle, 120),
			note: cleanText(row.note, 300),
			...(extra ? { extra } : {})
		});
	}
	return {
		guests,
		skipped,
		truncated: lines.length > MAX_LINES,
		headers,
		header,
		columns: columns ?? {},
		d365
	};
}

/** A column mapping sent back from the review card, as `{ column: index }`; junk is dropped. */
export function readColumns(raw: unknown): Columns | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const columns: Columns = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		const index = Number(value);
		if (COLUMNS.includes(key as Column) && Number.isInteger(index) && index >= 0 && index < 200)
			columns[key as Column] = index;
	}
	return columns;
}
