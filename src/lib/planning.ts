/** The answers to "who should come?" for one event, as the planning page asks them. */
export interface Brief {
	/** What the event is for, in a sentence or two. */
	goal: string;
	/** Job titles worth inviting: "CIO, CFO, ERP lead". */
	roles: string;
	seniority: string[];
	departments: string[];
	/** Most people to suggest per target company. */
	perCompany: number;
	/** Who not to suggest: competitors, interns, people already engaged by sales… */
	avoid: string;
}

export const SENIORITY = [
	'C-level / owner',
	'VP / Director',
	'Head / Manager',
	'Specialist / Lead'
];

export const DEPARTMENTS = [
	'Executive',
	'IT',
	'Finance',
	'Operations',
	'Supply chain',
	'Sales & marketing',
	'HR'
];

export const EMPTY_BRIEF: Brief = {
	goal: '',
	roles: '',
	seniority: [],
	departments: [],
	perCompany: 3,
	avoid: ''
};

/** Enough of a brief to research against: something about who, not just what. */
export function briefIsReady(b: Brief): boolean {
	return !!(b.roles.trim() || b.seniority.length || b.departments.length);
}

/** Nothing answered yet (the per-company number alone is a default, not an answer). */
export function briefIsEmpty(b: Brief): boolean {
	return !(
		b.goal.trim() ||
		b.roles.trim() ||
		b.seniority.length ||
		b.departments.length ||
		b.avoid.trim()
	);
}

/** The shell variable the research command reads the API token from (§6.2). */
export const RESEARCH_TOKEN_VAR = 'EVENT_PLANNER_TOKEN';

/**
 * Companies per batch (§6.2). One `claude -p` session over more than this runs for hours, gives
 * an answer long enough to be cut off, and loses all of it if the last step fails.
 */
export const RESEARCH_CAP = 15;

/** Why a run has nothing to do: every ticked company was answered today (§6.2). */
export function researchedAllMessage(ticked: number): string {
	const who = ticked === 1 ? 'The only ticked company was' : `All ${ticked} ticked companies were`;
	return `${who} researched in the last 24 hours. Tick another company, or remove and re-add one to research it again today.`;
}

/**
 * The pipeline the organizer runs, once per batch: curl fetches the next brief with the token,
 * claude -p researches it with web tools only, and curl posts the answer back before the next
 * batch is asked for. Claude never sees the token. A refusal (409) at the first batch ends up in
 * $brief and is printed; an empty body (204) means nothing is left and ends the loop quietly;
 * a failed claude or POST clears $brief first, so the prompt is never echoed as if it were an
 * error. Plain POSIX constructs, so it reads the same in zsh and bash.
 */
export function researchCommand(base: string, eventId: string): string {
	const auth = `-H "Authorization: Bearer $${RESEARCH_TOKEN_VAR}"`;
	const promptUrl = `${base}/api/research/events/${eventId}/prompt`;
	const postUrl = `${base}/api/research/events/${eventId}/suggestions`;
	return [
		`n=0; while brief=$(curl -sS --fail-with-body ${auth} "${promptUrl}?batch=$n") && [ -n "$brief" ]; do`,
		`  n=$((n+1)); echo "Batch $n: researching up to ${RESEARCH_CAP} companies…" >&2`,
		`  printf '%s' "$brief" \\`,
		`    | claude -p --tools "WebSearch WebFetch" --allowedTools "WebSearch WebFetch" --output-format json \\`,
		`    | tee "event-planner-research-${eventId}-$(date +%H%M%S).json" \\`,
		`    | curl -sS --fail-with-body ${auth} -H "content-type: application/json" --data-binary @- ${postUrl} || { brief=; break; }`,
		`done; [ -n "$brief" ] && echo "$brief" >&2; echo "Finished: $n batch(es)."`
	].join('\n');
}
