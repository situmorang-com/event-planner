import { describe, expect, it } from 'vitest';
import { createDb } from './database';
import { setTeamNames } from './settings';
import { setWho, WHO_COOKIE, whoAmI } from './who';

const cookies = (value?: string) => ({ get: () => value });

describe('whoAmI', () => {
	it('trusts the cookie only while the name is on the team list', () => {
		const db = createDb(':memory:');
		setTeamNames(db, ['Edmund', 'Sari']);
		expect(whoAmI(db, cookies('sari'))).toBe('Sari');
		expect(whoAmI(db, cookies(' Edmund '))).toBe('Edmund');
		expect(whoAmI(db, cookies('Someone'))).toBeNull();
		expect(whoAmI(db, cookies())).toBeNull();
		setTeamNames(db, ['Sari']);
		expect(whoAmI(db, cookies('Edmund'))).toBeNull();
	});
});

type SetCall = { name: string; value: string; opts: Record<string, unknown> };
type DeleteCall = { name: string; opts: Record<string, unknown> };

/** Just enough of SvelteKit's Cookies to see what setWho() writes. */
function fakeCookies() {
	const calls = { set: [] as SetCall[], deleted: [] as DeleteCall[] };
	const jar = {
		get: () => undefined,
		set: (name: string, value: string, opts: Record<string, unknown>) =>
			calls.set.push({ name, value, opts }),
		delete: (name: string, opts: Record<string, unknown>) => calls.deleted.push({ name, opts })
	};
	return { jar: jar as never, calls };
}

describe('setWho', () => {
	it('stores a listed name for 400 days on the whole site, secure only over https', () => {
		const db = createDb(':memory:');
		setTeamNames(db, ['Edmund', 'Sari']);
		const { jar, calls } = fakeCookies();
		expect(setWho(db, jar, 'Sari', new URL('https://events.example.com/admin'))).toBe('Sari');
		expect(calls.set).toEqual([
			{
				name: WHO_COOKIE,
				value: 'Sari',
				opts: { path: '/', sameSite: 'lax', secure: true, maxAge: 400 * 86_400 }
			}
		]);
		setWho(db, jar, 'Edmund', new URL('http://192.168.1.20:3000/admin'));
		expect(calls.set[1].opts.secure).toBe(false);
	});

	it('forgets the name when it is blank, unknown or only a case-insensitive match', () => {
		const db = createDb(':memory:');
		setTeamNames(db, ['Edmund']);
		const { jar, calls } = fakeCookies();
		const url = new URL('https://events.example.com/admin');
		expect(setWho(db, jar, '', url)).toBeNull();
		expect(setWho(db, jar, 'Nobody', url)).toBeNull();
		// The picker offers the saved spelling, so anything else did not come from it.
		expect(setWho(db, jar, 'edmund', url)).toBeNull();
		expect(calls.set).toHaveLength(0);
		expect(calls.deleted).toHaveLength(3);
		expect(calls.deleted[0]).toEqual({ name: WHO_COOKIE, opts: { path: '/', secure: true } });
	});
});
