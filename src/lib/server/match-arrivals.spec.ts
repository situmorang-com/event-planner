import { describe, expect, it } from 'vitest';
import { matchArrivals } from './match-arrivals';

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

	it('uses each check-in once, and lists the rest as walk-ins', () => {
		const list = invitees({ name: 'Andi Pratama' }, { name: 'Andi Pratama' });
		const came = checkins({ name: 'Andi Pratama' }, { name: 'Kevin Tan' });
		expect(pairs(list, came)).toEqual([100, null]);
		expect(matchArrivals(list, came).walkIns.map((w) => w.name)).toEqual(['Kevin Tan']);
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
