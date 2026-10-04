import type { MessageKind, Reply, Stage, Via } from '../people.ts';
import type { DB } from './database.ts';
import { recomputeRow } from './next-action.ts';

/*
 * The one place that changes an event row's stage (§5.3). Every verb elsewhere describes what
 * happened (a touch, a reply, a check-in) and lets nextState() decide the row's new shape, so
 * the transition table lives in one function and can be tested without a database.
 */

export type { Reply, Stage, Via } from '../people.ts';
export type TouchKind =
	| 'invitation'
	| 'chase'
	| 'reminder'
	| 'thanks_yes'
	| 'followup_maybe'
	| 'thanks_no'
	| 'legacy_notice'
	| 'manual';
export type ConfirmedVia = 'registration' | 'reconfirm';

export const STAGES: Stage[] = [
	'found',
	'shortlisted',
	'invited',
	'replied',
	'confirmed',
	'checked_in'
];
export const stageRank = (stage: Stage) => STAGES.indexOf(stage);

/** The columns a transition may touch. */
export interface StageState {
	stage: Stage;
	reply: Reply;
	replied_at: number | null;
	invited_at: number | null;
	invited_via: Via | null;
	last_contacted_at: number | null;
	confirmed_at: number | null;
	confirmed_via: ConfirmedVia | null;
	checkin_id: number | null;
	consent_event_at: number | null;
	skipped_at: number | null;
	skipped_by: string | null;
	next_action_at: number | null;
	next_action_kind: 'chase' | 'reminder' | null;
}

export type Touch = { kind: TouchKind; via: Via; at: number };

export type StageChange =
	| { type: 'shortlist' }
	| { type: 'skip'; by: string }
	| { type: 'unskip' }
	| { type: 'touch'; touch: Touch }
	| { type: 'reply'; reply: Reply }
	| { type: 'confirm'; via: ConfirmedVia }
	| { type: 'checkin'; checkinId: number; consentAt: number | null }
	| { type: 'checkout' }
	/** After a touch was deleted: what the remaining touches say. */
	| { type: 'recount'; touches: Touch[] }
	| { type: 'lock' };

/**
 * What a message tapped now is for (§7): the invitation until they have one, then a chase or
 * the follow-up that fits their answer. The messaging phase lets the row's menu override it.
 */
export function suggestedTouchKind(row: Pick<StageState, 'stage' | 'reply'>): MessageKind {
	if (row.stage === 'shortlisted') return 'invitation';
	switch (row.reply) {
		case 'yes':
			return row.stage === 'confirmed' ? 'reminder' : 'thanks_yes';
		case 'maybe':
			return 'followup_maybe';
		case 'no':
			return 'thanks_no';
		default:
			return 'chase';
	}
}

const none = { confirmed_at: null, confirmed_via: null } as const;

/** What the row becomes; null when the change doesn't apply at its current stage. */
export function nextState(
	row: StageState,
	change: StageChange,
	now: number
): Partial<StageState> | null {
	const { stage } = row;
	switch (change.type) {
		case 'shortlist':
			return stage === 'found'
				? { stage: 'shortlisted', skipped_at: null, skipped_by: null }
				: null;

		case 'skip':
			return stage === 'found' ? { skipped_at: now, skipped_by: change.by } : null;

		case 'unskip':
			return stage === 'found' && row.skipped_at ? { skipped_at: null, skipped_by: null } : null;

		case 'touch': {
			if (stage === 'found') return null;
			const { kind, via, at } = change.touch;
			const last_contacted_at = Math.max(row.last_contacted_at ?? 0, at);
			// Anything sent to someone not yet invited is the invitation, whatever it was called.
			if (stage === 'shortlisted' || kind === 'invitation')
				return {
					stage: stage === 'shortlisted' ? 'invited' : stage,
					invited_at: row.invited_at ?? at,
					invited_via: row.invited_via ?? via,
					last_contacted_at
				};
			return { last_contacted_at };
		}

		case 'reply': {
			if (stage === 'found') return null;
			const reply = change.reply;
			if (reply === 'pending')
				return {
					reply,
					replied_at: null,
					...none,
					stage: stage === 'replied' || stage === 'confirmed' ? 'invited' : stage
				};
			// A repeated tap on the same answer keeps the original time, as today.
			const replied_at = row.reply === reply ? (row.replied_at ?? now) : now;
			switch (stage) {
				case 'shortlisted':
					// A reply before any touch: they were reached some other way (a phone call).
					return {
						stage: 'replied',
						reply,
						replied_at,
						invited_at: row.invited_at ?? replied_at,
						invited_via: row.invited_via ?? 'other'
					};
				case 'invited':
				case 'replied':
					return { stage: 'replied', reply, replied_at };
				case 'confirmed':
					// A confirmation is a yes; anything else takes it back.
					return reply === 'yes'
						? { reply, replied_at }
						: { stage: 'replied', reply, replied_at, ...none };
				case 'checked_in':
					return reply === 'no' ? { reply, replied_at, ...none } : { reply, replied_at };
			}
			return null;
		}

		case 'confirm':
			if (stage === 'found') return null;
			return {
				stage: stage === 'checked_in' ? 'checked_in' : 'confirmed',
				reply: 'yes',
				replied_at: row.reply === 'yes' ? (row.replied_at ?? now) : now,
				invited_at: row.invited_at ?? now,
				invited_via: row.invited_via ?? 'other',
				confirmed_at: now,
				confirmed_via: change.via
			};

		case 'checkin':
			return {
				stage: 'checked_in',
				checkin_id: change.checkinId,
				consent_event_at: change.consentAt,
				skipped_at: null,
				skipped_by: null,
				next_action_at: null,
				next_action_kind: null
			};

		case 'checkout': {
			if (stage !== 'checked_in') return null;
			const previous: Stage = row.confirmed_at
				? 'confirmed'
				: row.reply !== 'pending'
					? 'replied'
					: row.invited_at
						? 'invited'
						: 'shortlisted';
			return { stage: previous, checkin_id: null, consent_event_at: null };
		}

		case 'recount': {
			if (stage === 'found') return null;
			const invitation = change.touches
				.filter((t) => t.kind === 'invitation')
				.sort((a, b) => a.at - b.at)[0];
			const replied = row.reply !== 'pending';
			const invited_at = invitation?.at ?? (replied ? row.replied_at : null);
			const invited_via = invitation
				? invitation.via
				: replied
					? (row.invited_via ?? 'other')
					: null;
			const last_contacted_at = change.touches.length
				? Math.max(...change.touches.map((t) => t.at))
				: null;
			return {
				invited_at,
				invited_via,
				last_contacted_at,
				stage: stage === 'invited' && !invited_at ? 'shortlisted' : stage
			};
		}

		case 'lock':
			return { next_action_at: null, next_action_kind: null };
	}
}

const COLUMNS: (keyof StageState)[] = [
	'stage',
	'reply',
	'replied_at',
	'invited_at',
	'invited_via',
	'last_contacted_at',
	'confirmed_at',
	'confirmed_via',
	'checkin_id',
	'consent_event_at',
	'skipped_at',
	'skipped_by',
	'next_action_at',
	'next_action_kind'
];

export function getStageState(db: DB, rowId: number): (StageState & { id: number }) | undefined {
	return db
		.prepare(`SELECT id, ${COLUMNS.join(', ')} FROM event_people WHERE id = ?`)
		.get(rowId) as (StageState & { id: number }) | undefined;
}

/**
 * Applies a change to one row and recomputes what it is due next (§5.2). Returns the new
 * state, or null when the change didn't apply.
 */
export function applyChange(
	db: DB,
	rowId: number,
	change: StageChange,
	now = Date.now()
): StageState | null {
	const row = getStageState(db, rowId);
	if (!row) return null;
	const next = nextState(row, change, now);
	if (!next) return null;
	const keys = (Object.keys(next) as (keyof StageState)[]).filter((k) => COLUMNS.includes(k));
	if (keys.length) {
		db.prepare(
			`UPDATE event_people SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = @now
			WHERE id = @id`
		).run({ ...next, now, id: rowId });
	}
	recomputeRow(db, rowId, now);
	return { ...row, ...next };
}
