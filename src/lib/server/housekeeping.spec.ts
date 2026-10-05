import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listActivity } from './activity-log';
import { checkIn } from './checkins';
import { createDb, type DB } from './database';
import { blockByHand, listEntries, lockPerson } from './do-not-contact';
import {
	addFound,
	addRowForPerson,
	addShortlisted,
	addTouch,
	clearLatestTouch,
	getEventPerson,
	listEventPeople,
	setReply,
	skipRow
} from './event-people';
import { createEvent, getEvent, updateEvent } from './events';
import {
	expirePeople,
	expiring,
	HOUSEKEEPING_INTERVAL,
	housekeepingRanAt,
	purgePlanning,
	retentionCounts,
	runHousekeeping,
	schedulerRunning,
	startScheduler,
	stopScheduler
} from './housekeeping';
import { createPerson, getPerson, touchLastEvent, type PersonRow } from './people';
import {
	addTargets,
	listTargets,
	markResearched,
	markResearchRequested,
	saveBrief
} from './planning';
import { submitRegistration } from './registration';
import { keptUntilPerson, personRetention, planningKeptUntil } from './retention';
import { consentBoxesSince } from './settings';
import { DAY } from '../time';

const START = Date.UTC(2026, 10, 1, 2);
const MONTH = 31 * DAY;

const newEvent = (db: DB, startsAt: number | null = START) =>
	createEvent(db, {
		name: 'Launch',
		venue: '',
		startsAt,
		timezone: 'Asia/Jakarta',
		qrMode: 'static'
	});

const guest = (name: string, extra: Record<string, unknown> = {}) => ({
	name,
	company: 'Batavia Foods',
	jobTitle: '',
	email: null,
	phone: null,
	...extra
});

const names = (db: DB) =>
	(db.prepare(`SELECT name FROM people ORDER BY name`).all() as { name: string }[]).map(
		(p) => p.name
	);

/* ───────────────────────── keptUntil ───────────────────────── */

describe('keptUntil', () => {
	const since = Date.UTC(2026, 9, 1);
	const base: Parameters<typeof keptUntilPerson>[0] = {
		origin: 'typed',
		is_customer: 0,
		consent_future_at: null,
		legacy_notice_at: null,
		legacy_kept_at: null,
		last_event_at: null,
		created_at: Date.UTC(2026, 0, 15),
		country: null,
		phone: null
	};
	const prospect = { attendee: false, replied: false, since };

	it('keeps research and typed prospects twelve months after their last event', () => {
		expect(keptUntilPerson(base, prospect)).toBe(Date.UTC(2027, 0, 15));
		expect(
			keptUntilPerson(
				{ ...base, origin: 'research', last_event_at: Date.UTC(2026, 5, 1) },
				prospect
			)
		).toBe(Date.UTC(2027, 5, 1));
		expect(personRetention(base, prospect).rule).toBe('prospect');
	});

	it('keeps attendees, repliers, customers, consenters and the self-registered until deleted', () => {
		expect(keptUntilPerson(base, { ...prospect, attendee: true })).toBeNull();
		expect(keptUntilPerson(base, { ...prospect, replied: true })).toBeNull();
		expect(keptUntilPerson({ ...base, is_customer: 1 }, prospect)).toBeNull();
		expect(keptUntilPerson({ ...base, consent_future_at: 1 }, prospect)).toBeNull();
		expect(keptUntilPerson({ ...base, origin: 'self_registered' }, prospect)).toBeNull();
		expect(keptUntilPerson({ ...base, origin: 'd365' }, prospect)).toBeNull();
		expect(personRetention({ ...base, origin: 'd365' }, prospect).rule).toBe('kept');
	});

	it('gives a legacy Indonesian attendee thirty days from the notice unless they answered', () => {
		const legacy = {
			...base,
			origin: 'checkin' as const,
			created_at: since - DAY,
			phone: '+6281234567890',
			legacy_notice_at: Date.UTC(2026, 9, 3)
		};
		const facts = { attendee: true, replied: false, since };
		expect(personRetention(legacy, facts)).toEqual({
			rule: 'legacy',
			until: Date.UTC(2026, 10, 2)
		});
		// Not told yet: on the legacy rule, with no date until the notice goes out.
		expect(personRetention({ ...legacy, legacy_notice_at: null }, facts)).toEqual({
			rule: 'legacy',
			until: null
		});
		expect(keptUntilPerson({ ...legacy, legacy_kept_at: 1 }, facts)).toBeNull();
		expect(keptUntilPerson({ ...legacy, consent_future_at: 1 }, facts)).toBeNull();
		// A customer, or someone who replied on any event before the notice, is kept (§2.3).
		expect(personRetention({ ...legacy, is_customer: 1 }, facts).rule).toBe('kept');
		expect(personRetention(legacy, { ...facts, replied: true }).rule).toBe('kept');
		// Checked in after the boxes shipped: they were offered the box, so not legacy.
		expect(keptUntilPerson({ ...legacy, created_at: since + 1 }, facts)).toBeNull();
		// Malaysia and unknown countries get no notice and no clock (D15).
		expect(keptUntilPerson({ ...legacy, phone: '+60123456789' }, facts)).toBeNull();
		expect(keptUntilPerson({ ...legacy, phone: null }, facts)).toBeNull();
		expect(keptUntilPerson({ ...legacy, phone: null, country: 'ID' }, facts)).toBe(
			Date.UTC(2026, 10, 2)
		);
	});

	it('purges planning data ninety days after the start; nothing without a date', () => {
		expect(planningKeptUntil({ starts_at: START })).toBe(START + 90 * DAY);
		expect(planningKeptUntil({ starts_at: null })).toBeNull();
	});
});

/* ───────────────────────── Event start and planning purge ───────────────────────── */

describe('planning jobs', () => {
	let db: DB;
	let eventId: string;
	const rows = () => listEventPeople(db, eventId).map((r) => [r.name, r.stage, !!r.skipped_at]);

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = newEvent(db);
		saveBrief(db, eventId, {
			goal: 'ERP',
			roles: 'CFO',
			seniority: [],
			departments: [],
			perCompany: 3,
			avoid: ''
		});
		addTargets(db, eventId, [{ name: 'Batavia Foods', website: '' }]);
		markResearchRequested(db, eventId, [listTargets(db, eventId)[0].id], START - 2 * DAY);
		markResearched(db, eventId, START - DAY);
		addShortlisted(db, eventId, [guest('Rina')], { source: 'typed' });
		addFound(db, eventId, [guest('Andi'), guest('Budi')], { source: 'research' });
		skipRow(db, eventId, listEventPeople(db, eventId).find((r) => r.name === 'Budi')!.id);
	});

	it('runs the event start job for every event that has begun, once', () => {
		expect(runHousekeeping(db, START - 1).started).toBe(0);
		expect(rows()).toHaveLength(3);
		expect(runHousekeeping(db, START)).toMatchObject({ started: 1, purged: 0 });
		expect(rows()).toEqual([
			['Rina', 'shortlisted', false],
			['Budi', 'found', true]
		]);
		expect(runHousekeeping(db, START + DAY).started).toBe(0);
		expect(housekeepingRanAt(db)).toBe(START + DAY);
	});

	it('purges the planning data ninety days after the start and never again', () => {
		const deadline = START + 90 * DAY;
		expect(runHousekeeping(db, deadline - 1).purged).toBe(0);
		expect(rows()).toHaveLength(2);

		expect(runHousekeeping(db, deadline)).toMatchObject({ started: 0, purged: 1 });
		expect(rows()).toEqual([['Rina', 'shortlisted', false]]);
		expect(getEvent(db, eventId)!.planning_purged_at).toBe(deadline);
		// The research stamps go; the brief and the target companies stay (builder).
		expect(listTargets(db, eventId)).toEqual([
			expect.objectContaining({
				name: 'Batavia Foods',
				researched_at: null,
				research_requested_at: null
			})
		]);
		expect(db.prepare(`SELECT goal FROM invite_briefs WHERE event_id = ?`).get(eventId)).toEqual({
			goal: 'ERP'
		});
		expect(listActivity(db, eventId)[0]).toMatchObject({
			kind: 'purge',
			who: '',
			row_count: 1,
			what: '{"job":"planning_purge"}'
		});

		const logged = listActivity(db, eventId).length;
		expect(runHousekeeping(db, deadline + DAY).purged).toBe(0);
		expect(listActivity(db, eventId)).toHaveLength(logged);
	});

	it('deletes planning data from the button at any time, stamped with who pressed it', () => {
		expect(purgePlanning(db, eventId, { by: 'Edmund' }, START - 5 * DAY)).toBe(2);
		expect(rows()).toEqual([['Rina', 'shortlisted', false]]);
		expect(getEvent(db, eventId)!.planning_purged_at).toBe(START - 5 * DAY);
		expect(listActivity(db, eventId)[0]).toMatchObject({
			kind: 'purge',
			who: 'Edmund',
			row_count: 2
		});
		expect(purgePlanning(db, 'nope')).toBeNull();
		// Research re-run before the start leaves Found rows the button never saw: the deadline
		// purge still comes for them, once.
		addFound(db, eventId, [guest('Citra')], { source: 'research' });
		expect(
			retentionCounts(db, START + 91 * DAY).find((r) => r.key === 'found_unapproved')
		).toMatchObject({ total: 1, due: 1 });
		expect(runHousekeeping(db, START + 91 * DAY).purged).toBe(1);
		expect(rows()).toEqual([['Rina', 'shortlisted', false]]);
		expect(getEvent(db, eventId)!.planning_purged_at).toBe(START + 91 * DAY);
		expect(runHousekeeping(db, START + 92 * DAY).purged).toBe(0);
	});
});

/* ───────────────────────── Prospect expiry ───────────────────────── */

describe('prospect expiry', () => {
	let db: DB;
	let eventId: string;
	let since: number;
	const person = (name: string, origin: PersonRow['origin'], createdAt: number, extra = {}) =>
		createPerson(db, { name, company: 'Batavia Foods', ...extra }, { origin }, createdAt);

	beforeEach(() => {
		db = createDb(':memory:');
		since = consentBoxesSince(db)!;
		eventId = newEvent(db, since - 20 * MONTH);
	});

	it('deletes research and typed prospects twelve months after their last event, with their rows', () => {
		const old = since - 14 * MONTH;
		const research = person('Andi', 'research', old);
		const typed = person('Budi', 'typed', old);
		addRowForPerson(db, eventId, research, { source: 'research' });
		addRowForPerson(db, eventId, typed, { source: 'typed' });
		touchLastEvent(db, research, old);
		touchLastEvent(db, typed, old);
		// A fresh prospect, and one whose last event is recent, both wait.
		person('Citra', 'typed', since - DAY);
		const recent = person('Dewi', 'research', old);
		addRowForPerson(db, newEvent(db, since - MONTH), recent, { source: 'research' });
		touchLastEvent(db, recent, since);

		expect(expiring(db, 'prospect', since)).toEqual(expect.arrayContaining([research, typed]));
		expect(expiring(db, 'prospect', since)).toHaveLength(2);
		expect(runHousekeeping(db, since).prospects).toBe(2);
		expect(names(db)).toEqual(['Citra', 'Dewi']);
		expect(listEventPeople(db, eventId)).toEqual([]);
		expect(listActivity(db, null)[0]).toMatchObject({
			kind: 'delete',
			row_count: 4,
			what: expect.stringContaining('"job":"prospect_expiry"')
		});
		expect(listActivity(db, null)[0].what).not.toContain('Andi');

		// A second run finds nothing more to do.
		expect(runHousekeeping(db, since).prospects).toBe(0);
		expect(names(db)).toEqual(['Citra', 'Dewi']);
	});

	it('never deletes attendees, repliers, customers, consenters or the self-registered', () => {
		const old = since - 14 * MONTH;
		const attendee = person('Attendee', 'typed', old);
		db.prepare(
			`INSERT INTO checkins (event_id, person_id, checked_in_at, method, device, consent_at)
			VALUES (?, ?, ?, 'form', 'ios', ?)`
		).run(eventId, attendee, old, old);
		const replier = person('Replier', 'research', old);
		setReply(db, eventId, addRowForPerson(db, eventId, replier, { source: 'research' }), 'no', old);
		touchLastEvent(db, replier, old);
		person('Customer', 'typed', old, {});
		db.prepare(`UPDATE people SET is_customer = 1 WHERE name = 'Customer'`).run();
		person('Consenter', 'typed', old);
		db.prepare(`UPDATE people SET consent_future_at = ? WHERE name = 'Consenter'`).run(old);
		person('Registered', 'self_registered', old);
		person('Imported', 'd365', old);

		expect(expiring(db, 'prospect', since)).toEqual([]);
		expect(runHousekeeping(db, since).prospects).toBe(0);
		expect(names(db)).toHaveLength(6);
	});

	it('follows an event that is re-dated: a prospect on an upcoming list is not expired', () => {
		const old = since - 14 * MONTH;
		const prospect = person('Andi', 'typed', old);
		const undated = newEvent(db, null);
		addRowForPerson(db, undated, prospect, { source: 'pool' });
		touchLastEvent(db, prospect, old);
		expect(expiring(db, 'prospect', since)).toEqual([prospect]);
		updateEvent(db, undated, {
			name: 'Launch',
			venue: '',
			startsAt: since + MONTH,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		expect(getPerson(db, prospect)!.last_event_at).toBe(since + MONTH);
		expect(expiring(db, 'prospect', since)).toEqual([]);
		expect(runHousekeeping(db, since).prospects).toBe(0);
	});

	it('deletes a locked prospect but keeps the do-not-contact entries that lock them', () => {
		const locked = person('Locked', 'typed', since - 14 * MONTH, { email: 'l@x.id' });
		lockPerson(db, locked, { reason: 'asked', source: 'staff' });
		blockByHand(db, { kind: 'email', value: 'other@x.id', reason: '' });
		expect(expirePeople(db, 'prospect', since)).toBe(1);
		expect(getPerson(db, locked)).toBeUndefined();
		expect(listEntries(db)).toHaveLength(3);
	});
});

/* ───────────────────────── Legacy notices ───────────────────────── */

describe('legacy notices', () => {
	let db: DB;
	let since: number;
	let pastEvent: string;
	let eventId: string;

	/** A past attendee from before the boxes: origin checkin, no tick, a check-in on an old event. */
	function legacy(name: string, phone: string, email = `${name.toLowerCase()}@x.id`) {
		const id = createPerson(
			db,
			{ name, company: 'Batavia Foods', phone, email },
			{ origin: 'checkin' },
			since - 2 * MONTH
		);
		db.prepare(
			`INSERT INTO checkins (event_id, person_id, checked_in_at, method, device, consent_at)
			VALUES (?, ?, ?, 'form', 'ios', ?)`
		).run(pastEvent, id, since - 2 * MONTH, since - 2 * MONTH);
		touchLastEvent(db, id, since - 2 * MONTH);
		const rowId = addRowForPerson(db, eventId, id, { source: 'pool' });
		return { id, rowId };
	}

	beforeEach(() => {
		db = createDb(':memory:');
		since = consentBoxesSince(db)!;
		pastEvent = newEvent(db, since - 2 * MONTH);
		eventId = newEvent(db, since + 3 * MONTH);
	});

	it('stamps the first notice from its touch and takes it back when the touch is undone', () => {
		const { id, rowId } = legacy('Rina', '+6281234567890');
		expect(getPerson(db, id)!.legacy_notice_at).toBeNull();
		addTouch(db, eventId, rowId, { kind: 'legacy_notice', via: 'whatsapp' }, since + DAY);
		expect(getPerson(db, id)!.legacy_notice_at).toBe(since + DAY);
		// A second notice doesn't restart the clock.
		addTouch(db, eventId, rowId, { kind: 'legacy_notice', via: 'email' }, since + 5 * DAY);
		expect(getPerson(db, id)!.legacy_notice_at).toBe(since + DAY);
		clearLatestTouch(db, eventId, rowId, since + 6 * DAY);
		expect(getPerson(db, id)!.legacy_notice_at).toBe(since + DAY);
		clearLatestTouch(db, eventId, rowId, since + 6 * DAY);
		expect(getPerson(db, id)!.legacy_notice_at).toBeNull();
	});

	it('deletes legacy Indonesian attendees thirty days after the notice unless they answered', () => {
		const silent = legacy('Silent', '+6281111111111');
		const replied = legacy('Replied', '+6282222222222');
		const cameAgain = legacy('Came', '+6283333333333');
		const registered = legacy('Registered', '+6284444444444');
		const fresh = legacy('Fresh', '+6285555555555');
		const malaysian = legacy('Mei', '+60123456789');
		const untold = legacy('Untold', '+6286666666666');
		const noticeAt = since + DAY;
		for (const { rowId } of [silent, replied, cameAgain, registered, malaysian])
			addTouch(db, eventId, rowId, { kind: 'legacy_notice', via: 'whatsapp' }, noticeAt);
		addTouch(
			db,
			eventId,
			fresh.rowId,
			{ kind: 'legacy_notice', via: 'whatsapp' },
			noticeAt + 20 * DAY
		);

		// Each way of answering stamps legacy_kept_at (§5.4): the reply button, a check-in, the form.
		setReply(db, eventId, replied.rowId, 'maybe', noticeAt + 2 * DAY);
		checkIn(
			db,
			eventId,
			{ name: 'Came', email: 'came@x.id', phone: null, company: 'Batavia Foods', jobTitle: '' },
			{ method: 'form', device: 'ios', consent: true },
			noticeAt + 3 * DAY
		);
		const row = getEventPerson(db, eventId, registered.rowId)!;
		expect(
			submitRegistration(
				db,
				{ row, event: getEvent(db, eventId)! },
				{
					rsvp: 'no',
					email: null,
					phone: null,
					note: '',
					consentFuture: false,
					consentShare: false
				},
				noticeAt + 4 * DAY
			).status
		).toBe('saved');
		for (const { id } of [replied, cameAgain, registered])
			expect(getPerson(db, id)!.legacy_kept_at).not.toBeNull();
		expect(getPerson(db, silent.id)!.legacy_kept_at).toBeNull();
		// Nothing is due for the ones who never answered: the notice was their one message (§8).
		expect(getEventPerson(db, eventId, silent.rowId)!.next_action_at).toBeNull();

		const now = noticeAt + 30 * DAY;
		expect(expiring(db, 'legacy', now - 1)).toEqual([]);
		expect(expiring(db, 'legacy', now)).toEqual([silent.id]);
		expect(runHousekeeping(db, now).legacy).toBe(1);
		expect(names(db)).toEqual(['Came', 'Fresh', 'Mei', 'Registered', 'Replied', 'Untold']);
		expect(listActivity(db, null)[0]).toMatchObject({
			kind: 'delete',
			what: JSON.stringify({ job: 'legacy_expiry', personIds: [silent.id] })
		});
		expect(runHousekeeping(db, now).legacy).toBe(0);
		// The one told later goes on its own day.
		expect(runHousekeeping(db, now + 20 * DAY).legacy).toBe(1);
		expect(names(db)).not.toContain('Fresh');
	});

	it('keeps a legacy attendee who replied before the notice, and a customer, without one', () => {
		const early = legacy('Early', '+6281234567890');
		setReply(db, eventId, early.rowId, 'yes', since);
		expect(getPerson(db, early.id)!.legacy_kept_at).toBe(since);
		addTouch(db, eventId, early.rowId, { kind: 'legacy_notice', via: 'whatsapp' }, since + DAY);
		const customer = legacy('Customer', '+6289999999999');
		db.prepare(`UPDATE people SET is_customer = 1 WHERE id = ?`).run(customer.id);
		addTouch(db, eventId, customer.rowId, { kind: 'legacy_notice', via: 'whatsapp' }, since + DAY);
		expect(expiring(db, 'legacy', since + 40 * DAY)).toEqual([]);
		expect(runHousekeeping(db, since + 40 * DAY).legacy).toBe(0);
		expect(names(db)).toEqual(['Customer', 'Early']);
	});

	it('leaves a legacy attendee alone before any notice, and after a future-events tick', () => {
		const { id, rowId } = legacy('Rina', '+6281234567890');
		expect(runHousekeeping(db, since + 10 * MONTH).legacy).toBe(0);
		addTouch(db, eventId, rowId, { kind: 'legacy_notice', via: 'whatsapp' }, since);
		db.prepare(`UPDATE people SET consent_future_at = ? WHERE id = ?`).run(since + DAY, id);
		expect(runHousekeeping(db, since + 10 * MONTH).legacy).toBe(0);
		expect(getPerson(db, id)).toBeDefined();
	});
});

/* ───────────────────────── The Settings table ───────────────────────── */

describe('retentionCounts', () => {
	it('counts what each rule holds and what the next run removes', () => {
		const db = createDb(':memory:');
		const since = consentBoxesSince(db)!;
		const now = since + DAY;
		const started = newEvent(db, now - DAY);
		addFound(db, started, [guest('Andi'), guest('Budi'), guest('Citra')], { source: 'research' });
		skipRow(db, started, listEventPeople(db, started).find((r) => r.name === 'Citra')!.id);
		const purgeable = newEvent(db, now - 100 * DAY);
		addFound(db, purgeable, [guest('Dewi')], { source: 'research' });
		skipRow(db, purgeable, listEventPeople(db, purgeable)[0].id);
		runHousekeeping(db, now - 99 * DAY);

		const old = createPerson(db, { name: 'Eko' }, { origin: 'research' }, now - 14 * MONTH);
		createPerson(db, { name: 'Fajar' }, { origin: 'typed' }, now - DAY);
		addShortlisted(db, started, [guest('Gita', { reply: 'yes' })], { source: 'typed' });
		const legacyId = createPerson(
			db,
			{ name: 'Hana', phone: '+6281234567890' },
			{ origin: 'checkin' },
			since - MONTH
		);
		db.prepare(`UPDATE people SET legacy_notice_at = ? WHERE id = ?`).run(now - 40 * DAY, legacyId);
		blockByHand(db, { kind: 'email', value: 'gone@x.id', reason: '' });
		void old;

		expect(retentionCounts(db, now).map(({ key, total, due }) => ({ key, total, due }))).toEqual([
			{ key: 'found_unapproved', total: 2, due: 2 },
			{ key: 'found_skipped', total: 2, due: 1 },
			{ key: 'prospect', total: 2, due: 1 },
			{ key: 'legacy', total: 1, due: 1 },
			{ key: 'kept', total: 1, due: null },
			{ key: 'logs', total: null, due: null },
			{ key: 'dnc', total: 1, due: null }
		]);
		expect(retentionCounts(db, now).map(({ what, until }) => `${what} → ${until}`))
			.toMatchInlineSnapshot(`
				[
				  "Research finds nobody approved → the event starts",
				  "Research finds that were skipped → 90 days after the event starts, or Delete planning data",
				  "People found by research or typed in who never replied → 12 months after their last event",
				  "Past attendees in Indonesia who never ticked “future events” → 30 days after the notice, unless they reply",
				  "Attendees, customers and anyone who replied → deleted by hand",
				  "Touch and activity logs → with the row or the event",
				  "Do-not-contact entries → forever; removed by hand, with a reason",
				]
			`);

		// After the run, the table agrees with what it said would happen.
		expect(runHousekeeping(db, now)).toEqual({ started: 1, purged: 1, prospects: 1, legacy: 1 });
		expect(retentionCounts(db, now).map(({ key, total, due }) => ({ key, total, due }))).toEqual([
			{ key: 'found_unapproved', total: 0, due: 0 },
			{ key: 'found_skipped', total: 1, due: 0 },
			{ key: 'prospect', total: 1, due: 0 },
			{ key: 'legacy', total: 0, due: 0 },
			{ key: 'kept', total: 1, due: null },
			{ key: 'logs', total: null, due: null },
			{ key: 'dnc', total: 1, due: null }
		]);
	});
});

/* ───────────────────────── The scheduler ───────────────────────── */

describe('startScheduler', () => {
	afterEach(() => {
		stopScheduler();
		vi.useRealTimers();
	});

	it('starts nothing while building', () => {
		const db = createDb(':memory:');
		const run = vi.fn();
		expect(startScheduler(db, { building: true, run })).toBe(false);
		expect(run).not.toHaveBeenCalled();
		expect(schedulerRunning()).toBe(false);
	});

	it('runs at once, then daily, and only one copy survives a reload', () => {
		vi.useFakeTimers();
		const db = createDb(':memory:');
		const run = vi.fn();
		expect(startScheduler(db, { building: false, run })).toBe(true);
		expect(run).toHaveBeenCalledTimes(1);
		expect(startScheduler(db, { building: false, run })).toBe(false);
		expect(run).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(HOUSEKEEPING_INTERVAL);
		expect(run).toHaveBeenCalledTimes(2);
		stopScheduler();
		vi.advanceTimersByTime(HOUSEKEEPING_INTERVAL);
		expect(run).toHaveBeenCalledTimes(2);
		expect(schedulerRunning()).toBe(false);
	});

	it('keeps going when a run throws', () => {
		vi.useFakeTimers();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const db = createDb(':memory:');
		const run = vi.fn(() => {
			throw new Error('bad row');
		});
		expect(startScheduler(db, { building: false, run })).toBe(true);
		vi.advanceTimersByTime(HOUSEKEEPING_INTERVAL);
		expect(run).toHaveBeenCalledTimes(2);
		expect(error).toHaveBeenCalledTimes(2);
		error.mockRestore();
	});

	it('runs the real housekeeping and stamps the time', () => {
		const db = createDb(':memory:');
		expect(startScheduler(db, { building: false })).toBe(true);
		expect(housekeepingRanAt(db)).not.toBeNull();
	});
});
