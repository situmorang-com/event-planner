import {
	isSalutation,
	SALUTATION_RANK,
	type Salutation,
	type SalutationSource
} from '../salutation.ts';
import type { DB } from './database.ts';

/*
 * Pak or Bu, and the call name (D27), on the person: like the LinkedIn connection, how someone
 * is addressed holds for every event they are on.
 */

export { isSalutation, type Salutation, type SalutationSource };

/** Schema version 7: the columns, on a file created before them. */
export function addSalutationColumns(db: DB) {
	const have = new Set(
		(db.prepare(`PRAGMA table_info(people)`).all() as { name: string }[]).map((c) => c.name)
	);
	if (!have.has('salutation'))
		db.exec(`ALTER TABLE people ADD COLUMN salutation TEXT CHECK (salutation IN ('pak', 'bu'))`);
	if (!have.has('salutation_source'))
		db.exec(
			`ALTER TABLE people ADD COLUMN salutation_source TEXT
				CHECK (salutation_source IN ('self', 'team', 'research'))`
		);
	if (!have.has('salutation_note'))
		db.exec(`ALTER TABLE people ADD COLUMN salutation_note TEXT NOT NULL DEFAULT ''`);
	if (!have.has('call_name')) db.exec(`ALTER TABLE people ADD COLUMN call_name TEXT`);
}

/**
 * Records Pak or Bu from a source, or with null takes the stored answer away (back to the
 * name's guess). A weaker source never overwrites a stronger one: research doesn't undo the
 * team, and nobody but the person undoes their own answer, except the team on purpose. Returns
 * whether anything changed.
 */
export function setSalutation(
	db: DB,
	personId: string,
	value: Salutation | null,
	source: SalutationSource,
	{ note = '' }: { note?: string } = {},
	now = Date.now()
): boolean {
	const current = db
		.prepare(`SELECT salutation, salutation_source FROM people WHERE id = ?`)
		.get(personId) as
		{ salutation: Salutation | null; salutation_source: SalutationSource | null } | undefined;
	if (!current) return false;
	const held = current.salutation_source;
	if (held && source !== 'team' && SALUTATION_RANK[source] < SALUTATION_RANK[held]) return false;
	if (value === null) {
		if (current.salutation === null) return false;
		db.prepare(
			`UPDATE people SET salutation = NULL, salutation_source = NULL, salutation_note = '',
				updated_at = ? WHERE id = ?`
		).run(now, personId);
		return true;
	}
	if (current.salutation === value && held === source) return false;
	db.prepare(
		`UPDATE people SET salutation = ?, salutation_source = ?, salutation_note = ?, updated_at = ?
		WHERE id = ?`
	).run(value, source, note.slice(0, 300), now, personId);
	return true;
}

/** The name after Pak or Bu; blank goes back to the first given name. */
export function setCallName(db: DB, personId: string, value: string, now = Date.now()) {
	const name = value.replace(/\s+/g, ' ').trim().slice(0, 60) || null;
	db.prepare(`UPDATE people SET call_name = ?, updated_at = ? WHERE id = ?`).run(
		name,
		now,
		personId
	);
}
