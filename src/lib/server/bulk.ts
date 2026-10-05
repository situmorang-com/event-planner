import { logActivity } from './activity-log.ts';
import type { DB } from './database.ts';
import { check as doNotContact } from './do-not-contact.ts';
import {
	addRowForPerson,
	findRow,
	getEventPerson,
	markInvited,
	setOwner,
	shortlistFound,
	skipRow,
	type EventPersonRow,
	type Refusal
} from './event-people.ts';
import { recomputeRow } from './next-action.ts';
import { touchLastEvent } from './people.ts';
import { applyChange, type Via } from './stages.ts';

/*
 * Bulk actions on the People page (§4.2, D22). Each one is one transaction over the rows the
 * organizer selected: a row that can't take the action is reported by id and reason and the
 * rest go through, except that a thrown error rolls the whole batch back, so the list never
 * ends up half-done. Locked people and blocked companies are refused row by row, the stored
 * next action follows each change (§5.2), and one activity_log row records ids and counts.
 */

export type BulkReason =
	| Refusal['reason']
	| 'not on this event'
	| 'not on the list yet'
	| 'already on the list'
	| 'not at that stage'
	| 'skipped';

export interface BulkResult {
	done: number;
	refused: { id: number; reason: BulkReason }[];
}

export type BulkAction = 'shortlist' | 'skip' | 'invited' | 'owner' | 'stage' | 'copy';

/** The stages a bulk "Set stage" may move rows between (§5.3): anything later needs an answer. */
export type BulkStage = 'shortlisted' | 'invited';

type Opts = { by?: string };

/** A locked person or a blocked company takes no action in bulk (D13); a suppressed one neither. */
function closed(row: EventPersonRow): BulkReason | null {
	if (row.blocked_at) return 'blocked company';
	if (row.locked_at) return 'locked';
	if (row.d365_suppressed) return 'suppressed';
	return null;
}

const unique = (ids: number[]) => [...new Set(ids)];

/**
 * Runs `each` over the rows inside one transaction and writes the log entry. `what` carries
 * only ids and counts: the log must never hold a name (§8).
 */
function batch(
	db: DB,
	eventId: string,
	action: BulkAction,
	ids: number[],
	{ by = '' }: Opts,
	now: number,
	each: (id: number, row: EventPersonRow | undefined) => BulkReason | null,
	extra: Record<string, unknown> = {}
): BulkResult {
	return db.transaction((): BulkResult => {
		const done: number[] = [];
		const refused: BulkResult['refused'] = [];
		for (const id of unique(ids)) {
			const reason = each(id, getEventPerson(db, eventId, id));
			if (reason) refused.push({ id, reason });
			else done.push(id);
		}
		if (done.length)
			logActivity(
				db,
				{
					eventId,
					kind: 'bulk',
					who: by,
					what: { action, ids: done, refused: refused.map((r) => r.id), ...extra },
					rowCount: done.length
				},
				now
			);
		return { done: done.length, refused };
	})();
}

/** Add on every selected Found row; a skipped one is unskipped by it, as the row's own Add is. */
export function bulkShortlist(
	db: DB,
	eventId: string,
	ids: number[],
	opts: Opts = {},
	now = Date.now()
): BulkResult {
	return batch(db, eventId, 'shortlist', ids, opts, now, (id, row) => {
		if (!row) return 'not on this event';
		if (row.stage !== 'found') return 'already on the list';
		const result = shortlistFound(db, eventId, id, { by: opts.by }, now);
		switch (result.status) {
			case 'added':
				return null;
			case 'refused':
				return result.reason;
			case 'duplicate':
				return 'already on the list';
			case 'missing':
				return 'not on this event';
		}
	});
}

/**
 * Skip is the one bulk verb that needs no lock or block check: hiding a Found row is what a
 * lock does to it anyway, and a blocked company's rows can be skipped and nothing else.
 */
export function bulkSkip(
	db: DB,
	eventId: string,
	ids: number[],
	opts: Opts = {},
	now = Date.now()
): BulkResult {
	return batch(db, eventId, 'skip', ids, opts, now, (id, row) => {
		if (!row) return 'not on this event';
		if (row.stage !== 'found') return 'already on the list';
		skipRow(db, eventId, id, { by: opts.by }, now);
		return null;
	});
}

/** Shortlisted rows become invited with one invitation touch each (§5.3); the via is shared. */
export function bulkMarkInvited(
	db: DB,
	eventId: string,
	ids: number[],
	via: Via,
	opts: Opts = {},
	now = Date.now()
): BulkResult {
	return batch(
		db,
		eventId,
		'invited',
		ids,
		opts,
		now,
		(id, row) => {
			if (!row) return 'not on this event';
			if (row.stage === 'found') return 'not on the list yet';
			if (row.skipped_at) return 'skipped';
			if (row.stage !== 'shortlisted') return 'not at that stage';
			const reason = closed(row);
			if (reason) return reason;
			markInvited(db, eventId, id, via, { by: opts.by }, now);
			return null;
		},
		{ via }
	);
}

/** NULL means "the company's owner" (D1). Live rows only: a Found row has nobody to own yet. */
export function bulkSetOwner(
	db: DB,
	eventId: string,
	ids: number[],
	owner: string | null,
	opts: Opts = {},
	now = Date.now()
): BulkResult {
	return batch(db, eventId, 'owner', ids, opts, now, (id, row) => {
		if (!row) return 'not on this event';
		if (row.stage === 'found') return 'not on the list yet';
		const reason = closed(row);
		if (reason) return reason;
		setOwner(db, eventId, id, owner, now);
		return null;
	});
}

/**
 * Shortlisted ↔ invited only. Forward is an invitation by other means; back says they were
 * never invited after all, so the row's touches go and the dates are recounted from nothing.
 * A reply, a confirmation or a check-in is the person's own word and is never set in bulk.
 */
export function bulkSetStage(
	db: DB,
	eventId: string,
	ids: number[],
	stage: BulkStage,
	{ via = 'other' as Via, by = '' }: Opts & { via?: Via } = {},
	now = Date.now()
): BulkResult {
	if (stage === 'invited') return bulkMarkInvited(db, eventId, ids, via, { by }, now);
	return batch(
		db,
		eventId,
		'stage',
		ids,
		{ by },
		now,
		(id, row) => {
			if (!row) return 'not on this event';
			if (row.stage === 'found') return 'not on the list yet';
			if (row.skipped_at) return 'skipped';
			if (row.stage !== 'invited') return 'not at that stage';
			const reason = closed(row);
			if (reason) return reason;
			db.prepare(`DELETE FROM touches WHERE event_person_id = ?`).run(id);
			applyChange(db, id, { type: 'recount', touches: [] }, now);
			return null;
		},
		{ stage }
	);
}

/**
 * Copies people from one event's list onto another's at Shortlisted (D22, §5.3). Only people
 * travel: a Found row is a snapshot, not a person yet. Replies, consents, touches and due
 * dates belong to the event they were given on and stay behind; the per-person owner comes
 * along. Someone already on the target, locked, suppressed, on the do-not-contact list or at
 * a blocked company is refused by id. Logged once, on the target event.
 */
export function copyToEvent(
	db: DB,
	fromEventId: string,
	toEventId: string,
	ids: number[],
	{ by = '' }: Opts = {},
	now = Date.now()
): BulkResult {
	return db.transaction((): BulkResult => {
		const done: number[] = [];
		const created: number[] = [];
		const refused: BulkResult['refused'] = [];
		for (const id of unique(ids)) {
			const row = getEventPerson(db, fromEventId, id);
			const reason = copyRefusal(db, toEventId, row);
			if (reason || !row?.person_id) {
				refused.push({ id, reason: reason ?? 'not on the list yet' });
				continue;
			}
			const newId = addRowForPerson(db, toEventId, row.person_id, { source: 'copied', by }, now);
			if (row.owner)
				db.prepare(`UPDATE event_people SET owner = ? WHERE id = ?`).run(row.owner, newId);
			recomputeRow(db, newId, now);
			touchLastEvent(db, row.person_id, now);
			done.push(id);
			created.push(newId);
		}
		if (done.length)
			logActivity(
				db,
				{
					eventId: toEventId,
					kind: 'bulk',
					who: by,
					what: {
						action: 'copy',
						fromEventId,
						ids: done,
						created,
						refused: refused.map((r) => r.id)
					},
					rowCount: done.length
				},
				now
			);
		return { done: done.length, refused };
	})();
}

function copyRefusal(
	db: DB,
	toEventId: string,
	row: EventPersonRow | undefined
): BulkReason | null {
	if (!row) return 'not on this event';
	if (!row.person_id) return 'not on the list yet';
	// A live row skipped by "Not me" (§4.6) is somebody else's person: not one to copy.
	if (row.skipped_at) return 'skipped';
	const reason = closed(row);
	if (reason) return reason;
	// The list may have grown since the person was locked (D13): the hashes are the truth.
	if (doNotContact(db, row)) return 'do not contact';
	if (findRow(db, toEventId, row.person_id)) return 'already on the list';
	return null;
}
