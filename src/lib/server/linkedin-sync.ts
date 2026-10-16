// LinkedIn connections, synced from LinkedIn's own data export (D28). LinkedIn has no API for
// "who accepted my request" and the planner doesn't scrape it, so the organizer downloads
// Connections.csv (Settings → Data privacy → Get a copy of your data → Connections) and drops it
// here: every request they accepted turns Connected, and the dashboard lists who to message.
import { linkedinProfile, nameKey } from '../invitations.ts';
import type { Connection } from '../linkedin-export.ts';
import type { PeopleRow } from '../people.ts';
import type { DB } from './database.ts';
import { getEvent, type EventRow } from './events.ts';
import { hasEnded } from './event-people.ts';
import type { MessagingEnv } from './messaging.ts';
import { peopleView } from './people-page.ts';
import { getSetting, setSetting } from './settings.ts';

export type { Connection };

export interface SyncResult {
	/** Connections in the file. */
	total: number;
	/** People who turned Connected with this sync. */
	connected: { id: string; name: string }[];
	/** People already marked Connected. */
	already: number;
	syncedAt: number;
}

interface Candidate {
	id: string;
	name: string;
	linkedin: string | null;
	linkedin_status: string | null;
}

/**
 * Marks everyone in the export Connected. A person matches by profile link; one without a link
 * matches by name only when they're the single person waiting on a request under that name (a
 * name alone is too weak for anyone else), and gets the link from the file.
 */
export function syncConnections(
	db: DB,
	connections: Connection[],
	by = '',
	now = Date.now()
): SyncResult {
	const people = db
		.prepare(`SELECT id, name, linkedin, linkedin_status FROM people`)
		.all() as Candidate[];
	const byLink = new Map<string, Candidate[]>();
	// Without a link, only someone we sent a request to (or already connected) can match.
	const waitingByName = new Map<string, Candidate[]>();
	for (const p of people) {
		const link = p.linkedin ? linkedinProfile(p.linkedin) : null;
		if (link) byLink.set(link, [...(byLink.get(link) ?? []), p]);
		else if (p.linkedin_status) {
			const key = nameKey(p.name);
			waitingByName.set(key, [...(waitingByName.get(key) ?? []), p]);
		}
	}

	const set = db.prepare(
		`UPDATE people SET linkedin_status = 'connected', linkedin_status_at = @at,
			linkedin_status_by = @by, linkedin = COALESCE(linkedin, @link), updated_at = @now
		WHERE id = @id AND linkedin_status IS NOT 'connected'`
	);
	const result: SyncResult = {
		total: connections.length,
		connected: [],
		already: 0,
		syncedAt: now
	};
	const seen = new Set<string>();
	db.transaction(() => {
		for (const c of connections) {
			let matches = c.linkedin ? (byLink.get(c.linkedin) ?? []) : [];
			if (!matches.length) {
				const waiting = waitingByName.get(nameKey(c.name)) ?? [];
				matches = waiting.length === 1 ? waiting : [];
			}
			for (const p of matches) {
				if (seen.has(p.id)) continue;
				seen.add(p.id);
				if (p.linkedin_status === 'connected') {
					result.already++;
					continue;
				}
				// The day they accepted, never later than now; "today" counts from now.
				const at = c.connectedOn === null ? now : Math.min(c.connectedOn, now);
				set.run({ id: p.id, at, by: by || 'LinkedIn export', link: c.linkedin, now });
				result.connected.push({ id: p.id, name: p.name });
			}
		}
		setSetting(db, 'linkedin_synced_at', String(now));
	})();
	return result;
}

export function lastLinkedinSync(db: DB): number | null {
	const value = Number(getSetting(db, 'linkedin_synced_at'));
	return Number.isFinite(value) && value > 0 ? value : null;
}

/** How far back "just accepted" reaches. */
export const JUST_ACCEPTED_DAYS = 14;

export interface JustAccepted {
	event: Pick<EventRow, 'id' | 'name' | 'starts_at' | 'timezone'>;
	row: PeopleRow;
}

/**
 * People who accepted lately and haven't heard from us since, on events still to come: the
 * dashboard's "message them now" list. Replied, skipped and research finds aren't on it.
 */
export function justAccepted(
	db: DB,
	env: MessagingEnv | null,
	now = Date.now(),
	days = JUST_ACCEPTED_DAYS
): JustAccepted[] {
	const pending = db
		.prepare(
			`SELECT ep.event_id, ep.id FROM event_people ep JOIN people p ON p.id = ep.person_id
			WHERE p.linkedin_status = 'connected' AND p.linkedin_status_at >= @since
				AND ep.stage IN ('shortlisted', 'invited') AND ep.skipped_at IS NULL
				AND ep.reply IN ('pending', 'maybe')
				AND (ep.last_contacted_at IS NULL OR ep.last_contacted_at < p.linkedin_status_at)`
		)
		.all({ since: now - days * 86_400_000 }) as { event_id: string; id: number }[];
	const byEvent = new Map<string, Set<number>>();
	for (const p of pending)
		byEvent.set(p.event_id, (byEvent.get(p.event_id) ?? new Set()).add(p.id));

	const out: JustAccepted[] = [];
	for (const [eventId, ids] of byEvent) {
		const event = getEvent(db, eventId);
		if (!event || hasEnded(event, now)) continue;
		const { id, name, starts_at, timezone } = event;
		for (const row of peopleView(db, event, env, now).rows)
			if (ids.has(row.id)) out.push({ event: { id, name, starts_at, timezone }, row });
	}
	return out.sort((a, b) => (b.row.linkedin_status_at ?? 0) - (a.row.linkedin_status_at ?? 0));
}
