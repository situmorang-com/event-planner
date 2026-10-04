import { describe, expect, it } from 'vitest';
import { createDb } from './database';
import {
	addTeamName,
	CHASE_DEFAULTS,
	chaseDefaults,
	consentBoxesSince,
	getSetting,
	matchTeamName,
	parseChaseRules,
	phoneCountryDefault,
	recordConsentBoxesSince,
	removeTeamName,
	setChaseDefaults,
	setPhoneCountryDefault,
	setSetting,
	setTeamNames,
	teamNames
} from './settings';

describe('settings keys', () => {
	it('round-trips a value and overwrites it in place', () => {
		const db = createDb(':memory:');
		expect(getSetting(db, 'nothing')).toBeNull();
		setSetting(db, 'k', 'one');
		setSetting(db, 'k', 'two');
		expect(getSetting(db, 'k')).toBe('two');
	});
});

describe('team names', () => {
	it('keeps the order typed, trims, and drops blanks and duplicates', () => {
		const db = createDb(':memory:');
		setTeamNames(db, [' Edmund ', 'Sari', '', 'Edmund']);
		expect(teamNames(db)).toEqual(['Edmund', 'Sari']);
	});

	it('reads an empty list from a missing or broken value', () => {
		const db = createDb(':memory:');
		expect(teamNames(db)).toEqual([]);
		setSetting(db, 'team_names', '{not json');
		expect(teamNames(db)).toEqual([]);
		setSetting(db, 'team_names', '"Edmund"');
		expect(teamNames(db)).toEqual([]);
	});

	it('adds to the end once, whatever the case, and removes by exact name', () => {
		const db = createDb(':memory:');
		expect(addTeamName(db, ' Edmund  Situmorang ')).toEqual(['Edmund Situmorang']);
		expect(addTeamName(db, 'Sari')).toEqual(['Edmund Situmorang', 'Sari']);
		expect(addTeamName(db, 'sari')).toEqual(['Edmund Situmorang', 'Sari']);
		expect(addTeamName(db, '   ')).toEqual(['Edmund Situmorang', 'Sari']);
		expect(removeTeamName(db, 'sari')).toEqual(['Edmund Situmorang', 'Sari']);
		expect(removeTeamName(db, 'Sari')).toEqual(['Edmund Situmorang']);
	});

	it('matches a D365 owner value to a team name by full or first name', () => {
		const db = createDb(':memory:');
		setTeamNames(db, ['Edmund Situmorang', 'Sari Dewi']);
		expect(matchTeamName(db, 'edmund situmorang')).toBe('Edmund Situmorang');
		expect(matchTeamName(db, 'SARI')).toBe('Sari Dewi');
		expect(matchTeamName(db, 'Dewi')).toBeNull();
		expect(matchTeamName(db, '')).toBeNull();
	});
});

describe('phone-country default', () => {
	it('falls back to the given country until a valid one is saved', () => {
		const db = createDb(':memory:');
		expect(phoneCountryDefault(db)).toBe('ID');
		expect(phoneCountryDefault(db, 'MY')).toBe('MY');
		setPhoneCountryDefault(db, 'MY');
		expect(phoneCountryDefault(db, 'ID')).toBe('MY');
		setSetting(db, 'phone_country_default', 'SG');
		expect(phoneCountryDefault(db)).toBe('ID');
	});
});

describe('chase defaults', () => {
	it('fills anything missing or malformed from the built-in rules', () => {
		expect(parseChaseRules(null)).toBeNull();
		expect(parseChaseRules('nope')).toBeNull();
		expect(parseChaseRules('[]')).toEqual(CHASE_DEFAULTS);
		expect(parseChaseRules('{"chaseAfterWorkingDays": 5, "maxTouches": {"none": 1}}')).toEqual({
			...CHASE_DEFAULTS,
			chaseAfterWorkingDays: 5,
			maxTouches: { relationship: 3, none: 1 }
		});
	});

	it('reads what was saved and the defaults before that', () => {
		const db = createDb(':memory:');
		expect(chaseDefaults(db)).toEqual(CHASE_DEFAULTS);
		setChaseDefaults(db, { ...CHASE_DEFAULTS, reminderDaysBefore: 4 });
		expect(chaseDefaults(db).reminderDaysBefore).toBe(4);
	});
});

describe('consent boxes since', () => {
	it('is stamped by schema version 4 and never moved afterwards', () => {
		const db = createDb(':memory:');
		const since = consentBoxesSince(db);
		expect(since).not.toBeNull();
		recordConsentBoxesSince(db, 5_000);
		expect(consentBoxesSince(db)).toBe(since);
	});

	it('records the first stamp on a database without one', () => {
		const db = createDb(':memory:');
		db.prepare(`DELETE FROM settings WHERE key = 'consent_boxes_since'`).run();
		expect(consentBoxesSince(db)).toBeNull();
		recordConsentBoxesSince(db, 5_000);
		recordConsentBoxesSince(db, 6_000);
		expect(consentBoxesSince(db)).toBe(5_000);
	});
});
