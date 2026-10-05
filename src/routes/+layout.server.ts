import type { LayoutServerLoad } from './$types';

/** The language and theme from their cookies (hooks.server.ts), for every page. */
export const load: LayoutServerLoad = ({ locals }) => ({ lang: locals.lang, theme: locals.theme });
