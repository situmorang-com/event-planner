import type { DB } from './database.ts';

export type ActivityKind =
	'export' | 'delete' | 'purge' | 'import' | 'merge' | 'bulk' | 'lock' | 'unlock';

export interface ActivityRow {
	id: number;
	event_id: string | null;
	kind: ActivityKind;
	who: string;
	at: number;
	/** JSON: ids and counts only, never names. */
	what: string;
	row_count: number;
}

export interface ActivityInput {
	eventId?: string | null;
	kind: ActivityKind;
	who?: string;
	/** Ids and counts only: the log must never carry personal data. */
	what?: Record<string, unknown>;
	rowCount?: number;
}

export function logActivity(db: DB, input: ActivityInput, now = Date.now()) {
	db.prepare(
		`INSERT INTO activity_log (event_id, kind, who, at, what, row_count)
		VALUES (?, ?, ?, ?, ?, ?)`
	).run(
		input.eventId ?? null,
		input.kind,
		input.who ?? '',
		now,
		JSON.stringify(input.what ?? {}),
		input.rowCount ?? 0
	);
}

export function listActivity(db: DB, eventId: string | null, limit = 100): ActivityRow[] {
	return db
		.prepare(
			`SELECT * FROM activity_log WHERE (@eventId IS NULL OR event_id = @eventId)
			ORDER BY at DESC, id DESC LIMIT @limit`
		)
		.all({ eventId, limit }) as ActivityRow[];
}
