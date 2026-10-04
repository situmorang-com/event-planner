import { beforeEach, describe, expect, it } from 'vitest';
import { findCompany, setCompanyPhoneCountry } from './companies';
import { createDb, type DB } from './database';
import { lockPerson } from './do-not-contact';
import { addShortlisted, listEventPeople, setReply } from './event-people';
import { createEvent, getEvent, setInvitationText, updateEvent, type EventRow } from './events';
import { OPT_OUT_LINE, setTemplate } from './message-templates';
import {
	countryResolver,
	fillPlaceholders,
	formatWhen,
	languageFor,
	messageLink,
	phoneCountryFor,
	renderMessage,
	rowMessage,
	tidy
} from './messaging';
import { createPerson } from './people';
import { registrationToken } from './registration-token';

const START = Date.UTC(2026, 9, 13, 2, 0);
const ENV = {
	org: 'SRKK',
	privacyUrl: 'https://srkk.test/privacy',
	base: 'https://ep.test',
	secret: 's'
};

describe('language and country resolution (§2.3)', () => {
	const event = { language: null, phone_country: 'ID' } as const;

	it('follows the company’s phone country, else the event’s, and maps it to a language', () => {
		expect(phoneCountryFor(event)).toBe('ID');
		expect(phoneCountryFor(event, null)).toBe('ID');
		expect(phoneCountryFor(event, { phone_country: null })).toBe('ID');
		expect(phoneCountryFor(event, { phone_country: 'MY' })).toBe('MY');
		expect(phoneCountryFor({ phone_country: 'MY' }, { phone_country: 'ID' })).toBe('ID');

		expect(languageFor(event)).toBe('id');
		expect(languageFor(event, { phone_country: 'MY' })).toBe('ms');
		expect(languageFor({ language: null, phone_country: 'MY' })).toBe('ms');
		expect(languageFor({ language: null, phone_country: 'MY' }, { phone_country: 'ID' })).toBe(
			'id'
		);
	});

	it('lets an explicit language on the event beat every country, and only that gives English', () => {
		expect(languageFor({ language: 'en', phone_country: 'ID' }, { phone_country: 'MY' })).toBe(
			'en'
		);
		expect(languageFor({ language: 'ms', phone_country: 'ID' })).toBe('ms');
		expect(languageFor({ language: 'id', phone_country: 'MY' }, { phone_country: 'MY' })).toBe(
			'id'
		);
	});

	it('looks a typed company up for the forms', () => {
		const db = createDb(':memory:');
		createPerson(db, { name: 'Mei', company: 'Selat Energy' }, { origin: 'typed' });
		setCompanyPhoneCountry(db, findCompany(db, 'Selat Energy')!.id, 'MY');
		const country = countryResolver(db, { phone_country: 'ID' });
		expect(country('PT Selat Energy Sdn Bhd')).toBe('MY');
		expect(country('Batavia Foods')).toBe('ID');
		expect(country('')).toBe('ID');
	});
});

describe('placeholders', () => {
	it('fills the known ones and tidies what an empty one leaves behind', () => {
		expect(
			fillPlaceholders('Hi {name}, {event} on {date}, {venue}. Register here: {link}', {
				name: 'Rina',
				event: 'Summit',
				date: 'Tue, 13 Oct 2026 at 9:00 AM',
				venue: '',
				link: ''
			})
		).toBe('Hi Rina, Summit on Tue, 13 Oct 2026 at 9:00 AM. Register here.');
		expect(
			fillPlaceholders('{org} {x} {link}. Bye', { org: 'SRKK', link: 'https://a.b/r/1' })
		).toBe('SRKK {x} https://a.b/r/1. Bye');
		expect(tidy('a , b ,  . c:')).toBe('a, b. c.');
	});

	it('formats the date in the reader’s language', () => {
		expect(formatWhen(START, 'Asia/Jakarta', 'en')).toBe('Tue, 13 Oct 2026 at 9:00 AM');
		expect(formatWhen(START, 'Asia/Jakarta', 'id')).toMatch(/2026/);
		expect(formatWhen(START, 'Asia/Kuala_Lumpur', 'ms')).toMatch(/2026/);
	});
});

describe('renderMessage (§7)', () => {
	let db: DB;
	let eventId: string;
	const event = () => getEvent(db, eventId) as EventRow;
	const row = (i = 0) => listEventPeople(db, eventId)[i];
	const ctx = (i = 0) => ({ row: row(i), event: event() });

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Partner Summit',
			venue: 'Grand Ballroom',
			startsAt: START,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		createPerson(
			db,
			{ name: 'Andi Pratama', email: 'andi@x.test', company: 'Kopi Kita' },
			{ origin: 'research', sourceUrl: 'https://x.test/team' }
		);
		addShortlisted(
			db,
			eventId,
			[
				{
					name: 'Rina Wijaya',
					company: 'Batavia Foods',
					jobTitle: '',
					email: 'rina@batavia.co.id',
					phone: '+6281234567890'
				},
				{
					name: 'Andi Pratama',
					company: 'Kopi Kita',
					jobTitle: '',
					email: 'andi@x.test',
					phone: null
				}
			],
			{ source: 'typed' }
		);
	});

	it('puts the body first, the research source line after it and the opt-out line last', () => {
		const text = renderMessage(db, 'invitation', ctx(1), ENV)!;
		const parts = text.split('\n\n');
		expect(parts).toHaveLength(3);
		expect(parts[0]).toMatch(
			/^Halo Andi, SRKK mengundang Anda ke Partner Summit pada .*2026.*, Grand Ballroom\./
		);
		expect(parts[0]).toContain(`https://ep.test/r/${registrationToken('s', eventId, row(1).id)}`);
		expect(parts[1]).toBe(
			'Kami menemukan data pekerjaan Anda di halaman publik: https://x.test/team. Cara kami menangani data: https://srkk.test/privacy'
		);
		expect(parts[2]).toBe(OPT_OUT_LINE.id);

		// Someone typed in gets no source line; the opt-out line still closes the message.
		const typed = renderMessage(db, 'invitation', ctx(0), ENV)!.split('\n\n');
		expect(typed).toHaveLength(2);
		expect(typed[0]).toMatch(/^Halo Rina/);
		expect(typed[1]).toBe(OPT_OUT_LINE.id);
	});

	it('cannot render for a research find until PRIVACY_URL is set', () => {
		const env = { ...ENV, privacyUrl: '' };
		expect(renderMessage(db, 'invitation', ctx(1), env)).toBeNull();
		expect(rowMessage(db, ctx(1), env)).toMatchObject({ text: null, email: null, whatsapp: null });
		expect(rowMessage(db, ctx(1), env)?.hint).toMatch(/PRIVACY_URL/);
		expect(messageLink(db, 'invitation', ctx(1), env)).toBeNull();
		// Everyone else is unaffected.
		expect(renderMessage(db, 'invitation', ctx(0), env)).toMatch(/^Halo Rina/);
	});

	it('resolves the invitation text, then the template, then the built-in default', () => {
		const base = {
			name: 'Partner Summit',
			venue: 'Grand Ballroom',
			startsAt: START,
			timezone: 'Asia/Jakarta',
			qrMode: 'static' as const
		};
		updateEvent(db, eventId, { ...base, language: 'en' });
		expect(renderMessage(db, 'chase', ctx(0), ENV)).toMatch(/^Hi Rina, just following up/);
		setTemplate(db, 'chase', 'en', 'Chasing {name} about {event} ({org})');
		expect(renderMessage(db, 'chase', ctx(0), ENV)).toMatch(
			/^Chasing Rina about Partner Summit \(SRKK\)\n\n/
		);
		setInvitationText(db, eventId, 'Dear {name}, come to {event} at {venue}: {link}');
		expect(renderMessage(db, 'invitation', ctx(0), ENV)).toMatch(
			/^Dear Rina, come to Partner Summit at Grand Ballroom: https:\/\/ep\.test\/r\/r\.\d+\.[\w-]{12}\n\n/
		);
		// The override is for invitations only.
		expect(renderMessage(db, 'chase', ctx(0), ENV)).toMatch(/^Chasing Rina/);
		setInvitationText(db, eventId, '   ');
		expect(renderMessage(db, 'invitation', ctx(0), ENV)).toMatch(/^Hi Rina, SRKK would like/);
	});

	it('writes in the company’s language and leaves {link} out while the event has no date', () => {
		setCompanyPhoneCountry(db, findCompany(db, 'Batavia Foods')!.id, 'MY');
		const text = renderMessage(db, 'reminder', ctx(0), ENV)!;
		expect(text).toMatch(/^Hai Rina, sekadar peringatan/);
		expect(text.endsWith(OPT_OUT_LINE.ms)).toBe(true);
		db.prepare(`UPDATE events SET starts_at = NULL WHERE id = ?`).run(eventId);
		const undated = renderMessage(db, 'reminder', ctx(0), ENV)!;
		expect(undated).not.toContain('/r/');
		expect(undated).toMatch(/di sini\. Jumpa nanti!/);
	});
});

describe('messageLink', () => {
	let db: DB;
	let eventId: string;
	const ctx = (i = 0) => ({ row: listEventPeople(db, eventId)[i], event: getEvent(db, eventId)! });

	beforeEach(() => {
		db = createDb(':memory:');
		eventId = createEvent(db, {
			name: 'Summit',
			venue: '',
			startsAt: START,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		addShortlisted(
			db,
			eventId,
			[
				{ name: 'Rina', company: 'A', jobTitle: '', email: 'rina@a.test', phone: '+6281234567890' },
				{ name: 'Budi', company: 'A', jobTitle: '', email: 'budi@a.test', phone: '0812' },
				{ name: 'Dewi', company: 'A', jobTitle: '', email: null, phone: null }
			],
			{ source: 'typed' }
		);
	});

	it('opens WhatsApp for an international mobile, else email, else nothing', () => {
		const rina = messageLink(db, 'invitation', ctx(0), ENV)!;
		expect(rina.via).toBe('whatsapp');
		expect(rina.href).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=Halo%20Rina/);
		expect(decodeURIComponent(rina.href.split('text=')[1])).toContain(OPT_OUT_LINE.id);
		const budi = messageLink(db, 'invitation', ctx(1), ENV)!;
		expect(budi.via).toBe('email');
		expect(budi.href).toMatch(/^mailto:budi@a\.test\?subject=Summit&body=Halo%20Budi/);
		expect(messageLink(db, 'invitation', ctx(2), ENV)).toBeNull();
	});

	it('follows the kind the row’s stage suggests and goes quiet once they are locked', () => {
		expect(rowMessage(db, ctx(0), ENV)?.kind).toBe('invitation');
		setReply(db, eventId, ctx(0).row.id, 'yes');
		expect(rowMessage(db, ctx(0), ENV)?.kind).toBe('thanks_yes');
		expect(rowMessage(db, ctx(0), ENV)?.text).toMatch(
			/^Halo Rina, terima kasih atas konfirmasinya/
		);
		lockPerson(db, ctx(0).row.person_id!, { source: 'staff' });
		expect(messageLink(db, 'thanks_yes', ctx(0), ENV)).toBeNull();
		expect(rowMessage(db, ctx(0), ENV)).toMatchObject({ whatsapp: null, email: null, hint: null });
	});
});
