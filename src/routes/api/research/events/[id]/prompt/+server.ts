import { error, text } from '@sveltejs/kit';
import { verifyBearer } from '$lib/server/api-tokens';
import { db } from '$lib/server/db';
import { getEvent } from '$lib/server/events';
import { briefIsReady } from '$lib/planning';
import {
	getBrief,
	listTargets,
	markResearchRequested,
	RESEARCH_CAP,
	researchPrompt,
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
	// Stop before Claude spends anything on a brief with nothing to research.
	if (event.starts_at === null) error(409, 'Set the event date first.');
	const brief = getBrief(db, event.id);
	if (!briefIsReady(brief))
		error(
			409,
			'Answer “Who should come?” on the Planning page first (roles, seniority or departments).'
		);
	if (!listTargets(db, event.id).length)
		error(409, 'Add at least one target company on the Planning page first.');
	const targets = researchTargets(db, event.id, brief.perCompany);
	if (!targets.length) error(409, 'No target company is ticked for research.');
	if (targets.length > RESEARCH_CAP)
		error(409, `At most ${RESEARCH_CAP} companies per run; untick some on the Planning page.`);
	markResearchRequested(
		db,
		event.id,
		targets.map((t) => t.id)
	);
	return text(researchPrompt(db, event), {
		headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' }
	});
};
