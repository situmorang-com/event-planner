import { error, json } from '@sveltejs/kit';
import { DEFAULT_PHONE_COUNTRY } from '$lib/server/config';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { COLUMN_LABEL, COLUMNS, parseGuestList, readColumns } from '$lib/server/guest-list';
import { cleanText } from '$lib/server/normalize';
import type { RequestHandler } from './$types';

/**
 * Splits typed, pasted or uploaded lines into fields for the organizer to check before anything
 * is saved. Lines without a name come back too, named '', so they can be filled in. Numbers are
 * read with the event's phone country (D14). The detected column mapping comes back with the
 * rows, and a mapping sent in `columns` is used instead of it (§4.2).
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');
	const body = (await request.json().catch(() => ({}))) as {
		company?: unknown;
		names?: unknown;
		columns?: unknown;
		header?: unknown;
	};
	const text = String(body.names ?? '');
	if (text.length > 2_000_000) error(413, 'Too large');
	const parsed = parseGuestList(text, {
		company: cleanText(body.company, 120),
		country: event.phone_country || DEFAULT_PHONE_COUNTRY,
		keepNameless: true,
		columns: readColumns(body.columns),
		header: body.header === undefined ? undefined : body.header !== false
	});
	return json(
		{
			guests: parsed.guests,
			truncated: parsed.truncated,
			headers: parsed.headers,
			header: parsed.header,
			columns: parsed.columns,
			d365: parsed.d365,
			options: COLUMNS.map((c) => ({ key: c, label: COLUMN_LABEL[c] }))
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
