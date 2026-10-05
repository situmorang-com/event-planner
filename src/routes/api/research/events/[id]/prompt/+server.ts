import { error, text } from '@sveltejs/kit';
import { verifyBearer } from '$lib/server/api-tokens';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { getBrief } from '$lib/server/planning';
import {
	markResearchRequested,
	nextResearchBatch,
	researchPrompt,
	researchRefusal,
	researchTargets
} from '$lib/server/planning';
import { allow } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const markdown = (prompt: string) =>
	text(prompt, {
		headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' }
	});

/**
 * The research brief for one event, piped straight into `claude -p`. With `?batch=<n>` it is
 * the next RESEARCH_CAP companies not answered today, 204 once a run has nothing left (§6.2);
 * without it, the command from before batches: every ticked company, refused above the cap.
 */
export const GET: RequestHandler = ({ params, request, url }) => {
	const token = verifyBearer(db, request.headers.get('authorization'));
	if (!token) error(401, 'Missing or revoked token');
	if (!allow(`research:${token.id}`, 60, 60_000)) error(429, 'Too many requests');
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');

	const batch = url.searchParams.get('batch');
	if (batch === null) {
		// Stop before Claude spends anything on a brief with nothing to research (§6.2).
		const refusal = researchRefusal(db, event);
		if (refusal) error(409, refusal);
		const targets = researchTargets(db, event.id, getBrief(db, event.id).perCompany);
		markResearchRequested(
			db,
			event.id,
			targets.map((t) => t.id)
		);
		return markdown(researchPrompt(db, event, targets));
	}
	if (!/^\d{1,9}$/.test(batch)) error(400, 'batch must be a whole number, counting from 0');
	const next = nextResearchBatch(db, event, Number(batch));
	if (next.kind === 'refused') error(409, next.message);
	if (next.kind === 'done') return new Response(null, { status: 204 });
	return markdown(next.prompt);
};
