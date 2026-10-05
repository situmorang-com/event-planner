import { seenCookie } from './recent.ts';

/**
 * Records that this browser saw a page as it was when opened: the time is taken on arrival and
 * written as the page is left (or hidden, for a phone switching apps), so whatever arrives while
 * it is open is still new next time, and the page's own reloads don't clear the marks. `page` is
 * read reactively: moving straight to another event's page saves the old one and starts anew.
 */
export function rememberSeen(page: () => string) {
	$effect(() => {
		const name = seenCookie(page());
		const opened = Date.now();
		const save = () => {
			document.cookie = `${name}=${opened}; path=/; max-age=31536000; samesite=lax`;
		};
		window.addEventListener('pagehide', save);
		return () => {
			window.removeEventListener('pagehide', save);
			save();
		};
	});
}
