// Reading LinkedIn's Connections.csv (D28). It runs in the browser, so only names, links and
// dates go to the server (a big network's file is past the upload limit), and on the server
// again to check what arrives.
import { linkedinProfile } from './invitations.ts';

export interface Connection {
	name: string;
	/** Canonical profile URL; LinkedIn leaves it blank for a few members. */
	linkedin: string | null;
	company: string;
	/** "Connected On" at midnight UTC; null when it doesn't read as a date. */
	connectedOn: number | null;
}

/** RFC 4180 rows: quoted fields may hold commas, quotes ("") and line breaks. */
function csvRows(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') ((field += '"'), i++);
			else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') (row.push(field), (field = ''));
		else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			(row.push(field), rows.push(row), (row = []), (field = ''));
		} else field += c;
	}
	if (field || row.length) (row.push(field), rows.push(row));
	return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** LinkedIn writes "16 Oct 2026"; older exports wrote "10/16/26". */
export function connectedOnDate(text: string): number | null {
	const t = text.trim();
	let m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(t);
	if (m) {
		const month = MONTHS.indexOf(m[2].toLowerCase());
		return month < 0 ? null : Date.UTC(+m[3], month, +m[1]);
	}
	m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
	if (m) return Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);
	return null;
}

/**
 * The connections in an export. The file opens with a few "Notes:" lines before its header, so
 * the header is found by name; null when the text isn't a Connections file at all.
 */
export function parseConnections(text: string): Connection[] | null {
	const rows = csvRows(text.replace(/^﻿/, ''));
	const head = rows.findIndex((r) => r[0]?.trim() === 'First Name' && r.includes('Last Name'));
	if (head < 0) return null;
	const col = (name: string) => rows[head].findIndex((c) => c.trim() === name);
	const [first, last, url, company, on] = [
		col('First Name'),
		col('Last Name'),
		col('URL'),
		col('Company'),
		col('Connected On')
	];
	return rows
		.slice(head + 1)
		.filter((r) => r.some((c) => c.trim()))
		.map((r) => ({
			name: `${r[first] ?? ''} ${last >= 0 ? (r[last] ?? '') : ''}`.trim(),
			linkedin: url >= 0 ? linkedinProfile(r[url] ?? '') : null,
			company: company >= 0 ? (r[company] ?? '').trim() : '',
			connectedOn: on >= 0 ? connectedOnDate(r[on] ?? '') : null
		}));
}

/** What the browser sends, cleaned again: anything that isn't a connection is dropped. */
export function cleanConnections(json: unknown): Connection[] {
	if (!Array.isArray(json)) return [];
	return json.flatMap((c) => {
		if (!c || typeof c !== 'object') return [];
		const { name, linkedin, company, connectedOn } = c as Record<string, unknown>;
		if (typeof name !== 'string' || !name.trim()) return [];
		return [
			{
				name: name.trim().slice(0, 200),
				linkedin: typeof linkedin === 'string' ? linkedinProfile(linkedin) : null,
				company: typeof company === 'string' ? company.trim().slice(0, 200) : '',
				connectedOn:
					typeof connectedOn === 'number' && Number.isFinite(connectedOn) ? connectedOn : null
			}
		];
	});
}
