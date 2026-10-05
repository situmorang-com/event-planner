import { error, fail } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import { briefIsEmpty, DEPARTMENTS, SENIORITY, type Brief } from '$lib/planning';
import {
	ACCOUNT_COLUMN_LABEL,
	ACCOUNT_COLUMNS,
	parseAccounts,
	readAccountColumns
} from '$lib/server/accounts-list';
import { CHASE_FIELDS, chaseFormValues, parseChaseForm } from '$lib/server/chase-form';
import { countCheckins } from '$lib/server/checkins';
import { db } from '$lib/server/db';
import { countLive, countToReview, listEventPeople } from '$lib/server/event-people';
import { getEvent, setChaseRules, setInvitationText } from '$lib/server/events';
import { purgePlanning } from '$lib/server/housekeeping';
import { eventPageLoad } from '$lib/server/jobs';
import { languageFor } from '$lib/server/messaging';
import {
	APPENDED_LINE_ERROR,
	containsAppendedLine,
	DEFAULT_TEMPLATES,
	LANGUAGE_LABEL,
	PLACEHOLDERS
} from '$lib/server/message-templates';
import { rulesFor } from '$lib/server/next-action';
import { cleanText } from '$lib/server/normalize';
import {
	addAccounts,
	addTargets,
	copyPlanning,
	getBrief,
	listTargets,
	parseTargets,
	planningSources,
	removeTarget,
	RESEARCH_CAP,
	researchPending,
	researchRefusal,
	saveBrief,
	setTargetFocus,
	setTargetResearch
} from '$lib/server/planning';
import { planningKeptUntil } from '$lib/server/retention';
import { chaseDefaults } from '$lib/server/settings';
import { publicBaseUrl } from '$lib/server/urls';
import { isNew } from '$lib/recent';
import type { Actions, PageServerLoad } from './$types';

function requireEvent(id: string) {
	const event = getEvent(db, id);
	if (!event) error(404, 'Event not found');
	return event;
}

/**
 * parseChaseForm's English message ("Chase after: a whole number from 0 to 30.") in the page's
 * language: the field label and the range are read back out and put in the translated template.
 */
function chaseErrorIn(lang: App.Locals['lang'], message: string) {
	const m = /^(.+): a whole number from 0 to (\d+)\.$/.exec(message);
	if (!m) return translate(lang, message);
	return translate(lang, '{field}: a whole number from 0 to {max}.', {
		field: translate(lang, m[1]),
		max: m[2]
	});
}

const idOf = (form: FormData, field = 'id') => {
	const id = Number(form.get(field));
	return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const load: PageServerLoad = ({ params, url }) => {
	const now = Date.now();
	// The start job and the next-action pass also run lazily here (§5.4), so a page opened
	// before the day's housekeeping is right.
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
			fresh: isNew(t.created_at, now),
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

	// What the next run takes on: the ticked companies not answered today, RESEARCH_CAP a batch.
	const pending = researchPending(db, event.id, brief.perCompany, now).length;

	return {
		event,
		brief,
		briefEmpty: briefIsEmpty(brief),
		// Other events whose brief or companies can be copied here (§4.3), most recent first.
		sources: planningSources(db, event.id),
		accountOptions: ACCOUNT_COLUMNS.map((c) => ({ key: c, label: ACCOUNT_COLUMN_LABEL[c] })),
		targets,
		ticked: targets.filter((t) => t.ticked).length,
		cap: RESEARCH_CAP,
		pending,
		batches: Math.ceil(pending / RESEARCH_CAP),
		refusal: researchRefusal(db, event, { batched: true }),
		started: event.starts_at !== null && now >= event.starts_at,
		toReview: countToReview(db, event.id),
		accepted: rows.filter((r) => r.stage !== 'found' && r.source === 'research').length,
		// Retention (D10): when the Found rows and research stamps go, and what is left to delete.
		retention: {
			keptUntil: planningKeptUntil(event),
			found: rows.filter((r) => r.stage === 'found').length
		},
		// The per-event invitation wording (D21) and what it replaces when left blank.
		invitation: {
			text: event.invitation_text ?? '',
			languageLabel: LANGUAGE_LABEL[languageFor(event)],
			fallback: DEFAULT_TEMPLATES.invitation[languageFor(event)],
			placeholders: PLACEHOLDERS
		},
		// The chase rules this event runs on (D20): its own, or the settings defaults.
		chase: {
			fields: CHASE_FIELDS,
			own: event.chase_rules !== null,
			values: chaseFormValues(rulesFor(db, event)),
			defaults: chaseFormValues(chaseDefaults(db))
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

	// Copy brief + targets from another event (§4.3). The page asks before a non-empty brief is
	// replaced and sends `overwrite`; without it the brief stays and only the companies come.
	copyFrom: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const from = planningSources(db, event.id).find((s) => s.id === form.get('from'));
		if (!from) return fail(400, { copyError: 'Pick an event to copy from.' });
		const result = copyPlanning(db, from.id, event.id, {
			overwriteBrief: form.get('overwrite') === '1',
			by: locals.who
		});
		return { copied: { ...result, from: from.name } };
	},

	// A Dynamics 365 accounts export (§6.1). `preview=1`, or a header the app can barely read,
	// sends the detected mapping back for the organizer to correct before anything is added.
	accounts: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const text = String(form.get('accounts') ?? '');
		if (text.length > 2_000_000) return fail(413, { accountsError: 'That paste is too big.' });
		let columns: ReturnType<typeof readAccountColumns>;
		try {
			columns = readAccountColumns(JSON.parse(String(form.get('columns') || 'null')));
		} catch {
			columns = undefined;
		}
		const parsed = parseAccounts(text, {
			columns,
			header: columns ? form.get('header') !== '0' : undefined
		});
		const matched = Object.keys(parsed.columns).length;
		const unsure = !columns && parsed.headers.length >= 2 && matched < 2;
		if (form.get('preview') === '1' || unsure) {
			return {
				accountsPreview: {
					headers: parsed.headers,
					header: parsed.header,
					columns: parsed.columns,
					count: parsed.accounts.length,
					skipped: parsed.skipped.length,
					unsure
				}
			};
		}
		if (!parsed.accounts.length)
			return fail(400, { accountsError: 'No company names found. Include the header row.' });
		const result = addAccounts(db, event.id, parsed.accounts, { by: locals.who });
		return { accounts: { ...result, skipped: parsed.skipped.length, truncated: parsed.truncated } };
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

	// The event's own invitation wording (D21); blank goes back to the message default. The
	// opt-out line is appended at render time, so a body that carries it is refused (§7).
	invitation: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const text = String((await request.formData()).get('text') ?? '').slice(0, 2000);
		if (containsAppendedLine(text)) return fail(400, { invitationError: APPENDED_LINE_ERROR });
		setInvitationText(db, event.id, text);
		return { invitationSaved: true };
	},

	// The per-event chase override (D20): "use defaults" clears it, else all five fields are kept.
	chase: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		if (form.get('useDefaults') === '1') {
			setChaseRules(db, event.id, null);
			return { chaseSaved: true };
		}
		const rules = parseChaseForm(form);
		if (typeof rules === 'string')
			return fail(400, { chaseError: chaseErrorIn(locals.lang, rules) });
		setChaseRules(db, event.id, rules);
		return { chaseSaved: true };
	},

	removeTarget: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const id = idOf(await request.formData());
		if (id) removeTarget(db, event.id, id);
		return { targetRemoved: id };
	},

	// Delete planning data (D10): every Found row and the research stamps, now; logged.
	purge: async ({ params, locals }) => {
		const event = requireEvent(params.id);
		return { purged: purgePlanning(db, event.id, { by: locals.who }) };
	}
};
