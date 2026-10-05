import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createToken } from '$lib/server/api-tokens';
import { db } from '$lib/server/db';
import { createEvent } from '$lib/server/events';
import {
	addTargets,
	getBrief,
	markResearched,
	parseTargets,
	saveBrief
} from '$lib/server/planning';
import { GET } from './+server';

// The handler reads the app's database; a throwaway one stands in for it.
vi.mock('$lib/server/db', async () => {
	const { createDb } = await import('$lib/server/database');
	return { db: createDb(':memory:') };
});

describe('GET /api/research/events/[id]/prompt', () => {
	let eventId: string;
	let auth: string;
	const get = (query = '') => {
		const url = new URL(`http://localhost/api/research/events/${eventId}/prompt${query}`);
		return GET({
			params: { id: eventId },
			request: new Request(url, { headers: { authorization: auth } }),
			url
		} as unknown as Parameters<typeof GET>[0]);
	};

	beforeEach(() => {
		eventId = createEvent(db, {
			name: 'ERP Breakfast',
			venue: 'Jakarta',
			startsAt: null,
			timezone: 'Asia/Jakarta',
			qrMode: 'static'
		});
		auth = `Bearer ${createToken(db, 'MacBook')}`;
	});

	it('refuses as the bare sentence the command echoes, with and without a batch', async () => {
		for (const query of ['?batch=0', '']) {
			const res = await get(query);
			expect(res.status).toBe(409);
			expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
			expect(await res.text()).toBe('Set the event date first.');
		}
		const bad = await get('?batch=one');
		expect(bad.status).toBe(400);
		expect(await bad.text()).toBe('batch must be a whole number, counting from 0');
	});

	it('serves a batch, 204 once nothing is left, and the exhausted sentence at batch 0', async () => {
		db.prepare(`UPDATE events SET starts_at = ? WHERE id = ?`).run(Date.UTC(2026, 10, 1), eventId);
		saveBrief(db, eventId, { ...getBrief(db, eventId), roles: 'CFO' });
		addTargets(db, eventId, parseTargets('Batavia Foods'));

		const first = await get('?batch=0');
		expect(first.status).toBe(200);
		expect(first.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		expect(await first.text()).toContain('### Batavia Foods');

		markResearched(db, eventId);
		const rest = await get('?batch=1');
		expect(rest.status).toBe(204);
		expect(await rest.text()).toBe('');

		const again = await get('?batch=0');
		expect(again.status).toBe(409);
		expect(await again.text()).toMatch(/^The only ticked company was researched/);
	});
});
