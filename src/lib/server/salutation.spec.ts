import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, migrate, SCHEMA_VERSION, type DB } from './database';
import { addShortlisted, getEventPerson, listEventPeople, shortlistFound } from './event-people';
import { createEvent, getEvent, type EventRow } from './events';
import { DEFAULT_TEMPLATES, setTemplate, templateBody } from './message-templates';
import { renderMessage } from './messaging';
import { createPerson, getPerson, mergeInto } from './people';
import { addSuggestions, cleanSuggestion } from './planning';
import { registerGeneric, submitRegistration } from './registration';
import { setCallName, setSalutation } from './salutation';
import { setSchemaVersion } from './settings';

const START = Date.UTC(2026, 10, 1, 2);
const ENV = {
	org: 'SRKK',
	privacyUrl: 'https://srkk.test/privacy',
	base: 'https://ep.test',
	secret: 's'
};
const CONSENTS = { consentFuture: false, consentShare: false };

describe('Pak or Bu, and the call name (D27)', () => {
	let db: DB;
	let event: EventRow;
	let personId: string;

	const row = () => listEventPeople(db, event.id).find((r) => r.person_id === personId)!;
	const greeting = () => renderMessage(db, 'invitation', { row: row(), event }, ENV)!.split(',')[0];

	beforeEach(() => {
		db = createDb(':memory:');
		const id = createEvent(db, {
			name: 'Launch',
			venue: '',
			startsAt: START,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		event = getEvent(db, id)!;
		addShortlisted(
			db,
			event.id,
			[
				{
					name: 'Ade Kurniawan',
					company: 'Batavia Foods',
					jobTitle: '',
					email: 'ade@x.id',
					phone: null
				}
			],
			{ source: 'typed' }
		);
		personId = listEventPeople(db, event.id)[0].person_id!;
	});

	it('greets with Bapak/Ibu while the name could be either, and Pak or Bu once someone says', () => {
		expect(greeting()).toBe('Halo Bapak/Ibu Ade');
		setSalutation(db, personId, 'bu', 'team');
		expect(greeting()).toBe('Halo Bu Ade');
		setCallName(db, personId, '  Kurnia ');
		expect(greeting()).toBe('Halo Bu Kurnia');
		setCallName(db, personId, '');
		setSalutation(db, personId, null, 'team');
		expect(greeting()).toBe('Halo Bapak/Ibu Ade');
	});

	it('lets a stronger source overwrite a weaker one, and the team overwrite anything', () => {
		const stored = () => {
			const p = getPerson(db, personId)!;
			return `${p.salutation}/${p.salutation_source}`;
		};
		expect(setSalutation(db, personId, 'pak', 'research', { note: 'he leads…' })).toBe(true);
		expect(stored()).toBe('pak/research');
		expect(getPerson(db, personId)!.salutation_note).toBe('he leads…');
		expect(setSalutation(db, personId, 'bu', 'self')).toBe(true);
		expect(stored()).toBe('bu/self');
		// Research never undoes their own answer.
		expect(setSalutation(db, personId, 'pak', 'research')).toBe(false);
		expect(stored()).toBe('bu/self');
		// The team can, on purpose.
		expect(setSalutation(db, personId, 'pak', 'team')).toBe(true);
		expect(stored()).toBe('pak/team');
		expect(setSalutation(db, personId, 'pak', 'team')).toBe(false);
	});

	it('takes research’s answer only with the words that said so, and applies it on Add', () => {
		expect(
			cleanSuggestion({
				company: 'A',
				name: 'Ade Putra',
				salutation: 'pak',
				salutationEvidence: ''
			})?.salutation
		).toBeNull();
		expect(
			cleanSuggestion({
				company: 'A',
				name: 'Ade Putra',
				salutation: 'maybe',
				salutationEvidence: 'x'
			})?.salutation
		).toBeNull();
		expect(
			cleanSuggestion({
				company: 'A',
				name: 'Ade Putra',
				salutation: 'She',
				salutationEvidence: '“She leads the data team”'
			})
		).toMatchObject({ salutation: 'bu', salutationEvidence: '“She leads the data team”' });

		addSuggestions(db, event.id, [
			{
				company: 'Selat Energy',
				name: 'Rizki Amelia',
				jobTitle: 'Head of Data',
				sourceUrl: 'https://selat.test/team',
				reason: 'Runs data.',
				salutation: 'bu',
				salutationEvidence: 'Ibu Rizki Amelia, Head of Data'
			}
		]);
		const found = listEventPeople(db, event.id).find((r) => r.name === 'Rizki Amelia')!;
		expect(shortlistFound(db, event.id, found.id).status).toBe('added');
		const person = getPerson(db, getEventPerson(db, event.id, found.id)!.person_id!)!;
		expect(person).toMatchObject({
			salutation: 'bu',
			salutation_source: 'research',
			salutation_note: 'Ibu Rizki Amelia, Head of Data'
		});
	});

	it('records their own answer from either registration link', () => {
		submitRegistration(
			db,
			{ row: row(), event },
			{ rsvp: 'yes', email: null, phone: null, note: '', salutation: 'pak', ...CONSENTS }
		);
		expect(getPerson(db, personId)).toMatchObject({ salutation: 'pak', salutation_source: 'self' });

		const result = registerGeneric(db, event, {
			name: 'Nur Hidayat',
			company: 'Selat Energy',
			jobTitle: '',
			email: 'nur@selat.test',
			phone: null,
			note: '',
			salutation: 'bu',
			...CONSENTS
		});
		expect(result.status).toBe('saved');
		if (result.status === 'saved')
			expect(getPerson(db, result.personId)).toMatchObject({
				salutation: 'bu',
				salutation_source: 'self'
			});
	});

	it('keeps the stronger answer, and a call name, when two records merge', () => {
		const twin = createPerson(
			db,
			{ name: 'Ade K.', company: 'Batavia Foods' },
			{ origin: 'typed' }
		);
		setSalutation(db, twin, 'bu', 'self');
		setCallName(db, twin, 'Kurnia');
		setSalutation(db, personId, 'pak', 'research');
		mergeInto(db, twin, personId);
		expect(getPerson(db, personId)).toMatchObject({
			salutation: 'bu',
			salutation_source: 'self',
			call_name: 'Kurnia'
		});
	});

	it('moves unedited default messages to the new greeting, and leaves edited ones alone', () => {
		const old = (kind: 'invitation' | 'chase', l: 'id' | 'en') =>
			DEFAULT_TEMPLATES[kind][l].replace('{salutation}', '{name}');
		db.prepare(
			`UPDATE message_templates SET body = ? WHERE kind = 'invitation' AND language = 'id'`
		).run(old('invitation', 'id'));
		setTemplate(db, 'chase', 'id', 'Tindak lanjut untuk {name}');
		for (const c of ['call_name', 'salutation_note', 'salutation_source', 'salutation'])
			db.exec(`ALTER TABLE people DROP COLUMN ${c}`);
		setSchemaVersion(db, 6);
		migrate(db);
		expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(7);
		expect(templateBody(db, 'invitation', 'id')).toBe(DEFAULT_TEMPLATES.invitation.id);
		expect(templateBody(db, 'invitation', 'id')).toMatch(/^Halo \{salutation\},/);
		expect(templateBody(db, 'chase', 'id')).toBe('Tindak lanjut untuk {name}');
		// An edited body still works: {name} is the call name.
		expect(renderMessage(db, 'chase', { row: { ...row(), stage: 'invited' }, event }, ENV)).toMatch(
			/^Tindak lanjut untuk Ade/
		);
		expect(getPerson(db, personId)?.salutation).toBeNull();
	});
});
