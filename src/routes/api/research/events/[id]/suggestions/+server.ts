import { error, text } from '@sveltejs/kit';
import { verifyBearer } from '$lib/server/api-tokens';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { addSuggestions, extractSuggestions, markResearched } from '$lib/server/planning';
import { allow } from '$lib/server/rate-limit';
import { publicBaseUrl } from '$lib/server/urls';
import type { RequestHandler } from './$types';

/**
 * Receives the agent's answer: the whole `claude -p --output-format json` envelope, or a bare
 * {"suggestions": […]}. Replies in plain text, since it lands in the organizer's terminal.
 */
export const POST: RequestHandler = async ({ params, request, url }) => {
	const token = verifyBearer(db, request.headers.get('authorization'));
	if (!token) error(401, 'Missing or revoked token');
	if (!allow(`research:${token.id}`, 60, 60_000)) error(429, 'Too many requests');
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');

	const raw = (await request.text()).trim();
	if (raw.length > 1_000_000) error(413, 'Too large');
	if (!raw)
		error(400, 'Nothing arrived from claude -p. If it failed, its own error is printed above.');
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		// Not one JSON document (a warning line before it, or plain-text output): look inside.
		body = { result: raw };
	}
	if (body && typeof body === 'object' && (body as { is_error?: unknown }).is_error === true) {
		const said = String((body as { result?: unknown }).result ?? '').slice(0, 300);
		error(502, `claude -p reported an error: ${said || 'no details'}`);
	}
	const found = extractSuggestions(body);
	if (!found) {
		const said = (
			typeof (body as { result?: unknown }).result === 'string'
				? (body as { result: string }).result
				: raw
		)
			.replace(/\s+/g, ' ')
			.slice(0, 200);
		error(422, `No {"suggestions": [...]} list in Claude's answer. It said: ${said}`);
	}

	markResearched(db, event.id);
	// Research after the start creates no Found rows: the list has gone live (§5.4).
	if (event.starts_at !== null && Date.now() >= event.starts_at)
		return text(`Event Planner: ${event.name} has started, ${found.length} names not kept.\n`);
	const { added, skipped } = addSuggestions(db, event.id, found);
	// Suggestions wait under People › To review (§4.3); Planning only counts them.
	const review = `${publicBaseUrl(url).base}/admin/events/${event.id}/people`;
	return text(
		`Event Planner: ${added} new suggestion${added === 1 ? '' : 's'} for ${event.name}` +
			`${skipped ? ` (${skipped} skipped: already known or incomplete)` : ''}.\nReview: ${review}\n`
	);
};
