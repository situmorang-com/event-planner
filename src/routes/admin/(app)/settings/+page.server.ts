import { fail } from '@sveltejs/kit';
import { translate, type Lang } from '$lib/i18n';
import { createToken, listTokens, revokeToken } from '$lib/server/api-tokens';
import { CHASE_FIELDS, chaseFormValues, parseChaseForm } from '$lib/server/chase-form';
import { DEFAULT_PHONE_COUNTRY } from '$lib/server/config';
import { db } from '$lib/server/db';
import { blockByHand, listEntries, removeEntry, type DncKind } from '$lib/server/do-not-contact';
import type { Language } from '$lib/server/events';
import { housekeepingRanAt, retentionCounts } from '$lib/server/housekeeping';
import {
	APPENDED_LINE_ERROR,
	containsAppendedLine,
	DEFAULT_TEMPLATES,
	isLanguage,
	KIND_LABEL,
	LANGUAGE_LABEL,
	LANGUAGES,
	listTemplates,
	MESSAGE_KINDS,
	PLACEHOLDERS,
	setTemplate,
	type MessageKind
} from '$lib/server/message-templates';
import { recomputeAll } from '$lib/server/next-action';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from '$lib/server/normalize';
import {
	LEGACY_NOTICE_DAYS,
	PLANNING_PURGE_DAYS,
	PROSPECT_MONTHS,
	type RetentionKey
} from '$lib/server/retention';
import {
	addTeamName,
	chaseDefaults,
	isCountry,
	phoneCountryDefault,
	removeTeamName,
	setChaseDefaults,
	setPhoneCountryDefault
} from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

const KINDS: DncKind[] = ['email', 'phone', 'name_company'];
const isKind = (v: unknown): v is DncKind => KINDS.includes(v as DncKind);

const idOf = (form: FormData, field = 'id') => {
	const id = Number(form.get(field));
	return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const envCountry = () => (isCountry(DEFAULT_PHONE_COUNTRY) ? DEFAULT_PHONE_COUNTRY : 'ID');

/** The message bodies as a kind × language grid, with the built-in wording where none is stored. */
function templateGrid() {
	const bodies = Object.fromEntries(
		LANGUAGES.map((l) => [
			l,
			Object.fromEntries(MESSAGE_KINDS.map((k) => [k, DEFAULT_TEMPLATES[k][l]]))
		])
	) as Record<Language, Record<MessageKind, string>>;
	for (const t of listTemplates(db)) bodies[t.language][t.kind] = t.body;
	return bodies;
}

/** The §5.4 table's two text columns in the admin's language; the numbers come from the rules. */
function retentionText(lang: Lang, key: RetentionKey): { what: string; until: string } {
	const t = (text: string, vars?: Record<string, number>) => translate(lang, text, vars);
	switch (key) {
		case 'found_unapproved':
			return { what: t('Research finds nobody approved'), until: t('the event starts') };
		case 'found_skipped':
			return {
				what: t('Research finds that were skipped'),
				until: t('{n} days after the event starts, or Delete planning data', {
					n: PLANNING_PURGE_DAYS
				})
			};
		case 'prospect':
			return {
				what: t('People found by research or typed in who never replied'),
				until: t('{n} months after their last event', { n: PROSPECT_MONTHS })
			};
		case 'legacy':
			return {
				what: t('Past attendees in Indonesia who never ticked “future events”'),
				until: t('{n} days after the notice, unless they reply', { n: LEGACY_NOTICE_DAYS })
			};
		case 'kept':
			return {
				what: t('Attendees, customers and anyone who replied'),
				until: t('deleted by hand')
			};
		case 'logs':
			return { what: t('Touch and activity logs'), until: t('with the row or the event') };
		case 'dnc':
			return {
				what: t('Do-not-contact entries'),
				until: t('forever; removed by hand, with a reason')
			};
	}
}

/** parseChaseForm's "Field: a whole number from 0 to N." in the admin's language. */
function chaseError(lang: Lang, message: string): string {
	const m = /^(.*): a whole number from 0 to (\d+)\.$/.exec(message);
	if (!m) return translate(lang, message);
	return translate(lang, '{field}: a whole number from 0 to {max}.', {
		field: translate(lang, m[1]),
		max: m[2]
	});
}

export const load: PageServerLoad = ({ url, locals }) => {
	const showRemoved = url.searchParams.has('removed');
	const now = Date.now();
	return {
		tokens: listTokens(db),
		// The §5.4 table with what each rule holds and what the next daily run removes.
		retention: {
			rows: retentionCounts(db, now).map((r) => ({ ...r, ...retentionText(locals.lang, r.key) })),
			ranAt: housekeepingRanAt(db)
		},
		phoneCountry: phoneCountryDefault(db, envCountry()),
		chase: { fields: CHASE_FIELDS, values: chaseFormValues(chaseDefaults(db)) },
		blocked: listEntries(db, showRemoved),
		showRemoved,
		messages: {
			bodies: templateGrid(),
			kinds: MESSAGE_KINDS.map((k) => ({ key: k, label: KIND_LABEL[k] })),
			languages: LANGUAGES.map((l) => ({ key: l, label: LANGUAGE_LABEL[l] })),
			placeholders: PLACEHOLDERS
		},
		now
	};
};

export const actions: Actions = {
	addTeam: async ({ request }) => {
		const name = cleanText((await request.formData()).get('name'), 60);
		if (!name) return fail(400, { teamError: 'Type a name first.' });
		addTeamName(db, name);
		return { teamAdded: name };
	},

	removeTeam: async ({ request }) => {
		const name = cleanText((await request.formData()).get('name'), 60);
		if (name) removeTeamName(db, name);
		return { teamRemoved: name };
	},

	createToken: async ({ request }) => {
		const label = cleanText((await request.formData()).get('label'), 60) || 'claude -p';
		return { token: createToken(db, label) };
	},

	revokeToken: async ({ request }) => {
		const id = idOf(await request.formData());
		if (id) revokeToken(db, id);
		return { revoked: id };
	},

	phoneCountry: async ({ request }) => {
		const country = (await request.formData()).get('country');
		if (!isCountry(country)) return fail(400, { phoneError: 'Pick Indonesia or Malaysia.' });
		setPhoneCountryDefault(db, country);
		return { phoneSaved: country };
	},

	// The chase defaults (§5.1); every event without its own override follows them at once.
	chase: async ({ request, locals }) => {
		const rules = parseChaseForm(await request.formData());
		if (typeof rules === 'string') return fail(400, { chaseError: chaseError(locals.lang, rules) });
		setChaseDefaults(db, rules);
		recomputeAll(db);
		return { chaseSaved: true };
	},

	// One language's bodies at a time (§4.4). A blank cell goes back to the built-in wording; the
	// reminder must keep its reconfirm link and no body may carry the lines the app appends (§7).
	// Stamped with whoever saved it.
	templates: async ({ request, locals }) => {
		const form = await request.formData();
		const language = form.get('language');
		if (!isLanguage(language)) return fail(400, { templateError: 'Pick a language.' });
		const bodies = Object.fromEntries(
			MESSAGE_KINDS.map((k) => [k, String(form.get(`body_${k}`) ?? '').slice(0, 2000)])
		) as Record<MessageKind, string>;
		if (bodies.reminder.trim() && !bodies.reminder.includes('{link}'))
			return fail(400, {
				templateError: 'The reminder must include {link}: it is how people reconfirm.',
				templateLanguage: language
			});
		if (Object.values(bodies).some(containsAppendedLine))
			return fail(400, { templateError: APPENDED_LINE_ERROR, templateLanguage: language });
		db.transaction(() => {
			for (const k of MESSAGE_KINDS) setTemplate(db, k, language, bodies[k], { by: locals.who });
		})();
		return { templatesSaved: language };
	},

	// A hand-typed entry: hashed the same way as the rows it must match (§2.2), never stored plain.
	block: async ({ request, locals }) => {
		const form = await request.formData();
		const kind = form.get('kind');
		const raw = String(form.get('value') ?? '');
		const company = cleanText(form.get('company'), 120);
		const reason = cleanText(form.get('reason'), 200);
		if (!isKind(kind)) return fail(400, { blockError: 'Pick what to block.' });

		let value: string | null;
		if (kind === 'email') {
			value = normalizeEmail(raw);
			if (!value || !isValidEmail(value)) return fail(400, { blockError: 'Check the email.' });
		} else if (kind === 'phone') {
			value = normalizePhone(raw, phoneCountryDefault(db, envCountry()));
			if (!value) return fail(400, { blockError: 'Check the mobile number.' });
		} else {
			value = cleanText(raw, 100);
			if (!value) return fail(400, { blockError: 'Type the person’s name.' });
		}

		const result = blockByHand(db, { kind, value, company, reason, by: locals.who });
		if (!result) return fail(400, { blockError: 'Nothing to block in that.' });
		return { blocked: result.locked };
	},

	unblock: async ({ request, locals }) => {
		const form = await request.formData();
		const id = idOf(form);
		const reason = cleanText(form.get('reason'), 200);
		if (id === null) return fail(400, { unblockError: 'That entry is gone.' });
		if (!reason)
			return fail(400, { unblockId: id, unblockError: 'Say why it comes off the list.' });
		if (!removeEntry(db, id, { by: locals.who, reason }))
			return fail(400, { unblockError: 'That entry is gone.' });
		// Whoever the entry alone locked is contactable again: their due dates come back.
		recomputeAll(db);
		return { unblocked: id };
	}
};
