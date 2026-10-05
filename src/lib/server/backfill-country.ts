import type { DB } from './database.ts';
import { countryOf, type PersonRow } from './people.ts';

/*
 * Schema version 5: a past attendee's country from the event they walked into (§2.3). The
 * version-2 migration set it for everyone it carried over, but a check-in recorded between
 * that deploy and this one stored none when the phone couldn't say, and the legacy rules
 * (D15) then treated an Indonesian attendee as Malaysian: never told, never deleted. From
 * this version checkIn() stores it as it creates the person; this step fills the gap once.
 */

type Row = Pick<PersonRow, 'id' | 'country' | 'phone'> & { tz: string | null };

export function backfillCheckinCountry(db: DB) {
	const rows = db
		.prepare(
			`SELECT p.id, p.country, p.phone,
				(SELECT e.timezone FROM checkins c JOIN events e ON e.id = c.event_id
					WHERE c.person_id = p.id ORDER BY c.checked_in_at DESC LIMIT 1) AS tz
			FROM people p WHERE p.country IS NULL AND p.origin = 'checkin'`
		)
		.all() as Row[];
	const update = db.prepare(`UPDATE people SET country = ? WHERE id = ?`);
	for (const r of rows) {
		const country = countryOf(r, r.tz);
		if (country) update.run(country, r.id);
	}
}
