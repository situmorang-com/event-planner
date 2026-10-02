import type { Cookies } from '@sveltejs/kit';
import type { DB } from './database.ts';
import { teamNames } from './settings.ts';

/** The plain cookie the "me" picker sets (§4.4). It carries a team name, nothing secret. */
export const WHO_COOKIE = 'ea_who';

// 400 days is the longest lifetime browsers honour; "once per browser" means as long as that.
const WHO_DAYS = 400;

/**
 * Who is using this browser, or null. The value is only trusted when it is still on the team
 * list, so a renamed or removed teammate stops stamping rows under the old name.
 */
export function whoAmI(db: DB, cookies: { get(name: string): string | undefined }): string | null {
	const raw = cookies.get(WHO_COOKIE)?.trim().toLowerCase();
	if (!raw) return null;
	return teamNames(db).find((n) => n.toLowerCase() === raw) ?? null;
}

/** Remembers the picked name, or forgets it when the name is empty or not on the team list. */
export function setWho(db: DB, cookies: Cookies, name: string, url: URL): string | null {
	const picked = teamNames(db).find((n) => n === name.trim()) ?? null;
	// Plain http on a venue laptop must still be able to pick a name, as with the session cookie.
	const secure = url.protocol === 'https:';
	if (picked) {
		cookies.set(WHO_COOKIE, picked, {
			path: '/',
			sameSite: 'lax',
			secure,
			maxAge: WHO_DAYS * 86_400
		});
	} else {
		cookies.delete(WHO_COOKIE, { path: '/', secure });
	}
	return picked;
}
