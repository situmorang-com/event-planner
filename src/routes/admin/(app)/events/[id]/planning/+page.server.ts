import { error, fail } from '@sveltejs/kit';
import { DEPARTMENTS, SENIORITY, type Brief } from '$lib/planning';
import { countCheckins } from '$lib/server/checkins';
import { db } from '$lib/server/db';
import { countLive, countToReview, listEventPeople } from '$lib/server/event-people';
import { getEvent, setInvitationText } from '$lib/server/events';
import { eventPageLoad } from '$lib/server/jobs';
import { languageFor } from '$lib/server/messaging';
import { DEFAULT_TEMPLATES, PLACEHOLDERS } from '$lib/server/message-templates';
import { cleanText } from '$lib/server/normalize';
import {
	addTargets,
	getBrief,
	listTargets,
	parseTargets,
	removeTarget,
	RESEARCH_CAP,
	researchRefusal,
	saveBrief,
	setTargetFocus,
	setTargetResearch
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
	const now = Date.now();
	// The start job runs lazily here until the scheduler lands (§5.4).
	const event = eventPageLoad(db, requireEvent(params.id), now);
	const rows = listEventPeople(db, event.id);
	const brief = getBrief(db, event.id);

	// Per company: who is on the list, and who research found that nobody has looked at yet.
	const live = new Map<string, number>();
	const waiting = new Map<string, number>();
	for (const r of rows) {
		const counts = r.stage === 'found' ? (r.skipped_at ? null : waiting) : live;
		counts?.set(r.company_key, (counts.get(r.company_key) ?? 0) + 1);
	}

	const targets = listTargets(db, event.id).map((t) => {
		// The default tick (§6.2): research a company until enough contactable people are known.
		const defaultTick = t.known < brief.perCompany;
		return {
			id: t.id,
			name: t.name,
			website: t.website,
			focus: t.focus,
			live: live.get(t.key) ?? 0,
			waiting: waiting.get(t.key) ?? 0,
			known: t.known,
			blocked: t.blocked_at !== null,
			phoneCountry: t.phone_country,
			research: t.research,
			defaultTick,
			ticked: !t.blocked_at && !!(t.research ?? (defaultTick ? 1 : 0)),
			researchedAt: t.researched_at,
			requestedAt: t.research_requested_at
		};
	});

	return {
		event,
		brief,
		targets,
		ticked: targets.filter((t) => t.ticked).length,
		cap: RESEARCH_CAP,
		refusal: researchRefusal(db, event),
		started: event.starts_at !== null && now >= event.starts_at,
		toReview: countToReview(db, event.id),
		accepted: rows.filter((r) => r.stage !== 'found' && r.source === 'research').length,
		// The per-event invitation wording (D21) and what it replaces when left blank.
		invitation: {
			text: event.invitation_text ?? '',
			language: languageFor(event),
			fallback: DEFAULT_TEMPLATES.invitation[languageFor(event)],
			placeholders: PLACEHOLDERS
		},
		base: publicBaseUrl(url).base,
		now,
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

	// The research tick (D25): "1" / "0" is an explicit choice, anything else the computed default.
	research: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = idOf(form);
		const value = form.get('research');
		if (id) setTargetResearch(db, event.id, id, value === '1' ? 1 : value === '0' ? 0 : null);
		return { researchSet: id };
	},

	// The event's own invitation wording (D21); blank goes back to the message default.
	invitation: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const text = String((await request.formData()).get('text') ?? '').slice(0, 2000);
		setInvitationText(db, event.id, text);
		return { invitationSaved: true };
	},

	removeTarget: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const id = idOf(await request.formData());
		if (id) removeTarget(db, event.id, id);
		return { targetRemoved: id };
	}
};
