import type { DB } from './database.ts';

export type Country = 'ID' | 'MY';

/** Chase rules (§5.1): the app-wide defaults, which an event may override in `chase_rules`. */
export interface ChaseRules {
	chaseAfterWorkingDays: number;
	stopDaysBeforeEvent: number;
	reminderDaysBefore: number;
	maxTouches: { relationship: number; none: number };
}

export const CHASE_DEFAULTS: ChaseRules = {
	chaseAfterWorkingDays: 3,
	stopDaysBeforeEvent: 1,
	reminderDaysBefore: 2,
	maxTouches: { relationship: 3, none: 2 }
};

export function getSetting(db: DB, key: string): string | null {
	const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
		{ value: string } | undefined;
	return row?.value ?? null;
}

export function setSetting(db: DB, key: string, value: string) {
	db.prepare(
		`INSERT INTO settings (key, value) VALUES (?, ?)
		ON CONFLICT (key) DO UPDATE SET value = excluded.value`
	).run(key, value);
}

export function schemaVersion(db: DB): number | null {
	const v = getSetting(db, 'schema_version');
	return v === null ? null : Number(v);
}

export function setSchemaVersion(db: DB, version: number) {
	setSetting(db, 'schema_version', String(version));
}

/** The names organizers pick from as "me"; order is display order. */
export function teamNames(db: DB): string[] {
	try {
		const v = JSON.parse(getSetting(db, 'team_names') ?? '[]');
		return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
	} catch {
		return [];
	}
}

export function setTeamNames(db: DB, names: string[]) {
	setSetting(
		db,
		'team_names',
		JSON.stringify([...new Set(names.map((n) => n.trim()))].filter(Boolean))
	);
}

/** Adds a name to the end of the list; a name already there (any case) is left as it was. */
export function addTeamName(db: DB, raw: string): string[] {
	const name = raw.replace(/\s+/g, ' ').trim();
	const names = teamNames(db);
	if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
	setTeamNames(db, names);
	return teamNames(db);
}

/**
 * Removes a name. Rows stamped with it keep the old name: the stamp says who did something at
 * the time, and whoAmI() stops trusting the name on its own.
 */
export function removeTeamName(db: DB, name: string): string[] {
	setTeamNames(
		db,
		teamNames(db).filter((n) => n !== name.trim())
	);
	return teamNames(db);
}

/** A team name as it was saved, matched case-insensitively (first-name match allowed); null if unknown. */
export function matchTeamName(db: DB, raw: string): string | null {
	const q = raw.trim().toLowerCase();
	if (!q) return null;
	const names = teamNames(db);
	return (
		names.find((n) => n.toLowerCase() === q) ??
		names.find((n) => n.toLowerCase().split(/\s+/)[0] === q) ??
		null
	);
}

/**
 * When the consent boxes (§4.7) first shipped. A `checkin`-origin person without a future-events
 * tick who was created before this is "legacy" (§2.3): they were never offered the box.
 */
export function consentBoxesSince(db: DB): number | null {
	const v = getSetting(db, 'consent_boxes_since');
	return v === null ? null : Number(v);
}

export function recordConsentBoxesSince(db: DB, now = Date.now()) {
	if (consentBoxesSince(db) === null) setSetting(db, 'consent_boxes_since', String(now));
}

export const isCountry = (v: unknown): v is Country => v === 'ID' || v === 'MY';

export function phoneCountryDefault(db: DB, fallback: Country = 'ID'): Country {
	const v = getSetting(db, 'phone_country_default');
	return isCountry(v) ? v : fallback;
}

export function setPhoneCountryDefault(db: DB, country: Country) {
	setSetting(db, 'phone_country_default', country);
}

export function chaseDefaults(db: DB): ChaseRules {
	return parseChaseRules(getSetting(db, 'chase_defaults')) ?? CHASE_DEFAULTS;
}

export function setChaseDefaults(db: DB, rules: ChaseRules) {
	setSetting(db, 'chase_defaults', JSON.stringify(rules));
}

/** Reads stored chase rules; anything missing or malformed falls back to the defaults. */
export function parseChaseRules(json: string | null): ChaseRules | null {
	if (!json) return null;
	try {
		const v = JSON.parse(json) as Partial<ChaseRules>;
		if (!v || typeof v !== 'object') return null;
		const n = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
		return {
			chaseAfterWorkingDays: n(v.chaseAfterWorkingDays, CHASE_DEFAULTS.chaseAfterWorkingDays),
			stopDaysBeforeEvent: n(v.stopDaysBeforeEvent, CHASE_DEFAULTS.stopDaysBeforeEvent),
			reminderDaysBefore: n(v.reminderDaysBefore, CHASE_DEFAULTS.reminderDaysBefore),
			maxTouches: {
				relationship: n(v.maxTouches?.relationship, CHASE_DEFAULTS.maxTouches.relationship),
				none: n(v.maxTouches?.none, CHASE_DEFAULTS.maxTouches.none)
			}
		};
	} catch {
		return null;
	}
}
