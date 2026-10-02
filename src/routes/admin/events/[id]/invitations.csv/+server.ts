import { error } from '@sveltejs/kit';
import { REPLY_LABEL } from '$lib/invitations';
import { csvResponse, toCsv } from '$lib/server/csv';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { groupByCompany, listInvitations } from '$lib/server/invitations';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');

	const invitations = listInvitations(db, event.id);
	const iso = (ts: number | null | undefined) => (ts ? new Date(ts).toISOString() : '');
	const rows = groupByCompany(invitations).flatMap((group) =>
		group.guests.map((i) => [
			i.company,
			i.name,
			i.job_title,
			i.email,
			i.phone,
			i.linkedin,
			REPLY_LABEL[i.reply],
			i.note,
			iso(i.replied_at),
			iso(i.arrived_at),
			iso(i.created_at)
		])
	);

	const csv = toCsv(
		[
			'Company',
			'Name',
			'Job title',
			'Email',
			'Mobile',
			'LinkedIn',
			'Reply',
			'Note',
			'Replied (UTC)',
			'Checked in (UTC)',
			'Added (UTC)'
		],
		rows
	);
	return csvResponse(`${event.name}-guest-list.csv`, csv);
};
