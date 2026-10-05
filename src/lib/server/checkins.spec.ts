import { beforeEach, describe, expect, it } from 'vitest';
import { backfillCheckinCountry } from './backfill-country';
import { checkIn, listAttendees, type ContactInput } from './checkins';
import { listContacts } from './contacts';
import { createDb, type DB } from './database';
import { listEventPeople } from './event-people';
import { createEvent } from './events';
import { getPerson } from './people';
import { computeStats } from './stats';

const meta = { method: 'form' as const, device: 'ios' as const, consent: true };

function person(overrides: Partial<ContactInput> = {}): ContactInput {
	return {
		name: 'Rina Wijaya',
		email: 'rina@example.com',
		phone: '+6281234567890',
		company: 'SRKK',
		jobTitle: '',
		...overrides
	};
}

describe('checkIn', () => {
	let db: DB;
	let eventId: string;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: 'Jakarta',
			startsAt: null,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
	});

	it('creates a contact and numbers arrivals in order', () => {
		const a = checkIn(db, eventId, person(), meta);
		const b = checkIn(
			db,
			eventId,
			person({ name: 'Dewi', email: 'dewi@example.com', phone: null }),
			meta
		);
		expect(a).toMatchObject({ status: 'created', number: 1, isNewContact: true });
		expect(b).toMatchObject({ status: 'created', number: 2, isNewContact: true });
	});

	it('recognises a repeat scan instead of double counting', () => {
		const first = checkIn(db, eventId, person(), meta, 1_000);
		const again = checkIn(
			db,
			eventId,
			person({ email: 'RINA@example.com'.toLowerCase() }),
			meta,
			5_000
		);
		expect(again).toMatchObject({ status: 'existing', number: 1, checkedInAt: 1_000 });
		expect(again.personId).toBe(first.personId);
		expect(listAttendees(db, eventId)).toHaveLength(1);
	});

	it('keeps the best-known details when a later check-in leaves fields blank', () => {
		checkIn(db, eventId, person({ jobTitle: 'CIO' }), meta);
		const other = createEvent(db, {
			name: 'Summit',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
		checkIn(db, other, person({ company: '', jobTitle: '', phone: null }), meta);
		const [contact] = listContacts(db);
		expect(contact).toMatchObject({
			company: 'SRKK',
			job_title: 'CIO',
			phone: '+6281234567890',
			events_attended: 2
		});
	});

	it('matches on phone only when that cannot merge two different people', () => {
		const staffAdded = checkIn(db, eventId, person({ email: null }), { ...meta, method: 'staff' });
		const other = createEvent(db, {
			name: 'Summit',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
		const selfServe = checkIn(db, other, person(), meta);
		expect(selfServe.personId).toBe(staffAdded.personId);

		const colleague = checkIn(
			db,
			other,
			person({ name: 'Assistant', email: 'pa@example.com' }),
			meta
		);
		expect(colleague.personId).not.toBe(staffAdded.personId);
	});

	it('records the three consent boxes on the check-in, the row and the person (§4.7)', () => {
		const first = checkIn(db, eventId, person(), { ...meta, consentShare: true }, 1_000);
		const row = () => listEventPeople(db, eventId)[0];
		expect(row()).toMatchObject({
			stage: 'checked_in',
			checkin_id: first.checkinId,
			consent_event_at: 1_000,
			consent_share_at: 1_000
		});
		expect(getPerson(db, first.personId)!.consent_future_at).toBeNull();

		const other = createEvent(db, {
			name: 'Summit',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
		const second = checkIn(db, other, person(), { ...meta, consentFuture: true }, 2_000);
		expect(second.personId).toBe(first.personId);
		expect(getPerson(db, first.personId)!.consent_future_at).toBe(2_000);
		expect(listEventPeople(db, other)[0]).toMatchObject({
			consent_event_at: 2_000,
			consent_share_at: null
		});

		// A staff add records no consent at all, whatever the form carried.
		const staff = checkIn(
			db,
			eventId,
			person({ name: 'Bima', email: 'bima@example.com', phone: null }),
			{ ...meta, method: 'staff', consentFuture: true, consentShare: true },
			3_000
		);
		expect(listEventPeople(db, eventId)[1]).toMatchObject({
			consent_event_at: null,
			consent_share_at: null
		});
		expect(getPerson(db, staff.personId)!.consent_future_at).toBeNull();
	});

	it('stores the country from the phone, else from the event walked into (§2.3)', () => {
		const byPhone = checkIn(db, eventId, person({ phone: '+60123456789' }), meta);
		expect(getPerson(db, byPhone.personId)!.country).toBe('MY');
		const byEvent = checkIn(
			db,
			eventId,
			person({ name: 'Dewi', email: 'dewi@example.com', phone: null }),
			meta
		);
		expect(getPerson(db, byEvent.personId)!.country).toBe('ID');

		// Older check-ins stored none; the version-5 step fills them from their last event.
		db.prepare(`UPDATE people SET country = NULL`).run();
		backfillCheckinCountry(db);
		expect(getPerson(db, byPhone.personId)!.country).toBe('MY');
		expect(getPerson(db, byEvent.personId)!.country).toBe('ID');
	});

	it('marks people who attended an earlier event as returning', () => {
		const earlier = createEvent(db, {
			name: 'Meetup',
			venue: '',
			startsAt: null,
			timezone: 'UTC',
			qrMode: 'static'
		});
		checkIn(db, earlier, person(), meta, 1_000);
		checkIn(db, eventId, person(), meta, 2_000);
		checkIn(
			db,
			eventId,
			person({ name: 'New Face', email: 'new@example.com', phone: null }),
			meta,
			3_000
		);

		const stats = computeStats(listAttendees(db, eventId), { now: 3_000, isOpen: false });
		expect(stats).toMatchObject({ total: 2, returning: 1, newContacts: 1 });
		expect(stats.devices.ios).toBe(2);
	});
});
