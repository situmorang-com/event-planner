import { error, json } from '@sveltejs/kit';
import { isMessageKind } from '$lib/people';
import { db } from '$lib/server/db';
import { getEventPerson } from '$lib/server/event-people';
import { getEvent } from '$lib/server/events';
import { rowMessage } from '$lib/server/messaging';
import { messagingEnv } from '$lib/server/messaging-env';
import type { RequestHandler } from './$types';

/**
 * One row's message for a kind picked in its menu (§7): the page carries only the suggested
 * kind's text, and fetches another here when the organizer chooses differently.
 */
export const GET: RequestHandler = ({ params, url }) => {
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');
	const id = Number(url.searchParams.get('id'));
	const kind = url.searchParams.get('kind');
	if (!Number.isSafeInteger(id) || !isMessageKind(kind)) error(400, 'Bad request');
	const row = getEventPerson(db, event.id, id);
	if (!row) error(404, 'Row not found');
	const message = rowMessage(db, { row, event }, messagingEnv(url), kind);
	return json({ message }, { headers: { 'cache-control': 'no-store' } });
};
