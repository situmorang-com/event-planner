import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ID, plural, translate } from './index';

// Every literal the admin app passes to t() / plural() / translate() has an Indonesian entry,
// so switching the toggle never leaves an English sentence behind on a translated page.

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return /\.(svelte|ts)$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : [];
	});
}

const CALL = /\b(?:t|plural|translate\([^,()]+,)\(?\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const SECOND =
	/\bplural\([^,]+,\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/g;

function literals(): { text: string; file: string }[] {
	const found: { text: string; file: string }[] = [];
	for (const file of files('src')) {
		const source = readFileSync(file, 'utf8');
		// Only code that uses these helpers: other functions happen to be called t() or plural().
		if (file.startsWith(join('src', 'lib', 'i18n'))) continue;
		if (!/from '\$lib\/i18n(\/t\.svelte)?'|from '\.\.?\/(\.\.\/)*i18n/.test(source)) continue;
		for (const m of source.matchAll(CALL)) {
			if (m[1] === '`' && m[2].includes('${')) continue;
			found.push({ text: m[2].replace(/\\(['"`\\])/g, '$1'), file });
		}
		for (const m of source.matchAll(SECOND)) {
			for (const text of [m[2], m[4]])
				found.push({ text: text.replace(/\\(['"`\\])/g, '$1'), file });
		}
	}
	return found;
}

describe('the Indonesian dictionary', () => {
	it('has every string the app translates', () => {
		const missing = literals()
			.filter(({ text }) => text.trim() && !(text in ID))
			.map(({ text, file }) => `${file}: ${text}`);
		expect([...new Set(missing)]).toEqual([]);
	});

	it('keeps the same {slots} in both languages', () => {
		const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
		const wrong = Object.entries(ID).filter(([en, id]) => slots(en).join() !== slots(id).join());
		expect(wrong).toEqual([]);
	});

	it('translates, fills slots, and falls back to the English', () => {
		expect(translate('id', 'Events')).toBe('Acara');
		expect(translate('en', 'Events')).toBe('Events');
		expect(translate('id', 'Not in the dictionary {x}', { x: 1 })).toBe('Not in the dictionary 1');
		expect(plural('en', 1, '{n} person', '{n} people')).toBe('1 person');
		expect(plural('en', 3, '{n} person', '{n} people')).toBe('3 people');
	});
});
