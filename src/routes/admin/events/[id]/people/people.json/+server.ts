import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { onEventCheck } from '$lib/server/event-people';
import { getEvent } from '$lib/server/events';
import { peopleAtCompany, searchPeople } from '$lib/server/people';
import type { RequestHandler } from './$types';

/**
 * The pool, two ways: `?company=` lists who works there for the add form (default list and
 * prospects apart, §2.3); `?q=` searches by name, email or company for "Merge into…".
 */
export const GET: RequestHandler = ({ params, url }) => {
	const event = getEvent(db, params.id);
	if (!event) error(404, 'Event not found');

	const q = url.searchParams.get('q');
	if (q !== null) {
		const people = searchPeople(db, q).map((p) => ({
			id: p.id,
			name: p.name,
			company: p.company,
			email: p.email
		}));
		return json({ people }, { headers: { 'cache-control': 'no-store' } });
	}

	const company = url.searchParams.get('company') ?? '';
	const onList = onEventCheck(db, event.id);
	const people = peopleAtCompany(db, company)
		.slice(0, 300)
		.map((p) => ({
			id: p.id,
			name: p.name,
			jobTitle: p.job_title,
			email: p.email,
			onList: onList({ name: p.name, company, email: p.email, linkedin: p.linkedin }),
			prospect: !p.is_default
		}));
	return json({ people }, { headers: { 'cache-control': 'no-store' } });
};
