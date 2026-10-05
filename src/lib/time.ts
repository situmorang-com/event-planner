// Every timestamp is formatted in the event's own timezone so the server render and the
// browser render agree (and a venue laptop set to the wrong zone can't confuse anyone).

/** One day in milliseconds: what the retention and chase clocks count in. */
export const DAY = 86_400_000;

// Newer ICU puts a narrow no-break space before AM/PM; normalize so server and client match.
const tidy = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

export function formatTime(ts: number, timeZone: string, withSeconds = false): string {
	return tidy(
		new Intl.DateTimeFormat('en-US', {
			timeZone,
			hour: 'numeric',
			minute: '2-digit',
			second: withSeconds ? '2-digit' : undefined
		}).format(ts)
	);
}

export function formatDate(ts: number, timeZone: string): string {
	return tidy(
		new Intl.DateTimeFormat('en-GB', {
			timeZone,
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(ts)
	);
}

/** "Tue 7 Oct": for due dates, where the weekday matters and the year never does. */
export function formatDueDay(ts: number, timeZone: string): string {
	return tidy(
		new Intl.DateTimeFormat('en-GB', {
			timeZone,
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		})
			.format(ts)
			.replace(',', '')
	);
}

/** "2 Oct": for markers and chips, where the weekday and year would only add noise. */
export function formatDay(ts: number, timeZone: string): string {
	return tidy(
		new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(ts)
	);
}

export function formatDateTime(ts: number, timeZone: string): string {
	return `${formatDate(ts, timeZone)} · ${formatTime(ts, timeZone)}`;
}

export function timeAgo(ts: number, now: number): string {
	const s = Math.max(0, Math.round((now - ts) / 1000));
	if (s < 45) return 'just now';
	if (s < 3600) return `${Math.round(s / 60)}m ago`;
	if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
	return `${Math.round(s / 86_400)}d ago`;
}

function zoneOffsetMs(ts: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(ts);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second')
	);
	return asUtc - Math.floor(ts / 1000) * 1000;
}

/** "2026-10-01T09:00" typed on a datetime-local input, read as wall-clock time in `timeZone`. */
export function fromLocalInput(value: string, timeZone: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
	if (!m) return null;
	const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
	let ts = wall - zoneOffsetMs(wall, timeZone);
	const corrected = wall - zoneOffsetMs(ts, timeZone); // second pass settles DST edges
	if (corrected !== ts) ts = corrected;
	return ts;
}

/** The inverse: a timestamp as a datetime-local value in `timeZone`. */
export function toLocalInput(ts: number, timeZone: string): string {
	const d = new Date(ts + zoneOffsetMs(ts, timeZone));
	return d.toISOString().slice(0, 16);
}

/** The calendar date of `ts` in `timeZone`, as "YYYY-MM-DD". */
export function localDate(ts: number, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(ts);
	const get = (type: string) => parts.find((p) => p.type === type)?.value;
	return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Midnight at the start of `ts`'s day in `timeZone`. */
export function startOfDay(ts: number, timeZone: string): number {
	return fromLocalInput(`${localDate(ts, timeZone)}T00:00`, timeZone)!;
}

/** The last millisecond of `ts`'s day in `timeZone`: what "due today" is measured against. */
export function endOfDay(ts: number, timeZone: string): number {
	// The next day's midnight, found by date arithmetic so a DST change can't skip a day.
	const date = localDate(ts, timeZone);
	const next = new Date(`${date}T00:00:00Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	return fromLocalInput(`${next.toISOString().slice(0, 10)}T00:00`, timeZone)! - 1;
}

export function isValidTimeZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}
