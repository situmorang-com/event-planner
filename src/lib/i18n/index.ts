import type { UiLang } from '../time.ts';
import common from './id/common.ts';
import event from './id/event.ts';
import people from './id/people.ts';
import planning from './id/planning.ts';
import row from './id/row.ts';
import settings from './id/settings.ts';

/*
 * The admin app in English or Indonesian (the header toggle; English by default). The English
 * text is the key: t('Add people') is "Add people" in English and the dictionary's entry in
 * Indonesian, so a string nobody has translated yet still reads, in English. The dictionaries
 * are split by area so each part of the app keeps its own.
 */

export type Lang = UiLang;
export const LANGS: Lang[] = ['en', 'id'];
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'id';
export const LANG_COOKIE = 'ep_lang';

export const ID: Record<string, string> = {
	...common,
	...people,
	...row,
	...planning,
	...event,
	...settings
};

export type Vars = Record<string, string | number>;

/** The text in `lang`, with {name}-style slots filled from `vars` (others are left as they are). */
export function translate(lang: Lang, text: string, vars?: Vars): string {
	const base = lang === 'id' ? (ID[text] ?? text) : text;
	if (!vars) return base;
	return base.replace(/\{(\w+)\}/g, (slot, key: string) =>
		key in vars ? String(vars[key]) : slot
	);
}

/** "1 person" / "3 people": picks the form by count, then translates it. */
export function plural(lang: Lang, n: number, one: string, many: string, vars: Vars = {}) {
	return translate(lang, n === 1 ? one : many, { n: n.toLocaleString(), ...vars });
}

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);
export const THEME_COOKIE = 'ep_theme';
