import { error } from '@sveltejs/kit';
import { logActivity } from '$lib/server/activity-log';
import { listAttendees } from '$lib/server/checkins';
import { csvResponse, toCsv } from '$lib/server/csv';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { exportRow, iso } from '$lib/server/exports';
import type { RequestHandler } from './$types';

/** Who checked in, in arrival order. A locked person's channels are blanked here too (D13). */
export const GET: RequestHandler = ({ params, locals }) => {
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');

	const rows = listAttendees(db, event.id)
		.reverse()
		.map(exportRow)
		.map((a, i) => [
			i + 1,
			a.name,
			a.email,
			a.phone,
			a.company,
			a.job_title,
			iso(a.checked_in_at),
			a.method,
			a.device,
			a.is_returning ? 'yes' : 'no',
			iso(a.consent_at),
			a.locked ? 'yes' : ''
		]);
	logActivity(db, {
		eventId: event.id,
		kind: 'export',
		who: locals.who,
		what: { export: 'attendees' },
		rowCount: rows.length
	});

	const csv = toCsv(
		[
			'#',
			'Name',
			'Email',
			'Mobile',
			'Company',
			'Job title',
			'Checked in (UTC)',
			'Method',
			'Device',
			'Returning',
			'Consent given (UTC)',
			'Locked'
		],
		rows
	);
	return csvResponse(`${event.name}-attendees.csv`, csv);
};
