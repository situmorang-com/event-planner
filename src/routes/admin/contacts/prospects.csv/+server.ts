import { logActivity } from '$lib/server/activity-log';
import { csvResponse } from '$lib/server/csv';
import { db } from '$lib/server/db';
import { poolCsv } from '$lib/server/exports';
import type { RequestHandler } from './$types';

/** The prospects (§2.3, §4.5): found or typed, never replied, attended or registered. */
export const GET: RequestHandler = ({ locals }) => {
	const { csv, count } = poolCsv(db, { prospects: true });
	logActivity(db, {
		kind: 'export',
		who: locals.who,
		what: { export: 'prospects' },
		rowCount: count
	});
	return csvResponse(`prospects-${new Date().toISOString().slice(0, 10)}.csv`, csv);
};
