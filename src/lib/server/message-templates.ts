import type { MessageKind } from '../people.ts';
import type { DB } from './database.ts';
import type { Language } from './events.ts';
import { TABLES } from './schema.ts';

/*
 * The stored message bodies (D21, §7): one per kind and language, edited under Settings ›
 * Message defaults. Bodies never carry the opt-out or research source lines; renderMessage()
 * appends those, so an edit can't drop them. The built-in wording below is the last fallback
 * and what a fresh database is seeded with.
 */

export type { MessageKind };

export const MESSAGE_KINDS: MessageKind[] = [
	'invitation',
	'chase',
	'reminder',
	'thanks_yes',
	'followup_maybe',
	'thanks_no',
	'legacy_notice'
];

export const LANGUAGES: Language[] = ['id', 'en', 'ms'];

export const isLanguage = (v: unknown): v is Language => LANGUAGES.includes(v as Language);

export const KIND_LABEL: Record<MessageKind, string> = {
	invitation: 'Invitation',
	chase: 'Chase',
	reminder: 'Reminder',
	thanks_yes: 'Thanks (attending)',
	followup_maybe: 'Follow-up (tentative)',
	thanks_no: 'Thanks (declined)',
	legacy_notice: 'Legacy notice'
};

export const LANGUAGE_LABEL: Record<Language, string> = {
	id: 'Indonesian',
	en: 'English',
	ms: 'Malay'
};

/** What a body may contain; anything else is sent as written. */
export const PLACEHOLDERS = ['{name}', '{event}', '{date}', '{venue}', '{link}', '{org}'] as const;

// Written as "{event} on {date}, {venue}." so a missing venue or date tidies away cleanly
// (renderMessage drops the empty slot and its comma); the reminder must carry {link} (§7).
export const DEFAULT_TEMPLATES: Record<MessageKind, Record<Language, string>> = {
	invitation: {
		en: 'Hi {name}, {org} would like to invite you to {event} on {date}, {venue}. We would be glad to have you there. Please let us know whether you can join, or register here: {link}',
		id: 'Halo {name}, {org} mengundang Anda ke {event} pada {date}, {venue}. Kami akan senang jika Anda dapat hadir. Mohon konfirmasi kehadiran Anda, atau daftar di sini: {link}',
		ms: 'Hai {name}, {org} ingin menjemput anda ke {event} pada {date}, {venue}. Kami amat mengalu-alukan kehadiran anda. Sila maklumkan sama ada anda dapat hadir, atau daftar di sini: {link}'
	},
	chase: {
		en: 'Hi {name}, just following up on our invitation to {event} on {date}, {venue}. Could you let us know if you can make it? You can also reply here: {link}',
		id: 'Halo {name}, kami ingin menindaklanjuti undangan kami ke {event} pada {date}, {venue}. Apakah Anda dapat hadir? Anda juga bisa menjawab di sini: {link}',
		ms: 'Hai {name}, kami ingin menyusuli jemputan kami ke {event} pada {date}, {venue}. Bolehkah anda maklumkan sama ada anda dapat hadir? Anda juga boleh membalas di sini: {link}'
	},
	reminder: {
		en: 'Hi {name}, a quick reminder that {event} is on {date}, {venue}. Please tap here to reconfirm your place: {link}. See you there!',
		id: 'Halo {name}, sekadar mengingatkan bahwa {event} akan berlangsung pada {date}, {venue}. Mohon konfirmasi ulang kehadiran Anda di sini: {link}. Sampai jumpa!',
		ms: 'Hai {name}, sekadar peringatan bahawa {event} akan berlangsung pada {date}, {venue}. Sila sahkan semula kehadiran anda di sini: {link}. Jumpa nanti!'
	},
	thanks_yes: {
		en: 'Hi {name}, thank you for confirming. We look forward to seeing you at {event} on {date}, {venue}.',
		id: 'Halo {name}, terima kasih atas konfirmasinya. Kami menantikan kehadiran Anda di {event} pada {date}, {venue}.',
		ms: 'Hai {name}, terima kasih atas pengesahan anda. Kami tidak sabar untuk bertemu anda di {event} pada {date}, {venue}.'
	},
	followup_maybe: {
		en: 'Hi {name}, thank you for getting back to us. We have pencilled you in for {event} on {date}, {venue}. Let us know once you are sure, or confirm here: {link}',
		id: 'Halo {name}, terima kasih atas jawabannya. Kami sudah mencatat Anda sebagai tentatif untuk {event} pada {date}, {venue}. Kabari kami jika sudah pasti, atau konfirmasi di sini: {link}',
		ms: 'Hai {name}, terima kasih kerana membalas. Kami telah mencatat anda sebagai tentatif untuk {event} pada {date}, {venue}. Maklumkan kami apabila anda pasti, atau sahkan di sini: {link}'
	},
	thanks_no: {
		en: 'Hi {name}, thank you for letting us know. We will miss you at {event} and hope to see you at a future {org} event.',
		id: 'Halo {name}, terima kasih sudah memberi kabar. Sayang sekali Anda tidak dapat hadir di {event}; semoga bisa bertemu di acara {org} berikutnya.',
		ms: 'Hai {name}, terima kasih kerana memaklumkan. Kami akan merindui kehadiran anda di {event} dan berharap dapat bertemu di acara {org} yang akan datang.'
	},
	legacy_notice: {
		en: 'Hi {name}, you attended a {org} event in the past, so we still have your contact details. We would like to keep inviting you to events like {event}. If that is fine with you, simply reply, or register here: {link}',
		id: 'Halo {name}, Anda pernah hadir di acara {org}, sehingga kami masih menyimpan kontak Anda. Kami ingin tetap mengundang Anda ke acara seperti {event}. Jika berkenan, cukup balas pesan ini, atau daftar di sini: {link}',
		ms: 'Hai {name}, anda pernah menghadiri acara {org}, jadi kami masih menyimpan butiran hubungan anda. Kami ingin terus menjemput anda ke acara seperti {event}. Jika anda bersetuju, balas sahaja mesej ini, atau daftar di sini: {link}'
	}
};

/** §8: on every message, last. */
export const OPT_OUT_LINE: Record<Language, string> = {
	en: "Reply STOP if you'd rather not hear from us about events.",
	id: 'Balas STOP jika Anda tidak ingin dihubungi lagi tentang acara.',
	ms: 'Balas STOP jika anda tidak mahu dihubungi lagi tentang acara.'
};

/** §7, D10: for people found by research, before the opt-out line. */
export const SOURCE_LINE: Record<Language, { found: string; withUrl: string; privacy: string }> = {
	en: {
		found: 'We found your work details on public pages',
		withUrl: 'We found your work details on public pages: {source_url}',
		privacy: 'How we handle data: {privacy_url}'
	},
	id: {
		found: 'Kami menemukan data pekerjaan Anda di halaman publik',
		withUrl: 'Kami menemukan data pekerjaan Anda di halaman publik: {source_url}',
		privacy: 'Cara kami menangani data: {privacy_url}'
	},
	ms: {
		found: 'Kami menemui butiran kerja anda di laman awam',
		withUrl: 'Kami menemui butiran kerja anda di laman awam: {source_url}',
		privacy: 'Cara kami mengendalikan data: {privacy_url}'
	}
};

/**
 * §7: the opt-out and source lines are appended at render time and never stored, so a body
 * that pastes one in (it would then read twice, or freeze a stale privacy sentence) is refused
 * by the editors. Checked against the lines in every language.
 */
export function containsAppendedLine(body: string): boolean {
	if (/\{(privacy_url|source_url)\}/.test(body)) return true;
	return LANGUAGES.some(
		(l) => body.includes(OPT_OUT_LINE[l]) || body.includes(SOURCE_LINE[l].found)
	);
}

/** What the editors say when a body carries one of those lines. */
export const APPENDED_LINE_ERROR =
	'Leave out the opt-out and source lines: they are added to every message automatically.';

export interface TemplateRow {
	id: number;
	kind: MessageKind;
	language: Language;
	body: string;
	updated_at: number;
	updated_by: string;
}

/**
 * Schema version 3: every (kind, language) pair gets the built-in wording unless a body is
 * already stored. Safe to run again: a pair someone edited is left alone.
 */
export function seedMessageTemplates(db: DB, now = Date.now()) {
	db.exec(TABLES.message_templates);
	const insert = db.prepare(
		`INSERT OR IGNORE INTO message_templates (kind, language, body, updated_at, updated_by)
		VALUES (?, ?, ?, ?, '')`
	);
	db.transaction(() => {
		for (const kind of MESSAGE_KINDS)
			for (const language of LANGUAGES)
				insert.run(kind, language, DEFAULT_TEMPLATES[kind][language], now);
	})();
}

export function listTemplates(db: DB): TemplateRow[] {
	return db
		.prepare(`SELECT * FROM message_templates ORDER BY language, kind`)
		.all() as TemplateRow[];
}

/** The stored body, or the built-in default when none is stored (the final fallback, §7). */
export function templateBody(db: DB, kind: MessageKind, language: Language): string {
	const row = db
		.prepare(`SELECT body FROM message_templates WHERE kind = ? AND language = ?`)
		.get(kind, language) as { body: string } | undefined;
	return row?.body || DEFAULT_TEMPLATES[kind][language];
}

/** An edit from Settings; an empty body puts the built-in wording back. */
export function setTemplate(
	db: DB,
	kind: MessageKind,
	language: Language,
	body: string,
	{ by = '' } = {},
	now = Date.now()
) {
	db.prepare(
		`INSERT INTO message_templates (kind, language, body, updated_at, updated_by)
		VALUES (@kind, @language, @body, @now, @by)
		ON CONFLICT (kind, language) DO UPDATE SET body = excluded.body,
			updated_at = excluded.updated_at, updated_by = excluded.updated_by`
	).run({ kind, language, body: body.trim() || DEFAULT_TEMPLATES[kind][language], now, by });
}
