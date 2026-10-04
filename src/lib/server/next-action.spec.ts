import { beforeEach, describe, expect, it } from 'vitest';
import { fromLocalInput } from '../time';
import { createDb, type DB } from './database';
import {
	addShortlisted,
	addTouch,
	clearLatestTouch,
	listEventPeople,
	markInvited,
	setReply,
	type GuestInput
} from './event-people';
import { createEvent, getEvent, setChaseRules, updateEvent } from './events';
import {
	addWorkingDays,
	computeNextAction,
	countDue,
	recomputeEvent,
	rulesFor,
	setNextActionOverride,
	type NextAction,
	type RuleCompany,
	type RuleEvent,
	type RulePerson,
	type RuleRow
} from './next-action';
import { peopleView } from './people-page';
import { CHASE_DEFAULTS, setChaseDefaults } from './settings';

const TZ = 'Asia/Jakarta';
const at = (local: string) => fromLocalInput(local, TZ)!;

// October 2026: the 1st is a Thursday, the 16th (the event) a Friday.
const NOW = at('2026-10-01T10:00');
const START = at('2026-10-16T09:00');
const EVENT: RuleEvent = { starts_at: START, timezone: TZ };

const person = (extra: Partial<RulePerson> = {}): RulePerson => ({
	locked_at: null,
	d365_suppressed: 0,
	d365_no_email: 0,
	d365_no_phone: 0,
	is_customer: 0,
	origin: 'typed',
	consent_future_at: null,
	created_at: at('2026-09-01T09:00'),
	country: 'ID',
	phone: '+628123456789',
	attendee: false,
	...extra
});

const invited = (extra: Partial<RuleRow> = {}): RuleRow => ({
	stage: 'invited',
	reply: 'pending',
	replied_at: null,
	invited_at: NOW,
	last_contacted_at: NOW,
	confirmed_at: null,
	skipped_at: null,
	next_action_at: null,
	next_action_kind: null,
	next_action_overridden: 0,
	touches: [{ kind: 'invitation' }],
	...extra
});

const OPEN: RuleCompany = { never_invite_at: null };

function compute(
	row: RuleRow,
	who: RulePerson | null = person(),
	company: RuleCompany = OPEN,
	event: RuleEvent = EVENT,
	now = NOW,
	rules = CHASE_DEFAULTS
) {
	return computeNextAction(row, who, company, event, rules, now, at('2026-09-15T00:00'));
}

describe('addWorkingDays', () => {
	it('skips weekends in the event zone and keeps the time of day', () => {
		expect(addWorkingDays(at('2026-10-01T10:00'), 3, TZ)).toBe(at('2026-10-06T10:00'));
		expect(addWorkingDays(at('2026-10-03T10:00'), 3, TZ)).toBe(at('2026-10-07T10:00'));
		expect(addWorkingDays(at('2026-10-09T18:00'), 1, TZ)).toBe(at('2026-10-12T18:00'));
		expect(addWorkingDays(NOW, 0, TZ)).toBe(NOW);
	});
});

describe('computeNextAction', () => {
	const chaseOn = (local: string): NextAction => ({ kind: 'chase', at: at(local) });

	const table: [string, () => ReturnType<typeof compute>, ReturnType<typeof compute>][] = [
		[
			'invited: a chase three working days after the last message',
			() => compute(invited()),
			chaseOn('2026-10-06T10:00')
		],
		[
			'invited on a Saturday: counted from the Monday',
			() => compute(invited({ last_contacted_at: at('2026-10-03T10:00') })),
			chaseOn('2026-10-07T10:00')
		],
		[
			'cap for someone new: two messages, then nothing',
			() => compute(invited({ touches: [{ kind: 'invitation' }, { kind: 'chase' }] })),
			null
		],
		[
			'cap for a customer: three',
			() =>
				compute(
					invited({ touches: [{ kind: 'invitation' }, { kind: 'chase' }] }),
					person({ is_customer: 1 })
				),
			chaseOn('2026-10-06T10:00')
		],
		[
			'an attendee has a relationship',
			() =>
				compute(
					invited({ touches: [{ kind: 'invitation' }, { kind: 'chase' }] }),
					person({ attendee: true })
				),
			chaseOn('2026-10-06T10:00')
		],
		[
			'so does someone who ticked "future events"',
			() =>
				compute(
					invited({ touches: [{ kind: 'invitation' }, { kind: 'chase' }] }),
					person({ consent_future_at: NOW })
				),
			chaseOn('2026-10-06T10:00')
		],
		[
			'manual and thank-you touches never count',
			() =>
				compute(
					invited({ touches: [{ kind: 'invitation' }, { kind: 'manual' }, { kind: 'thanks_yes' }] })
				),
			chaseOn('2026-10-06T10:00')
		],
		[
			'a chase that would land inside the stop window is dropped',
			() => compute(invited({ last_contacted_at: at('2026-10-12T10:00') })),
			null
		],
		[
			'one that lands just before it is kept',
			() => compute(invited({ last_contacted_at: at('2026-10-09T10:00') })),
			chaseOn('2026-10-14T10:00')
		],
		[
			'a bigger stop window drops more',
			() =>
				compute(
					invited({ last_contacted_at: at('2026-10-09T10:00') }),
					person(),
					OPEN,
					EVENT,
					NOW,
					{
						...CHASE_DEFAULTS,
						stopDaysBeforeEvent: 3
					}
				),
			null
		],
		[
			'a reply of yes: a reminder two days before',
			() => compute(invited({ stage: 'replied', reply: 'yes', replied_at: NOW })),
			{ kind: 'reminder', at: at('2026-10-14T09:00') }
		],
		[
			'confirmed: the same reminder',
			() =>
				compute(invited({ stage: 'confirmed', reply: 'yes', replied_at: NOW, confirmed_at: NOW })),
			{ kind: 'reminder', at: at('2026-10-14T09:00') }
		],
		[
			'the reminder is floored to now',
			() =>
				compute(
					invited({ stage: 'replied', reply: 'yes', replied_at: NOW }),
					person(),
					OPEN,
					EVENT,
					at('2026-10-15T10:00')
				),
			{ kind: 'reminder', at: at('2026-10-15T10:00') }
		],
		[
			'a reminder already sent: nothing',
			() =>
				compute(
					invited({
						stage: 'replied',
						reply: 'yes',
						replied_at: NOW,
						touches: [{ kind: 'invitation' }, { kind: 'reminder' }]
					})
				),
			null
		],
		[
			'maybe: a follow-up three working days after the reply',
			() =>
				compute(
					invited({
						stage: 'replied',
						reply: 'maybe',
						replied_at: at('2026-10-02T10:00'),
						last_contacted_at: NOW
					})
				),
			chaseOn('2026-10-07T10:00')
		],
		[
			'maybe: a follow-up already sent restarts the clock',
			() =>
				compute(
					invited({
						stage: 'replied',
						reply: 'maybe',
						replied_at: at('2026-10-02T10:00'),
						last_contacted_at: at('2026-10-05T10:00'),
						touches: [{ kind: 'invitation' }, { kind: 'followup_maybe' }]
					}),
					person({ is_customer: 1 })
				),
			chaseOn('2026-10-08T10:00')
		],
		[
			'maybe: the cap counts invitations, chases and follow-ups',
			() =>
				compute(
					invited({
						stage: 'replied',
						reply: 'maybe',
						replied_at: at('2026-10-02T10:00'),
						touches: [{ kind: 'invitation' }, { kind: 'followup_maybe' }]
					})
				),
			null
		],
		[
			'an override is kept as set',
			() =>
				compute(
					invited({
						next_action_overridden: 1,
						next_action_kind: 'chase',
						next_action_at: at('2026-10-09T09:00')
					})
				),
			chaseOn('2026-10-09T09:00')
		],
		[
			'but not past a no',
			() =>
				compute(
					invited({
						stage: 'replied',
						reply: 'no',
						next_action_overridden: 1,
						next_action_kind: 'chase',
						next_action_at: at('2026-10-09T09:00')
					})
				),
			null
		],
		[
			'shortlisted: nothing yet',
			() => compute(invited({ stage: 'shortlisted', touches: [] })),
			null
		],
		['found: nothing', () => compute(invited({ stage: 'found', touches: [] }), null), null],
		['checked in: nothing', () => compute(invited({ stage: 'checked_in' })), null],
		['declined: nothing', () => compute(invited({ stage: 'replied', reply: 'no' })), null],
		['skipped ("not me"): nothing', () => compute(invited({ skipped_at: NOW })), null],
		['locked: nothing', () => compute(invited(), person({ locked_at: NOW })), null],
		['suppressed by D365: nothing', () => compute(invited(), person({ d365_suppressed: 1 })), null],
		[
			'blocked company: nothing',
			() => compute(invited(), person(), { never_invite_at: NOW }),
			null
		],
		[
			'not contactable (legacy Malaysian attendee): nothing',
			() =>
				compute(
					invited(),
					person({ origin: 'checkin', country: 'MY', created_at: at('2026-09-01T09:00') })
				),
			null
		],
		[
			'a legacy Indonesian attendee is still chased',
			() =>
				compute(
					invited(),
					person({ origin: 'checkin', country: 'ID', created_at: at('2026-09-01T09:00') })
				),
			chaseOn('2026-10-06T10:00')
		],
		[
			'both channels refused by D365: nothing',
			() => compute(invited(), person({ d365_no_email: 1, d365_no_phone: 1 })),
			null
		],
		[
			'once the event has begun: nothing',
			() => compute(invited(), person(), OPEN, EVENT, START),
			null
		],
		[
			'no date: nothing',
			() => compute(invited(), person(), OPEN, { starts_at: null, timezone: TZ }),
			null
		]
	];

	it.each(table)('%s', (_, run, expected) => {
		expect(run()).toEqual(expected);
	});
});

describe('recompute hooks', () => {
	let db: DB;
	let eventId: string;
	const guest = (name: string, extra: Partial<GuestInput> = {}): GuestInput => ({
		name,
		company: 'Batavia Foods',
		jobTitle: '',
		email: null,
		phone: '+628123456789',
		...extra
	});
	const row = () => listEventPeople(db, eventId)[0];
	const event = () => getEvent(db, eventId)!;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: START,
			timezone: TZ,
			qrMode: 'static'
		});
		addShortlisted(db, eventId, [guest('Rina Wijaya')], { source: 'typed' }, NOW);
	});

	it('a touch sets the chase and the next one moves it; clearing it moves it back', () => {
		expect(row()).toMatchObject({ next_action_at: null, next_action_kind: null });
		markInvited(db, eventId, row().id, 'whatsapp', {}, NOW);
		expect(row()).toMatchObject({
			next_action_at: at('2026-10-06T10:00'),
			next_action_kind: 'chase'
		});

		// The relationship cap is three, so a customer gets a second chase.
		db.prepare(`UPDATE people SET is_customer = 1`).run();
		const chased = at('2026-10-06T11:00');
		addTouch(db, eventId, row().id, { kind: 'chase', via: 'whatsapp' }, chased);
		expect(row()).toMatchObject({
			next_action_at: at('2026-10-09T11:00'),
			next_action_kind: 'chase'
		});

		clearLatestTouch(db, eventId, row().id, chased);
		expect(row()).toMatchObject({
			next_action_at: at('2026-10-06T10:00'),
			next_action_kind: 'chase'
		});
	});

	it('a reply clears the chase and sets the reminder; a no clears everything', () => {
		markInvited(db, eventId, row().id, 'whatsapp', {}, NOW);
		setReply(db, eventId, row().id, 'yes', at('2026-10-02T10:00'));
		expect(row()).toMatchObject({
			next_action_at: at('2026-10-14T09:00'),
			next_action_kind: 'reminder'
		});
		setReply(db, eventId, row().id, 'no', at('2026-10-02T11:00'));
		expect(row()).toMatchObject({ next_action_at: null, next_action_kind: null });
	});

	it('merges the event override over the settings defaults, field by field', () => {
		setChaseDefaults(db, { ...CHASE_DEFAULTS, reminderDaysBefore: 5 });
		expect(rulesFor(db, { chase_rules: null })).toEqual({
			...CHASE_DEFAULTS,
			reminderDaysBefore: 5
		});
		expect(
			rulesFor(db, { chase_rules: '{"chaseAfterWorkingDays":1,"maxTouches":{"none":4}}' })
		).toEqual({
			...CHASE_DEFAULTS,
			chaseAfterWorkingDays: 1,
			reminderDaysBefore: 5,
			maxTouches: { relationship: 3, none: 4 }
		});
		expect(rulesFor(db, { chase_rules: 'not json' })).toEqual({
			...CHASE_DEFAULTS,
			reminderDaysBefore: 5
		});

		// Saving the override recomputes the list straight away.
		markInvited(db, eventId, row().id, 'whatsapp', {}, NOW);
		setChaseRules(db, eventId, { ...CHASE_DEFAULTS, chaseAfterWorkingDays: 1 }, NOW);
		expect(row().next_action_at).toBe(at('2026-10-02T10:00'));
		setChaseRules(db, eventId, null, NOW);
		expect(row().next_action_at).toBe(at('2026-10-06T10:00'));
	});

	it('keeps an override until it is cleared, and drops it once the rules say never', () => {
		markInvited(db, eventId, row().id, 'whatsapp', {}, NOW);
		const own = at('2026-10-09T09:00');
		expect(setNextActionOverride(db, eventId, row().id, own, NOW)).toEqual({
			kind: 'chase',
			at: own
		});
		expect(row()).toMatchObject({ next_action_at: own, next_action_overridden: 1 });
		// Another touch would move the computed date; the organizer's stays.
		addTouch(db, eventId, row().id, { kind: 'chase', via: 'email' }, at('2026-10-02T10:00'));
		expect(row()).toMatchObject({ next_action_at: own, next_action_overridden: 1 });
		setNextActionOverride(db, eventId, row().id, null, NOW);
		expect(row()).toMatchObject({ next_action_overridden: 0, next_action_at: null });

		setNextActionOverride(db, eventId, row().id, own, NOW);
		setReply(db, eventId, row().id, 'no', NOW);
		expect(row()).toMatchObject({ next_action_at: null, next_action_overridden: 0 });
	});

	it('follows the event date, and clears everything once the event has begun', () => {
		markInvited(db, eventId, row().id, 'whatsapp', {}, NOW);
		updateEvent(
			db,
			eventId,
			{
				name: 'Launch',
				venue: '',
				startsAt: at('2026-10-05T09:00'),
				timezone: TZ,
				qrMode: 'static'
			},
			NOW
		);
		// The chase would land after the stop window now.
		expect(row().next_action_at).toBeNull();
		updateEvent(
			db,
			eventId,
			{ name: 'Launch', venue: '', startsAt: START, timezone: TZ, qrMode: 'static' },
			NOW
		);
		expect(row().next_action_at).toBe(at('2026-10-06T10:00'));
		expect(recomputeEvent(db, eventId, START)).toBe(0);
		expect(row().next_action_at).toBeNull();
	});

	it('counts what is due today or earlier, in the event zone', () => {
		addShortlisted(
			db,
			eventId,
			[guest('Budi Santoso', { phone: '+628129876543' })],
			{ source: 'typed' },
			NOW
		);
		const [rina, budi] = listEventPeople(db, eventId);
		markInvited(db, eventId, rina.id, 'whatsapp', {}, NOW); // due Tue 6 Oct 10:00
		markInvited(db, eventId, budi.id, 'whatsapp', {}, at('2026-10-02T10:00')); // due Wed 7 Oct
		const env = { org: 'SRKK', privacyUrl: '', base: 'https://ep.test', secret: 's' };

		const monday = at('2026-10-05T12:00');
		expect(peopleView(db, event(), env, monday).due).toBe(0);
		expect(countDue(db, event(), monday)).toBe(0);

		const tuesdayMorning = at('2026-10-06T08:00');
		const view = peopleView(db, event(), env, tuesdayMorning);
		expect(view.due).toBe(1);
		expect(view.today).toEqual({ start: at('2026-10-06T00:00'), end: at('2026-10-07T00:00') - 1 });
		expect(countDue(db, event(), tuesdayMorning)).toBe(1);
		expect(countDue(db, event(), at('2026-10-07T23:30'))).toBe(2);
	});
});
