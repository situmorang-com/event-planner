import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createToken, listTokens, revokeToken, verifyBearer } from './api-tokens';
import { blockCompany } from './companies';
import { createDb, type DB } from './database';
import { createEvent, getEvent } from './events';
import { addInvitations, listInvitations } from './invitations';
import {
	acceptSuggestion,
	addSuggestions,
	addTargets,
	countAcceptedSuggestions,
	extractSuggestions,
	getBrief,
	listSuggestions,
	listTargets,
	markResearched,
	markResearchRequested,
	parseTargets,
	researchPrompt,
	researchTargets,
	saveBrief,
	setSuggestionStatus,
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

describe('planning', () => {
	let db: DB;
	let eventId: string;

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

	it('only adds people nobody has seen yet', () => {
		addInvitations(db, eventId, [
			{
				name: 'Bapak Hendra Gunawan',
				company: 'Batavia Foods',
				jobTitle: '',
				email: null,
				phone: null
			}
		]);
		expect(
			addSuggestions(db, eventId, [
				person('Rina Wijaya', { linkedin: 'linkedin.com/in/rina-wijaya-4a1b2c' }),
				person('Hendra Gunawan'),
				person('', { company: 'Batavia Foods' }),
				person('Andi Pratama', { sourceUrl: 'javascript:alert(1)' })
			])
		).toEqual({ added: 2, skipped: 2 });

		const [rina, andi] = listSuggestions(db, eventId);
		expect(rina.linkedin).toBe('https://www.linkedin.com/in/rina-wijaya-4a1b2c');
		expect(andi.source_url).toBe('');

		setSuggestionStatus(db, eventId, andi.id, 'dismissed');
		const again = addSuggestions(db, eventId, [
			person('R. Wijaya', {
				company: 'Selat',
				linkedin: 'https://linkedin.com/in/rina-wijaya-4a1b2c'
			}),
			person('andi pratama', { company: 'PT Batavia Foods' })
		]);
		expect(again).toEqual({ added: 0, skipped: 2 });
	});

	it('puts an approved suggestion on the guest list, once', () => {
		addSuggestions(db, eventId, [
			person('Rina Wijaya', { linkedin: 'https://www.linkedin.com/in/rina-wijaya-4a1b2c' })
		]);
		const [{ id }] = listSuggestions(db, eventId);
		expect(acceptSuggestion(db, eventId, id)).toBe('Rina Wijaya');
		expect(acceptSuggestion(db, eventId, id)).toBeNull();
		expect(listInvitations(db, eventId)).toEqual([
			expect.objectContaining({
				name: 'Rina Wijaya',
				company: 'Batavia Foods',
				job_title: 'CFO',
				linkedin: 'https://www.linkedin.com/in/rina-wijaya-4a1b2c',
				reply: 'pending'
			})
		]);
		expect(listSuggestions(db, eventId)).toEqual([]);
		expect(countAcceptedSuggestions(db, eventId)).toBe(1);
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
		addInvitations(db, eventId, [
			{
				name: 'Hendra Gunawan',
				company: 'PT Batavia Foods',
				jobTitle: '',
				email: null,
				phone: null
			}
		]);
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

	it('researches the companies that still need people, and never a blocked one', () => {
		saveBrief(db, eventId, { ...getBrief(db, eventId), roles: 'CFO', perCompany: 1 });
		addTargets(db, eventId, parseTargets('Batavia Foods\nSelat Energy\nKopi Kita'));
		addInvitations(db, eventId, [
			{ name: 'Hendra Gunawan', company: 'Batavia Foods', jobTitle: '', email: null, phone: null }
		]);
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
