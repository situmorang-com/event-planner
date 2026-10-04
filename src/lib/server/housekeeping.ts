import { logActivity } from './activity-log.ts';
import type { DB } from './database.ts';
import { getEvent } from './events.ts';
import { runEventStart } from './jobs.ts';
import { recomputeAll } from './next-action.ts';
import {
	DAY,
	personRetention,
	PLANNING_PURGE_DAYS,
	RETENTION_RULES,
	type PersonRule,
	type RetentionPerson,
	type RetentionRule
} from './retention.ts';
import { consentBoxesSince, getSetting, setSetting } from './settings.ts';

/*
 * The housekeeping jobs (§5.4): what the app deletes by itself and when. runHousekeeping()
 * runs them all in one pass, at startup and then daily from the scheduler below; the event
 * start job is also checked lazily when an event's pages load (jobs.ts), so a list opened
 * before the daily run is right. Every job is idempotent: a second run at the same moment
 * changes nothing, and each deletion is logged with ids and counts only (§8).
 */

export interface HousekeepingReport {
	/** Events whose unapproved Found rows were just deleted. */
	started: number;
	/** Events whose planning data was just purged. */
	purged: number;
	/** Prospects deleted on the twelve-month clock. */
	prospects: number;
	/** Legacy attendees deleted thirty days after the notice. */
	legacy: number;
}

export function runHousekeeping(db: DB, now = Date.now()): HousekeepingReport {
	return db.transaction((): HousekeepingReport => {
		const starting = db
			.prepare(
				`SELECT id FROM events WHERE starts_at IS NOT NULL AND starts_at <= ?
				AND started_job_at IS NULL`
			)
			.all(now) as { id: string }[];
		let started = 0;
		for (const { id } of starting) if (runEventStart(db, id, now) !== null) started++;

		const purging = db
			.prepare(
				`SELECT id FROM events WHERE starts_at IS NOT NULL AND starts_at + ? <= ?
				AND planning_purged_at IS NULL`
			)
			.all(PLANNING_PURGE_DAYS * DAY, now) as { id: string }[];
		let purged = 0;
		for (const { id } of purging) if (purgePlanning(db, id, {}, now) !== null) purged++;

		const prospects = expirePeople(db, 'prospect', now);
		const legacy = expirePeople(db, 'legacy', now);
		// The daily next-action pass (§5.2): "due" moves with the clock, not with a write.
		recomputeAll(db, now);
		setSetting(db, 'housekeeping_ran_at', String(now));
		return { started, purged, prospects, legacy };
	})();
}

/** When housekeeping last ran, for the Settings page; null before the first run. */
export function housekeepingRanAt(db: DB): number | null {
	const v = getSetting(db, 'housekeeping_ran_at');
	return v === null ? null : Number(v);
}

/* ───────────────────────── Planning purge (D10) ───────────────────────── */

/**
 * Deletes what research left behind: every remaining Found row, skipped ones included, and
 * the research stamps on the target companies. The brief and the companies stay: they are
 * event configuration, not personal data, and "copy from a previous event" needs them. Runs
 * 90 days after the start, or from the Planning tab's button at any time. Returns how many
 * rows went, or null for an unknown event.
 */
export function purgePlanning(
	db: DB,
	eventId: string,
	{ by = '' } = {},
	now = Date.now()
): number | null {
	return db.transaction((): number | null => {
		if (!getEvent(db, eventId)) return null;
		const { changes } = db
			.prepare(`DELETE FROM event_people WHERE event_id = ? AND stage = 'found'`)
			.run(eventId);
		db.prepare(
			`UPDATE event_companies SET research_requested_at = NULL, researched_at = NULL
			WHERE event_id = ?`
		).run(eventId);
		db.prepare(`UPDATE events SET planning_purged_at = ? WHERE id = ?`).run(now, eventId);
		logActivity(
			db,
			{ eventId, kind: 'purge', who: by, what: { job: 'planning_purge' }, rowCount: changes },
			now
		);
		return changes;
	})();
}

/* ───────────────────────── Prospects and legacy attendees (D15, D18) ───────────────────────── */

interface Candidate extends RetentionPerson {
	id: string;
	attendee: 0 | 1;
	replied: 0 | 1;
}

// Everyone in the pool with the two facts the rules need beyond their own row (§2.3).
const CANDIDATES = `SELECT p.id, p.origin, p.is_customer, p.consent_future_at, p.legacy_notice_at,
	p.legacy_kept_at, p.last_event_at, p.created_at, p.country, p.phone,
	EXISTS (SELECT 1 FROM checkins c WHERE c.person_id = p.id) AS attendee,
	EXISTS (SELECT 1 FROM event_people ep WHERE ep.person_id = p.id AND ep.reply <> 'pending')
		AS replied
	FROM people p`;

/** Every person with the rule that holds them and its date. */
function retentionOfEveryone(db: DB) {
	const since = consentBoxesSince(db);
	return (db.prepare(CANDIDATES).all() as Candidate[]).map((p) => ({
		id: p.id,
		...personRetention(p, { attendee: !!p.attendee, replied: !!p.replied, since })
	}));
}

/** Who the next run deletes under one rule: their clock has run out. */
export function expiring(db: DB, rule: Exclude<PersonRule, 'kept'>, now = Date.now()): string[] {
	return retentionOfEveryone(db)
		.filter((p) => p.rule === rule && p.until !== null && p.until <= now)
		.map((p) => p.id);
}

const JOB: Record<Exclude<PersonRule, 'kept'>, string> = {
	prospect: 'prospect_expiry',
	legacy: 'legacy_expiry'
};

/** Deletes everyone whose clock under the rule has run out, cascading to their rows; logged. */
export function expirePeople(db: DB, rule: Exclude<PersonRule, 'kept'>, now = Date.now()): number {
	return db.transaction(() => {
		const ids = expiring(db, rule, now);
		if (!ids.length) return 0;
		const rows = (
			db
				.prepare(
					`SELECT COUNT(*) AS n FROM event_people WHERE person_id IN (SELECT value FROM json_each(?))`
				)
				.get(JSON.stringify(ids)) as { n: number }
		).n;
		db.prepare(`DELETE FROM people WHERE id IN (SELECT value FROM json_each(?))`).run(
			JSON.stringify(ids)
		);
		logActivity(
			db,
			{ kind: 'delete', what: { job: JOB[rule], personIds: ids }, rowCount: ids.length + rows },
			now
		);
		return ids.length;
	})();
}

/* ───────────────────────── The Settings table ───────────────────────── */

export interface RetentionCount extends RetentionRule {
	/** How many are held by the rule now; null where nothing is counted. */
	total: number | null;
	/** How many of them the next run removes; null where the rule never runs by itself. */
	due: number | null;
}

/** The §5.4 table with counts of what is held and what the next run removes. */
export function retentionCounts(db: DB, now = Date.now()): RetentionCount[] {
	const count = (sql: string, ...params: unknown[]) =>
		(db.prepare(`SELECT COUNT(*) AS n ${sql}`).get(...params) as { n: number }).n;
	const people = retentionOfEveryone(db);
	const under = (rule: PersonRule) => people.filter((p) => p.rule === rule);
	const dueUnder = (rule: PersonRule) =>
		under(rule).filter((p) => p.until !== null && p.until <= now).length;

	const counts: Record<RetentionRule['key'], { total: number | null; due: number | null }> = {
		found_unapproved: {
			total: count(`FROM event_people WHERE stage = 'found' AND skipped_at IS NULL`),
			due: count(
				`FROM event_people ep JOIN events e ON e.id = ep.event_id
				WHERE ep.stage = 'found' AND ep.skipped_at IS NULL AND e.starts_at IS NOT NULL
					AND e.starts_at <= ? AND e.started_job_at IS NULL`,
				now
			)
		},
		found_skipped: {
			total: count(`FROM event_people WHERE stage = 'found' AND skipped_at IS NOT NULL`),
			due: count(
				`FROM event_people ep JOIN events e ON e.id = ep.event_id
				WHERE ep.stage = 'found' AND ep.skipped_at IS NOT NULL AND e.starts_at IS NOT NULL
					AND e.starts_at + ? <= ? AND e.planning_purged_at IS NULL`,
				PLANNING_PURGE_DAYS * DAY,
				now
			)
		},
		prospect: { total: under('prospect').length, due: dueUnder('prospect') },
		legacy: { total: under('legacy').length, due: dueUnder('legacy') },
		kept: { total: under('kept').length, due: null },
		logs: { total: null, due: null },
		dnc: { total: count(`FROM do_not_contact WHERE removed_at IS NULL`), due: null }
	};
	return RETENTION_RULES.map((rule) => ({ ...rule, ...counts[rule.key] }));
}

/* ───────────────────────── The scheduler ───────────────────────── */

export const HOUSEKEEPING_INTERVAL = 24 * 3_600_000;

// Kept on globalThis like the db handle, so a Vite reload of this module finds the timer it
// started earlier instead of starting a second one.
const g = globalThis as typeof globalThis & { __housekeeping?: ReturnType<typeof setInterval> };

export interface SchedulerOptions {
	/** `building` from $app/environment: the build imports server modules and must run nothing. */
	building: boolean;
	interval?: number;
	run?: (db: DB, now: number) => unknown;
}

/**
 * Runs housekeeping now and then every 24 hours. The timer is unref()'d so it never keeps the
 * process alive, and a failing run is logged rather than thrown: a bad row must not stop the
 * server or the next day's pass. Returns whether a scheduler was started by this call.
 */
export function startScheduler(
	db: DB,
	{ building, interval = HOUSEKEEPING_INTERVAL, run = runHousekeeping }: SchedulerOptions
): boolean {
	if (building || g.__housekeeping) return false;
	const tick = () => {
		try {
			run(db, Date.now());
		} catch (e) {
			console.error('housekeeping failed', e);
		}
	};
	tick();
	const timer = setInterval(tick, interval);
	timer.unref();
	g.__housekeeping = timer;
	return true;
}

export function stopScheduler() {
	if (!g.__housekeeping) return;
	clearInterval(g.__housekeeping);
	delete g.__housekeeping;
}

export const schedulerRunning = () => g.__housekeeping !== undefined;
