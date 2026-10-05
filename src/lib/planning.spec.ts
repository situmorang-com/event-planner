import { describe, expect, it } from 'vitest';
import {
	RESEARCH_CAP,
	RESEARCH_TOKEN_VAR,
	researchCommand,
	researchedAllMessage
} from './planning';

describe('researchCommand', () => {
	const command = researchCommand('https://checkin.example.com', 'abc123');

	it('reads the token from EVENT_PLANNER_TOKEN and never carries one itself', () => {
		expect(RESEARCH_TOKEN_VAR).toBe('EVENT_PLANNER_TOKEN');
		expect(command).toContain('Bearer $EVENT_PLANNER_TOKEN');
		expect(command).not.toMatch(/ep_[\w-]{32}/);
	});

	it('loops over the batches, posting each answer back before asking for the next', () => {
		expect(command).toContain(
			'"https://checkin.example.com/api/research/events/abc123/prompt?batch=$n"'
		);
		expect(command).toContain('https://checkin.example.com/api/research/events/abc123/suggestions');
		expect(command).toContain('claude -p --tools "WebSearch WebFetch"');
		expect(command).toContain(`up to ${RESEARCH_CAP} companies`);
		// A failed claude or POST must not echo the prompt as if it were the server's refusal, and
		// must end the line the error body left open before anything else is printed.
		expect(command).toContain('|| { brief=; failed=1; echo; break; }');
		expect(command).toContain('[ -n "$brief" ] && echo "$brief" >&2');
	});

	it('counts posted batches only and says which batch failed, with a status to match', () => {
		// Both counters start afresh, so running it twice in one shell cannot inherit a failure.
		expect(command).toMatch(/^n=0; failed=; while /);
		// n moves on after the POST, so a failed batch is never counted as finished.
		expect(command.indexOf('\n  n=$((n+1))\n')).toBeGreaterThan(command.indexOf('break; }'));
		expect(command).toContain('"Batch $((n+1)): researching');
		expect(command).toContain(
			'[ -n "$failed" ] && echo "Batch $((n+1)) failed after $n posted; run the command again to resume." >&2'
		);
		// The last line: "Finished" only after a clean end, and the exit status says the same.
		expect(command.split('\n').at(-1)).toBe(
			'[ -z "$brief" ] && [ -z "$failed" ] && echo "Finished: $n batch(es)."'
		);
	});
});

describe('researchedAllMessage', () => {
	it('counts the ticked companies', () => {
		expect(researchedAllMessage(31)).toBe(
			'All 31 ticked companies were researched in the last 24 hours. Tick another company, or remove and re-add one to research it again today.'
		);
		expect(researchedAllMessage(1)).toMatch(/^The only ticked company was researched/);
	});
});
