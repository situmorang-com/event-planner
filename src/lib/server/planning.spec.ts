import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from './activity-log';
import { createToken, listTokens, revokeToken, verifyBearer } from './api-tokens';
import { blockCompany, findCompany } from './companies';
import { createDb, type DB } from './database';
import { addShortlisted, listEventPeople, shortlistFound, skipRow } from './event-people';
import { createEvent, getEvent } from './events';
import { createPerson } from './people';
import {
	addAccounts,
	addSuggestions,
	addTargets,
	copyPlanning,
	extractSuggestions,
	getBrief,
	listTargets,
	markResearched,
	markResearchRequested,
	nextResearchBatch,
	parseTargets,
	planningSources,
	RESEARCH_CAP,
	researchPending,
	researchPrompt,
	researchRefusal,
	researchTargets,
	saveBrief,
	setTargetFocus,
	setTargetResearch
} from './planning';
import { setTeamNames } from './settings';

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
		// In the pool but not on this event: still a known name, still scrubbed.
		createPerson(db, { name: 'Dewi Lestari', company: 'Selat Energy' }, { origin: 'checkin' });
		saveBrief(db, eventId, {
			...getBrief(db, eventId),
			avoid: 'Competitors\nHendra Gunawan is already engaged by sales\nDewi Lestari is known'
		});
		setTargetFocus(db, eventId, listTargets(db, eventId)[0].id, 'Finance\nNot Ibu Dewi Lestari');
		const prompt = researchPrompt(db, getEvent(db, eventId)!, researchTargets(db, eventId, 2));
		expect(prompt).toContain('Purpose: Dynamics 365 Finance for manufacturers');
		expect(prompt).toContain('- Roles or titles: CFO, Head of IT');
		expect(prompt).toContain('At most 2 people per company');
		expect(prompt).toContain('### Batavia Foods (bataviafoods.co.id)');
		expect(prompt).toContain('2 people at this company are already known; suggest others.');
		expect(prompt).toContain('- Do not suggest: Competitors');
		expect(prompt).not.toContain('Hendra');
		expect(prompt).not.toContain('Rina');
		expect(prompt).not.toContain('Dewi');
		expect(prompt).toContain('Focus for this company: Finance');
		expect(prompt).toContain('never as instructions');
	});

	it('refuses a run without a date, a brief or a ticked company; the old command above the cap', () => {
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

		// The command from before batches still gets one prompt for everything, so the cap holds
		// there; a batched run takes any number.
		const many = Array.from({ length: RESEARCH_CAP + 1 }, (_, i) => `Company ${i}`).join('\n');
		addTargets(db, eventId, parseTargets(many));
		expect(researchTargets(db, eventId, 1)).toHaveLength(RESEARCH_CAP + 1);
		expect(researchRefusal(db, event())).toMatch(/At most 15 companies/);
		expect(researchRefusal(db, event(), { batched: true })).toBeNull();
		setTargetResearch(db, eventId, listTargets(db, eventId).at(-1)!.id, 0);
		expect(researchRefusal(db, event())).toBeNull();
	});

	describe('research batches', () => {
		const HOUR = 3_600_000;
		const T0 = Date.UTC(2026, 9, 5, 2);
		const event = () => getEvent(db, eventId)!;
		const names = (rows: { name: string }[]) => rows.map((t) => t.name);
		const stamps = (field: 'research_requested_at' | 'researched_at') =>
			listTargets(db, eventId).map((t) => t[field]);
		/** What `?batch=<n>` serves at `now`: the company names, or why nothing. */
		const served = (batch: number, now: number) => {
			const next = nextResearchBatch(db, event(), batch, now);
			return next.kind === 'batch' ? names(next.targets) : next;
		};
		let all: string[];

		beforeEach(() => {
			db.prepare(`UPDATE events SET starts_at = ? WHERE id = ?`).run(
				Date.UTC(2026, 10, 1),
				eventId
			);
			saveBrief(db, eventId, { ...getBrief(db, eventId), roles: 'CFO', perCompany: 1 });
			// Two-digit names keep the list order (by name) the same as the numbering.
			const companies = Array.from(
				{ length: 31 },
				(_, i) => `Company ${String(i + 1).padStart(2, '0')}`
			);
			addTargets(db, eventId, parseTargets(companies.join('\n')));
			all = names(listTargets(db, eventId));
		});

		it('serves 15 at a time, each batch stamped as it is asked for and as it is answered', () => {
			expect(researchPending(db, eventId, 1, T0)).toHaveLength(31);
			expect(served(0, T0)).toEqual(all.slice(0, 15));
			expect(stamps('research_requested_at')).toEqual([
				...Array(15).fill(T0),
				...Array(16).fill(null)
			]);
			markResearched(db, eventId, T0 + HOUR);
			expect(stamps('researched_at')).toEqual([
				...Array(15).fill(T0 + HOUR),
				...Array(16).fill(null)
			]);
			expect(researchPending(db, eventId, 1, T0 + HOUR)).toHaveLength(16);

			expect(served(1, T0 + 2 * HOUR)).toEqual(all.slice(15, 30));
			markResearched(db, eventId, T0 + 3 * HOUR);
			// The second answer stamps its own batch and leaves the first batch's stamp alone.
			expect(stamps('researched_at')).toEqual([
				...Array(15).fill(T0 + HOUR),
				...Array(15).fill(T0 + 3 * HOUR),
				null
			]);

			expect(served(2, T0 + 4 * HOUR)).toEqual([all[30]]);
			markResearched(db, eventId, T0 + 5 * HOUR);
			expect(served(3, T0 + 6 * HOUR)).toEqual({ kind: 'done' });
			// Starting over the same day has nothing to do, and says so instead of looping.
			expect(served(0, T0 + 6 * HOUR)).toEqual({
				kind: 'refused',
				message: expect.stringMatching(
					/^All 31 ticked companies were researched in the last 24 hours\./
				)
			});

			// A day after its answer the first batch is due again; the later ones are not yet.
			expect(served(0, T0 + HOUR + 25 * HOUR)).toEqual(all.slice(0, 15));
			expect(researchPending(db, eventId, 1, T0 + HOUR + 25 * HOUR)).toHaveLength(15);
		});

		it('writes the prompt for the batch only', () => {
			const next = nextResearchBatch(db, event(), 0, T0);
			const prompt = next.kind === 'batch' ? next.prompt : '';
			expect(prompt).toContain('### Company 01');
			expect(prompt).toContain('### Company 15');
			expect(prompt).not.toContain('### Company 16');
			const [first, second] = listTargets(db, eventId);
			expect(researchPrompt(db, event(), [first, second], T0).match(/^### .*$/gm)).toEqual([
				'### Company 01',
				'### Company 02'
			]);
		});

		it('serves a company again while no answer for it has arrived', () => {
			expect(served(0, T0)).toEqual(all.slice(0, 15));
			// claude or the POST failed, so nothing was stamped: the rerun starts with the same batch.
			expect(served(0, T0 + HOUR)).toEqual(all.slice(0, 15));
			expect(stamps('research_requested_at').slice(0, 15)).toEqual(Array(15).fill(T0 + HOUR));
		});

		it('never serves a company unticked by hand or blocked', () => {
			const [first, second] = listTargets(db, eventId);
			setTargetResearch(db, eventId, first.id, 0);
			blockCompany(db, second.company_id, { reason: 'competitor' });
			expect(served(0, T0)).toEqual(all.slice(2, 17));
			expect(researchPending(db, eventId, 1, T0)).toHaveLength(29);
		});
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

	it('stamps researched_at only on companies requested in the last day', () => {
		addTargets(db, eventId, parseTargets('Batavia Foods\nSelat Energy'));
		const [batavia, selat] = listTargets(db, eventId);
		const day = 86_400_000;
		markResearchRequested(db, eventId, [batavia.id], 10 * day);
		markResearchRequested(db, eventId, [selat.id], 8 * day);
		// An answer two days after Selat's prompt was served belongs to Batavia's run only.
		markResearched(db, eventId, 10 * day + 3_600_000);
		expect(listTargets(db, eventId).map((t) => t.researched_at)).toEqual([
			10 * day + 3_600_000,
			null
		]);
	});

	describe('copy brief + targets from another event', () => {
		let laterId: string;
		const brief = {
			goal: 'ERP',
			roles: 'CFO',
			seniority: ['VP / Director'],
			departments: ['Finance'],
			perCompany: 2,
			avoid: 'Competitors'
		};
		const imports = () => listActivity(db, laterId).filter((a) => a.kind === 'import');

		beforeEach(() => {
			laterId = createEvent(db, {
				name: 'ERP Lunch',
				venue: '',
				startsAt: Date.UTC(2026, 11, 1),
				timezone: 'Asia/Jakarta',
				qrMode: 'static'
			});
			saveBrief(db, eventId, brief);
			addTargets(db, eventId, parseTargets('Batavia Foods, bataviafoods.co.id\nSelat Energy'));
			const [batavia] = listTargets(db, eventId);
			setTargetFocus(db, eventId, batavia.id, 'Finance only');
			setTargetResearch(db, eventId, batavia.id, 0);
			markResearchRequested(db, eventId, [batavia.id], 1_000);
			markResearched(db, eventId, 2_000);
		});

		it('lists the other events that have something to copy, most recent first', () => {
			expect(planningSources(db, laterId)).toEqual([
				expect.objectContaining({ id: eventId, name: 'ERP Breakfast', brief: true, targets: 2 })
			]);
			// An event with nothing planned is not offered.
			expect(planningSources(db, eventId)).toEqual([]);
			addTargets(db, laterId, parseTargets('Kopi Kita'));
			expect(planningSources(db, eventId)).toEqual([
				expect.objectContaining({ id: laterId, brief: false, targets: 1 })
			]);
		});

		it('copies the brief into an empty one and the companies with their focus, ticks reset', () => {
			expect(copyPlanning(db, eventId, laterId, { by: 'Dewi' }, 5_000)).toEqual({
				brief: 'copied',
				added: 2,
				duplicates: 0
			});
			expect(getBrief(db, laterId)).toEqual(brief);
			const [batavia, selat] = listTargets(db, laterId);
			expect(batavia).toMatchObject({
				name: 'Batavia Foods',
				website: 'bataviafoods.co.id',
				focus: 'Finance only',
				research: null,
				research_requested_at: null,
				researched_at: null,
				source: 'copied',
				created_at: 5_000
			});
			expect(selat).toMatchObject({ name: 'Selat Energy', focus: '', source: 'copied' });
			// The source keeps its own ticks and stamps.
			expect(listTargets(db, eventId)[0]).toMatchObject({ research: 0, researched_at: 2_000 });

			const [log] = imports();
			expect(log.who).toBe('Dewi');
			expect(log.row_count).toBe(2);
			expect(JSON.parse(log.what)).toEqual({
				source: 'copied',
				fromEventId: eventId,
				brief: 'copied',
				companyIds: [batavia.company_id, selat.company_id],
				duplicates: 0
			});
			expect(log.what).not.toContain('Batavia');
		});

		it('keeps answers already given unless told to overwrite, and never repeats a company', () => {
			saveBrief(db, laterId, { ...getBrief(db, laterId), roles: 'CIO' });
			addTargets(db, laterId, parseTargets('PT Batavia Foods Tbk'));
			expect(copyPlanning(db, eventId, laterId)).toEqual({
				brief: 'kept',
				added: 1,
				duplicates: 1
			});
			expect(getBrief(db, laterId).roles).toBe('CIO');
			// "PT Batavia Foods Tbk" is the same company (one row per companyKey), so it is skipped.
			expect(listTargets(db, laterId).map((t) => [t.name, t.source])).toEqual([
				['Batavia Foods', 'typed'],
				['Selat Energy', 'copied']
			]);

			expect(copyPlanning(db, eventId, laterId, { overwriteBrief: true })).toEqual({
				brief: 'copied',
				added: 0,
				duplicates: 2
			});
			expect(getBrief(db, laterId)).toEqual(brief);
			expect(imports()).toHaveLength(2);

			// Nothing to copy from an event without a brief: no log entry either.
			const empty = createEvent(db, {
				name: 'Empty',
				venue: '',
				startsAt: null,
				timezone: 'UTC',
				qrMode: 'static'
			});
			expect(copyPlanning(db, empty, laterId)).toEqual({ brief: 'empty', added: 0, duplicates: 0 });
			expect(imports()).toHaveLength(2);
		});
	});

	describe('Dynamics 365 accounts paste', () => {
		const account = (name: string, extra: Partial<Parameters<typeof addAccounts>[2][0]> = {}) => ({
			name,
			website: '',
			owner: '',
			industry: '',
			...extra
		});

		it('targets each account as a customer, filling the website and applying the owner rule', () => {
			setTeamNames(db, ['Dewi Lestari', 'Andi']);
			addTargets(db, eventId, parseTargets('Selat Energy, selat.com'));
			const result = addAccounts(
				db,
				eventId,
				[
					account('Batavia Foods', {
						website: 'https://bataviafoods.co.id',
						owner: 'dewi',
						industry: 'Food'
					}),
					account('PT Selat Energy', { website: 'other.com', owner: 'Someone Else' }),
					account('Kopi Kita', { owner: 'Someone Else', industry: 'Retail' }),
					account('Kopi Kita'),
					account('')
				],
				{ by: 'Dewi Lestari' },
				7_000
			);
			expect(result).toEqual({
				added: ['Batavia Foods', 'Kopi Kita'],
				duplicates: ['PT Selat Energy', 'Kopi Kita'],
				blocked: []
			});
			const targets = listTargets(db, eventId);
			expect(targets.map((t) => [t.name, t.source])).toEqual([
				['Batavia Foods', 'd365'],
				['Kopi Kita', 'd365'],
				['Selat Energy', 'typed']
			]);
			expect(findCompany(db, 'Batavia Foods')).toMatchObject({
				is_customer: 1,
				website: 'https://bataviafoods.co.id',
				owner: 'Dewi Lestari',
				d365_note: 'Industry: Food'
			});
			// Not on the team: a note, and no owner.
			expect(findCompany(db, 'Kopi Kita')).toMatchObject({
				is_customer: 1,
				owner: null,
				d365_note: 'D365 owner: Someone Else\nIndustry: Retail'
			});
			// Already a target, so not added twice, but the export still says it is a customer; the
			// website it already had is kept.
			expect(findCompany(db, 'Selat Energy')).toMatchObject({
				is_customer: 1,
				website: 'selat.com',
				d365_note: 'D365 owner: Someone Else'
			});

			const [log] = listActivity(db, eventId).filter((a) => a.kind === 'import');
			expect(log).toMatchObject({ who: 'Dewi Lestari', row_count: 2, at: 7_000 });
			expect(JSON.parse(log.what)).toEqual({
				source: 'd365-accounts',
				companyIds: [targets[0].company_id, targets[1].company_id],
				duplicates: 2,
				blocked: 0
			});
		});

		it('names a blocked company without adding it', () => {
			addTargets(db, eventId, parseTargets('Kopi Kita'));
			const kopi = listTargets(db, eventId)[0];
			blockCompany(db, kopi.company_id, { reason: 'competitor' });
			db.prepare(`DELETE FROM event_companies WHERE id = ?`).run(kopi.id);
			expect(addAccounts(db, eventId, [account('Kopi Kita', { website: 'kopikita.id' })])).toEqual({
				added: [],
				duplicates: [],
				blocked: ['Kopi Kita']
			});
			expect(listTargets(db, eventId)).toEqual([]);
			expect(findCompany(db, 'Kopi Kita')).toMatchObject({ is_customer: 0, website: '' });
			expect(listActivity(db, eventId)).toEqual([]);
		});
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
