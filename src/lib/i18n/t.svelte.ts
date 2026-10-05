import { page } from '$app/state';
import { plural as pluralIn, translate, type Lang, type Vars } from './index.ts';

// For components: the language comes from the page data (set from the cookie on every
// request), so every t() in a template re-renders when the toggle changes it.

export const lang = (): Lang => (page.data?.lang === 'id' ? 'id' : 'en');

export function t(text: string, vars?: Vars): string {
	return translate(lang(), text, vars);
}

export function plural(n: number, one: string, many: string, vars?: Vars): string {
	return pluralIn(lang(), n, one, many, vars);
}
