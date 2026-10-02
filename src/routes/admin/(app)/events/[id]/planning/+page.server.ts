import { error, fail } from '@sveltejs/kit';
import { DEPARTMENTS, SENIORITY, type Brief } from '$lib/planning';
import { createToken, listTokens, revokeToken } from '$lib/server/api-tokens';
import { countCheckins } from '$lib/server/checkins';
import { db } from '$lib/server/db';
import { countLive, countToReview, listEventPeople } from '$lib/server/event-people';
import { getEvent } from '$lib/server/events';
import { cleanText } from '$lib/server/normalize';
import {
	addTargets,
	getBrief,
	listTargets,
	parseTargets,
	removeTarget,
	saveBrief,
	setTargetFocus
} from '$lib/server/planning';
import { publicBaseUrl } from '$lib/server/urls';
import type { Actions, PageServerLoad } from './$types';

function requireEvent(id: string) {
	const event = getEvent(db, id);
	if (!event) error(404, 'Event not found');
	return event;
}

const idOf = (form: FormData, field = 'id') => {
	const id = Number(form.get(field));
	return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const load: PageServerLoad = ({ params, url }) => {
	const event = requireEvent(params.id);
	const rows = listEventPeople(db, event.id);

	// Per company: who is on the list, and who research found that nobody has looked at yet.
	const live = new Map<string, number>();
	const waiting = new Map<string, number>();
	for (const r of rows) {
		const counts = r.stage === 'found' ? (r.skipped_at ? null : waiting) : live;
		counts?.set(r.company_key, (counts.get(r.company_key) ?? 0) + 1);
	}

	return {
		event,
		brief: getBrief(db, event.id),
		targets: listTargets(db, event.id).map((t) => ({
			id: t.id,
			name: t.name,
			website: t.website,
			focus: t.focus,
			live: live.get(t.key) ?? 0,
			waiting: waiting.get(t.key) ?? 0
		})),
		toReview: countToReview(db, event.id),
		accepted: rows.filter((r) => r.stage !== 'found' && r.source === 'research').length,
		tokens: listTokens(db),
		base: publicBaseUrl(url).base,
		tabs: {
			checkins: countCheckins(db, event.id),
			people: countLive(db, event.id),
			review: countToReview(db, event.id)
		}
	};
};

export const actions: Actions = {
	brief: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const perCompany = Math.round(Number(form.get('perCompany')));
		const brief: Brief = {
			goal: cleanText(form.get('goal'), 600),
			roles: cleanText(form.get('roles'), 300),
			seniority: form
				.getAll('seniority')
				.map(String)
				.filter((s) => SENIORITY.includes(s)),
			departments: [
				...form
					.getAll('departments')
					.map(String)
					.filter((d) => DEPARTMENTS.includes(d)),
				...cleanText(form.get('otherDepartments'), 200)
					.split(',')
					.map((d) => d.trim())
					.filter(Boolean)
			],
			perCompany: Number.isFinite(perCompany) ? Math.min(10, Math.max(1, perCompany)) : 3,
			avoid: cleanText(form.get('avoid'), 400)
		};
		saveBrief(db, event.id, brief);
		return { briefSaved: true };
	},

	targets: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const targets = parseTargets(String((await request.formData()).get('companies') ?? ''));
		if (!targets.length) return fail(400, { targetError: 'Add at least one company name.' });
		const { added, duplicates } = addTargets(db, event.id, targets);
		return { targetsAdded: added.length, targetDuplicates: duplicates };
	},

	focus: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = idOf(form);
		if (id) setTargetFocus(db, event.id, id, cleanText(form.get('focus'), 300));
		return { focused: id };
	},

	removeTarget: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const id = idOf(await request.formData());
		if (id) removeTarget(db, event.id, id);
		return { targetRemoved: id };
	},

	createToken: async ({ request }) => {
		const label = cleanText((await request.formData()).get('label'), 60) || 'claude -p';
		return { token: createToken(db, label) };
	},

	revokeToken: async ({ request }) => {
		const id = idOf(await request.formData());
		if (id) revokeToken(db, id);
		return { revoked: id };
	}
};
