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
		expect(command).toContain('|| { brief=; end=failed; echo; break; }');
		expect(command).toContain('*) [ -n "$brief" ] && echo "$brief" >&2;');
	});

	it('tells a clean end, a failed batch and an unreachable server apart', () => {
		// Both start afresh, so running it twice in one shell cannot inherit an ending.
		expect(command).toMatch(/^n=0; end=; while /);
		// A GET that fails ends the loop as an error whether or not it carried a message; only an
		// empty 200/204 body means there is nothing left.
		expect(command).toContain('|| { end=error; false; }; do');
		expect(command).toContain('[ -n "$brief" ] || { end=done; break; }');
		// n moves on after the POST, so a failed batch is never counted as finished.
		expect(command.indexOf('\n  n=$((n+1))\n')).toBeGreaterThan(command.indexOf('break; }'));
		expect(command).toContain('"Batch $((n+1)): researching');
		expect(command).toContain('done) echo "Finished: $n batch(es).";;');
		expect(command).toContain(
			'failed) echo "Batch $((n+1)) failed after $n posted; run the command again to resume." >&2; false;;'
		);
		expect(command).toContain(
			'[ "$n" -gt 0 ] && echo "Stopped after $n posted; run the command again to resume." >&2; false;;'
		);
		expect(command.split('\n').at(-1)).toBe('esac');
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
