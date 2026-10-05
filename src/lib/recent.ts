// What counts as "new" on the Planning and Contacts pages: added within the last week.
// Worked out from when the record was created, so nothing is stored and nothing goes stale.

import { DAY } from './time.ts';

export const NEW_DAYS = 7;

/** The moment before which nothing is new any more. */
export const newSince = (now: number) => now - NEW_DAYS * DAY;

export const isNew = (createdAt: number | null | undefined, now: number) =>
	createdAt != null && createdAt >= newSince(now);
