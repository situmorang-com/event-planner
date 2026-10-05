import { isLinkedinStatus, type LinkedinStatus } from '../people.ts';
import type { DB } from './database.ts';

/*
 * Whether the team is connected with someone on LinkedIn (D26). It belongs to the person, not
 * to one event: a connection made for one invitation is still there for the next.
 */

export { isLinkedinStatus, type LinkedinStatus };

const RANK: Record<LinkedinStatus, number> = { none: 0, requested: 1, connected: 2 };
export const linkedinRank = (status: string | null) =>
	isLinkedinStatus(status) ? RANK[status] : RANK.none;

/** Schema version 6: the three columns, on a file created before them. */
export function addLinkedinStatusColumns(db: DB) {
	const have = new Set(
		(db.prepare(`PRAGMA table_info(people)`).all() as { name: string }[]).map((c) => c.name)
	);
	if (!have.has('linkedin_status'))
		db.exec(
			`ALTER TABLE people ADD COLUMN linkedin_status TEXT
				CHECK (linkedin_status IN ('requested', 'connected'))`
		);
	if (!have.has('linkedin_status_at'))
		db.exec(`ALTER TABLE people ADD COLUMN linkedin_status_at INTEGER`);
	if (!have.has('linkedin_status_by'))
		db.exec(`ALTER TABLE people ADD COLUMN linkedin_status_by TEXT NOT NULL DEFAULT ''`);
}

/**
 * Sets the status, or with `ifNone` only moves "not connected" to the new one: opening the
 * profile from the row records a request (the organizer's way of working) but never undoes a
 * connection. Returns whether anything changed.
 */
export function setLinkedinStatus(
	db: DB,
	personId: string,
	status: LinkedinStatus,
	{ by = '', ifNone = false }: { by?: string; ifNone?: boolean } = {},
	now = Date.now()
): boolean {
	const value = status === 'none' ? null : status;
	const result = db
		.prepare(
			`UPDATE people SET linkedin_status = @value,
				linkedin_status_at = CASE WHEN @value IS NULL THEN NULL ELSE @now END,
				linkedin_status_by = CASE WHEN @value IS NULL THEN '' ELSE @by END,
				updated_at = @now
			WHERE id = @id AND linkedin_status IS NOT @value
				AND (@ifNone = 0 OR linkedin_status IS NULL)`
		)
		.run({ id: personId, value, by, now, ifNone: ifNone ? 1 : 0 });
	return result.changes > 0;
}
