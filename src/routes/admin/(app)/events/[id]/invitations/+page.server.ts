import { error, fail } from '@sveltejs/kit';
import { isReply, linkedinProfile } from '$lib/invitations';
import { listAttendees } from '$lib/server/checkins';
import { DEFAULT_PHONE_COUNTRY } from '$lib/server/config';
import { getContacts } from '$lib/server/contacts';
import { db } from '$lib/server/db';
import { countNewSuggestions } from '$lib/server/planning';
import { getEvent } from '$lib/server/events';
import { parseGuestList } from '$lib/server/guest-list';
import {
	addInvitations,
	addWalkIn,
	companySuggestions,
	groupByCompany,
	listInvitations,
	removeInvitation,
	renameCompany,
	setNote,
	setReply,
	updateInvitation,
	walkIns,
	type GuestInput
} from '$lib/server/invitations';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from '$lib/server/normalize';
import type { Actions, PageServerLoad } from './$types';

function requireEvent(id: string) {
	const event = getEvent(db, id);
	if (!event) error(404, 'Event not found');
	return event;
}

/**
 * Rows checked field by field in the add form, as JSON. Every field is cleaned again here;
 * returns the first problem as a message instead when a row can't be saved.
 */
function reviewedGuests(raw: string, company: string, country: string): GuestInput[] | string {
	let rows: unknown;
	try {
		rows = JSON.parse(raw);
	} catch {
		return 'Those rows didn’t arrive intact. Please try again.';
	}
	if (!Array.isArray(rows)) return 'Those rows didn’t arrive intact. Please try again.';
	const guests: GuestInput[] = [];
	for (const [i, row] of rows.slice(0, 1000).entries()) {
		const r = (row ?? {}) as Record<string, unknown>;
		const email = normalizeEmail(r.email);
		const linkedinText = cleanText(r.linkedin, 300);
		const guest: GuestInput = {
			name: cleanText(r.name, 100),
			company: cleanText(r.company, 120) || company,
			jobTitle: cleanText(r.jobTitle, 120),
			email,
			phone: normalizePhone(r.phone, country),
			linkedin: linkedinProfile(linkedinText),
			reply: isReply(r.reply) ? r.reply : 'pending',
			note: cleanText(r.note, 300)
		};
		const which = `Row ${i + 1}${guest.name ? ` (${guest.name})` : ''}`;
		if (!guest.name) return `${which} needs a name.`;
		if (email && !isValidEmail(email)) return `${which}: check the email.`;
		if (linkedinText && !guest.linkedin)
			return `${which}: that isn’t a LinkedIn profile link (linkedin.com/in/…).`;
		guests.push(guest);
	}
	return guests;
}

function guestId(form: FormData): number | null {
	const id = Number(form.get('id'));
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const load: PageServerLoad = ({ params }) => {
	const event = requireEvent(params.id);
	const invitations = listInvitations(db, event.id);
	const checkins = listAttendees(db, event.id);

	const guests = invitations.map((i) => ({
		id: i.id,
		name: i.name,
		company: i.company,
		job_title: i.job_title,
		email: i.email,
		phone: i.phone,
		linkedin: i.linkedin,
		reply: i.reply,
		note: i.note,
		arrived_at: i.arrived_at
	}));

	return {
		event,
		groups: groupByCompany(guests),
		// Walk-ins only mean something once there's a guest list to compare against.
		walkIns: invitations.length ? walkIns(db, event.id) : [],
		checkins: checkins.length,
		suggestions: countNewSuggestions(db, event.id),
		companies: companySuggestions(db)
	};
};

export const actions: Actions = {
	add: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const company = cleanText(form.get('company'), 120);
		const reviewed = form.has('guests')
			? reviewedGuests(String(form.get('guests')), company, event.phone_country)
			: null;
		if (typeof reviewed === 'string') return fail(400, { addError: reviewed });
		const parsed = reviewed
			? { guests: reviewed, skipped: [], truncated: false }
			: parseGuestList(String(form.get('names') ?? ''), {
					company,
					country: event.phone_country || DEFAULT_PHONE_COUNTRY
				});
		const picked = getContacts(db, form.getAll('contact').map(String)).map((c) => ({
			name: c.name,
			company: company || c.company,
			jobTitle: c.job_title,
			email: c.email,
			phone: c.phone
		}));

		const guests = [...picked, ...parsed.guests];
		if (!guests.length) {
			return fail(400, {
				addError: parsed.skipped.length
					? 'Start each line with the person’s name.'
					: 'Add at least one name.'
			});
		}
		const { added, duplicates } = addInvitations(db, event.id, guests);
		return {
			added: added.length,
			duplicates,
			skipped: parsed.skipped,
			truncated: parsed.truncated,
			company
		};
	},

	reply: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = guestId(form);
		const reply = form.get('reply');
		if (id === null || !isReply(reply)) return fail(400, { replyError: true });
		setReply(db, event.id, id, reply);
		return { replied: id };
	},

	note: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = guestId(form);
		if (id === null) return fail(400, { noteError: true });
		setNote(db, event.id, id, cleanText(form.get('note'), 300));
		return { noted: id };
	},

	update: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const id = guestId(form);
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

		updateInvitation(db, event.id, id, details);
		return { edited: id };
	},

	remove: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const id = guestId(await request.formData());
		if (id !== null) removeInvitation(db, event.id, id);
		return { removed: id };
	},

	rename: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const from = String(form.get('from') ?? '');
		const to = cleanText(form.get('to'), 120);
		if (!from || !to) return fail(400, { renameError: 'Give the company a name.' });
		renameCompany(db, event.id, from, to);
		return { renamed: to };
	},

	walkin: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const checkinId = Number((await request.formData()).get('checkin'));
		const name = Number.isSafeInteger(checkinId) ? addWalkIn(db, event.id, checkinId) : null;
		if (!name) return fail(404, { walkinError: 'That check-in is gone.' });
		return { walkedIn: name };
	}
};
