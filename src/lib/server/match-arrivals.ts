import { companyKey, nameKey } from '../invitations.ts';

type Person = { name: string; company: string; email: string | null; phone: string | null };

/**
 * Two names that cannot be the same person: both given and not one word in common. "Rina" and
 * "Rina Wijaya" agree (an abbreviation); "Rina Maharani" and "Hendra Gunawan" clash, so a
 * shared info@ address must not fold them together (§3, D6).
 */
export function namesClash(a: string, b: string): boolean {
	const [x, y] = [nameKey(a), nameKey(b)];
	if (!x || !y) return false;
	const words = new Set(x.split(' '));
	return !y.split(' ').some((w) => words.has(w));
}

/**
 * Pairs a guest list with the check-ins at the event. Email and mobile match exactly, except
 * that an email shared by two clearly different names is not a pair; a name match only counts
 * when the companies don't contradict it. Check-ins left over are walk-ins. Live rows carry
 * `checkin_id` now, so this serves the v1 → v2 migration and loose pairing.
 */
export function matchArrivals<
	I extends Person & { id: number },
	A extends Person & { checkin_id: number }
>(invitees: I[], checkins: A[]) {
	const arrived = new Map<number, A>();
	const taken = new Set<number>();

	const pair = (key: (p: Person) => string | null, fits: (i: I, a: A) => boolean = () => true) => {
		const index = new Map<string, A[]>();
		for (const a of checkins) {
			const k = taken.has(a.checkin_id) ? null : key(a);
			if (k) index.set(k, [...(index.get(k) ?? []), a]);
		}
		for (const i of invitees) {
			const k = arrived.has(i.id) ? null : key(i);
			if (!k) continue;
			const options = (index.get(k) ?? []).filter((a) => !taken.has(a.checkin_id) && fits(i, a));
			const best =
				options.find((a) => companyKey(a.company) === companyKey(i.company)) ?? options[0];
			if (best) {
				arrived.set(i.id, best);
				taken.add(best.checkin_id);
			}
		}
	};

	pair(
		(p) => p.email,
		(i, a) => !namesClash(i.name, a.name)
	);
	pair((p) => p.phone);
	pair(
		(p) => nameKey(p.name) || null,
		(i, a) => {
			const [x, y] = [companyKey(i.company), companyKey(a.company)];
			return !x || !y || x === y;
		}
	);

	return { arrived, walkIns: checkins.filter((a) => !taken.has(a.checkin_id)) };
}
