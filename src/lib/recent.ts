// What counts as "new" on the Planning and Contacts pages: added since this browser last had
// the page open (a cookie per page, written as the page is left, so the marks stay for the
// whole visit). A first visit falls back to the last week.

import { DAY } from './time.ts';

export const NEW_DAYS = 7;

/** A page's "last opened" cookie: contacts, or planning-<event id>. */
export const seenCookie = (page: string) => `ep_seen_${page.replace(/[^\w-]/g, '')}`;

/** The moment before which nothing is new: the last visit, or a week back for a first one. */
export function newSince(now: number, lastSeen?: string | null): number {
	const seen = Number(lastSeen);
	return Number.isFinite(seen) && seen > 0 && seen <= now ? seen : now - NEW_DAYS * DAY;
}

export const isNew = (createdAt: number | null | undefined, since: number) =>
	createdAt != null && createdAt >= since;
