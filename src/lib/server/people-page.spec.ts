import { beforeEach, describe, expect, it } from 'vitest';
import { markers, menuKinds } from '../people';
import { checkIn } from './checkins';
import { blockCompany, findCompany, setCompanyOwner, setCompanyPhoneCountry } from './companies';
import { createDb, type DB } from './database';
import { lockPerson } from './do-not-contact';
import {
	addShortlisted,
	addTouch,
	confirmRow,
	listEventPeople,
	setOwner,
	setReply,
	shortlistFound,
	type GuestInput
} from './event-people';
import { createEvent, updateEvent } from './events';
import { createPerson, getPeople } from './people';
import { addPeople, FOUND_THRESHOLD, peopleView, reviewedGuests } from './people-page';
import { notMe } from './registration';
import { consentBoxesSince, recordConsentBoxesSince, setTeamNames } from './settings';

const guest = (name: string, extra: Partial<GuestInput> = {}): GuestInput => ({
	name,
	company: 'Batavia Foods',
	jobTitle: '',
	email: null,
	phone: null,
	...extra
});

const START = Date.UTC(2026, 10, 1, 2);
const DAY = 86_400_000;
const ENV = {
	org: 'SRKK',
	privacyUrl: 'https://srkk.test/privacy',
	base: 'https://ep.test',
	secret: 's'
};

function newEvent(db: DB) {
	return createEvent(db, {
		name: 'Launch',
		venue: '',
		startsAt: START,
		timezone: 'Asia/Jakarta',
		qrMode: 'static',
		targetCount: 10
	});
}

describe('peopleView', () => {
	let db: DB;
	let eventId: string;
	const event = () => db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId) as never;
	const view = (now = START - 86_400_000) => peopleView(db, event(), ENV, now);

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = newEvent(db);
		setTeamNames(db, ['Edmund', 'Sari']);
	});

	it('groups rows by company with the owner inherited from it', () => {
		addShortlisted(
			db,
			eventId,
			[
				guest('Ana', { email: 'ana@x.id' }),
				guest('Budi', { company: 'PT Batavia Foods', phone: '+6281234567890' }),
				guest('Citra', { company: 'Selat Energy' }),
				guest('Dewi', { company: '' })
			],
			{ source: 'typed' }
		);
		setCompanyOwner(db, findCompany(db, 'Batavia Foods')!.id, 'Sari');
		const rows = listEventPeople(db, eventId);
		setOwner(db, eventId, rows[1].id, 'Edmund');

		const { groups } = view();
		expect(groups.map((g) => [g.name, g.owner, g.rows.map((r) => r.name)])).toEqual([
			['Batavia Foods', 'Sari', ['Ana', 'Budi']],
			['Selat Energy', null, ['Citra']],
			['', null, ['Dewi']]
		]);
		expect(groups[0].rows.map((r) => [r.owner, r.company_owner])).toEqual([
			[null, 'Sari'],
			['Edmund', 'Sari']
		]);
	});

	it('counts Yes replies against the target and confirmations beside it', () => {
		addShortlisted(
			db,
			eventId,
			[guest('A', { reply: 'yes' }), guest('B', { reply: 'yes' }), guest('C', { reply: 'maybe' })],
			{ source: 'typed' }
		);
		const rows = listEventPeople(db, eventId);
		confirmRow(db, eventId, rows[0].id, 'registration');
		expect(view().progress).toEqual({ yes: 2, confirmed: 1, target: 10 });
		expect(view().counts).toMatchObject({ yes: 2, maybe: 1, confirmed: 1, shortlisted: 0 });
		expect(view().ended).toBe(false);
		expect(view(START + 7 * 3_600_000)).toMatchObject({ ended: true });
		// A row its person disowned is nobody's yes: it counts only behind the Skipped chip.
		notMe(db, { row: rows[0], event: event() });
		expect(view().progress).toEqual({ yes: 1, confirmed: 0, target: 10 });
		expect(view().counts).toMatchObject({ yes: 1, confirmed: 0, skipped: 1 });
		expect(view().rows[0].message).toBeNull();
		expect(view(START + 7 * 3_600_000).counts.no_show).toBe(2);
	});

	it('closes the message buttons for locked, blocked and flagged people', () => {
		addShortlisted(
			db,
			eventId,
			[
				guest('Rina', { email: 'rina@x.id', phone: '+6281234567890' }),
				guest('Kopi', { company: 'Kopi Kita', email: 'k@kopi.id' }),
				guest('Nomail', { email: 'n@x.id', phone: '+6281111111111' })
			],
			{ source: 'typed' }
		);
		const [rina, kopi, nomail] = listEventPeople(db, eventId);
		lockPerson(db, rina.person_id!, { source: 'staff', reason: 'asked' });
		blockCompany(db, findCompany(db, 'Kopi Kita')!.id, { reason: 'competitor' });
		db.prepare(`UPDATE people SET d365_no_email = 1 WHERE id = ?`).run(nomail.person_id);

		const rows = view().rows;
		expect(rows.map((r) => r.contact)).toEqual([
			{ whatsapp: false, email: false, reason: 'locked' },
			{ whatsapp: false, email: false, reason: null },
			{ whatsapp: true, email: false, reason: null }
		]);
		const day = () => '2 Oct';
		expect(markers(rows[0], day).map((m) => m.key)).toEqual(['locked']);
		expect(markers(rows[1], day).map((m) => m.key)).toEqual(['blocked']);
		expect(markers(rows[2], day)).toEqual([]);
		void kopi;
	});

	it('marks what a row still needs and how often it was chased', () => {
		addShortlisted(db, eventId, [guest('Rina'), guest('Andi', { email: 'a@x.id' })], {
			source: 'typed'
		});
		const [rina, andi] = listEventPeople(db, eventId);
		addTouch(db, eventId, andi.id, { kind: 'invitation', via: 'linkedin' }, 1_000);
		addTouch(db, eventId, andi.id, { kind: 'chase', via: 'email' }, 2_000);
		checkIn(
			db,
			eventId,
			{ name: 'Rina', email: null, phone: null, company: 'Batavia Foods', jobTitle: '' },
			{ method: 'staff', device: 'other', consent: false }
		);

		const rows = view().rows;
		const day = (ts: number) => `day ${ts}`;
		expect(markers(rows[0], day).map((m) => m.label)).toEqual([
			'Needs details',
			'No consent recorded'
		]);
		// Invited on LinkedIn shows as the row's pressed button and its track, not a marker.
		expect(markers(rows[1], day).map((m) => m.label)).toEqual(['Chased ×1, last day 2000']);
		expect(rows[1].invited_via).toBe('linkedin');
		void rina;
	});

	it('suggests the thank-you for a fresh yes and the reminder only once it is due (§7)', () => {
		addShortlisted(db, eventId, [guest('Rina', { phone: '+6281234567890' })], { source: 'typed' });
		const [row] = listEventPeople(db, eventId);
		addTouch(db, eventId, row.id, { kind: 'invitation', via: 'whatsapp' }, START - 14 * DAY);
		setReply(db, eventId, row.id, 'yes', START - 14 * DAY);
		const twoWeeksOut = view(START - 14 * DAY).rows[0];
		expect(twoWeeksOut).toMatchObject({
			next_action_kind: 'reminder',
			suggested_kind: 'thanks_yes'
		});
		expect(twoWeeksOut.message?.kind).toBe('thanks_yes');
		// Two days before: the rules' reminder is due, so it is what the buttons open.
		expect(view(START - 2 * DAY).rows[0].suggested_kind).toBe('reminder');
		confirmRow(db, eventId, row.id, 'registration', START - 14 * DAY);
		expect(view(START - 14 * DAY).rows[0].suggested_kind).toBe('reminder');
	});

	it('shows a legacy Malaysian attendee as not contactable until they register', () => {
		// Legacy means created before the consent boxes shipped (the version-4 stamp) without a tick.
		const since = consentBoxesSince(db)!;
		const personId = createPerson(
			db,
			{ name: 'Mei Ling', email: 'mei@x.my', phone: '+60123456789', company: 'Selat' },
			{ origin: 'checkin' },
			since - 10
		);
		addShortlisted(
			db,
			eventId,
			[...getPeople(db, [personId])].map((p) =>
				guest(p.name, {
					company: p.company,
					email: p.email,
					phone: p.phone
				})
			),
			{ source: 'pool' }
		);
		const [row] = view().rows;
		expect(row.person_id).toBe(personId);
		expect(row.contact).toEqual({ whatsapp: false, email: false, reason: 'not contactable' });
		expect(markers(row, () => '').map((m) => m.key)).toEqual(['contact']);
		// The stamp never moves, so a later call changes nothing.
		recordConsentBoxesSince(db, START);
		expect(view().rows[0].contact.reason).toBe('not contactable');

		setReply(db, eventId, row.id, 'yes');
		db.prepare(`UPDATE people SET consent_future_at = 1 WHERE id = ?`).run(personId);
		expect(view().rows[0].contact).toEqual({ whatsapp: true, email: true, reason: null });
	});

	it('offers a legacy Indonesian attendee the notice first, then says where the clock stands', () => {
		const since = consentBoxesSince(db)!;
		const personId = createPerson(
			db,
			{ name: 'Rina Wijaya', email: 'rina@x.id', phone: '+6281234567890', company: 'Batavia' },
			{ origin: 'checkin' },
			since - 10
		);
		addShortlisted(db, eventId, [guest('Rina Wijaya', { email: 'rina@x.id' })], { source: 'pool' });
		const day = (ts: number) => `day ${ts}`;
		let [row] = view().rows;
		expect(row.person_id).toBe(personId);
		expect(row.legacy).toEqual({ notice_at: null, kept_at: null });
		// The notice is their invitation (§8): preselected, rendered, and on the menu.
		expect(row.suggested_kind).toBe('legacy_notice');
		expect(row.message?.kind).toBe('legacy_notice');
		expect(row.message?.text).toContain('Anda pernah hadir di acara SRKK');
		expect(menuKinds(row)).toContain('legacy_notice');
		expect(markers(row, day).map((m) => m.label)).toEqual([
			'Legacy: past attendee, send the notice first'
		]);

		addTouch(db, eventId, row.id, { kind: 'legacy_notice', via: 'whatsapp' }, 3_000);
		[row] = view().rows;
		expect(row.stage).toBe('invited');
		expect(row.legacy).toEqual({ notice_at: 3_000, kept_at: null });
		expect(row.suggested_kind).toBe('chase');
		// The notice was their one message: nothing comes due until they answer (§8).
		expect(row.next_action_at).toBeNull();
		expect(markers(row, day).map((m) => m.label)).toEqual([
			'Legacy: notice sent day 3000, kept if they reply'
		]);

		setReply(db, eventId, row.id, 'maybe', 4_000);
		[row] = view().rows;
		expect(row.legacy).toEqual({ notice_at: 3_000, kept_at: 4_000 });
		expect(markers(row, day).map((m) => m.label)).toEqual(['Legacy: kept, answered day 4000']);

		// Nobody else gets the notice: a Malaysian legacy attendee waits, a new person is invited.
		expect(menuKinds({ legacy: null })).not.toContain('legacy_notice');
	});
});

describe('peopleView messages', () => {
	let db: DB;
	let eventId: string;
	const event = () => db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId) as never;
	const view = () => peopleView(db, event(), ENV, START - 86_400_000);

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = newEvent(db);
	});

	it('renders each live row a message in its company’s language with links per open channel', () => {
		addShortlisted(
			db,
			eventId,
			[
				guest('Rina Wijaya', { email: 'rina@batavia.co.id', phone: '+6281234567890' }),
				guest('Mei Ling', { company: 'Selat Energy', email: 'mei@selat.my', phone: '0123456789' })
			],
			{ source: 'typed' }
		);
		setCompanyPhoneCountry(db, findCompany(db, 'Selat Energy')!.id, 'MY');
		const [rina, mei] = view().rows;
		expect(rina.message).toMatchObject({ kind: 'invitation', hint: null });
		expect(rina.message?.text).toMatch(/^Halo Rina, SRKK mengundang Anda ke Launch/);
		expect(rina.message?.text).toMatch(
			/Balas STOP jika Anda tidak ingin dihubungi lagi tentang acara\.$/
		);
		expect(rina.message?.whatsapp).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
		expect(rina.message?.email).toMatch(/^mailto:rina@batavia\.co\.id\?subject=Launch&body=/);
		// Mei's company reads MY: her number is local, so email only, and the Malay wording.
		expect(mei.company_phone_country).toBe('MY');
		expect(mei.message?.text).toMatch(/^Hai Mei, SRKK ingin menjemput anda/);
		expect(mei.message?.whatsapp).toBeNull();
		expect(mei.message?.email).toMatch(/^mailto:mei@selat\.my/);
		expect(view().groups.find((g) => g.name === 'Selat Energy')?.phone_country).toBe('MY');
	});

	it('shows a hint instead of buttons for a research find until PRIVACY_URL is set', () => {
		db.prepare(
			`INSERT INTO event_people (event_id, name, company_id, source_url, stage, source, created_at,
				updated_at) VALUES (?, 'Andi Pratama', NULL, 'https://x.test/team', 'found', 'research', 1, 1)`
		).run(eventId);
		const found = view().rows[0];
		expect(found.message).toBeNull();
		shortlistFound(db, eventId, found.id);
		db.prepare(`UPDATE people SET email = 'andi@x.test'`).run();
		const dark = peopleView(db, event(), { ...ENV, privacyUrl: '' }).rows[0];
		expect(dark.message).toMatchObject({ text: null, whatsapp: null, email: null });
		expect(dark.message?.hint).toMatch(/PRIVACY_URL/);
		const lit = view().rows[0];
		expect(lit.message?.email).toMatch(/^mailto:andi@x\.test/);
		expect(lit.message?.text).toContain('https://x.test/team');
	});
});

describe('addPeople', () => {
	let db: DB;
	let eventId: string;
	const rows = () => listEventPeople(db, eventId);
	const event = () => db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId) as never;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = newEvent(db);
	});

	it('shortlists a short typed list and parks a long paste at Found', () => {
		const few = addPeople(db, eventId, {
			typed: [guest('Rina'), guest('Andi')],
			picked: [],
			company: 'Batavia Foods',
			park: false,
			originDetail: 'expo cards'
		});
		expect(few).toEqual({ added: 2, found: 0, duplicates: [], refused: [] });
		expect(rows().map((r) => [r.stage, r.source])).toEqual([
			['shortlisted', 'typed'],
			['shortlisted', 'typed']
		]);
		expect(getPeople(db, [rows()[0].person_id!])[0].origin_detail).toBe('expo cards');

		const many = Array.from({ length: FOUND_THRESHOLD + 1 }, (_, i) => guest(`Person ${i}`));
		const big = addPeople(db, eventId, { typed: many, picked: [], company: '', park: false });
		expect(big).toMatchObject({ added: 0, found: FOUND_THRESHOLD + 1 });
		expect(
			rows()
				.filter((r) => r.stage === 'found')
				.map((r) => r.source)
		).toEqual(many.map(() => 'paste'));
	});

	it('parks typed rows on request, keeping the typed source', () => {
		const result = addPeople(db, eventId, {
			typed: [guest('Rina')],
			picked: [],
			company: '',
			park: true
		});
		expect(result).toMatchObject({ added: 0, found: 1 });
		expect(rows()[0]).toMatchObject({ stage: 'found', source: 'typed', person_id: null });
	});

	it('imports D365 rows as customers with their flags, and parks suppressed ones', () => {
		setTeamNames(db, ['Sari Dewi']);
		const result = addPeople(db, eventId, {
			typed: [
				guest('Rina', {
					email: 'rina@batavia.co.id',
					extra: { doNotEmail: true, owner: 'Sari Dewi', status: 'Active' }
				}),
				guest('Andi', { extra: { suppressed: true, owner: 'Someone In Sales' } })
			],
			picked: [],
			company: '',
			park: false,
			d365: true
		});
		expect(result).toMatchObject({ added: 1, found: 0, refused: [{ name: 'Andi' }] });
		expect(result.refused[0].reason).toBe('suppressed');
		const [rina] = rows();
		expect(rina).toMatchObject({ stage: 'shortlisted', source: 'd365' });
		expect(getPeople(db, [rina.person_id!])[0]).toMatchObject({
			origin: 'd365',
			is_customer: 1,
			d365_no_email: 1,
			d365_no_phone: 0
		});
		expect(findCompany(db, 'Batavia Foods')).toMatchObject({ owner: 'Sari Dewi', d365_note: '' });

		// Parked: the snapshot keeps the flags, the owner note lands on the company, Add refuses.
		const parked = addPeople(db, eventId, {
			typed: [guest('Budi', { extra: { suppressed: true, owner: 'Someone In Sales' } })],
			picked: [],
			company: '',
			park: true,
			d365: true
		});
		expect(parked).toMatchObject({ added: 0, found: 1 });
		const budi = rows().find((r) => r.name === 'Budi')!;
		expect(budi).toMatchObject({ stage: 'found', source: 'd365' });
		expect(peopleView(db, event(), ENV).rows.find((r) => r.id === budi.id)?.suppressed).toBe(true);
		expect(shortlistFound(db, eventId, budi.id)).toMatchObject({ status: 'refused' });
		expect(findCompany(db, 'Batavia Foods')).toMatchObject({
			owner: 'Sari Dewi',
			d365_note: 'D365 owner: Someone In Sales'
		});
	});

	it('shortlists pool picks under the typed company, and reports what it could not add', () => {
		// Typed by the organizer before, so the company typed now may replace it (§3 precedence).
		const id = createPerson(
			db,
			{ name: 'Hendra Gunawan', email: 'hendra@x.id', company: 'Old Spelling' },
			{ origin: 'typed' }
		);
		const locked = createPerson(db, { name: 'Dewi', email: 'dewi@x.id' }, { origin: 'typed' });
		lockPerson(db, locked, { source: 'staff' });
		addShortlisted(db, eventId, [guest('Rina')], { source: 'typed' });

		const result = addPeople(db, eventId, {
			typed: [guest('Rina'), guest('Dewi', { email: 'dewi@x.id' })],
			picked: getPeople(db, [id]),
			company: 'Batavia Foods',
			park: false
		});
		expect(result).toEqual({
			added: 1,
			found: 0,
			duplicates: ['Rina'],
			refused: [{ name: 'Dewi', reason: 'do not contact' }]
		});
		const hendra = rows().find((r) => r.person_id === id)!;
		expect(hendra).toMatchObject({
			stage: 'shortlisted',
			source: 'pool',
			company: 'Batavia Foods'
		});
	});

	it('refuses a locked or suppressed pick on the record itself, whatever company is typed', () => {
		// No channels, so only a name+company hash exists; a new company would miss it.
		const locked = createPerson(db, { name: 'Andi Pratama', company: 'Old' }, { origin: 'typed' });
		lockPerson(db, locked, { source: 'staff' });
		const suppressed = createPerson(db, { name: 'Budi Santoso' }, { origin: 'd365' });
		db.prepare(`UPDATE people SET d365_suppressed = 1 WHERE id = ?`).run(suppressed);
		const citra = createPerson(db, { name: 'Citra', company: 'Kopi Kita' }, { origin: 'typed' });
		blockCompany(db, findCompany(db, 'Kopi Kita')!.id, { reason: 'competitor' });
		const before = db.prepare(`SELECT COUNT(*) AS n FROM people`).get();
		expect(
			addPeople(db, eventId, {
				typed: [],
				picked: getPeople(db, [locked, suppressed, citra]),
				company: 'Kopi Kita',
				park: false
			})
		).toEqual({
			added: 0,
			found: 0,
			duplicates: [],
			refused: [
				{ name: 'Andi Pratama', reason: 'locked' },
				{ name: 'Budi Santoso', reason: 'suppressed' },
				{ name: 'Citra', reason: 'blocked company' }
			]
		});
		expect(rows()).toEqual([]);
		expect(db.prepare(`SELECT COUNT(*) AS n FROM people`).get()).toEqual(before);
	});
});

describe('reviewedGuests', () => {
	it('cleans every field and names the first row that cannot be saved', () => {
		const ok = reviewedGuests(
			JSON.stringify([
				{
					name: ' Rina  Wijaya ',
					company: '',
					jobTitle: 'CFO',
					email: 'RINA@x.id',
					phone: '0812 3456 7890',
					linkedin: 'linkedin.com/in/Rina-Wijaya',
					reply: 'yes',
					note: 'VIP'
				}
			]),
			'Batavia Foods',
			'ID'
		);
		expect(ok).toEqual([
			{
				name: 'Rina Wijaya',
				company: 'Batavia Foods',
				jobTitle: 'CFO',
				email: 'rina@x.id',
				phone: '+6281234567890',
				linkedin: 'https://www.linkedin.com/in/rina-wijaya',
				reply: 'yes',
				note: 'VIP'
			}
		]);
		expect(reviewedGuests('[{"name": ""}]', '', 'ID')).toBe('Row 1 needs a name.');
		expect(reviewedGuests('[{"name": "A", "email": "nope"}]', '', 'ID')).toBe(
			'Row 1 (A): check the email.'
		);
		expect(reviewedGuests('[{"name": "A", "linkedin": "x.com/a"}]', '', 'ID')).toMatch(
			/isn’t a LinkedIn profile link/
		);
		expect(reviewedGuests('not json', '', 'ID')).toMatch(/didn’t arrive intact/);
	});
});

describe('target and phone country on the event', () => {
	it('keeps the target when the form leaves it out and clears it when sent empty', () => {
		const db = createDb(':memory:');
		const id = newEvent(db);
		const base = {
			name: 'Launch',
			venue: '',
			startsAt: START,
			timezone: 'UTC',
			qrMode: 'static' as const
		};
		updateEvent(db, id, { ...base, phoneCountry: 'MY' });
		expect(db.prepare(`SELECT target_count, phone_country FROM events`).get()).toEqual({
			target_count: 10,
			phone_country: 'MY'
		});
		updateEvent(db, id, { ...base, targetCount: null });
		expect(db.prepare(`SELECT target_count FROM events`).get()).toEqual({ target_count: null });
	});
});
