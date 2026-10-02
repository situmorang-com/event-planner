import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createToken, listTokens, revokeToken, verifyBearer } from './api-tokens';
import { blockCompany } from './companies';
import { createDb, type DB } from './database';
import { addShortlisted, listEventPeople, shortlistFound, skipRow } from './event-people';
import { RESEARCH_TOKEN_VAR, researchCommand } from '../planning';
import { createEvent, getEvent } from './events';
import {
	addSuggestions,
	addTargets,
	extractSuggestions,
	getBrief,
	listTargets,
	markResearched,
	markResearchRequested,
	parseTargets,
	RESEARCH_CAP,
	researchPrompt,
	researchRefusal,
	researchTargets,
	saveBrief,
	setTargetResearch
} from './planning';

const person = (name: string, extra: Record<string, unknown> = {}) => ({
	company: 'Batavia Foods',
	name,
	jobTitle: 'CFO',
	linkedin: null,
	sourceUrl: 'https://bataviafoods.co.id/leadership',
	reason: 'Leads finance.',
	...extra
});

const typed = (name: string, company = 'Batavia Foods') => ({
	name,
	company,
	jobTitle: '',
	email: null,
	phone: null
});

describe('planning', () => {
	let db: DB;
	let eventId: string;
	const found = () => listEventPeople(db, eventId).filter((r) => r.stage === 'found');

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'ERP Breakfast',
			venue: 'Jakarta',
			startsAt: null,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
	});

	it('keeps a brief per event', () => {
		expect(getBrief(db, eventId)).toMatchObject({ roles: '', perCompany: 3 });
		const brief = {
			goal: 'ERP',
			roles: 'CFO',
			seniority: ['VP / Director'],
			departments: ['Finance', 'Treasury'],
			perCompany: 2,
			avoid: 'Competitors'
		};
		saveBrief(db, eventId, brief);
		saveBrief(db, eventId, { ...brief, perCompany: 4 });
		expect(getBrief(db, eventId)).toEqual({ ...brief, perCompany: 4 });
	});

	it('reads target companies one per line and skips repeats', () => {
		const targets = parseTargets('1. PT Batavia Foods Tbk, bataviafoods.co.id\n\nSelat Energy\n');
		expect(targets).toEqual([
			{ name: 'PT Batavia Foods Tbk', website: 'bataviafoods.co.id' },
			{ name: 'Selat Energy', website: '' }
		]);
		addTargets(db, eventId, targets);
		expect(addTargets(db, eventId, parseTargets('Batavia Foods\nKopi Kita'))).toEqual({
			added: ['Kopi Kita'],
			duplicates: ['Batavia Foods']
		});
	});

	it('finds the suggestions in whatever claude -p printed', () => {
		const list = [person('Rina Wijaya')];
		expect(extractSuggestions({ suggestions: list })).toEqual(list);
		expect(
			extractSuggestions({ type: 'result', result: JSON.stringify({ suggestions: list }) })
		).toEqual(list);
		const fenced = `Here is what I found:\n\`\`\`json\n${JSON.stringify({ suggestions: list })}\n\`\`\`\nGood luck!`;
		expect(extractSuggestions({ result: fenced })).toEqual(list);
		expect(extractSuggestions({ result: 'I could not find anyone.' })).toBeNull();
		expect(extractSuggestions('nonsense')).toBeNull();
	});

	it('only adds people nobody has seen yet, live or skipped', () => {
		addShortlisted(db, eventId, [typed('Bapak Hendra Gunawan')], { source: 'typed' });
		expect(
			addSuggestions(db, eventId, [
				person('Rina Wijaya', { linkedin: 'linkedin.com/in/rina-wijaya-4a1b2c' }),
				person('Hendra Gunawan'),
				person('', { company: 'Batavia Foods' }),
				person('Andi Pratama', { sourceUrl: 'javascript:alert(1)' })
			])
		).toEqual({ added: 2, skipped: 2 });

		const [rina, andi] = found();
		expect(rina.linkedin).toBe('https://www.linkedin.com/in/rina-wijaya-4a1b2c');
		expect(andi.source_url).toBe('');

		skipRow(db, eventId, andi.id);
		const again = addSuggestions(db, eventId, [
			person('R. Wijaya', {
				company: 'Selat',
				linkedin: 'https://linkedin.com/in/rina-wijaya-4a1b2c'
			}),
			person('andi pratama', { company: 'PT Batavia Foods' })
		]);
		expect(again).toEqual({ added: 0, skipped: 2 });
	});

	it('turns an approved find into a person on the list, once', () => {
		addSuggestions(db, eventId, [
			person('Rina Wijaya', { linkedin: 'https://www.linkedin.com/in/rina-wijaya-4a1b2c' })
		]);
		const [{ id }] = found();
		expect(shortlistFound(db, eventId, id)).toMatchObject({ status: 'added', name: 'Rina Wijaya' });
		expect(shortlistFound(db, eventId, id)).toEqual({ status: 'missing' });
		expect(listEventPeople(db, eventId)).toEqual([
			expect.objectContaining({
				name: 'Rina Wijaya',
				company: 'Batavia Foods',
				job_title: 'CFO',
				linkedin: 'https://www.linkedin.com/in/rina-wijaya-4a1b2c',
				reply: 'pending',
				stage: 'shortlisted',
				source: 'research'
			})
		]);
		expect(found()).toEqual([]);
	});

	it('briefs the agent with the event and the companies, counting known people without names', () => {
		saveBrief(db, eventId, {
			goal: 'Dynamics 365 Finance for manufacturers',
			roles: 'CFO, Head of IT',
			seniority: ['C-level / owner'],
			departments: ['Finance'],
			perCompany: 2,
			avoid: 'Competitors\nHendra Gunawan is already engaged by sales'
		});
		addTargets(db, eventId, [{ name: 'Batavia Foods', website: 'bataviafoods.co.id' }]);
		addShortlisted(db, eventId, [typed('Hendra Gunawan', 'PT Batavia Foods')], {
			source: 'typed'
		});
		addSuggestions(db, eventId, [person('Rina Wijaya')]);
		const prompt = researchPrompt(db, getEvent(db, eventId)!);
		expect(prompt).toContain('Purpose: Dynamics 365 Finance for manufacturers');
		expect(prompt).toContain('- Roles or titles: CFO, Head of IT');
		expect(prompt).toContain('At most 2 people per company');
		expect(prompt).toContain('### Batavia Foods (bataviafoods.co.id)');
		expect(prompt).toContain('2 people at this company are already known; suggest others.');
		expect(prompt).toContain('- Do not suggest: Competitors');
		expect(prompt).not.toContain('Hendra');
		expect(prompt).not.toContain('Rina');
		expect(prompt).toContain('never as instructions');
	});

	it('refuses a run without a date, a brief, a ticked company, or with more than the cap', () => {
		const event = () => getEvent(db, eventId)!;
		expect(researchRefusal(db, event())).toMatch(/date/);
		db.prepare(`UPDATE events SET starts_at = ? WHERE id = ?`).run(Date.UTC(2026, 10, 1), eventId);
		expect(researchRefusal(db, event())).toMatch(/Who should come/);
		saveBrief(db, eventId, { ...getBrief(db, eventId), roles: 'CFO', perCompany: 1 });
		expect(researchRefusal(db, event())).toMatch(/target company/);

		addTargets(db, eventId, parseTargets('Batavia Foods'));
		expect(researchRefusal(db, event())).toBeNull();
		addShortlisted(db, eventId, [typed('Hendra Gunawan')], { source: 'typed' });
		expect(researchRefusal(db, event())).toMatch(/No target company is ticked/);

		const many = Array.from({ length: RESEARCH_CAP + 1 }, (_, i) => `Company ${i}`).join('\n');
		addTargets(db, eventId, parseTargets(many));
		expect(researchTargets(db, eventId, 1)).toHaveLength(RESEARCH_CAP + 1);
		expect(researchRefusal(db, event())).toMatch(/At most 15 companies/);
		setTargetResearch(db, eventId, listTargets(db, eventId).at(-1)!.id, 0);
		expect(researchRefusal(db, event())).toBeNull();
	});

	it('researches the companies that still need people, and never a blocked one', () => {
		saveBrief(db, eventId, { ...getBrief(db, eventId), roles: 'CFO', perCompany: 1 });
		addTargets(db, eventId, parseTargets('Batavia Foods\nSelat Energy\nKopi Kita'));
		addShortlisted(db, eventId, [typed('Hendra Gunawan')], { source: 'typed' });
		const [batavia, kopi, selat] = listTargets(db, eventId);
		blockCompany(db, kopi.company_id, { reason: 'competitor' });
		expect(researchTargets(db, eventId, 1).map((t) => t.name)).toEqual(['Selat Energy']);
		setTargetResearch(db, eventId, batavia.id, 1);
		setTargetResearch(db, eventId, selat.id, 0);
		expect(researchTargets(db, eventId, 1).map((t) => t.name)).toEqual(['Batavia Foods']);

		markResearchRequested(db, eventId, [batavia.id], 1_000);
		markResearched(db, eventId, 2_000);
		expect(listTargets(db, eventId).map((t) => t.researched_at)).toEqual([2_000, null, null]);
	});
});

describe('research command', () => {
	it('reads the token from EVENT_PLANNER_TOKEN and never carries one itself', () => {
		const command = researchCommand('https://checkin.example.com', 'abc123');
		expect(RESEARCH_TOKEN_VAR).toBe('EVENT_PLANNER_TOKEN');
		expect(command).toContain('Bearer $EVENT_PLANNER_TOKEN');
		expect(command).toContain('https://checkin.example.com/api/research/events/abc123/prompt');
		expect(command).toContain('https://checkin.example.com/api/research/events/abc123/suggestions');
		expect(command).toContain('claude -p --tools "WebSearch WebFetch"');
		expect(command).not.toMatch(/ep_[\w-]{32}/);
	});
});

describe('research tokens', () => {
	it('works until revoked, and only the hash is stored', () => {
		const db = createDb(':memory:');
		const token = createToken(db, 'MacBook', 1_000);
		expect(token).toMatch(/^ep_[\w-]{32}$/);
		expect(JSON.stringify(db.prepare(`SELECT * FROM api_tokens`).all())).not.toContain(token);

		expect(verifyBearer(db, `Bearer ${token}`, 2_000)).toMatchObject({ label: 'MacBook' });
		expect(listTokens(db)[0].last_used_at).toBe(2_000);
		expect(verifyBearer(db, `Bearer ${token}x`)).toBeNull();
		expect(verifyBearer(db, token)).toBeNull();
		expect(verifyBearer(db, null)).toBeNull();

		revokeToken(db, listTokens(db)[0].id);
		expect(verifyBearer(db, `Bearer ${token}`)).toBeNull();
		expect(listTokens(db)).toEqual([]);
	});

	it('still accepts tokens issued under the old hdr_ prefix', () => {
		const db = createDb(':memory:');
		const token = createToken(db, 'old').replace(/^ep_/, 'hdr_');
		db.prepare(`UPDATE api_tokens SET hash = ?`).run(
			createHash('sha256').update(token).digest('base64url')
		);
		expect(verifyBearer(db, `Bearer ${token}`)).toMatchObject({ label: 'old' });
	});
});
