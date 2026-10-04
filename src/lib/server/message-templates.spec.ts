import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDb, migrate, SCHEMA } from './database';
import {
	DEFAULT_TEMPLATES,
	LANGUAGES,
	listTemplates,
	MESSAGE_KINDS,
	OPT_OUT_LINE,
	seedMessageTemplates,
	setTemplate,
	templateBody
} from './message-templates';
import { schemaVersion, setSchemaVersion } from './settings';

/** A database as the version-2 release left it: the tables, no templates, version 2. */
function v2(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	db.exec(SCHEMA);
	setSchemaVersion(db, 2);
	return db;
}

describe('message template seeding', () => {
	it('fills every kind and language on a fresh database', () => {
		const db = createDb(':memory:');
		const rows = listTemplates(db);
		expect(rows).toHaveLength(MESSAGE_KINDS.length * LANGUAGES.length);
		for (const kind of MESSAGE_KINDS)
			for (const language of LANGUAGES)
				expect(templateBody(db, kind, language)).toBe(DEFAULT_TEMPLATES[kind][language]);
		expect(rows.every((r) => r.updated_by === '')).toBe(true);
	});

	it('seeds a migrated version-2 database without touching an edited body', () => {
		const db = v2();
		db.prepare(
			`INSERT INTO message_templates (kind, language, body, updated_at, updated_by)
			VALUES ('chase', 'en', 'Our own chase {name}', 5, 'Sari')`
		).run();
		migrate(db);
		expect(schemaVersion(db)).toBe(4);
		expect(listTemplates(db)).toHaveLength(21);
		expect(templateBody(db, 'chase', 'en')).toBe('Our own chase {name}');
		expect(templateBody(db, 'chase', 'id')).toBe(DEFAULT_TEMPLATES.chase.id);
		// Running again changes nothing.
		seedMessageTemplates(db);
		expect(listTemplates(db)).toHaveLength(21);
	});

	it('keeps the built-in wording free of the lines that are appended at render time', () => {
		for (const kind of MESSAGE_KINDS)
			for (const language of LANGUAGES) {
				const body = DEFAULT_TEMPLATES[kind][language];
				expect(body).not.toContain('STOP');
				expect(body).not.toContain(OPT_OUT_LINE[language]);
				expect(body).not.toMatch(/\{(source_url|privacy_url)\}/);
				expect(body).toMatch(/\{name\}/);
				expect(body).not.toMatch(/\{(?!name|event|date|venue|link|org)\w+\}/);
			}
		for (const language of LANGUAGES)
			expect(DEFAULT_TEMPLATES.reminder[language]).toContain('{link}');
	});

	it('stores an edit stamped with who made it, and a blank restores the default', () => {
		const db = createDb(':memory:');
		setTemplate(db, 'thanks_no', 'ms', '  Terima kasih {name}.  ', { by: 'Edmund' }, 9);
		expect(templateBody(db, 'thanks_no', 'ms')).toBe('Terima kasih {name}.');
		expect(
			listTemplates(db).find((t) => t.kind === 'thanks_no' && t.language === 'ms')
		).toMatchObject({
			updated_by: 'Edmund',
			updated_at: 9
		});
		setTemplate(db, 'thanks_no', 'ms', '   ', { by: 'Sari' });
		expect(templateBody(db, 'thanks_no', 'ms')).toBe(DEFAULT_TEMPLATES.thanks_no.ms);
	});
});
