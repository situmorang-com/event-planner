import { describe, expect, it } from 'vitest';
import { ID } from './i18n/index';
import { REPLY_LABEL } from './invitations';
import {
	fill,
	KIND_LABEL,
	LEGACY_TEXT,
	legacyLabel,
	legacyText,
	LINKEDIN_STATUS_LABEL,
	MARKER_TEXT,
	NEXT_ACTION_TEXT,
	NEXT_STEP,
	nextActionLabel,
	nextActionText,
	phaseTrack,
	STAGE_LABEL
} from './people';

// The row translates these by value (t(KIND_LABEL[k]), t(step.label), t(marker.text)…), which the
// coverage scanner can't see, so each value is checked against the dictionary here.

describe('the row labels in Indonesian', () => {
	it('has every label, sentence and template the row looks up', () => {
		const track = (['pending', 'yes', 'maybe', 'no'] as const).flatMap((reply) =>
			phaseTrack({ stage: 'replied', reply, invited_at: 1, confirmed_at: null }).flatMap((s) => [
				s.label,
				s.help
			])
		);
		const values = [
			...Object.values(KIND_LABEL),
			...Object.values(STAGE_LABEL),
			...Object.values(LINKEDIN_STATUS_LABEL),
			...Object.values(REPLY_LABEL),
			...Object.values(NEXT_STEP),
			...Object.values(NEXT_ACTION_TEXT).flatMap((t) => Object.values(t)),
			...Object.values(MARKER_TEXT),
			...Object.values(LEGACY_TEXT),
			...track
		];
		expect(values.filter((v) => !(v in ID))).toEqual([]);
	});
});

describe('labels as templates', () => {
	const today = { start: 1_000, end: 2_000 };
	const day = (ts: number) => `day ${ts}`;

	it('gives the due line as a template, filled the same as the English label', () => {
		const chase = { next_action_kind: 'chase' as const };
		expect(nextActionText({ ...chase, next_action_at: 500 }, today, day)).toEqual({
			text: 'Chase · overdue since {day}',
			vars: { day: 'day 500' }
		});
		expect(nextActionText({ ...chase, next_action_at: 1_500 }, today, day)).toEqual({
			text: 'Chase · due today'
		});
		const reminder = { next_action_kind: 'reminder' as const, next_action_at: 3_000 };
		expect(nextActionText(reminder, today, day)).toEqual({
			text: 'Reminder · due {day}',
			vars: { day: 'day 3000' }
		});
		expect(nextActionLabel(reminder, today, day)).toBe('Reminder · due day 3000');
		expect(nextActionText({ next_action_kind: null, next_action_at: 3_000 }, today, day)).toBe(
			null
		);
	});

	it('gives the legacy line as a template', () => {
		const notice = { notice_at: 3_000, kept_at: null };
		expect(legacyText(notice, day)).toEqual({
			text: 'Legacy: notice sent {day}, kept if they reply',
			vars: { day: 'day 3000' }
		});
		expect(legacyLabel(notice, day)).toBe('Legacy: notice sent day 3000, kept if they reply');
		expect(legacyText({ notice_at: null, kept_at: null }, day)).toEqual({
			text: 'Legacy: past attendee, send the notice first'
		});
	});

	it('fills slots and leaves unknown ones', () => {
		expect(fill({ text: 'Chased ×{n}, last {day}', vars: { n: 2, day: '2 Oct' } })).toBe(
			'Chased ×2, last 2 Oct'
		);
		expect(fill({ text: 'Chased ×{n}' })).toBe('Chased ×{n}');
	});
});
