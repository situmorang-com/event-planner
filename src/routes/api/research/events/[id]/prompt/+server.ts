import { error, text } from '@sveltejs/kit';
import { verifyBearer } from '$lib/server/api-tokens';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { getBrief } from '$lib/server/planning';
import {
	markResearchRequested,
	researchPrompt,
	researchRefusal,
	researchTargets
} from '$lib/server/planning';
import { allow } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

/** The research brief for one event, piped straight into `claude -p`. */
export const GET: RequestHandler = ({ params, request }) => {
	const token = verifyBearer(db, request.headers.get('authorization'));
	if (!token) error(401, 'Missing or revoked token');
	if (!allow(`research:${token.id}`, 60, 60_000)) error(429, 'Too many requests');
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');
	// Stop before Claude spends anything on a brief with nothing to research (§6.2).
	const refusal = researchRefusal(db, event);
	if (refusal) error(409, refusal);
	const targets = researchTargets(db, event.id, getBrief(db, event.id).perCompany);
	markResearchRequested(
		db,
		event.id,
		targets.map((t) => t.id)
	);
	return text(researchPrompt(db, event), {
		headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' }
	});
};
