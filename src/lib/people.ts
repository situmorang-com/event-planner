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

export type MessageKind =
	| 'invitation'
	| 'chase'
	| 'reminder'
	| 'thanks_yes'
	| 'followup_maybe'
	| 'thanks_no'
	| 'legacy_notice';

export const KIND_LABEL: Record<MessageKind, string> = {
	invitation: 'Invitation',
	chase: 'Chase',
	reminder: 'Reminder',
	thanks_yes: 'Thanks (attending)',
	followup_maybe: 'Follow-up (tentative)',
	thanks_no: 'Thanks (declined)',
	legacy_notice: 'Legacy notice'
};

/** The kinds a row's message menu offers (§7); the legacy notice is the jobs' own. */
export const MENU_KINDS: MessageKind[] = [
	'invitation',
	'chase',
	'reminder',
	'thanks_yes',
	'followup_maybe',
	'thanks_no'
];

export type NextActionKind = 'chase' | 'reminder';

/** The message a row's buttons open (§7), rendered on the server for the row's language. */
export interface RowMessage {
	kind: MessageKind;
	/** Null when the message can't be rendered: a research find without PRIVACY_URL set. */
	text: string | null;
	/** wa.me link: the mobile is international and the channel is open to them. */
	whatsapp: string | null;
	/** mailto link: they have an email and the channel is open to them. */
	email: string | null;
	/** Shown instead of buttons when something the organizer can fix is missing. */
	hint: string | null;
}

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
	// A skipped row, found or "not me", is only ever behind the Skipped chip.
	if (row.skipped_at !== null) return chip === 'skipped';
	switch (chip) {
		case 'review':
			return row.stage === 'found';
		case 'skipped':
			return false;
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
	/** The company's own phone country (D14); null follows the event. */
	company_phone_country: 'ID' | 'MY' | null;
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
	/** What the buttons open; null while found (no person to write to yet). */
	message: RowMessage | null;
	/** Came in through the generic registration link: the company owner should check them (§4.6). */
	needs_review: boolean;
	/** The row's personal registration link (§7); null while found or before the event has a date. */
	registration_link: string | null;
	/** What the chase rules say is next (D20, §5.2), or the organizer's own date when overridden. */
	next_action_at: number | null;
	next_action_kind: NextActionKind | null;
	next_action_overridden: boolean;
	/** The kind the message menu preselects: the next action's, else what the stage calls for. */
	suggested_kind: MessageKind;
}

/** Today in the event's zone, as the page measures "due" and "overdue" against it. */
export interface Today {
	start: number;
	end: number;
}

type DueRow = Pick<PeopleRow, 'stage' | 'skipped_at' | 'next_action_at'>;

/** Due today or earlier (§5.2): the Due chip, the card count and the phone's default list. */
export function isDue(row: DueRow, today: Today): boolean {
	return (
		isLive(row) &&
		row.skipped_at === null &&
		row.next_action_at !== null &&
		row.next_action_at <= today.end
	);
}

export function isOverdue(row: DueRow, today: Today): boolean {
	return isDue(row, today) && row.next_action_at! < today.start;
}

/** "Chase · due Tue 7 Oct", "Reminder · due today", "Chase · overdue since Fri 2 Oct". */
export function nextActionLabel(
	row: Pick<PeopleRow, 'next_action_at' | 'next_action_kind'>,
	today: Today,
	day: (ts: number) => string
): string | null {
	if (row.next_action_at === null || !row.next_action_kind) return null;
	const kind = row.next_action_kind === 'chase' ? 'Chase' : 'Reminder';
	const at = row.next_action_at;
	if (at < today.start) return `${kind} · overdue since ${day(at)}`;
	if (at <= today.end) return `${kind} · due today`;
	return `${kind} · due ${day(at)}`;
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
	if (row.needs_review)
		list.push({ key: 'review', label: 'Self-registered, check company owner', tone: 'warn' });
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
