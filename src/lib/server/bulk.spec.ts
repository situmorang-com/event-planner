import { beforeEach, describe, expect, it } from 'vitest';
import { fromLocalInput } from '../time.ts';
import { listActivity } from './activity-log';
import {
	bulkMarkInvited,
	bulkSetOwner,
	bulkSetStage,
	bulkShortlist,
	bulkSkip,
	copyToEvent
} from './bulk';
import { blockCompany, findCompany } from './companies';
import { createDb, type DB } from './database';
import { addEntry, lockPerson } from './do-not-contact';
import {
	addFound,
	addShortlisted,
	addTouch,
	confirmRow,
	getEventPerson,
	listEventPeople,
	listTouches,
	markInvited,
	setReply,
	type GuestInput
} from './event-people';
import { createEvent } from './events';

const TZ = 'Asia/Jakarta';
const at = (local: string) => fromLocalInput(local, TZ)!;
const NOW = at('2026-10-01T10:00');
const START = at('2026-10-16T09:00');

const guest = (name: string, extra: Partial<GuestInput> = {}): GuestInput => ({
	name,
	company: 'Batavia Foods',
	jobTitle: '',
	email: null,
	phone: null,
	...extra
});

const newEvent = (db: DB, name: string, startsAt = START) =>
	createEvent(db, { name, venue: '', startsAt, timezone: TZ, qrMode: 'static' });

/** The log entries of one kind, with `what` parsed. */
const logged = (db: DB, kind: 'bulk') =>
	listActivity(db, null)
		.filter((a) => a.kind === kind)
		.map((a) => ({ ...a, what: JSON.parse(a.what) as Record<string, unknown> }));

describe('bulk actions', () => {
	let db: DB;
	let eventId: string;
	const rows = () => listEventPeople(db, eventId);
	const byName = (name: string) => rows().find((r) => r.name === name)!;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = newEvent(db, 'Launch');
	});

	describe('bulkShortlist', () => {
		beforeEach(() => {
			addFound(
				db,
				eventId,
				[
					guest('Rina Wijaya', { email: 'rina@batavia.co.id' }),
					guest('Budi Santoso', { email: 'budi@batavia.co.id' }),
					guest('Citra Lestari', { company: 'Nusantara Steel' })
				],
				{ source: 'research' },
				NOW
			);
		});

		it('adds every Found row and reports the rest by id and reason', () => {
			addShortlisted(db, eventId, [guest('Dewi Anggraini')], { source: 'typed' }, NOW);
			const result = bulkShortlist(
				db,
				eventId,
				[byName('Rina Wijaya').id, byName('Citra Lestari').id, byName('Dewi Anggraini').id, 999],
				{ by: 'Edmund' },
				NOW
			);
			expect(result).toEqual({
				done: 2,
				refused: [
					{ id: byName('Dewi Anggraini').id, reason: 'already on the list' },
					{ id: 999, reason: 'not on this event' }
				]
			});
			expect(byName('Rina Wijaya')).toMatchObject({ stage: 'shortlisted', origin: 'research' });
			expect(byName('Rina Wijaya').person_id).not.toBeNull();
			expect(byName('Citra Lestari').stage).toBe('shortlisted');
			expect(byName('Budi Santoso').stage).toBe('found');
		});

		it('refuses a blocked company and a listed person, row by row', () => {
			blockCompany(db, findCompany(db, 'Batavia Foods')!.id, { reason: 'competitor' }, NOW);
			addEntry(
				db,
				{
					kind: 'name_company',
					value: 'Citra Lestari',
					company: 'Nusantara Steel',
					source: 'staff'
				},
				NOW
			);
			const ids = rows().map((r) => r.id);
			const result = bulkShortlist(db, eventId, ids, {}, NOW);
			expect(result.done).toBe(0);
			expect(result.refused.map((r) => r.reason).sort()).toEqual([
				'blocked company',
				'blocked company',
				'do not contact'
			]);
			expect(rows().every((r) => r.stage === 'found')).toBe(true);
			expect(logged(db, 'bulk')).toHaveLength(0);
		});

		it('logs one bulk row with ids and counts and never a name', () => {
			const ids = rows().map((r) => r.id);
			bulkShortlist(db, eventId, ids, { by: 'Edmund' }, NOW);
			const entries = logged(db, 'bulk');
			expect(entries).toHaveLength(1);
			expect(entries[0]).toMatchObject({ event_id: eventId, who: 'Edmund', row_count: 3 });
			expect(entries[0].what).toEqual({ action: 'shortlist', ids, refused: [] });
			expect(JSON.stringify(entries[0].what)).not.toMatch(/Rina|Budi|Citra|batavia/i);
		});

		it('rolls the whole batch back when a row throws part-way through', () => {
			const ids = rows().map((r) => r.id);
			// The second row refuses to be written: SQLite raises inside the transaction.
			db.exec(
				`CREATE TRIGGER boom BEFORE UPDATE ON event_people WHEN NEW.id = ${ids[1]}
				BEGIN SELECT RAISE(ABORT, 'boom'); END`
			);
			expect(() => bulkShortlist(db, eventId, ids, {}, NOW)).toThrow(/boom/);
			expect(rows().every((r) => r.stage === 'found' && r.person_id === null)).toBe(true);
			expect(db.prepare(`SELECT COUNT(*) AS n FROM people`).get()).toEqual({ n: 0 });
			expect(logged(db, 'bulk')).toHaveLength(0);
		});
	});

	describe('bulkSkip', () => {
		it('skips Found rows, even at a blocked company, and leaves live rows alone', () => {
			addFound(
				db,
				eventId,
				[guest('Rina Wijaya'), guest('Budi Santoso')],
				{ source: 'paste' },
				NOW
			);
			addShortlisted(db, eventId, [guest('Dewi Anggraini')], { source: 'typed' }, NOW);
			blockCompany(db, findCompany(db, 'Batavia Foods')!.id, {}, NOW);
			const result = bulkSkip(
				db,
				eventId,
				[byName('Rina Wijaya').id, byName('Dewi Anggraini').id],
				{ by: 'Edmund' },
				NOW
			);
			expect(result).toEqual({
				done: 1,
				refused: [{ id: byName('Dewi Anggraini').id, reason: 'already on the list' }]
			});
			expect(byName('Rina Wijaya')).toMatchObject({ skipped_at: NOW, skipped_by: 'Edmund' });
			expect(byName('Budi Santoso').skipped_at).toBeNull();
			expect(logged(db, 'bulk')[0].what).toMatchObject({ action: 'skip' });
		});
	});

	describe('bulkMarkInvited', () => {
		beforeEach(() => {
			addShortlisted(
				db,
				eventId,
				[
					guest('Rina Wijaya', { phone: '+628123456789' }),
					guest('Budi Santoso', { email: 'budi@batavia.co.id' }),
					guest('Citra Lestari', { company: 'Nusantara Steel' })
				],
				{ source: 'typed' },
				NOW
			);
		});

		it('records one invitation touch per row and computes the chase that follows', () => {
			const result = bulkMarkInvited(
				db,
				eventId,
				[byName('Rina Wijaya').id, byName('Budi Santoso').id],
				'whatsapp',
				{ by: 'Edmund' },
				NOW
			);
			expect(result).toEqual({ done: 2, refused: [] });
			for (const name of ['Rina Wijaya', 'Budi Santoso']) {
				expect(byName(name)).toMatchObject({
					stage: 'invited',
					invited_at: NOW,
					invited_via: 'whatsapp',
					last_contacted_at: NOW,
					touch_count: 1,
					next_action_kind: 'chase',
					next_action_at: at('2026-10-06T10:00')
				});
				expect(listTouches(db, byName(name).id)[0]).toMatchObject({ by: 'Edmund' });
			}
			expect(byName('Citra Lestari').stage).toBe('shortlisted');
			expect(logged(db, 'bulk')[0].what).toMatchObject({ action: 'invited', via: 'whatsapp' });
		});

		it('refuses a locked person and a row past shortlisted', () => {
			lockPerson(db, byName('Rina Wijaya').person_id!, { source: 'staff' }, NOW);
			setReply(db, eventId, byName('Budi Santoso').id, 'yes', NOW);
			const result = bulkMarkInvited(
				db,
				eventId,
				rows().map((r) => r.id),
				'email',
				{},
				NOW
			);
			expect(result.done).toBe(1);
			expect(result.refused).toEqual([
				{ id: byName('Rina Wijaya').id, reason: 'locked' },
				{ id: byName('Budi Santoso').id, reason: 'not at that stage' }
			]);
			expect(byName('Rina Wijaya')).toMatchObject({ stage: 'shortlisted', touch_count: 0 });
		});
	});

	describe('bulkSetOwner', () => {
		it('sets or clears the override on live rows only', () => {
			addShortlisted(db, eventId, [guest('Rina Wijaya')], { source: 'typed' }, NOW);
			addFound(db, eventId, [guest('Budi Santoso')], { source: 'paste' }, NOW);
			const ids = rows().map((r) => r.id);
			expect(bulkSetOwner(db, eventId, ids, 'Edmund', {}, NOW)).toEqual({
				done: 1,
				refused: [{ id: byName('Budi Santoso').id, reason: 'not on the list yet' }]
			});
			expect(byName('Rina Wijaya').owner).toBe('Edmund');
			expect(bulkSetOwner(db, eventId, [byName('Rina Wijaya').id], null, {}, NOW).done).toBe(1);
			expect(byName('Rina Wijaya').owner).toBeNull();
			expect(logged(db, 'bulk')).toHaveLength(2);
		});
	});

	describe('bulkSetStage', () => {
		beforeEach(() => {
			addShortlisted(
				db,
				eventId,
				[guest('Rina Wijaya', { phone: '+628123456789' }), guest('Budi Santoso')],
				{ source: 'typed' },
				NOW
			);
		});

		it('moves shortlisted to invited by other means', () => {
			const result = bulkSetStage(db, eventId, [byName('Rina Wijaya').id], 'invited', {}, NOW);
			expect(result).toEqual({ done: 1, refused: [] });
			expect(byName('Rina Wijaya')).toMatchObject({
				stage: 'invited',
				invited_via: 'other',
				next_action_kind: 'chase'
			});
		});

		it('takes invited back to shortlisted, dropping the touches and the chase', () => {
			markInvited(db, eventId, byName('Rina Wijaya').id, 'whatsapp', {}, NOW);
			expect(byName('Rina Wijaya').next_action_at).not.toBeNull();
			addTouch(db, eventId, byName('Rina Wijaya').id, { kind: 'chase', via: 'whatsapp' }, NOW + 1);
			expect(byName('Rina Wijaya').touch_count).toBe(2);
			const result = bulkSetStage(
				db,
				eventId,
				[byName('Rina Wijaya').id, byName('Budi Santoso').id],
				'shortlisted',
				{},
				NOW + 2
			);
			expect(result).toEqual({
				done: 1,
				refused: [{ id: byName('Budi Santoso').id, reason: 'not at that stage' }]
			});
			expect(byName('Rina Wijaya')).toMatchObject({
				stage: 'shortlisted',
				invited_at: null,
				invited_via: null,
				last_contacted_at: null,
				touch_count: 0,
				next_action_at: null
			});
			expect(logged(db, 'bulk').at(-1)!.what).toMatchObject({
				action: 'stage',
				stage: 'shortlisted'
			});
		});

		it('never moves a reply or a confirmation', () => {
			setReply(db, eventId, byName('Rina Wijaya').id, 'yes', NOW);
			confirmRow(db, eventId, byName('Budi Santoso').id, 'registration', NOW);
			const ids = rows().map((r) => r.id);
			expect(bulkSetStage(db, eventId, ids, 'shortlisted', {}, NOW).done).toBe(0);
			expect(bulkSetStage(db, eventId, ids, 'invited', {}, NOW).done).toBe(0);
			expect(byName('Rina Wijaya').stage).toBe('replied');
			expect(byName('Budi Santoso').stage).toBe('confirmed');
		});
	});

	describe('copyToEvent', () => {
		let toId: string;
		const target = () => listEventPeople(db, toId);

		beforeEach(() => {
			toId = newEvent(db, 'Dinner', at('2026-11-20T19:00'));
			addShortlisted(
				db,
				eventId,
				[
					guest('Rina Wijaya', { email: 'rina@batavia.co.id' }),
					guest('Budi Santoso', { phone: '+628123456789' }),
					guest('Citra Lestari', { company: 'Nusantara Steel' })
				],
				{ source: 'typed' },
				NOW
			);
			addFound(db, eventId, [guest('Dewi Anggraini')], { source: 'research' }, NOW);
		});

		it('copies people at shortlisted with nothing of this event attached', () => {
			const rina = byName('Rina Wijaya');
			markInvited(db, eventId, rina.id, 'whatsapp', {}, NOW);
			setReply(db, eventId, rina.id, 'yes', NOW + 1);
			confirmRow(db, eventId, rina.id, 'registration', NOW + 2);
			db.prepare(
				`UPDATE event_people SET consent_event_at = ?, consent_share_at = ?, note = 'VIP', owner = 'Edmund'
				WHERE id = ?`
			).run(NOW, NOW, rina.id);
			expect(byName('Rina Wijaya').next_action_at).not.toBeNull();

			const result = copyToEvent(db, eventId, toId, [rina.id], { by: 'Edmund' }, NOW + 3);
			expect(result).toEqual({ done: 1, refused: [] });
			const copy = target()[0];
			expect(copy).toMatchObject({
				person_id: rina.person_id,
				stage: 'shortlisted',
				source: 'copied',
				reply: 'pending',
				replied_at: null,
				invited_at: null,
				last_contacted_at: null,
				confirmed_at: null,
				consent_event_at: null,
				consent_share_at: null,
				touch_count: 0,
				next_action_at: null,
				note: '',
				owner: 'Edmund',
				added_by: 'Edmund'
			});
			expect(listTouches(db, copy.id)).toEqual([]);
			// The source row is untouched.
			expect(byName('Rina Wijaya')).toMatchObject({ stage: 'confirmed', touch_count: 1 });
			const entry = logged(db, 'bulk')[0];
			expect(entry).toMatchObject({ event_id: toId, who: 'Edmund', row_count: 1 });
			expect(entry.what).toEqual({
				action: 'copy',
				fromEventId: eventId,
				ids: [rina.id],
				created: [copy.id],
				refused: []
			});
		});

		it('deduplicates against the target and ignores Found rows', () => {
			copyToEvent(db, eventId, toId, [byName('Rina Wijaya').id], {}, NOW);
			const ids = rows().map((r) => r.id);
			const result = copyToEvent(db, eventId, toId, ids, {}, NOW + 1);
			expect(result.done).toBe(2);
			expect(result.refused).toEqual([
				{ id: byName('Rina Wijaya').id, reason: 'already on the list' },
				{ id: byName('Dewi Anggraini').id, reason: 'not on the list yet' }
			]);
			expect(target()).toHaveLength(3);
			expect(copyToEvent(db, eventId, eventId, [byName('Budi Santoso').id], {}, NOW)).toEqual({
				done: 0,
				refused: [{ id: byName('Budi Santoso').id, reason: 'already on the list' }]
			});
		});

		it('refuses locked people, listed channels and blocked companies', () => {
			lockPerson(db, byName('Rina Wijaya').person_id!, { source: 'staff' }, NOW);
			addEntry(db, { kind: 'phone', value: '+628123456789', source: 'staff' }, NOW);
			blockCompany(db, findCompany(db, 'Nusantara Steel')!.id, {}, NOW);
			const ids = [byName('Rina Wijaya').id, byName('Budi Santoso').id, byName('Citra Lestari').id];
			const result = copyToEvent(db, eventId, toId, ids, {}, NOW);
			expect(result).toEqual({
				done: 0,
				refused: [
					{ id: ids[0], reason: 'locked' },
					{ id: ids[1], reason: 'do not contact' },
					{ id: ids[2], reason: 'blocked company' }
				]
			});
			expect(target()).toEqual([]);
			expect(logged(db, 'bulk')).toHaveLength(0);
		});

		it('rolls back when a row throws part-way through', () => {
			const ids = [byName('Rina Wijaya').id, byName('Budi Santoso').id];
			db.exec(
				`CREATE TRIGGER boom BEFORE INSERT ON event_people
				WHEN NEW.event_id = '${toId}' AND NEW.person_id = '${byName('Budi Santoso').person_id}'
				BEGIN SELECT RAISE(ABORT, 'boom'); END`
			);
			expect(() => copyToEvent(db, eventId, toId, ids, {}, NOW)).toThrow(/boom/);
			expect(target()).toEqual([]);
			expect(logged(db, 'bulk')).toHaveLength(0);
		});
	});
});

describe('bulk results and getEventPerson', () => {
	it('reads a row only on its own event', () => {
		const db = createDb(':memory:');
		const a = newEvent(db, 'A');
		const b = newEvent(db, 'B');
		addShortlisted(db, a, [guest('Rina Wijaya')], { source: 'typed' }, NOW);
		const id = listEventPeople(db, a)[0].id;
		expect(getEventPerson(db, b, id)).toBeUndefined();
		expect(bulkSkip(db, b, [id], {}, NOW)).toEqual({
			done: 0,
			refused: [{ id, reason: 'not on this event' }]
		});
	});
});
