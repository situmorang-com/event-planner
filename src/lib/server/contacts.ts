// The Contacts page's view of the pool: the §2.3 default list (attendees, anyone who replied,
// the self-registered) with prospects behind a flag. The names stay so the routes keep working.
import type { DB } from './database.ts';
import {
	countPeople,
	deletePerson,
	getPeople,
	listPeople,
	type PersonListRow,
	type PersonRow
} from './people.ts';

export type ContactListRow = PersonListRow;

export function listContacts(
	db: DB,
	q = '',
	limit = 1000,
	prospects = false,
	createdSince: number | null = null
): ContactListRow[] {
	return listPeople(db, { q, limit, prospects, createdSince });
}

export function countContacts(db: DB, prospects = false): number {
	return countPeople(db, prospects);
}

/** People by id, in the order asked for; unknown ids are dropped. */
export function getContacts(db: DB, ids: string[]): PersonRow[] {
	return getPeople(db, ids);
}

/** Erasure: the person, their check-ins and every event row they were on, logged by id. */
export function deleteContact(db: DB, id: string, by = '') {
	return deletePerson(db, id, { by });
}
