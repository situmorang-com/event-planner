import { companyKey } from '../invitations.ts';
import { hiddenLeading, splitCells, squash } from './guest-list.ts';
import { cleanText } from './normalize.ts';

/*
 * A Dynamics 365 Accounts view, pasted or opened as CSV, read into target companies (§6.1,
 * D11). The view's headers are matched case-insensitively by display name or logical name;
 * the hidden "(Do Not Modify)" columns of a static worksheet are dropped first; and a mapping
 * the organizer chose by hand replaces the detected one, as on the people paste. Without a
 * header row the lines are read as "Company, website", like the typed target list.
 */

export type AccountColumn =
	'name' | 'website' | 'primaryContact' | 'owner' | 'industry' | 'mainPhone';

/** Every column the mapping control can point a header at, in the order it lists them. */
export const ACCOUNT_COLUMNS: AccountColumn[] = [
	'name',
	'website',
	'primaryContact',
	'owner',
	'industry',
	'mainPhone'
];

export const ACCOUNT_COLUMN_LABEL: Record<AccountColumn, string> = {
	name: 'Account name',
	website: 'Website',
	primaryContact: 'Primary contact',
	owner: 'Owner',
	industry: 'Industry',
	mainPhone: 'Main phone'
};

// Display names first, then the logical names a developer export or an OData dump carries.
const HEADERS: Record<AccountColumn, string[]> = {
	name: [
		'accountname',
		'name',
		'account',
		'company',
		'companyname',
		'namaperusahaan',
		'perusahaan'
	],
	website: ['website', 'websiteurl', 'web', 'url', 'situsweb', 'lamanweb'],
	primaryContact: ['primarycontact', 'primarycontactid', 'contact', 'kontakutama'],
	owner: ['owner', 'ownerid', 'pemilik'],
	industry: ['industry', 'industrycode', 'industri'],
	mainPhone: ['mainphone', 'telephone1', 'phone', 'telepon', 'telefon']
};

export type AccountColumns = Partial<Record<AccountColumn, number>>;

export interface AccountInput {
	name: string;
	website: string;
	owner: string;
	industry: string;
}

export interface ParsedAccounts {
	accounts: AccountInput[];
	/** Lines with no company name to go on, as typed. */
	skipped: string[];
	truncated: boolean;
	/** The first line's cells, hidden D365 columns dropped, for the column-mapping control. */
	headers: string[];
	/** Whether the first line was read as a header row rather than a company. */
	header: boolean;
	/** The mapping the rows were read with (empty when read by shape). */
	columns: AccountColumns;
}

const MAX_LINES = 1000;
const LIST_MARKER = /^(?:\d{1,3}[.)]|[-*•])\s+/;

/** "bataviafoods.co.id", "https://www.selat.com/", never a bare word or an email. */
const looksLikeWebsite = (cell: string) =>
	/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(cell) && !cell.includes('@');

function matchHeader(cells: string[]): AccountColumns {
	const columns: AccountColumns = {};
	const rank: Partial<Record<AccountColumn, number>> = {};
	cells.forEach((cell, index) => {
		const squashed = squash(cell);
		for (const column of ACCOUNT_COLUMNS) {
			const r = HEADERS[column].indexOf(squashed);
			if (r >= 0 && r < (rank[column] ?? Infinity)) {
				columns[column] = index;
				rank[column] = r;
			}
		}
	});
	return columns;
}

/**
 * A first line that names the account column and one more is a header; so is a lone "Account
 * Name", the one-column view, which would otherwise be read as a company called that.
 */
const isHeader = (columns: AccountColumns, cellCount: number) =>
	'name' in columns && (cellCount === 1 || Object.keys(columns).length >= 2);

function fromColumns(cells: string[], columns: AccountColumns): AccountInput {
	const get = (c: AccountColumn) => {
		const i = columns[c];
		return i === undefined ? '' : (cells[i] ?? '');
	};
	const website = cleanText(get('website'), 160);
	return {
		name: cleanText(get('name'), 120),
		website: looksLikeWebsite(website) ? website : '',
		owner: cleanText(get('owner'), 100),
		industry: cleanText(get('industry'), 100)
	};
}

/** A typed line: the company, then its website if one of the cells is one. */
function fromShape(cells: string[]): AccountInput {
	const [name, ...rest] = cells;
	return {
		name: cleanText((name ?? '').replace(LIST_MARKER, ''), 120),
		website: cleanText(rest.find(looksLikeWebsite) ?? '', 160),
		owner: '',
		industry: ''
	};
}

export interface ParseAccountsOptions {
	/** The organizer's own column mapping; the first line is then a header unless `header` is false. */
	columns?: AccountColumns;
	header?: boolean;
}

export function parseAccounts(text: string, opts: ParseAccountsOptions = {}): ParsedAccounts {
	const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim());
	let rows = lines.slice(0, MAX_LINES).map((line) => ({ line, cells: splitCells(line) }));
	const hidden = rows.length ? hiddenLeading(rows[0].cells, rows[1]?.cells) : 0;
	if (hidden) rows = rows.map((r) => ({ ...r, cells: r.cells.slice(hidden) }));
	const headers = rows[0]?.cells ?? [];

	let columns: AccountColumns | null;
	let header: boolean;
	if (opts.columns) {
		columns = { ...opts.columns };
		header = opts.header !== false;
	} else {
		const detected = matchHeader(headers);
		header = isHeader(detected, headers.length);
		columns = header ? detected : null;
	}

	const accounts: AccountInput[] = [];
	const skipped: string[] = [];
	for (const { line, cells } of header ? rows.slice(1) : rows) {
		const account = columns ? fromColumns(cells, columns) : fromShape(cells);
		if (!companyKey(account.name)) {
			skipped.push(cleanText(line, 120));
			continue;
		}
		accounts.push(account);
	}
	return {
		accounts,
		skipped,
		truncated: lines.length > MAX_LINES,
		headers,
		header,
		columns: columns ?? {}
	};
}

/** A column mapping sent back from the page, as `{ column: index }`; junk is dropped. */
export function readAccountColumns(raw: unknown): AccountColumns | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const columns: AccountColumns = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		const index = Number(value);
		if (
			ACCOUNT_COLUMNS.includes(key as AccountColumn) &&
			Number.isInteger(index) &&
			index >= 0 &&
			index < 200
		)
			columns[key as AccountColumn] = index;
	}
	return columns;
}
