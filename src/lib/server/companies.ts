import { companyKey } from '../invitations.ts';
import type { DB } from './database.ts';
import { rehashCompany } from './do-not-contact.ts';
import { shortId } from './ids.ts';
import { matchTeamName, type Country } from './settings.ts';

export interface CompanyRow {
	id: string;
	name: string;
	/** companyKey(name): "PT Batavia Foods Tbk" and "Batavia Foods" share one. */
	key: string;
	website: string;
	owner: string | null;
	phone_country: Country | null;
	never_invite_at: number | null;
	never_invite_reason: string | null;
	never_invite_by: string | null;
	is_customer: 0 | 1;
	d365_note: string;
	created_at: number;
	updated_at: number;
}

export function getCompany(db: DB, id: string | null): CompanyRow | undefined {
	if (!id) return undefined;
	return db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id) as CompanyRow | undefined;
}

export function findCompany(db: DB, name: string): CompanyRow | undefined {
	const key = companyKey(name);
	if (!key) return undefined;
	return db.prepare(`SELECT * FROM companies WHERE key = ?`).get(key) as CompanyRow | undefined;
}

/** The company this spelling belongs to, created on first sight; null for no company. */
export function ensureCompany(
	db: DB,
	name: string,
	{ website = '' }: { website?: string } = {},
	now = Date.now()
): CompanyRow | null {
	const key = companyKey(name);
	if (!key) return null;
	const existing = findCompany(db, name);
	if (existing) {
		if (website && !existing.website) {
			db.prepare(`UPDATE companies SET website = ?, updated_at = ? WHERE id = ?`).run(
				website,
				now,
				existing.id
			);
			return { ...existing, website };
		}
		return existing;
	}
	const id = shortId();
	db.prepare(
		`INSERT INTO companies (id, name, key, website, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)`
	).run(id, name.trim(), key, website, now, now);
	return getCompany(db, id)!;
}

/**
 * Renames a company everywhere. When the new spelling is another company's, the two merge:
 * people and event rows move over, and do-not-contact entries follow the key.
 */
export function renameCompany(db: DB, id: string, name: string, now = Date.now()): boolean {
	const company = getCompany(db, id);
	const key = companyKey(name);
	if (!company || !key) return false;
	db.transaction(() => {
		const other = db.prepare(`SELECT * FROM companies WHERE key = ? AND id <> ?`).get(key, id) as
			CompanyRow | undefined;
		if (!other) {
			db.prepare(`UPDATE companies SET name = ?, key = ?, updated_at = ? WHERE id = ?`).run(
				name.trim(),
				key,
				now,
				id
			);
		} else {
			db.prepare(`UPDATE people SET company_id = ? WHERE company_id = ?`).run(other.id, id);
			db.prepare(`UPDATE event_people SET company_id = ? WHERE company_id = ?`).run(other.id, id);
			// An event that targeted both spellings keeps one row: the survivor's.
			db.prepare(
				`DELETE FROM event_companies WHERE company_id = ? AND event_id IN
					(SELECT event_id FROM event_companies WHERE company_id = ?)`
			).run(id, other.id);
			db.prepare(`UPDATE event_companies SET company_id = ? WHERE company_id = ?`).run(
				other.id,
				id
			);
			db.prepare(
				`UPDATE companies SET name = @name, updated_at = @now,
					website = CASE WHEN website = '' THEN @website ELSE website END,
					owner = COALESCE(owner, @owner),
					phone_country = COALESCE(phone_country, @phoneCountry),
					never_invite_at = COALESCE(never_invite_at, @blockedAt),
					never_invite_reason = COALESCE(never_invite_reason, @blockedReason),
					never_invite_by = COALESCE(never_invite_by, @blockedBy),
					is_customer = MAX(is_customer, @isCustomer),
					d365_note = CASE WHEN d365_note = '' THEN @note ELSE d365_note END
				WHERE id = @id`
			).run({
				id: other.id,
				name: name.trim(),
				now,
				website: company.website,
				owner: company.owner,
				phoneCountry: company.phone_country,
				blockedAt: company.never_invite_at,
				blockedReason: company.never_invite_reason,
				blockedBy: company.never_invite_by,
				isCustomer: company.is_customer,
				note: company.d365_note
			});
			db.prepare(`DELETE FROM companies WHERE id = ?`).run(id);
		}
		rehashCompany(db, company.key, key);
	})();
	return true;
}

/** Renames by key, as the guest list's company groups know them. */
export function renameCompanyByKey(db: DB, fromKey: string, name: string, now = Date.now()) {
	const company = db.prepare(`SELECT id FROM companies WHERE key = ?`).get(fromKey) as
		{ id: string } | undefined;
	return company ? renameCompany(db, company.id, name, now) : false;
}

export function blockCompany(
	db: DB,
	id: string,
	{ reason = '', by = '' }: { reason?: string; by?: string } = {},
	now = Date.now()
) {
	db.prepare(
		`UPDATE companies SET never_invite_at = ?, never_invite_reason = ?, never_invite_by = ?,
			updated_at = ? WHERE id = ?`
	).run(now, reason, by, now, id);
	db.prepare(
		`UPDATE event_people SET next_action_at = NULL, next_action_kind = NULL, updated_at = ?
		WHERE company_id = ? OR person_id IN (SELECT id FROM people WHERE company_id = ?)`
	).run(now, id, id);
}

export function unblockCompany(db: DB, id: string, now = Date.now()) {
	db.prepare(
		`UPDATE companies SET never_invite_at = NULL, never_invite_reason = NULL,
			never_invite_by = NULL, updated_at = ? WHERE id = ?`
	).run(now, id);
}

export function isBlocked(company: Pick<CompanyRow, 'never_invite_at'> | null | undefined) {
	return !!company?.never_invite_at;
}

export function setCompanyOwner(db: DB, id: string, owner: string | null, now = Date.now()) {
	db.prepare(`UPDATE companies SET owner = ?, updated_at = ? WHERE id = ?`).run(owner, now, id);
}

/**
 * The owner column of a D365 export (§6.1): it becomes the company's owner only when nobody
 * owns it yet and the value names a team member; anything else is kept as a note, so a CRM
 * user who isn't on the team is still visible without becoming a bogus "me".
 */
export function noteCompanyOwner(db: DB, id: string, owner: string, now = Date.now()) {
	const value = owner.replace(/\s+/g, ' ').trim();
	const company = getCompany(db, id);
	if (!value || !company) return;
	const team = matchTeamName(db, value);
	if (team && !company.owner) {
		setCompanyOwner(db, id, team, now);
		return;
	}
	const note = `D365 owner: ${value}`;
	if (company.d365_note.split('\n').includes(note)) return;
	db.prepare(`UPDATE companies SET d365_note = ?, updated_at = ? WHERE id = ?`).run(
		[company.d365_note, note].filter(Boolean).join('\n'),
		now,
		id
	);
}

export function setCompanyPhoneCountry(
	db: DB,
	id: string,
	country: Country | null,
	now = Date.now()
) {
	db.prepare(`UPDATE companies SET phone_country = ?, updated_at = ? WHERE id = ?`).run(
		country,
		now,
		id
	);
}

/** Company names for the datalist, with how many people in the pool work there. */
export function companySuggestions(db: DB) {
	return db
		.prepare(
			`SELECT co.name, (SELECT COUNT(*) FROM people p WHERE p.company_id = co.id) AS contacts
			FROM companies co ORDER BY co.name COLLATE NOCASE`
		)
		.all() as { name: string; contacts: number }[];
}
