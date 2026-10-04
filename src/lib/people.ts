// What the People page and the server view share: stages, chips and the markers a row shows.
// Pure, so the page can filter and count rows without a round trip after every tap.

export type Stage = 'found' | 'shortlisted' | 'invited' | 'replied' | 'confirmed' | 'checked_in';
export type Reply = 'pending' | 'yes' | 'maybe' | 'no';
export type Via = 'whatsapp' | 'email' | 'linkedin' | 'other';
export type Source =
	'typed' | 'paste' | 'd365' | 'pool' | 'research' | 'self_registered' | 'walk_in' | 'copied';

export type Origin = 'self_registered' | 'checkin' | 'd365' | 'typed' | 'research';

/** How a person first entered the pool (D16), as the Contacts page and the exports say it. */
export const ORIGIN_LABEL: Record<Origin, string> = {
	self_registered: 'Registered',
	checkin: 'Checked in',
	d365: 'Dynamics 365',
	typed: 'Typed',
	research: 'Research'
};

export const STAGE_LABEL: Record<Stage, string> = {
	found: 'Found',
	shortlisted: 'Shortlisted',
	invited: 'Invited',
	replied: 'Replied',
	confirmed: 'Confirmed',
	checked_in: 'Checked in'
};

/* ───────────────────────── Chips (§4.2) ───────────────────────── */

export type Chip =
	| 'review'
	| 'shortlisted'
	| 'invited'
	| 'yes'
	| 'maybe'
	| 'no'
	| 'confirmed'
	| 'checked_in'
	| 'no_show'
	| 'skipped';

export const CHIPS: Chip[] = [
	'review',
	'shortlisted',
	'invited',
	'yes',
	'maybe',
	'no',
	'confirmed',
	'checked_in',
	'no_show',
	'skipped'
];

export const CHIP_LABEL: Record<Chip, string> = {
	review: 'To review',
	shortlisted: 'Shortlisted',
	invited: 'Invited',
	yes: 'Attending',
	maybe: 'Tentative',
	no: 'Declined',
	confirmed: 'Confirmed',
	checked_in: 'Checked in',
	no_show: 'No-show',
	skipped: 'Skipped'
};

export interface ChipRow {
	stage: Stage;
	skipped_at: number | null;
	reply: Reply;
	confirmed_at: number | null;
	checkin_id: number | null;
}

export function matchesChip(row: ChipRow, chip: Chip, ended: boolean): boolean {
	switch (chip) {
		case 'review':
			return row.stage === 'found' && row.skipped_at === null;
		case 'skipped':
			return row.skipped_at !== null;
		case 'shortlisted':
		case 'invited':
		case 'confirmed':
		case 'checked_in':
			return row.stage === chip;
		case 'yes':
		case 'maybe':
		case 'no':
			return row.reply === chip && (row.stage === 'replied' || row.stage === 'confirmed');
		case 'no_show':
			return (
				ended &&
				(row.reply === 'yes' || row.reply === 'maybe' || row.confirmed_at !== null) &&
				row.checkin_id === null &&
				row.stage !== 'checked_in' &&
				row.stage !== 'found'
			);
	}
}

export function chipCounts(rows: ChipRow[], ended: boolean): Record<Chip, number> {
	const counts = Object.fromEntries(CHIPS.map((c) => [c, 0])) as Record<Chip, number>;
	for (const row of rows)
		for (const chip of CHIPS) if (matchesChip(row, chip, ended)) counts[chip]++;
	return counts;
}

/* ───────────────────────── Rows as the page sees them ───────────────────────── */

/** One event row with everything the page renders; the server view maps it from the database. */
export interface PeopleRow extends ChipRow {
	id: number;
	person_id: string | null;
	company_id: string | null;
	name: string;
	job_title: string;
	email: string | null;
	phone: string | null;
	linkedin: string | null;
	company: string;
	company_key: string;
	source_url: string | null;
	reason: string | null;
	source: Source;
	replied_at: number | null;
	invited_at: number | null;
	invited_via: Via | null;
	last_contacted_at: number | null;
	checked_in_at: number | null;
	consent_event_at: number | null;
	/** Per-person override; null means the company's owner. */
	owner: string | null;
	company_owner: string | null;
	note: string;
	locked_at: number | null;
	blocked_at: number | null;
	blocked_reason: string | null;
	suppressed: boolean;
	/** Any D365 flag on the person (§6.1), which the row menu can clear. */
	d365_flagged: boolean;
	chase_count: number;
	touch_count: number;
	/** Which message buttons may show (§2.3), and why none may when both are closed. */
	contact: { whatsapp: boolean; email: boolean; reason: string | null };
}

export const isLive = (row: Pick<PeopleRow, 'stage'>) => row.stage !== 'found';

export function effectiveOwner(row: Pick<PeopleRow, 'owner' | 'company_owner'>): string | null {
	return row.owner ?? row.company_owner ?? null;
}

/** A live row with no way to reach the person: the organizer still has details to find. */
export function needsDetails(row: Pick<PeopleRow, 'stage' | 'email' | 'phone'>): boolean {
	return isLive(row) && !row.email && !row.phone;
}

export interface Marker {
	key: string;
	label: string;
	tone: 'muted' | 'warn' | 'bad' | 'brand';
}

/** The markers from §1, in the order they read best on a row. `day` formats a timestamp. */
export function markers(row: PeopleRow, day: (ts: number) => string): Marker[] {
	const list: Marker[] = [];
	if (row.locked_at) list.push({ key: 'locked', label: 'Locked', tone: 'bad' });
	if (row.blocked_at) list.push({ key: 'blocked', label: 'Blocked company', tone: 'bad' });
	if (row.suppressed) list.push({ key: 'suppressed', label: 'Suppressed', tone: 'bad' });
	if (needsDetails(row)) list.push({ key: 'details', label: 'Needs details', tone: 'warn' });
	if (row.chase_count)
		list.push({
			key: 'chased',
			label: `Chased ×${row.chase_count}${row.last_contacted_at ? `, last ${day(row.last_contacted_at)}` : ''}`,
			tone: 'muted'
		});
	if (row.stage === 'checked_in' && row.consent_event_at === null)
		list.push({ key: 'consent', label: 'No consent recorded', tone: 'warn' });
	if (row.invited_via === 'linkedin')
		list.push({ key: 'linkedin', label: 'Via LinkedIn', tone: 'brand' });
	if (!row.contact.whatsapp && !row.contact.email && row.contact.reason === 'not contactable')
		list.push({ key: 'contact', label: 'Not contactable', tone: 'warn' });
	return list;
}
