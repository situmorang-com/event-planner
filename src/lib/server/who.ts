import type { DB } from './database.ts';
import { teamNames } from './settings.ts';

/** The plain cookie the "me" picker sets (§4.4). It carries a team name, nothing secret. */
export const WHO_COOKIE = 'ea_who';

/**
 * Who is using this browser, or null. The value is only trusted when it is still on the team
 * list, so a renamed or removed teammate stops stamping rows under the old name.
 */
export function whoAmI(db: DB, cookies: { get(name: string): string | undefined }): string | null {
	const raw = cookies.get(WHO_COOKIE)?.trim().toLowerCase();
	if (!raw) return null;
	return teamNames(db).find((n) => n.toLowerCase() === raw) ?? null;
}
