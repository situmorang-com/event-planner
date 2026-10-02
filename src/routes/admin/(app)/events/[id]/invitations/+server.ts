import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The guest list lives on the People tab now (§4.1); old bookmarks still land there. */
export const GET: RequestHandler = ({ params }) => {
	redirect(301, `/admin/events/${params.id}/people`);
};
