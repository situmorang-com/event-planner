import { createHash, randomBytes } from 'node:crypto';
import type { DB } from './database.ts';

export interface TokenRow {
	id: number;
	label: string;
	created_at: number;
	last_used_at: number | null;
}

const hash = (token: string) => createHash('sha256').update(token).digest('base64url');

/** A new research token. Only its hash is stored, so this is the one time it can be shown. */
export function createToken(db: DB, label: string, now = Date.now()) {
	const token = `ep_${randomBytes(24).toString('base64url')}`;
	db.prepare(`INSERT INTO api_tokens (label, hash, created_at) VALUES (?, ?, ?)`).run(
		label,
		hash(token),
		now
	);
	return token;
}

export function listTokens(db: DB): TokenRow[] {
	return db
		.prepare(
			`SELECT id, label, created_at, last_used_at FROM api_tokens
			WHERE revoked_at IS NULL ORDER BY created_at DESC`
		)
		.all() as TokenRow[];
}

export function revokeToken(db: DB, id: number, now = Date.now()) {
	db.prepare(`UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`).run(
		now,
		id
	);
}

/** The live token behind an `Authorization: Bearer …` header, or null. */
export function verifyBearer(db: DB, header: string | null, now = Date.now()): TokenRow | null {
	// hdr_ tokens predate the rename and keep working until they are revoked.
	const token = /^Bearer\s+((?:ep|hdr)_[\w-]{20,})\s*$/.exec(header ?? '')?.[1];
	if (!token) return null;
	const row = db
		.prepare(
			`SELECT id, label, created_at, last_used_at FROM api_tokens
			WHERE hash = ? AND revoked_at IS NULL`
		)
		.get(hash(token)) as TokenRow | undefined;
	if (!row) return null;
	db.prepare(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`).run(now, row.id);
	return { ...row, last_used_at: now };
}
