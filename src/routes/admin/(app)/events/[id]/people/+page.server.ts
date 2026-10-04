import { error, fail } from '@sveltejs/kit';
import { isReply, linkedinProfile } from '$lib/invitations';
import { logActivity } from '$lib/server/activity-log';
import { countCheckins } from '$lib/server/checkins';
import {
	blockCompany,
	companySuggestions,
	renameCompany,
	setCompanyOwner,
	setCompanyPhoneCountry,
	unblockCompany
} from '$lib/server/companies';
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
	unflagRow,
	unmarkInvited,
	unskipRow
} from '$lib/server/event-people';
import { getEvent } from '$lib/server/events';
import { parseGuestList } from '$lib/server/guest-list';
import { eventPageLoad } from '$lib/server/jobs';
import { countryResolver } from '$lib/server/messaging';
import { messagingEnv } from '$lib/server/messaging-env';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from '$lib/server/normalize';
import { getPeople, mergeInto } from '$lib/server/people';
import { addPeople, peopleView, reviewedGuests } from '$lib/server/people-page';
import { isCountry, teamNames } from '$lib/server/settings';
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

export const load: PageServerLoad = ({ params, locals, url }) => {
	// The start job runs lazily here until the scheduler lands (§5.4).
	const event = eventPageLoad(db, requireEvent(params.id));
	const tabs = {
		checkins: countCheckins(db, event.id),
		people: countLive(db, event.id),
		review: countToReview(db, event.id)
	};
	const base = { event, me: locals.who || null, team: teamNames(db), tabs };
	// Without a date there is nothing to count down to, and Found rows have no expiry (D17).
	if (event.starts_at === null) return { ...base, view: null, companies: [] };
	return {
		...base,
		view: peopleView(db, event, messagingEnv(url)),
		companies: companySuggestions(db)
	};
};

export const actions: Actions = {
	add: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const company = cleanText(form.get('company'), 120);
		// Numbers are read in the company's country when it has one, else the event's (D14).
		const country = countryResolver(db, event);
		const reviewed = form.has('guests')
			? reviewedGuests(String(form.get('guests')), company, country)
			: null;
		if (typeof reviewed === 'string') return fail(400, { addError: reviewed });
		const parsed = reviewed
			? { guests: reviewed, skipped: [], truncated: false, d365: false }
			: parseGuestList(String(form.get('names') ?? ''), { company, country });
		const picked = getPeople(db, form.getAll('contact').map(String));
		if (!picked.length && !parsed.guests.length) {
			return fail(400, {
				addError: parsed.skipped.length
					? 'Start each line with the person’s name.'
					: 'Add at least one name.'
			});
		}
		// Reviewed rows say where they came from; a direct paste is read for D365 headers here.
		const d365 = reviewed ? form.get('d365') === '1' : parsed.d365;
		const summary = addPeople(
			db,
			event.id,
			{
				typed: parsed.guests,
				picked,
				company,
				park: form.get('park') === '1',
				originDetail: cleanText(form.get('originDetail'), 200),
				d365
			},
			{ by: locals.who }
		);
		if (d365 && parsed.guests.length)
			logActivity(db, {
				eventId: event.id,
				kind: 'import',
				who: locals.who,
				what: { source: 'd365', added: summary.added, found: summary.found },
				rowCount: summary.added + summary.found
			});
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
			phone: normalizePhone(values.phone, countryResolver(db, event)(values.company)),
			linkedin: linkedinProfile(values.linkedin)
		};
		const errors: Record<string, string> = {};
		if (!details.name) errors.name = 'Name is required.';
		if (details.email && !isValidEmail(details.email)) errors.email = 'Check the email.';
		if (values.linkedin.trim() && !details.linkedin)
			errors.linkedin = 'Use a profile link: linkedin.com/in/…';
		if (id === null || Object.keys(errors).length)
			return fail(400, { editId: id, editErrors: errors, editValues: values });

		if (setDetails(db, event.id, id, details) === 'do not contact')
			return fail(409, {
				editId: id,
				editErrors: { email: 'Those details are on the do-not-contact list.' },
				editValues: values
			});
		return { edited: id };
	},

	remove: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const id = rowId(await request.formData());
		const result = id === null ? 'missing' : removeRow(db, event.id, id, { by: locals.who });
		if (result === 'checked in')
			return fail(409, {
				removeError: 'They have checked in. Remove the check-in on the Check-ins tab instead.'
			});
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

	// The company's phone country (D14): '' follows the event again. It also picks the language.
	companyCountry: async ({ params, request }) => {
		requireEvent(params.id);
		const form = await request.formData();
		const id = cleanText(form.get('company'), 20);
		const country = String(form.get('country') ?? '');
		if (!id || (country && !isCountry(country)))
			return fail(400, { countryError: 'Pick Indonesia, Malaysia or the event’s country.' });
		setCompanyPhoneCountry(db, id, isCountry(country) ? country : null);
		return { countrySet: id };
	},

	// "Block company": nobody there can be added, researched or messaged from now on (D13).
	block: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = cleanText(form.get('company'), 20);
		if (!id) return fail(400, { blockError: 'That company is gone.' });
		blockCompany(db, id, { reason: cleanText(form.get('reason'), 200), by: locals.who });
		logActivity(db, {
			eventId: event.id,
			kind: 'lock',
			who: locals.who,
			what: { companyId: id },
			rowCount: 1
		});
		return { blocked: id };
	},

	unblock: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const id = cleanText((await request.formData()).get('company'), 20);
		if (!id) return fail(400, { blockError: 'That company is gone.' });
		unblockCompany(db, id);
		logActivity(db, {
			eventId: event.id,
			kind: 'unlock',
			who: locals.who,
			what: { companyId: id },
			rowCount: 1
		});
		return { unblocked: id };
	},

	// Clears the D365 flags on the row's person (§6.1); logged by id.
	unflag: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const id = rowId(await request.formData());
		if (id !== null) unflagRow(db, event.id, id, { by: locals.who });
		return { unflagged: id };
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
