import { describe, expect, it } from 'vitest';
import { allow } from './rate-limit';

describe('allow', () => {
	it('lets a key through up to the limit inside the window, then refuses until it slides', () => {
		const key = `register:10.0.0.${Math.random()}`;
		expect(allow(key, 3, 1_000, 0)).toBe(true);
		expect(allow(key, 3, 1_000, 100)).toBe(true);
		expect(allow(key, 3, 1_000, 200)).toBe(true);
		expect(allow(key, 3, 1_000, 300)).toBe(false);
		// A refused hit is not counted, and the first one has aged out by now.
		expect(allow(key, 3, 1_000, 1_001)).toBe(true);
		expect(allow(key, 3, 1_000, 1_002)).toBe(false);
	});

	it('keeps keys apart, so one busy address does not block the venue', () => {
		const a = `register:a.${Math.random()}`;
		const b = `register:b.${Math.random()}`;
		expect(allow(a, 1, 1_000, 0)).toBe(true);
		expect(allow(a, 1, 1_000, 1)).toBe(false);
		expect(allow(b, 1, 1_000, 1)).toBe(true);
	});
});
