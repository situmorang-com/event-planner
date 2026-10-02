import { error, fail } from '@sveltejs/kit';
import { isReply, linkedinProfile } from '$lib/invitations';
import { countCheckins } from '$lib/server/checkins';
import { companySuggestions, renameCompany, setCompanyOwner } from '$lib/server/companies';
import { DEFAULT_PHONE_COUNTRY } from '$lib/server/config';
import { db } from '$lib/server/db';
import {
	addTouch,
	clearLatestTouch,
	countLive,
	countToReview,
	getEventPerson,
	lockRow,
	markInvited,
	removeRow,
	setDetails,
	setNote,
	setOwner,
	setReply,
	shortlistAll,
	shortlistFound,
	skipAll,
	skipRow,
	unmarkInvited,
	unskipRow
} from '$lib/server/event-people';
import { getEvent } from '$lib/server/events';
import { parseGuestList } from '$lib/server/guest-list';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from '$lib/server/normalize';
import { getPeople, mergeInto } from '$lib/server/people';
import { addPeople, peopleView, reviewedGuests } from '$lib/server/people-page';
import { teamNames } from '$lib/server/settings';
import { getStageState, suggestedTouchKind, type Via } from '$lib/server/stages';
import type { Actions, PageServerLoad } from './$types';

function requireEvent(id: string) {
	const event = getEvent(db, id);
	if (!event) error(404, 'Event not found');
	return event;
}

function rowId(form: FormData, field = 'id'): number | null {
	const id = Number(form.get(field));
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const VIAS: Via[] = ['whatsapp', 'email', 'linkedin', 'other'];
const isVia = (v: unknown): v is Via => VIAS.includes(v as Via);

/** A team name from the form, or null for "the company's owner" / nobody. */
function ownerFrom(form: FormData): string | null {
	const name = cleanText(form.get('owner'), 60);
	return name && teamNames(db).includes(name) ? name : null;
}

export const load: PageServerLoad = ({ params, locals }) => {
	const event = requireEvent(params.id);
	const tabs = {
		checkins: countCheckins(db, event.id),
		people: countLive(db, event.id),
		review: countToReview(db, event.id)
	};
	const base = { event, me: locals.who || null, team: teamNames(db), tabs };
	// Without a date there is nothing to count down to, and Found rows have no expiry (D17).
	if (event.starts_at === null) return { ...base, view: null, companies: [] };
	return { ...base, view: peopleView(db, event), companies: companySuggestions(db) };
};

export const actions: Actions = {
	add: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const company = cleanText(form.get('company'), 120);
		const country = event.phone_country || DEFAULT_PHONE_COUNTRY;
		const reviewed = form.has('guests')
			? reviewedGuests(String(form.get('guests')), company, country)
			: null;
		if (typeof reviewed === 'string') return fail(400, { addError: reviewed });
		const parsed = reviewed
			? { guests: reviewed, skipped: [], truncated: false }
			: parseGuestList(String(form.get('names') ?? ''), { company, country });
		const picked = getPeople(db, form.getAll('contact').map(String));
		if (!picked.length && !parsed.guests.length) {
			return fail(400, {
				addError: parsed.skipped.length
					? 'Start each line with the person’s name.'
					: 'Add at least one name.'
			});
		}
		const summary = addPeople(
			db,
			event.id,
			{
				typed: parsed.guests,
				picked,
				company,
				park: form.get('park') === '1',
				originDetail: cleanText(form.get('originDetail'), 200)
			},
			{ by: locals.who }
		);
		return { ...summary, skipped: parsed.skipped, truncated: parsed.truncated, company };
	},

	reply: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		const reply = form.get('reply');
		if (id === null || !isReply(reply)) return fail(400, { replyError: true });
		setReply(db, event.id, id, reply);
		return { replied: id };
	},

	note: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		if (id === null) return fail(400, { noteError: true });
		setNote(db, event.id, id, cleanText(form.get('note'), 300));
		return { noted: id };
	},

	update: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		const values = {
			name: String(form.get('name') ?? ''),
			company: String(form.get('company') ?? ''),
			jobTitle: String(form.get('jobTitle') ?? ''),
			email: String(form.get('email') ?? ''),
			phone: String(form.get('phone') ?? ''),
			linkedin: String(form.get('linkedin') ?? '')
		};
		const details = {
			name: cleanText(values.name, 100),
			company: cleanText(values.company, 120),
			jobTitle: cleanText(values.jobTitle, 120),
			email: normalizeEmail(values.email),
			phone: normalizePhone(values.phone, event.phone_country || DEFAULT_PHONE_COUNTRY),
			linkedin: linkedinProfile(values.linkedin)
		};
		const errors: Record<string, string> = {};
		if (!details.name) errors.name = 'Name is required.';
		if (details.email && !isValidEmail(details.email)) errors.email = 'Check the email.';
		if (values.linkedin.trim() && !details.linkedin)
			errors.linkedin = 'Use a profile link: linkedin.com/in/…';
		if (id === null || Object.keys(errors).length)
			return fail(400, { editId: id, editErrors: errors, editValues: values });

		setDetails(db, event.id, id, details);
		return { edited: id };
	},

	remove: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const id = rowId(await request.formData());
		if (id !== null) removeRow(db, event.id, id, { by: locals.who });
		return { removed: id };
	},

	rename: async ({ params, request }) => {
		requireEvent(params.id);
		const form = await request.formData();
		const id = cleanText(form.get('company'), 20);
		const to = cleanText(form.get('to'), 120);
		if (!id || !to) return fail(400, { renameError: 'Give the company a name.' });
		renameCompany(db, id, to);
		return { renamed: to };
	},

	owner: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		if (id !== null) setOwner(db, event.id, id, ownerFrom(form));
		return { owned: id };
	},

	companyOwner: async ({ params, request }) => {
		requireEvent(params.id);
		const form = await request.formData();
		const id = cleanText(form.get('company'), 20);
		if (id) setCompanyOwner(db, id, ownerFrom(form));
		return { companyOwned: id };
	},

	shortlist: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const id = rowId(await request.formData());
		if (id === null) return fail(400, { shortlistError: 'That row is gone.' });
		const result = shortlistFound(db, event.id, id, { by: locals.who });
		if (result.status === 'refused')
			return fail(409, { shortlistError: `${result.name}: ${result.reason}.` });
		return { shortlisted: id, status: result.status };
	},

	skip: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const id = rowId(await request.formData());
		if (id !== null) skipRow(db, event.id, id, { by: locals.who });
		return { skipped: id };
	},

	unskip: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const id = rowId(await request.formData());
		if (id !== null) unskipRow(db, event.id, id);
		return { unskipped: id };
	},

	addAll: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const key = String((await request.formData()).get('companyKey') ?? '');
		const results = shortlistAll(db, event.id, key, { by: locals.who });
		return {
			addedAll: results.filter((r) => r.status === 'added').length,
			refusedAll: results.flatMap((r) => (r.status === 'refused' ? [r.name] : []))
		};
	},

	skipAll: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const key = String((await request.formData()).get('companyKey') ?? '');
		return { skippedAll: skipAll(db, event.id, key, { by: locals.who }) };
	},

	// Sent with navigator.sendBeacon as a message link opens (§7), so nothing waits on it.
	touch: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		const via = form.get('via');
		if (id === null || !isVia(via)) return fail(400, { touchError: true });
		const state = getStageState(db, id);
		if (!state) return fail(404, { touchError: true });
		addTouch(db, event.id, id, {
			kind: suggestedTouchKind(state),
			via,
			by: locals.who
		});
		return { touched: id };
	},

	untouch: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const id = rowId(await request.formData());
		if (id !== null) clearLatestTouch(db, event.id, id);
		return { untouched: id };
	},

	invited: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		if (id === null) return fail(400, { invitedError: true });
		if (form.get('on') === '1') markInvited(db, event.id, id, 'linkedin', { by: locals.who });
		else unmarkInvited(db, event.id, id, 'linkedin');
		return { invited: id };
	},

	lock: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		if (id === null) return fail(400, { lockError: 'That row is gone.' });
		lockRow(db, event.id, id, {
			reason: cleanText(form.get('reason'), 200),
			by: locals.who
		});
		return { locked: id };
	},

	merge: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		const survivor = cleanText(form.get('survivor'), 40);
		const row = id === null ? undefined : getEventPerson(db, event.id, id);
		if (!row?.person_id || !survivor) return fail(400, { mergeError: 'Pick who to keep.' });
		if (!mergeInto(db, row.person_id, survivor, { by: locals.who }))
			return fail(409, { mergeError: 'Those two can’t be merged.' });
		return { merged: id };
	}
};
