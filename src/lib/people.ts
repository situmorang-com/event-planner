// What the People page and the server view share: stages, chips and the markers a row shows.
// Pure, so the page can filter and count rows without a round trip after every tap.

import type { Salutation, SalutationLanguage, SalutationSource } from './salutation.ts';

export type Stage = 'found' | 'shortlisted' | 'invited' | 'replied' | 'confirmed' | 'checked_in';
export type Reply = 'pending' | 'yes' | 'maybe' | 'no';
export type Via = 'whatsapp' | 'email' | 'linkedin' | 'other';
export type Source =
	'typed' | 'paste' | 'd365' | 'pool' | 'research' | 'self_registered' | 'walk_in' | 'copied';

export const STAGES: Stage[] = [
	'found',
	'shortlisted',
	'invited',
	'replied',
	'confirmed',
	'checked_in'
];
export const stageRank = (stage: Stage) => STAGES.indexOf(stage);

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

// Each name says when the message is for, so the menu reads as "which message", not a stage.
export const KIND_LABEL: Record<MessageKind, string> = {
	invitation: 'Invitation',
	chase: 'Chase (no reply yet)',
	reminder: 'Reminder (before the event)',
	thanks_yes: 'Thanks (attending)',
	followup_maybe: 'Follow-up (tentative)',
	thanks_no: 'Thanks (declined)',
	legacy_notice: 'Legacy notice'
};

export const isMessageKind = (v: unknown): v is MessageKind =>
	typeof v === 'string' && v in KIND_LABEL;

/**
 * The kinds a row's message menu offers (§7). The legacy notice (§8) is added for a legacy
 * Indonesian attendee only: it is their invitation, and the clock that follows is theirs.
 */
export const MENU_KINDS: MessageKind[] = [
	'invitation',
	'chase',
	'reminder',
	'thanks_yes',
	'followup_maybe',
	'thanks_no'
];

export function menuKinds(row: Pick<PeopleRow, 'legacy'>): MessageKind[] {
	return row.legacy ? [...MENU_KINDS, 'legacy_notice'] : MENU_KINDS;
}

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

/* ───────────────────────── LinkedIn connection (D26) ───────────────────────── */

export type LinkedinStatus = 'none' | 'requested' | 'connected';

export const isLinkedinStatus = (v: unknown): v is LinkedinStatus =>
	v === 'none' || v === 'requested' || v === 'connected';

export const LINKEDIN_STATUS_LABEL: Record<LinkedinStatus, string> = {
	none: 'Not connected',
	requested: 'Request sent',
	connected: 'Connected'
};

/* ───────────────────────── Where someone is (§4.2) ───────────────────────── */

export interface PhaseStep {
	key: Exclude<Stage, 'found'>;
	label: string;
	/** done: it happened · current: where they are · missed: passed without it (a walk-in was
	 * never invited) · todo: still ahead · closed: won't happen (they declined). */
	state: 'done' | 'current' | 'missed' | 'todo' | 'closed';
	help: string;
}

type PhaseRow = Pick<PeopleRow, 'stage' | 'reply' | 'invited_at' | 'confirmed_at'>;

/**
 * The five steps a listed person moves through, for the track on their row. The reply step
 * names the answer once there is one, so "Declined" is where a no stops.
 */
export function phaseTrack(row: PhaseRow): PhaseStep[] {
	const at = stageRank(row.stage);
	const declined = row.reply === 'no';
	const happened: Record<PhaseStep['key'], boolean> = {
		shortlisted: true,
		invited: row.invited_at !== null,
		replied: row.reply !== 'pending',
		confirmed: row.confirmed_at !== null,
		checked_in: row.stage === 'checked_in'
	};
	const steps: Omit<PhaseStep, 'state'>[] = [
		{ key: 'shortlisted', label: 'Shortlisted', help: 'On the list, not invited yet' },
		{ key: 'invited', label: 'Invited', help: 'Invitation sent, waiting for an answer' },
		{
			key: 'replied',
			label: row.reply === 'pending' ? 'Replied' : REPLY_WORD[row.reply],
			help: 'They answered: attending, tentative or declined'
		},
		{
			key: 'confirmed',
			label: 'Confirmed',
			help: 'Registered through their personal link, or reconfirmed'
		},
		{ key: 'checked_in', label: 'Checked in', help: 'Arrived at the event' }
	];
	return steps.map((s) => {
		const rank = stageRank(s.key);
		let state: PhaseStep['state'];
		if (rank === at) state = 'current';
		else if (rank < at) state = happened[s.key] ? 'done' : 'missed';
		else state = declined && row.stage !== 'checked_in' ? 'closed' : 'todo';
		return { ...s, state };
	});
}

const REPLY_WORD = { yes: 'Attending', maybe: 'Tentative', no: 'Declined' } as const;

type NextRow = Pick<
	PeopleRow,
	| 'stage'
	| 'reply'
	| 'skipped_at'
	| 'locked_at'
	| 'blocked_at'
	| 'suppressed'
	| 'email'
	| 'phone'
	| 'linkedin'
	| 'linkedin_status'
	| 'message'
>;

/**
 * Every sentence nextStep can return, whole, so each one can be translated as it stands (the
 * row looks it up in the dictionary; the server and the tests keep the English).
 */
export const NEXT_STEP = {
	whatsappOrEmail: 'Send the invitation by WhatsApp or email',
	whatsapp: 'Send the invitation by WhatsApp',
	email: 'Send the invitation by email',
	privacyUrl: 'Set PRIVACY_URL, then send the invitation',
	linkedinConnected: 'Send the invitation on LinkedIn',
	linkedinRequested: 'Wait for them to accept on LinkedIn, then send the invitation there',
	linkedinNone: 'Connect with them on LinkedIn, or add a phone or email',
	checkDetails: 'Check their phone or email (Edit), then invite them',
	findDetails: 'Find a phone, email or LinkedIn profile for them (Edit)',
	invited: 'Wait for their answer, then press Attending, Tentative or Declined',
	yes: 'Send the thank-you; a reminder follows before the event',
	maybe: 'Follow up until they decide',
	no: 'Declined: nothing more to send',
	confirmed: 'Send a reminder before the event'
} as const;

/**
 * What to do next for a listed person, in words anyone on the team can act on. The date, when
 * the rules set one, is the row's due line beside it; this says what the step is.
 */
export function nextStep(row: NextRow): string | null {
	if (row.stage === 'found' || row.skipped_at || row.locked_at || row.blocked_at || row.suppressed)
		return null;
	switch (row.stage) {
		case 'shortlisted': {
			const whatsapp = !!row.message?.whatsapp;
			const email = !!row.message?.email;
			if (whatsapp && email) return NEXT_STEP.whatsappOrEmail;
			if (whatsapp) return NEXT_STEP.whatsapp;
			if (email) return NEXT_STEP.email;
			if (row.message?.hint && (row.phone || row.email || row.linkedin_status === 'connected'))
				return NEXT_STEP.privacyUrl;
			if (row.linkedin) {
				if (row.linkedin_status === 'connected') return NEXT_STEP.linkedinConnected;
				if (row.linkedin_status === 'requested') return NEXT_STEP.linkedinRequested;
				return NEXT_STEP.linkedinNone;
			}
			if (row.phone || row.email) return NEXT_STEP.checkDetails;
			return NEXT_STEP.findDetails;
		}
		case 'invited':
			return NEXT_STEP.invited;
		case 'replied':
			if (row.reply === 'yes') return NEXT_STEP.yes;
			if (row.reply === 'maybe') return NEXT_STEP.maybe;
			return NEXT_STEP.no;
		case 'confirmed':
			return NEXT_STEP.confirmed;
		case 'checked_in':
			return null;
	}
}

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
	/** The person's LinkedIn connection (D26); 'none' while found or not connected. */
	linkedin_status: LinkedinStatus;
	/**
	 * How messages address them (D27): Pak or Bu (stored, or 'name' when guessed), the call name,
	 * and the greeting exactly as the row's language writes it ("Pak Kevin", "Bapak/Ibu Ade").
	 */
	address: {
		salutation: Salutation | null;
		source: SalutationSource | 'name' | null;
		note: string;
		call_name: string;
		/** Set by hand; otherwise the call name is worked out from the name. */
		call_name_set: boolean;
		greeting: string;
		language: SalutationLanguage;
	};
	linkedin_status_at: number | null;
	linkedin_status_by: string | null;
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
	/**
	 * Set for a legacy Indonesian attendee (§2.3, D15): checked in before the consent boxes,
	 * never ticked "future events". They get one notice and thirty days to answer (§5.4).
	 */
	legacy: { notice_at: number | null; kept_at: number | null } | null;
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

/** A label as a template and its slots, so the row can translate it ({day} is already formatted). */
export interface Template {
	text: string;
	vars?: Record<string, string | number>;
}

/** Fills a template's {slots}, as the English labels read. */
export const fill = ({ text, vars }: Template) =>
	vars
		? text.replace(/\{(\w+)\}/g, (slot, key: string) => (key in vars ? String(vars[key]) : slot))
		: text;

/** Every template nextActionText can return, one per kind and timing. */
export const NEXT_ACTION_TEXT = {
	chase: {
		overdue: 'Chase · overdue since {day}',
		today: 'Chase · due today',
		due: 'Chase · due {day}'
	},
	reminder: {
		overdue: 'Reminder · overdue since {day}',
		today: 'Reminder · due today',
		due: 'Reminder · due {day}'
	}
} as const;

/** nextActionLabel as a template: "Chase · due {day}" with the day in `vars`. */
export function nextActionText(
	row: Pick<PeopleRow, 'next_action_at' | 'next_action_kind'>,
	today: Today,
	day: (ts: number) => string
): Template | null {
	if (row.next_action_at === null || !row.next_action_kind) return null;
	const texts = NEXT_ACTION_TEXT[row.next_action_kind];
	const at = row.next_action_at;
	if (at < today.start) return { text: texts.overdue, vars: { day: day(at) } };
	if (at <= today.end) return { text: texts.today };
	return { text: texts.due, vars: { day: day(at) } };
}

/** "Chase · due Tue 7 Oct", "Reminder · due today", "Chase · overdue since Fri 2 Oct". */
export function nextActionLabel(
	row: Pick<PeopleRow, 'next_action_at' | 'next_action_kind'>,
	today: Today,
	day: (ts: number) => string
): string | null {
	const template = nextActionText(row, today, day);
	return template && fill(template);
}

export const isLive = (row: Pick<PeopleRow, 'stage'>) => row.stage !== 'found';

export function effectiveOwner(row: Pick<PeopleRow, 'owner' | 'company_owner'>): string | null {
	return row.owner ?? row.company_owner ?? null;
}

/**
 * A live row with no way to reach the person: the organizer still has details to find. A
 * LinkedIn connection is a way (D26); a profile alone is not, until they accept.
 */
export function needsDetails(
	row: Pick<PeopleRow, 'stage' | 'email' | 'phone' | 'linkedin' | 'linkedin_status'>
): boolean {
	const linkedin = !!row.linkedin && row.linkedin_status === 'connected';
	return isLive(row) && !row.email && !row.phone && !linkedin;
}

/** A marker's English `label`, and the same as a `text` template with `vars` to translate. */
export interface Marker extends Template {
	key: string;
	label: string;
	tone: 'muted' | 'warn' | 'bad' | 'brand';
}

/** Every template a marker can carry, the legacy ones included. */
export const MARKER_TEXT = {
	locked: 'Locked',
	blocked: 'Blocked company',
	suppressed: 'Suppressed',
	details: 'Needs details',
	review: 'Self-registered, check company owner',
	chased: 'Chased ×{n}',
	chasedLast: 'Chased ×{n}, last {day}',
	consent: 'No consent recorded',
	contact: 'Not contactable'
} as const;

export const LEGACY_TEXT = {
	kept: 'Legacy: kept, answered {day}',
	notice: 'Legacy: notice sent {day}, kept if they reply',
	first: 'Legacy: past attendee, send the notice first'
} as const;

function marker(key: string, tone: Marker['tone'], template: Template): Marker {
	return { key, label: fill(template), tone, ...template };
}

/** The markers from §1, in the order they read best on a row. `day` formats a timestamp. */
export function markers(row: PeopleRow, day: (ts: number) => string): Marker[] {
	const list: Marker[] = [];
	if (row.locked_at) list.push(marker('locked', 'bad', { text: MARKER_TEXT.locked }));
	if (row.blocked_at) list.push(marker('blocked', 'bad', { text: MARKER_TEXT.blocked }));
	if (row.suppressed) list.push(marker('suppressed', 'bad', { text: MARKER_TEXT.suppressed }));
	if (needsDetails(row)) list.push(marker('details', 'warn', { text: MARKER_TEXT.details }));
	if (row.needs_review) list.push(marker('review', 'warn', { text: MARKER_TEXT.review }));
	if (row.chase_count)
		list.push(
			marker(
				'chased',
				'muted',
				row.last_contacted_at
					? {
							text: MARKER_TEXT.chasedLast,
							vars: { n: row.chase_count, day: day(row.last_contacted_at) }
						}
					: { text: MARKER_TEXT.chased, vars: { n: row.chase_count } }
			)
		);
	if (row.stage === 'checked_in' && row.consent_event_at === null)
		list.push(marker('consent', 'warn', { text: MARKER_TEXT.consent }));
	// "Invited on LinkedIn" is the row's own pressed button, and the track shows Invited.
	if (!row.contact.whatsapp && !row.contact.email && row.contact.reason === 'not contactable')
		list.push(marker('contact', 'warn', { text: MARKER_TEXT.contact }));
	if (row.legacy) list.push(marker('legacy', 'warn', legacyText(row.legacy, day)));
	return list;
}

/** legacyLabel as a template, with the day in `vars`. */
export function legacyText(
	legacy: NonNullable<PeopleRow['legacy']>,
	day: (ts: number) => string
): Template {
	if (legacy.kept_at) return { text: LEGACY_TEXT.kept, vars: { day: day(legacy.kept_at) } };
	if (legacy.notice_at) return { text: LEGACY_TEXT.notice, vars: { day: day(legacy.notice_at) } };
	return { text: LEGACY_TEXT.first };
}

/** What is going on with a legacy attendee (§8): the notice, the clock, or that they answered. */
export function legacyLabel(
	legacy: NonNullable<PeopleRow['legacy']>,
	day: (ts: number) => string
): string {
	return fill(legacyText(legacy, day));
}
