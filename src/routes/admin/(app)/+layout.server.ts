import { db } from '$lib/server/db';
import { teamNames } from '$lib/server/settings';
import type { LayoutServerLoad } from './$types';

/** The "me" picker in the header needs the team list and the picked name on every page. */
export const load: LayoutServerLoad = ({ locals }) => {
	return { team: teamNames(db), who: locals.who };
};
