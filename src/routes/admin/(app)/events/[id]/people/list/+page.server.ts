import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { peopleView } from '$lib/server/people-page';
import type { PageServerLoad } from './$types';

/** Everyone on the event with their status, for reading down one table (no message rendering). */
export const load: PageServerLoad = ({ params }) => {
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');
	const view = event.starts_at === null ? null : peopleView(db, event, null);
	return { event, rows: view?.rows ?? [], today: view?.today ?? null };
};
