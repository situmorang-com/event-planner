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

/** The shell variable the research command reads the API token from (§6.2). */
export const RESEARCH_TOKEN_VAR = 'EVENT_PLANNER_TOKEN';

/**
 * The one-line pipeline the organizer runs: curl fetches the brief with the token, claude -p
 * researches it with web tools only, and curl posts the answer back. Claude never sees the
 * token, and the app refuses the brief (printing why) before Claude spends anything.
 */
export function researchCommand(base: string, eventId: string): string {
	const auth = `-H "Authorization: Bearer $${RESEARCH_TOKEN_VAR}"`;
	const promptUrl = `${base}/api/research/events/${eventId}/prompt`;
	const postUrl = `${base}/api/research/events/${eventId}/suggestions`;
	return [
		`brief=$(curl -sS --fail-with-body ${auth} ${promptUrl}) || { echo "$brief" >&2; false; } \\`,
		`  && printf '%s' "$brief" \\`,
		`  | claude -p --tools "WebSearch WebFetch" --allowedTools "WebSearch WebFetch" --output-format json \\`,
		`  | tee "event-planner-research-${eventId}-$(date +%H%M).json" \\`,
		`  | curl -sS --fail-with-body ${auth} -H "content-type: application/json" --data-binary @- ${postUrl}`
	].join('\n');
}
