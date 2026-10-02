import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { searchPeople } from '$lib/server/people';
import type { RequestHandler } from './$types';

/** A pool lookup by name, email or company, for picking a merge survivor on the Contacts page. */
export const GET: RequestHandler = ({ url }) => {
	const people = searchPeople(db, url.searchParams.get('q') ?? '').map((p) => ({
		id: p.id,
		name: p.name,
		company: p.company,
		email: p.email
	}));
	return json({ people }, { headers: { 'cache-control': 'no-store' } });
};
