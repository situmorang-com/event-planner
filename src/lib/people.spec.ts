import { describe, expect, it } from 'vitest';
import { KIND_LABEL, nextStep, phaseTrack, type PeopleRow, type RowMessage } from './people';

type Row = Parameters<typeof phaseTrack>[0] & Parameters<typeof nextStep>[0];

const row = (extra: Partial<PeopleRow> = {}): Row => ({
	stage: 'shortlisted',
	reply: 'pending',
	invited_at: null,
	confirmed_at: null,
	skipped_at: null,
	locked_at: null,
	blocked_at: null,
	suppressed: false,
	email: null,
	phone: null,
	linkedin: null,
	linkedin_status: 'none',
	message: null,
	...extra
});

const message = (extra: Partial<RowMessage> = {}): RowMessage => ({
	kind: 'invitation',
	text: 'Hi Rina, you are invited…',
	whatsapp: null,
	email: null,
	hint: null,
	...extra
});

const states = (r: Row) => phaseTrack(r).map((s) => `${s.label}:${s.state}`);

describe('phaseTrack', () => {
	it('starts at Shortlisted with everything ahead', () => {
		expect(states(row())).toEqual([
			'Shortlisted:current',
			'Invited:todo',
			'Replied:todo',
			'Confirmed:todo',
			'Checked in:todo'
		]);
	});

	it('names the answer on the reply step', () => {
		const yes = row({ stage: 'replied', reply: 'yes', invited_at: 1 });
		expect(states(yes)).toEqual([
			'Shortlisted:done',
			'Invited:done',
			'Attending:current',
			'Confirmed:todo',
			'Checked in:todo'
		]);
		expect(states(row({ stage: 'replied', reply: 'maybe', invited_at: 1 }))[2]).toBe(
			'Tentative:current'
		);
	});

	it('ends at Declined: the steps after a no will not happen', () => {
		expect(states(row({ stage: 'replied', reply: 'no', invited_at: 1 }))).toEqual([
			'Shortlisted:done',
			'Invited:done',
			'Declined:current',
			'Confirmed:closed',
			'Checked in:closed'
		]);
	});

	it('shows a step that was passed without happening, as for a walk-in', () => {
		expect(states(row({ stage: 'checked_in' }))).toEqual([
			'Shortlisted:done',
			'Invited:missed',
			'Replied:missed',
			'Confirmed:missed',
			'Checked in:current'
		]);
		expect(
			states(row({ stage: 'confirmed', reply: 'yes', invited_at: 1, confirmed_at: 2 }))
		).toEqual([
			'Shortlisted:done',
			'Invited:done',
			'Attending:done',
			'Confirmed:current',
			'Checked in:todo'
		]);
	});

	it('explains every step', () => {
		for (const s of phaseTrack(row())) expect(s.help.length).toBeGreaterThan(10);
	});
});

describe('nextStep', () => {
	it('says to send the invitation when a button can open it', () => {
		expect(
			nextStep(row({ phone: '+62812', message: message({ whatsapp: 'https://wa.me/1' }) }))
		).toBe('Send the invitation with the WhatsApp or email button');
	});

	it('walks a LinkedIn-only person through connecting before inviting', () => {
		const li = { linkedin: 'https://www.linkedin.com/in/rina', message: message() };
		expect(nextStep(row(li))).toMatch(/^Open their LinkedIn and send a connection request/);
		expect(nextStep(row({ ...li, linkedin_status: 'requested' }))).toMatch(
			/^Wait for them to accept on LinkedIn/
		);
		expect(nextStep(row({ ...li, linkedin_status: 'connected' }))).toBe(
			'Copy the message, send it on LinkedIn, then press “Mark invited on LinkedIn”'
		);
		// Without a message to copy (research finds before PRIVACY_URL), it still says what to do.
		expect(
			nextStep(row({ ...li, linkedin_status: 'connected', message: message({ text: null }) }))
		).toBe('Invite them on LinkedIn, then press “Mark invited on LinkedIn”');
	});

	it('asks for details when there is no way to reach them', () => {
		expect(nextStep(row())).toBe('Find a phone, email or LinkedIn profile for them (Edit)');
		expect(
			nextStep(
				row({
					email: 'rina@x.id',
					message: message({ text: null, hint: 'Set PRIVACY_URL to message people found…' })
				})
			)
		).toBe('Set PRIVACY_URL, then send the invitation');
	});

	it('follows the answer once they are invited', () => {
		expect(nextStep(row({ stage: 'invited' }))).toMatch(/^Wait for their answer/);
		expect(nextStep(row({ stage: 'replied', reply: 'yes' }))).toMatch(/thank-you/);
		expect(nextStep(row({ stage: 'replied', reply: 'maybe' }))).toBe('Follow up until they decide');
		expect(nextStep(row({ stage: 'replied', reply: 'no' }))).toBe('Declined: nothing more to send');
		expect(nextStep(row({ stage: 'confirmed', reply: 'yes' }))).toBe(
			'Send a reminder before the event'
		);
	});

	it('says nothing where there is nothing to do', () => {
		expect(nextStep(row({ stage: 'found' }))).toBeNull();
		expect(nextStep(row({ stage: 'checked_in' }))).toBeNull();
		expect(nextStep(row({ skipped_at: 1 }))).toBeNull();
		expect(nextStep(row({ locked_at: 1 }))).toBeNull();
		expect(nextStep(row({ blocked_at: 1 }))).toBeNull();
	});
});

describe('message names', () => {
	it('say when each message is for, so the menu does not read as steps', () => {
		expect(KIND_LABEL.chase).toBe('Chase (no reply yet)');
		expect(KIND_LABEL.reminder).toBe('Reminder (before the event)');
	});
});
