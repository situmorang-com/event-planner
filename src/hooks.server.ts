import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { startScheduler } from '$lib/server/housekeeping';
import { whoAmI } from '$lib/server/who';
import { isLang, isTheme, LANG_COOKIE, THEME_COOKIE } from '$lib/i18n';

// Housekeeping (§5.4) runs once as the server starts and then daily. The build imports this
// module too, so `building` keeps it from touching the build-time database.
startScheduler(db, { building });

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.admin = isAdmin(event.cookies);
	// Only an organizer stamps anything, so the name is only looked up for one.
	event.locals.who = event.locals.admin ? (whoAmI(db, event.cookies) ?? '') : '';
	// The header toggles (per browser): English and the device's own theme until changed.
	const lang = event.cookies.get(LANG_COOKIE);
	const theme = event.cookies.get(THEME_COOKIE);
	event.locals.lang = isLang(lang) ? lang : 'en';
	event.locals.theme = isTheme(theme) ? theme : 'system';

	const { pathname, search } = event.url;
	const protectedPath = pathname.startsWith('/admin') && pathname !== '/admin/login';

	// Pages redirect from admin/+layout.server.ts (that also covers client-side navigation);
	// this catches everything a layout can't: form actions, CSV exports, the live stream.
	if (protectedPath && !event.locals.admin && !event.isDataRequest) {
		const wantsPage =
			event.request.method === 'GET' && event.request.headers.get('accept')?.includes('text/html');
		if (!wantsPage) return new Response('Unauthorized', { status: 401 });
		const next = encodeURIComponent(pathname + search);
		return new Response(null, { status: 303, headers: { location: `/admin/login?next=${next}` } });
	}

	// The theme is on <html> in the first byte, so a dark page never flashes light.
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%ep.lang%', event.locals.lang).replace('%ep.theme%', event.locals.theme)
	});
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('x-frame-options', 'SAMEORIGIN');
	return response;
};
