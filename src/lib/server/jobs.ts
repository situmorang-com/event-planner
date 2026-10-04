// The jobs from §5.4 that run per event. Each is idempotent and stamps the event when it has
// run, so the lazy call from a page load and the scheduler (Phase C) can never run one twice.
import { logActivity } from './activity-log.ts';
import type { DB } from './database.ts';
import { getEvent, type EventRow } from './events.ts';
import { recomputeEvent } from './next-action.ts';

/**
 * Event start (D17): once the event has begun, Found rows nobody approved are deleted. Skipped
 * ones stay until the planning purge, so a re-run of research still knows what was rejected.
 * Returns how many rows went, or null when there was nothing to do yet (or it already ran).
 */
export function runEventStart(db: DB, eventId: string, now = Date.now()): number | null {
	return db.transaction((): number | null => {
		const event = getEvent(db, eventId);
		if (!event || event.starts_at === null || now < event.starts_at) return null;
		if (event.started_job_at !== null) return null;
		const { changes } = db
			.prepare(
				`DELETE FROM event_people WHERE event_id = ? AND stage = 'found' AND skipped_at IS NULL`
			)
			.run(eventId);
		db.prepare(`UPDATE events SET started_job_at = ? WHERE id = ?`).run(now, eventId);
		logActivity(
			db,
			{ eventId, kind: 'purge', what: { job: 'event_start' }, rowCount: changes },
			now
		);
		return changes;
	})();
}

/**
 * What an event page calls as it loads: the start job if it is due, then the next-action
 * pass, since "due" and "the event has begun" move with the clock and not with a write
 * (§5.2). Returns the event as it is afterwards, so the page renders the purged state
 * rather than the one it read first.
 */
export function eventPageLoad(db: DB, event: EventRow, now = Date.now()): EventRow {
	const started = runEventStart(db, event.id, now);
	recomputeEvent(db, event.id, now);
	return started === null ? event : (getEvent(db, event.id) ?? event);
}
