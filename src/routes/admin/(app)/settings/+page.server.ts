import { fail } from '@sveltejs/kit';
import { createToken, listTokens, revokeToken } from '$lib/server/api-tokens';
import { DEFAULT_PHONE_COUNTRY } from '$lib/server/config';
import { db } from '$lib/server/db';
import { blockByHand, listEntries, removeEntry, type DncKind } from '$lib/server/do-not-contact';
import type { Language } from '$lib/server/events';
import {
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
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from '$lib/server/normalize';
import {
	addTeamName,
	isCountry,
	phoneCountryDefault,
	removeTeamName,
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

export const load: PageServerLoad = ({ url }) => {
	const showRemoved = url.searchParams.has('removed');
	return {
		tokens: listTokens(db),
		phoneCountry: phoneCountryDefault(db, envCountry()),
		blocked: listEntries(db, showRemoved),
		showRemoved,
		messages: {
			bodies: templateGrid(),
			kinds: MESSAGE_KINDS.map((k) => ({ key: k, label: KIND_LABEL[k] })),
			languages: LANGUAGES.map((l) => ({ key: l, label: LANGUAGE_LABEL[l] })),
			placeholders: PLACEHOLDERS
		},
		now: Date.now()
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

	// One language's bodies at a time (§4.4). A blank cell goes back to the built-in wording; the
	// reminder must keep its reconfirm link (§7). Stamped with whoever saved it.
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
		return { unblocked: id };
	}
};
