import { error, fail, redirect } from '@sveltejs/kit';
import { toLocalInput } from '$lib/time';
import { publicName } from '$lib/names';
import { listActivity } from '$lib/server/activity-log';
import { publish } from '$lib/server/bus';
import { checkIn, listAttendees, removeCheckin } from '$lib/server/checkins';
import { DEFAULT_PHONE_COUNTRY } from '$lib/server/config';
import { db } from '$lib/server/db';
import { countLive, countToReview } from '$lib/server/event-people';
import { parseEventForm } from '$lib/server/event-form';
import { deleteEvent, getEvent, setEventOpen, updateEvent } from '$lib/server/events';
import { cleanText, isValidEmail, normalizeEmail, normalizePhone } from '$lib/server/normalize';
import { computeStats } from '$lib/server/stats';
import { checkinUrl, publicBaseUrl } from '$lib/server/urls';
import type { Actions, PageServerLoad } from './$types';

function requireEvent(id: string) {
	const event = getEvent(db, id);
	if (!event) error(404, 'Event not found');
	return event;
}

export const load: PageServerLoad = ({ params, url }) => {
	const event = requireEvent(params.id);
	const now = Date.now();
	const attendees = listAttendees(db, event.id);
	const { base, reachable } = publicBaseUrl(url);

	return {
		event,
		attendees,
		stats: computeStats(attendees, { now, isOpen: !!event.is_open }),
		people: countLive(db, event.id),
		review: countToReview(db, event.id),
		activity: listActivity(db, event.id, 50),
		staticLink: checkinUrl(base, event.id),
		reachable,
		created: url.searchParams.has('created'),
		now,
		settings: {
			name: event.name,
			venue: event.venue,
			startsAt: event.starts_at ? toLocalInput(event.starts_at, event.timezone) : '',
			timezone: event.timezone,
			qrMode: event.qr_mode,
			targetCount: event.target_count === null ? '' : String(event.target_count),
			phoneCountry: event.phone_country
		}
	};
};

export const actions: Actions = {
	toggle: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const open = (await request.formData()).get('open') === '1';
		setEventOpen(db, event.id, open);
		publish(event.id, { type: 'refresh' });
		return { toggled: open };
	},

	update: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const parsed = parseEventForm(await request.formData());
		if (!parsed.input)
			return fail(400, { settingsErrors: parsed.errors, settingsValues: parsed.values });
		updateEvent(db, event.id, parsed.input);
		publish(event.id, { type: 'refresh' });
		return { saved: true };
	},

	add: async ({ params, request, locals }) => {
		const event = requireEvent(params.id);
		const form = await request.formData();
		const values = {
			name: String(form.get('name') ?? ''),
			email: String(form.get('email') ?? ''),
			phone: String(form.get('phone') ?? ''),
			company: String(form.get('company') ?? '')
		};
		const input = {
			name: cleanText(values.name, 100),
			email: normalizeEmail(values.email),
			phone: normalizePhone(values.phone, DEFAULT_PHONE_COUNTRY),
			company: cleanText(values.company, 120),
			jobTitle: ''
		};
		const errors: Record<string, string> = {};
		if (!input.name) errors.name = 'Name is required.';
		if (input.email && !isValidEmail(input.email)) errors.email = 'Check the email.';
		if (!input.email && !input.phone) errors.email = 'Add an email or a mobile number.';
		if (Object.keys(errors).length) return fail(400, { addErrors: errors, addValues: values });

		const result = checkIn(db, event.id, input, {
			method: 'staff',
			device: 'other',
			consent: false,
			by: locals.who
		});
		if (result.status === 'created') {
			publish(event.id, {
				type: 'checkin',
				count: result.number,
				arrival: {
					id: result.checkinId,
					name: publicName(input.name),
					company: input.company,
					at: result.checkedInAt
				}
			});
		}
		return { added: { name: input.name, existing: result.status === 'existing' } };
	},

	remove: async ({ params, request }) => {
		const event = requireEvent(params.id);
		const checkinId = Number((await request.formData()).get('checkin'));
		if (Number.isSafeInteger(checkinId)) removeCheckin(db, event.id, checkinId);
		publish(event.id, { type: 'refresh' });
		return { removed: true };
	},

	delete: async ({ params }) => {
		const event = requireEvent(params.id);
		deleteEvent(db, event.id);
		publish(event.id, { type: 'refresh' });
		redirect(303, '/admin');
	}
};
