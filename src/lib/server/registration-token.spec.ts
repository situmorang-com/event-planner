import { describe, expect, it } from 'vitest';
import {
	registrationRowId,
	registrationToken,
	registrationUrl,
	verifyRegistrationToken
} from './registration-token';

const secret = 'test-secret';
const START = Date.UTC(2026, 9, 13, 2, 0);
const HOUR = 3_600_000;
const event = { id: 'evt1', starts_at: START, ends_at: null };

describe('registration tokens', () => {
	it('carries only the row id and a short signature', () => {
		const token = registrationToken(secret, 'evt1', 42);
		expect(token).toMatch(/^r\.42\.[A-Za-z0-9_-]{12}$/);
		expect(registrationRowId(token)).toBe(42);
		expect(registrationUrl({ id: 42 }, event, { base: 'https://x.test/', secret })).toBe(
			`https://x.test/r/${token}`
		);
	});

	it('verifies its own row on its own event while the event is on', () => {
		const token = registrationToken(secret, 'evt1', 42);
		expect(verifyRegistrationToken(secret, event, 42, token, START - 7 * 86_400_000)).toBe(true);
		expect(verifyRegistrationToken(secret, event, 42, token, START + 5 * HOUR)).toBe(true);
		expect(verifyRegistrationToken(secret, event, 43, token, START)).toBe(false);
		expect(verifyRegistrationToken(secret, { ...event, id: 'evt2' }, 42, token, START)).toBe(false);
		expect(verifyRegistrationToken('other', event, 42, token, START)).toBe(false);
	});

	it('rejects tampered or malformed tokens', () => {
		const token = registrationToken(secret, 'evt1', 42);
		expect(verifyRegistrationToken(secret, event, 42, token.slice(0, -1) + 'x', START)).toBe(false);
		expect(verifyRegistrationToken(secret, event, 42, token.replace('.42.', '.43.'), START)).toBe(
			false
		);
		expect(verifyRegistrationToken(secret, event, 42, null, START)).toBe(false);
		expect(registrationRowId('r.0.abcdefghijkl')).toBeNull();
		expect(registrationRowId('r.1.short')).toBeNull();
		expect(registrationRowId('garbage')).toBeNull();
	});

	it('expires with the event as it currently ends, and never without a date', () => {
		const token = registrationToken(secret, 'evt1', 42);
		// Six hours after the start when no end is set; the end itself once one is.
		expect(verifyRegistrationToken(secret, event, 42, token, START + 6 * HOUR)).toBe(false);
		const long = { ...event, ends_at: START + 10 * HOUR };
		expect(verifyRegistrationToken(secret, long, 42, token, START + 9 * HOUR)).toBe(true);
		expect(verifyRegistrationToken(secret, long, 42, token, START + 10 * HOUR)).toBe(false);
		expect(
			verifyRegistrationToken(secret, { ...event, starts_at: null }, 42, token, START - HOUR)
		).toBe(false);
	});
});
