import { beforeEach, describe, expect, it } from 'vitest';
import { checkIn, listAttendees } from './checkins';
import { deleteContact } from './contacts';
import { createDb, type DB } from './database';
import { createEvent } from './events';
import {
	addInvitations,
	addWalkIn,
	groupByCompany,
	listInvitations,
	matchArrivals,
	renameCompany,
	setReply,
	type GuestInput
} from './invitations';

const meta = { method: 'form' as const, device: 'ios' as const, consent: true };

function guest(name: string, overrides: Partial<GuestInput> = {}): GuestInput {
	return { name, company: 'Batavia Foods', jobTitle: '', email: null, phone: null, ...overrides };
}

function newEvent(db: DB, name = 'Launch') {
	return createEvent(db, {
		name,
		venue: 'Jakarta',
		startsAt: null,
		timezone: 'Asia/Jakarta',
		qrMode: 'static'
	});
}

describe('guest list', () => {
	let db: DB;
	let eventId: string;

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = newEvent(db);
	});

	it('skips people already on the list, however their name or company is written', () => {
		addInvitations(db, eventId, [
			guest('Hendra Gunawan'),
			guest('Rina Wijaya', { email: 'rina@batavia.co.id' })
		]);
		const again = addInvitations(db, eventId, [
			guest('Bapak Hendra Gunawan', { company: 'PT. Batavia Foods Tbk' }),
			guest('R. Wijaya', { email: 'rina@batavia.co.id' }),
			guest('Hendra Gunawan', { company: 'Selat Energy' })
		]);
		expect(again).toEqual({
			added: ['Hendra Gunawan'],
			duplicates: ['Bapak Hendra Gunawan', 'R. Wijaya']
		});
		expect(listInvitations(db, eventId)).toHaveLength(3);
	});

	it('knows someone by their LinkedIn profile', () => {
		const linkedin = 'https://www.linkedin.com/in/rina-wijaya-4a1b2c';
		addInvitations(db, eventId, [guest('Rina Wijaya', { linkedin })]);
		const again = addInvitations(db, eventId, [guest('Rina W.', { company: 'Selat', linkedin })]);
		expect(again.duplicates).toEqual(['Rina W.']);
		expect(listInvitations(db, eventId)[0].linkedin).toBe(linkedin);
	});

	it('records when a reply came in, and forgets it when the reply is taken back', () => {
		addInvitations(db, eventId, [guest('Rina Wijaya')], 1_000);
		const [{ id }] = listInvitations(db, eventId);
		const current = () => listInvitations(db, eventId)[0];

		setReply(db, eventId, id, 'yes', 2_000);
		setReply(db, eventId, id, 'yes', 3_000);
		expect(current()).toMatchObject({ reply: 'yes', replied_at: 2_000 });
		setReply(db, eventId, id, 'no', 4_000);
		expect(current()).toMatchObject({ reply: 'no', replied_at: 4_000 });
		setReply(db, eventId, id, 'pending', 5_000);
		expect(current()).toMatchObject({ reply: 'pending', replied_at: null });
	});

	it('only touches its own event', () => {
		const other = newEvent(db, 'Other');
		addInvitations(db, other, [guest('Rina Wijaya')]);
		const [{ id }] = listInvitations(db, other);
		setReply(db, eventId, id, 'yes');
		expect(listInvitations(db, other)[0].reply).toBe('pending');
	});

	it('groups spellings of one company and renames them together', () => {
		addInvitations(db, eventId, [
			guest('Ana', { company: 'Batavia Foods' }),
			guest('Budi', { company: 'PT Batavia Foods' }),
			guest('Citra', { company: 'Batavia Foods' }),
			guest('Dewi', { company: '' }),
			guest('Eko', { company: 'anggrek media' })
		]);
		const groups = groupByCompany(listInvitations(db, eventId));
		expect(groups.map((g) => [g.name, g.guests.map((x) => x.name)])).toEqual([
			['anggrek media', ['Eko']],
			['Batavia Foods', ['Ana', 'Budi', 'Citra']],
			['', ['Dewi']]
		]);

		renameCompany(db, eventId, groups[1].key, 'Batavia Foods Group');
		const companies = listInvitations(db, eventId).map((i) => i.company);
		expect(companies).toEqual([
			'Batavia Foods Group',
			'Batavia Foods Group',
			'Batavia Foods Group',
			'',
			'anggrek media'
		]);
	});

	it('adds a walk-in as attending, once', () => {
		const { checkinId } = checkIn(
			db,
			eventId,
			{
				name: 'Kevin Tan',
				email: 'kevin@example.com',
				phone: null,
				company: 'Kopi Kita',
				jobTitle: 'CIO'
			},
			meta
		);
		expect(addWalkIn(db, eventId, checkinId, 7_000)).toBe('Kevin Tan');
		addWalkIn(db, eventId, checkinId);
		expect(listInvitations(db, eventId)).toEqual([
			expect.objectContaining({
				name: 'Kevin Tan',
				company: 'Kopi Kita',
				job_title: 'CIO',
				reply: 'yes',
				replied_at: 7_000
			})
		]);
		expect(addWalkIn(db, newEvent(db, 'Other'), checkinId)).toBeNull();
	});

	it('erases invitations along with the contact they belong to', () => {
		const other = newEvent(db, 'Other');
		const { personId } = checkIn(
			db,
			eventId,
			{ name: 'Rina', email: 'rina@example.com', phone: null, company: '', jobTitle: '' },
			meta
		);
		addInvitations(db, eventId, [
			guest('Rina Wijaya', { email: 'rina@example.com' }),
			guest('Andi')
		]);
		addInvitations(db, other, [guest('Rina Wijaya', { email: 'rina@example.com' })]);

		deleteContact(db, personId);
		expect(listInvitations(db, eventId).map((i) => i.name)).toEqual(['Andi']);
		expect(listInvitations(db, other)).toEqual([]);
	});

	it('pairs the guest list with real check-ins', () => {
		addInvitations(db, eventId, [
			guest('Rina Wijaya', { email: 'rina@example.com' }),
			guest('Ibu Maya Anggraini'),
			guest('Andi Pratama')
		]);
		for (const [name, email] of [
			['Rina W', 'rina@example.com'],
			['Maya Anggraini', 'maya@gmail.com'],
			['Kevin Tan', 'kevin@example.com']
		])
			checkIn(db, eventId, { name, email, phone: null, company: '', jobTitle: '' }, meta);

		const invitations = listInvitations(db, eventId);
		const { arrived, walkIns } = matchArrivals(invitations, listAttendees(db, eventId));
		expect(invitations.map((i) => arrived.get(i.id)?.name ?? null)).toEqual([
			'Rina W',
			'Maya Anggraini',
			null
		]);
		expect(walkIns.map((w) => w.name)).toEqual(['Kevin Tan']);
	});
});

describe('matchArrivals', () => {
	type P = { name: string; company?: string; email?: string; phone?: string };
	const invitees = (...people: P[]) =>
		people.map((p, i) => ({
			id: i + 1,
			name: p.name,
			company: p.company ?? '',
			email: p.email ?? null,
			phone: p.phone ?? null
		}));
	const checkins = (...people: P[]) =>
		people.map((p, i) => ({
			checkin_id: 100 + i,
			name: p.name,
			company: p.company ?? '',
			email: p.email ?? null,
			phone: p.phone ?? null
		}));
	const pairs = (i: ReturnType<typeof invitees>, c: ReturnType<typeof checkins>) => {
		const { arrived } = matchArrivals(i, c);
		return i.map((x) => arrived.get(x.id)?.checkin_id ?? null);
	};

	it('trusts email and mobile over names', () => {
		const list = invitees(
			{ name: 'Rina', email: 'rina@example.com' },
			{ name: 'Andi', phone: '+6281234567890' }
		);
		const came = checkins(
			{ name: 'Someone Else', phone: '+6281234567890' },
			{ name: 'Rina Wijaya', email: 'rina@example.com' }
		);
		expect(pairs(list, came)).toEqual([101, 100]);
	});

	it('uses each check-in once', () => {
		const list = invitees({ name: 'Andi Pratama' }, { name: 'Andi Pratama' });
		expect(pairs(list, checkins({ name: 'Andi Pratama' }))).toEqual([100, null]);
	});

	it("won't pair namesakes from different companies", () => {
		const list = invitees({ name: 'Andi Pratama', company: 'Selat Energy' });
		expect(pairs(list, checkins({ name: 'Andi Pratama', company: 'Kopi Kita' }))).toEqual([null]);
		expect(pairs(list, checkins({ name: 'andi pratama', company: 'PT Selat Energy' }))).toEqual([
			100
		]);
		expect(pairs(list, checkins({ name: 'Andi Pratama' }))).toEqual([100]);
	});

	it('gives a repeated name to the check-in from the same company', () => {
		const list = invitees({ name: 'Andi Pratama', company: 'Kopi Kita' });
		const came = checkins({ name: 'Andi Pratama' }, { name: 'Andi Pratama', company: 'Kopi Kita' });
		expect(pairs(list, came)).toEqual([101]);
	});
});
