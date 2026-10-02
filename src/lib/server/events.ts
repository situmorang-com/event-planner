import type { DB } from './database.ts';
import { shortId } from './ids.ts';
import type { ChaseRules } from './settings.ts';
import type { Country } from './settings.ts';

export type QrMode = 'rotating' | 'static';
export type Language = 'id' | 'en' | 'ms';

export interface EventRow {
	id: string;
	name: string;
	venue: string;
	starts_at: number | null;
	/** NULL means six hours after the start. */
	ends_at: number | null;
	timezone: string;
	qr_mode: QrMode;
	is_open: 0 | 1;
	/** The one goal number, measured as Yes replies (D8). */
	target_count: number | null;
	phone_country: Country;
	language: Language | null;
	co_hosts: string;
	invitation_text: string | null;
	/** JSON ChaseRules, or NULL for the settings default. */
	chase_rules: string | null;
	started_job_at: number | null;
	planning_purged_at: number | null;
	created_at: number;
}

export interface EventInput {
	name: string;
	venue: string;
	startsAt: number | null;
	timezone: string;
	qrMode: QrMode;
	endsAt?: number | null;
	targetCount?: number | null;
	phoneCountry?: Country;
	language?: Language | null;
	coHosts?: string;
	invitationText?: string | null;
	chaseRules?: ChaseRules | null;
}

export function getEvent(db: DB, id: string): EventRow | undefined {
	return db.prepare(`SELECT * FROM events WHERE id = ?`).get(id) as EventRow | undefined;
}

export type EventListRow = EventRow & {
	checkins: number;
	last_checkin_at: number | null;
	/** People on the list (past found), and how many of them said yes or are confirmed. */
	invited: number;
	attending: number;
	confirmed: number;
};

export function listEvents(db: DB) {
	return db
		.prepare(
			`SELECT e.*, COUNT(c.id) AS checkins, MAX(c.checked_in_at) AS last_checkin_at,
				(SELECT COUNT(*) FROM event_people ep WHERE ep.event_id = e.id AND ep.stage <> 'found')
					AS invited,
				(SELECT COUNT(*) FROM event_people ep WHERE ep.event_id = e.id AND ep.reply = 'yes')
					AS attending,
				(SELECT COUNT(*) FROM event_people ep WHERE ep.event_id = e.id AND ep.confirmed_at IS NOT NULL)
					AS confirmed
			FROM events e LEFT JOIN checkins c ON c.event_id = e.id
			GROUP BY e.id
			ORDER BY COALESCE(e.starts_at, e.created_at) DESC`
		)
		.all() as EventListRow[];
}

const params = (input: EventInput) => ({
	name: input.name,
	venue: input.venue,
	startsAt: input.startsAt,
	timezone: input.timezone,
	qrMode: input.qrMode,
	endsAt: input.endsAt ?? null,
	targetCount: input.targetCount ?? null,
	phoneCountry: input.phoneCountry ?? null,
	language: input.language ?? null,
	coHosts: input.coHosts ?? null,
	invitationText: input.invitationText ?? null,
	chaseRules: input.chaseRules ? JSON.stringify(input.chaseRules) : null
});

export function createEvent(db: DB, input: EventInput, now = Date.now()): string {
	const id = shortId();
	db.prepare(
		`INSERT INTO events (id, name, venue, starts_at, ends_at, timezone, qr_mode, is_open,
			target_count, phone_country, language, co_hosts, invitation_text, chase_rules, created_at)
		VALUES (@id, @name, @venue, @startsAt, @endsAt, @timezone, @qrMode, 1, @targetCount,
			COALESCE(@phoneCountry, 'ID'), @language, COALESCE(@coHosts, ''), @invitationText,
			@chaseRules, @now)`
	).run({ ...params(input), id, now });
	return id;
}

/** The settings form; fields it doesn't carry keep their values. */
export function updateEvent(db: DB, id: string, input: EventInput) {
	db.prepare(
		`UPDATE events SET name = @name, venue = @venue, starts_at = @startsAt, timezone = @timezone,
			qr_mode = @qrMode,
			ends_at = CASE WHEN @endsAt IS NULL AND @keepEnd THEN ends_at ELSE @endsAt END,
			target_count = CASE WHEN @targetCount IS NULL AND @keepTarget THEN target_count
				ELSE @targetCount END,
			phone_country = COALESCE(@phoneCountry, phone_country),
			language = CASE WHEN @language IS NULL AND @keepLanguage THEN language ELSE @language END,
			co_hosts = COALESCE(@coHosts, co_hosts),
			invitation_text = CASE WHEN @invitationText IS NULL AND @keepText THEN invitation_text
				ELSE @invitationText END,
			chase_rules = CASE WHEN @chaseRules IS NULL AND @keepRules THEN chase_rules
				ELSE @chaseRules END
		WHERE id = @id`
	).run({
		...params(input),
		id,
		keepEnd: input.endsAt === undefined ? 1 : 0,
		keepTarget: input.targetCount === undefined ? 1 : 0,
		keepLanguage: input.language === undefined ? 1 : 0,
		keepText: input.invitationText === undefined ? 1 : 0,
		keepRules: input.chaseRules === undefined ? 1 : 0
	});
}

export function setEventOpen(db: DB, id: string, open: boolean) {
	db.prepare(`UPDATE events SET is_open = ? WHERE id = ?`).run(open ? 1 : 0, id);
}

export function deleteEvent(db: DB, id: string) {
	db.prepare(`DELETE FROM events WHERE id = ?`).run(id);
}
