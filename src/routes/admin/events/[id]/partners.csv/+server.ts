import { error } from '@sveltejs/kit';
import { csvResponse } from '$lib/server/csv';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { isPartnerVariant, partnerExport } from '$lib/server/exports';
import type { RequestHandler } from './$types';

/**
 * The list for the co-hosts (D15, §8): names only with the share consent, everyone else as a
 * count per company. `?when=before` is who said yes, `?when=after` who checked in. Only an
 * event with co-hosts has such a list.
 */
export const GET: RequestHandler = ({ params, url, locals }) => {
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');
	if (!event.co_hosts.trim()) error(404, 'This event has no co-hosts');
	const variant = url.searchParams.get('when') ?? 'before';
	if (!isPartnerVariant(variant)) error(400, 'when must be before or after');
	const { csv } = partnerExport(db, event.id, variant, { by: locals.who });
	return csvResponse(`${event.name}-partners-${variant}.csv`, csv);
};
