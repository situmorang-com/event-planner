import { error, fail } from '@sveltejs/kit';
import { isReply, linkedinProfile } from '$lib/invitations';
import { isLinkedinStatus, isMessageKind } from '$lib/people';
import { setLinkedinStatus } from '$lib/server/linkedin';
import { isSalutation, setCallName, setSalutation } from '$lib/server/salutation';
import { fromLocalInput } from '$lib/time';
import { logActivity } from '$lib/server/activity-log';
import {
	bulkMarkInvited,
	bulkSetOwner,
	bulkSetStage,
	bulkShortlist,
	bulkSkip,
	copyToEvent,
	type BulkAction,
	type BulkResult
} from '$lib/server/bulk';
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
	clearReview,
	countLive,
	countToReview,
	getEventPerson,
	hasEnded,
	listEventPeople,
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
import { getEvent, listEvents } from '$lib/server/events';
import { parseGuestList } from '$lib/server/guest-list';
import { eventPageLoad } from '$lib/server/jobs';
import { countryResolver } from '$lib/server/messaging';
import { messagingEnv } from '$lib/server/messaging-env';
import { recomputeEvent, recomputePerson, setNextActionOverride } from '$lib/server/next-action';
import { genericRegistrationUrl } from '$lib/server/registration-token';
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
const BULK_ACTIONS: BulkAction[] = ['shortlist', 'skip', 'invited', 'owner', 'stage', 'copy'];
const isBulkAction = (v: unknown): v is BulkAction => BULK_ACTIONS.includes(v as BulkAction);

/**
 * The other events a selection can be copied to (D22): dated ones that haven't ended, most
 * recent first. A finished event could never give the copied rows a next action (§5.2).
 */
function copyTargets(eventId: string) {
	return listEvents(db)
		.filter((e) => e.id !== eventId && e.starts_at !== null && !hasEnded(e))
		.map((e) => ({ id: e.id, name: e.name, starts_at: e.starts_at!, timezone: e.timezone }));
}

/** A team name from the form, or null for "the company's owner" / nobody. */
function ownerFrom(form: FormData): string | null {
	const name = cleanText(form.get('owner'), 60);
	return name && teamNames(db).includes(name) ? name : null;
}

export const load: PageServerLoad = ({ params, locals, url }) => {
	// The start job and the next-action pass also run lazily here (§5.4), so a page opened
	// before the day's housekeeping is right.
	const event = eventPageLoad(db, requireEvent(params.id));
	const tabs = {
		checkins: countCheckins(db, event.id),
		people: countLive(db, event.id),
		review: countToReview(db, event.id)
	};
	const base = { event, me: locals.who || null, team: teamNames(db), tabs };
	// Without a date there is nothing to count down to, and Found rows have no expiry (D17).
	if (event.starts_at === null)
		return { ...base, view: null, companies: [], genericLink: null, events: [] };
	const env = messagingEnv(url);
	return {
		...base,
		view: peopleView(db, event, env),
		companies: companySuggestions(db),
		events: copyTargets(event.id),
		// The open registration link (§4.6): anyone with it can register, flagged for review.
		genericLink: genericRegistrationUrl(event, env.base)
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
			linkedin: String(form.get('linkedin') ?? ''),
			callName: String(form.get('callName') ?? '')
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
		// The name after Pak or Bu (D27); blank goes back to the first given name.
		const personId = getEventPerson(db, event.id, id)?.person_id;
		if (personId) setCallName(db, personId, values.callName);
		return { edited: id };
	},

	// Pak or Bu from the team (D27); blank takes it back to the name's guess.
	salutation: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		const value = form.get('salutation');
		if (id === null || (value !== '' && !isSalutation(value)))
			return fail(400, { salutationError: true });
		const row = getEventPerson(db, event.id, id);
		if (!row?.person_id) return fail(404, { salutationError: true });
		setSalutation(db, row.person_id, value === '' ? null : value, 'team');
		return { salutation: id };
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
		// Blocking cleared the company's due dates; unblocking brings them back.
		recomputeEvent(db, event.id);
		logActivity(db, {
			eventId: event.id,
			kind: 'unlock',
			who: locals.who,
			what: { companyId: id },
			rowCount: 1
		});
		return { unblocked: id };
	},

	// The company owner has checked a generic-link registration (§4.6).
	reviewed: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const id = rowId(await request.formData());
		if (id !== null) clearReview(db, event.id, id);
		return { reviewed: id };
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

	// One selection, one verb (§4.2, D22): the bulk module runs it in one transaction and says
	// which rows it refused; their names are looked up here for the message, never logged.
	bulk: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const action = form.get('action');
		const ids = form
			.getAll('ids')
			.map(Number)
			.filter((id) => Number.isSafeInteger(id) && id > 0);
		if (!isBulkAction(action) || !ids.length)
			return fail(400, { bulkError: 'Pick some rows first.' });
		const by = locals.who;
		const via = form.get('via');
		// Names before the batch runs: a Found row folded into the live person is gone after.
		const names = new Map(listEventPeople(db, event.id).map((r) => [r.id, r.name]));
		let result: BulkResult;
		let to: { id: string; name: string } | null = null;
		switch (action) {
			case 'shortlist':
				result = bulkShortlist(db, event.id, ids, { by });
				break;
			case 'skip':
				result = bulkSkip(db, event.id, ids, { by });
				break;
			case 'invited':
				if (!isVia(via)) return fail(400, { bulkError: 'Say how they were invited.' });
				result = bulkMarkInvited(db, event.id, ids, via, { by });
				break;
			case 'owner':
				result = bulkSetOwner(db, event.id, ids, ownerFrom(form), { by });
				break;
			case 'stage': {
				const stage = form.get('stage');
				if (stage !== 'shortlisted' && stage !== 'invited')
					return fail(400, { bulkError: 'Only Shortlisted and Invited can be set in bulk.' });
				result = bulkSetStage(db, event.id, ids, stage, { via: isVia(via) ? via : 'other', by });
				break;
			}
			case 'copy': {
				const target = copyTargets(event.id).find((e) => e.id === form.get('to'));
				if (!target) return fail(400, { bulkError: 'Pick an event with a date to copy to.' });
				result = copyToEvent(db, event.id, target.id, ids, { by });
				to = { id: target.id, name: target.name };
				break;
			}
		}
		const refused = result.refused.map((r) => ({ ...r, name: names.get(r.id) ?? `#${r.id}` }));
		return { bulk: { action, done: result.done, refused, to } };
	},

	// Sent with navigator.sendBeacon as a message link opens (§7), so nothing waits on it. The
	// kind is the one picked in the row's message menu, else what the stage calls for.
	touch: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		const via = form.get('via');
		const kind = form.get('kind');
		if (id === null || !isVia(via)) return fail(400, { touchError: true });
		const state = getStageState(db, id);
		if (!state) return fail(404, { touchError: true });
		addTouch(db, event.id, id, {
			kind: isMessageKind(kind) ? kind : suggestedTouchKind(state),
			via,
			by: locals.who
		});
		return { touched: id };
	},

	// The organizer's own due date (§4.2): a day in the event's zone, taken as 9 am there.
	// An empty date clears the override and the rules' date comes back.
	due: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		const date = form.get('clear') === '1' ? '' : String(form.get('date') ?? '').trim();
		if (id === null) return fail(400, { dueError: 'That row is gone.' });
		const at = date ? fromLocalInput(`${date}T09:00`, event.timezone) : null;
		if (date && at === null) return fail(400, { dueError: 'That date doesn’t look right.' });
		setNextActionOverride(db, event.id, id, at);
		return { dueSet: id };
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

	// The LinkedIn connection (D26). Opening the profile from the row sends `opened`, which only
	// moves "not connected" to "request sent", so a connection is never undone by a click.
	linkedin: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = rowId(form);
		const status = form.get('status');
		if (id === null || !isLinkedinStatus(status)) return fail(400, { linkedinError: true });
		const row = getEventPerson(db, event.id, id);
		if (!row?.person_id) return fail(404, { linkedinError: true });
		setLinkedinStatus(db, row.person_id, status, {
			by: locals.who,
			ifNone: form.get('opened') === '1'
		});
		return { linkedin: id };
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
		// The survivor may have gained a relationship or a lock; their rows follow.
		recomputePerson(db, survivor);
		return { merged: id };
	}
};
