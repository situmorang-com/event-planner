import { error } from '@sveltejs/kit';
import { REPLY_LABEL } from '$lib/invitations';
import { effectiveOwner, STAGE_LABEL } from '$lib/people';
import { logActivity } from '$lib/server/activity-log';
import { csvResponse, toCsv } from '$lib/server/csv';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { groupRows, peopleView } from '$lib/server/people-page';
import type { RequestHandler } from './$types';

/**
 * The event's list as a spreadsheet. Found rows never leave the app (§8), and a locked
 * person's channels are blanked everywhere they are exported (D13).
 */
export const GET: RequestHandler = ({ params, locals }) => {
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');

	const live = peopleView(db, event).rows.filter((r) => r.stage !== 'found');
	const iso = (ts: number | null | undefined) => (ts ? new Date(ts).toISOString() : '');
	const rows = groupRows(live).flatMap((group) =>
		group.rows.map((r) => [
			r.company,
			r.name,
			r.job_title,
			r.locked_at ? '' : r.email,
			r.locked_at ? '' : r.phone,
			r.locked_at ? '' : r.linkedin,
			STAGE_LABEL[r.stage],
			REPLY_LABEL[r.reply],
			effectiveOwner(r),
			r.note,
			r.locked_at ? 'yes' : '',
			iso(r.invited_at),
			iso(r.replied_at),
			iso(r.confirmed_at),
			iso(r.checked_in_at),
			iso(r.consent_event_at)
		])
	);
	logActivity(db, {
		eventId: event.id,
		kind: 'export',
		who: locals.who,
		what: { export: 'people' },
		rowCount: rows.length
	});

	const csv = toCsv(
		[
			'Company',
			'Name',
			'Job title',
			'Email',
			'Mobile',
			'LinkedIn',
			'Stage',
			'Reply',
			'Owner',
			'Note',
			'Locked',
			'Invited (UTC)',
			'Replied (UTC)',
			'Confirmed (UTC)',
			'Checked in (UTC)',
			'Consent (UTC)'
		],
		rows
	);
	return csvResponse(`${event.name}-people.csv`, csv);
};
