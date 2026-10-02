// Fills the database with demo events, ~60 realistic check-ins, two guest lists and a few
// research finds so the dashboard, entrance screen, invitations and planning pages have
// something to show. People use @example.com addresses.
//
//   npm run demo:seed            (uses DB_PATH or data/attendance.db)
//
// Runs on Node's built-in TypeScript support and reuses the app's real modules, so every row
// goes through the same matching, stages and consent rules as the app itself.
import { checkIn, type Device, type Method } from '../src/lib/server/checkins.ts';
import { createDb } from '../src/lib/server/database.ts';
import {
	addFound,
	addShortlisted,
	setNote,
	setReply,
	type GuestInput
} from '../src/lib/server/event-people.ts';
import { createEvent as newEvent } from '../src/lib/server/events.ts';
import { addTargets, saveBrief } from '../src/lib/server/planning.ts';
import { setTeamNames } from '../src/lib/server/settings.ts';
import type { Reply } from '../src/lib/server/stages.ts';

const db = createDb(process.env.DB_PATH ?? 'data/attendance.db');

const PEOPLE = [
	'Rina Wijaya',
	'Andi Pratama',
	'Putri Maharani',
	'Ahmad Faiz',
	'Nur Aisyah',
	'Kevin Tan',
	'Mei Ling Chong',
	'Rizky Hidayat',
	'Anisa Rahma',
	'Hendra Gunawan',
	'Farah Nabila',
	'Jason Lim',
	'Aditya Nugroho',
	'Sarah Chen',
	'Bayu Saputra',
	'Lina Marlina',
	'Daniel Wong',
	'Yusuf Hakim',
	'Wulan Sari',
	'Arif Rahman',
	'Nadia Putri',
	'Eko Prasetyo',
	'Grace Tan',
	'Fajar Ramadhan',
	'Intan Permata',
	'Raj Kumar',
	'Priya Nair',
	'Hafiz Ismail',
	'Aina Sofea',
	'Marcus Lee',
	'Teguh Wibowo',
	'Maya Anggraini',
	'Irfan Hakim',
	'Clara Setiawan',
	'Samuel Lau',
	'Dina Oktaviani',
	'Reza Firmansyah',
	'Tasha Kaur',
	'Gilang Mahesa',
	'Vivian Ong',
	'Hadi Susanto',
	'Laras Ayu',
	'Benny Halim',
	'Sofia Rahim',
	'Yoga Permana',
	'Michelle Goh',
	'Taufik Hidayat',
	'Ayu Lestiani',
	'Rudi Hartono',
	'Amira Zulkifli',
	'Denny Kurnia',
	'Joanne Yap',
	'Galih Santosa',
	'Nabila Husna',
	'Wira Adinata',
	'Esther Koh',
	'Iqbal Maulana',
	'Siska Amelia',
	'Hanif Azhar',
	'Ratna Dewi'
];
const COMPANIES = [
	'Nusantara Logistik',
	'Batavia Foods',
	'Selat Energy',
	'Kopi Kita',
	'Garuda Retail',
	'Tanjung Health',
	'Borneo Timber Co',
	'Merdeka Finance',
	'Sinar Digital',
	'Pelita Manufacturing'
];
const TITLES = [
	'CIO',
	'IT Manager',
	'Finance Director',
	'Head of Operations',
	'CFO',
	'ERP Manager',
	''
];

const pick = <T>(list: T[], i: number) => list[i % list.length];
const person = (name: string, i: number) => ({
	name,
	email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
	phone: `+6281${String(200000000 + i * 7919).slice(0, 9)}`,
	company: pick(COMPANIES, i * 3),
	jobTitle: pick(TITLES, i * 5)
});

function createEvent(name: string, venue: string, startsAt: number, qrMode: 'rotating' | 'static') {
	return newEvent(
		db,
		{ name, venue, startsAt, timezone: 'Asia/Jakarta', qrMode, targetCount: 40 },
		startsAt - 7 * 86_400_000
	);
}

const now = Date.now();
setTeamNames(db, ['Edmund', 'Sari']);

// An earlier event, so some of today's attendees show up as "returning".
const earlier = createEvent(
	'Q2 Customer Meetup (demo)',
	'Jakarta',
	now - 90 * 86_400_000,
	'static'
);
PEOPLE.slice(0, 18).forEach((name, i) => {
	checkIn(
		db,
		earlier,
		person(name, i),
		{ method: 'form', device: 'ios', consent: true },
		now - 90 * 86_400_000 + i * 60_000
	);
});

// Guest lists. Most of today's arrivals were invited (some only by name, some with a title in
// front), a few confirmed guests never came, and the last fifteen arrivals are walk-ins.
interface Guest {
	name: string;
	company: string;
	jobTitle?: string;
	email?: string | null;
	phone?: string | null;
	reply: Reply;
	note?: string;
}

function invite(eventId: string, guests: Guest[], addedAt: number) {
	guests.forEach((g, i) => {
		const input: GuestInput = {
			name: g.name,
			company: g.company,
			jobTitle: g.jobTitle ?? '',
			email: g.email ?? null,
			phone: g.phone ?? null
		};
		addShortlisted(db, eventId, [input], { source: 'typed', by: 'Edmund' }, addedAt);
		const row = db
			.prepare(`SELECT id FROM event_people WHERE event_id = ? ORDER BY id DESC LIMIT 1`)
			.get(eventId) as { id: number };
		if (g.reply !== 'pending')
			setReply(db, eventId, row.id, g.reply, addedAt + (i + 1) * 5 * 3_600_000);
		if (g.note) setNote(db, eventId, row.id, g.note, addedAt);
	});
}

const NOTES: Record<number, string> = {
	2: 'Vegetarian',
	7: 'Arriving after lunch',
	12: 'Bringing a colleague from finance',
	21: 'Asked about parking'
};
// On the list with a title, by name only: they still match the check-ins typed without one.
const TITLED: Record<number, string> = { 11: 'Mr', 14: 'Bapak', 20: 'Ibu' };

// Today's event: the list goes in first, then arrivals over the last ~95 minutes, peaking
// about an hour ago, so each check-in lands on its own row.
const today = createEvent(
	'Partner Summit 2026 (demo)',
	'Grand Ballroom, Jakarta',
	now - 100 * 60_000,
	'rotating'
);
const invited: Guest[] = PEOPLE.slice(0, 45).map((name, i) => {
	const p = person(name, i);
	const byName = i % 3 === 2; // on the list by name only; matched to their check-in by name
	return {
		name: TITLED[i] ? `${TITLED[i]} ${name}` : name,
		company: p.company,
		jobTitle: p.jobTitle,
		email: byName ? null : p.email,
		phone: byName ? null : p.phone,
		reply: i % 11 === 4 ? 'maybe' : i % 13 === 6 ? 'pending' : 'yes',
		note: NOTES[i]
	};
});
const noShows: Guest[] = [
	{ name: 'Budi Santoso', company: 'Selat Energy', jobTitle: 'CIO', reply: 'yes' },
	{ name: 'Siti Aminah', company: 'Kopi Kita', jobTitle: 'Finance Director', reply: 'yes' },
	{ name: 'Johan Lim', company: 'Garuda Retail', phone: '+60123456789', reply: 'yes' },
	{
		name: 'Agus Setiawan',
		company: 'Batavia Foods',
		reply: 'no',
		note: 'Overseas that week, sending Rizky instead'
	},
	{ name: 'Melati Kusuma', company: 'Sinar Digital', jobTitle: 'CFO', reply: 'no' },
	{ name: 'Rahmat Hidayat', company: 'Tanjung Health', reply: 'maybe' },
	{
		name: 'Diana Putri',
		company: 'Merdeka Finance',
		email: 'diana.putri@example.com',
		reply: 'pending'
	}
];
invite(today, [...invited, ...noShows], now - 21 * 86_400_000);

PEOPLE.forEach((name, i) => {
	const u = (i + 0.5) / PEOPLE.length;
	// Cosine-shaped arrival curve: a trickle, a rush in the middle, then stragglers.
	const jitter = (((i * 37) % 11) - 5) * 20_000;
	const offset = Math.min(
		94 * 60_000,
		Math.max(0, 95 * 60_000 * (0.5 + Math.asin(2 * u - 1) / Math.PI) + jitter)
	);
	const device: Device = i % 17 === 0 ? 'other' : i % 3 === 1 ? 'android' : 'ios';
	const method: Method = i < 18 && i % 2 === 0 ? 'returning' : i % 7 === 3 ? 'picker' : 'form';
	checkIn(
		db,
		today,
		person(name, i),
		{ method, device, consent: true, consentFuture: i % 4 !== 0 },
		now - 95 * 60_000 + offset
	);
});

// An upcoming event that's still being planned: replies are coming in, nobody has checked in,
// and the research has turned up a few names to review.
const dinner = createEvent(
	'Year-end Customer Dinner (demo)',
	'Hotel Mulia, Jakarta',
	now + 30 * 86_400_000,
	'rotating'
);
invite(
	dinner,
	PEOPLE.slice(10, 34).map((name, i) => {
		const p = person(name, i + 10);
		return {
			name,
			company: p.company,
			jobTitle: p.jobTitle,
			email: p.email,
			phone: p.phone,
			reply: i % 4 === 3 ? 'pending' : i % 7 === 2 ? 'no' : i % 5 === 1 ? 'maybe' : 'yes'
		};
	}),
	now - 3 * 86_400_000
);
saveBrief(db, dinner, {
	goal: 'Thank this year’s customers and introduce the finance team to Dynamics 365 Finance.',
	roles: 'CFO, Finance Director, Head of IT',
	seniority: ['C-level / owner', 'VP / Director'],
	departments: ['Finance', 'IT'],
	perCompany: 2,
	avoid: 'Competitors and anyone already engaged by sales.'
});
addTargets(db, dinner, [
	{ name: 'Batavia Foods', website: 'bataviafoods.example.com' },
	{ name: 'Selat Energy', website: '' },
	{ name: 'Pelita Manufacturing', website: 'pelita.example.com' }
]);
addFound(
	db,
	dinner,
	[
		{
			name: 'Lestari Kusuma',
			company: 'Batavia Foods',
			jobTitle: 'Group CFO',
			email: null,
			phone: null,
			sourceUrl: 'https://bataviafoods.example.com/leadership',
			reason: 'Leads group finance and the ERP programme.'
		},
		{
			name: 'Harun Abdullah',
			company: 'Pelita Manufacturing',
			jobTitle: 'Head of IT',
			email: null,
			phone: null,
			linkedin: 'https://www.linkedin.com/in/harun-abdullah',
			sourceUrl: 'https://pelita.example.com/news/erp-rollout',
			reason: 'Quoted on the ERP rollout.'
		},
		{
			name: 'Citra Dewi',
			company: 'Selat Energy',
			jobTitle: 'Finance Director',
			email: null,
			phone: null,
			sourceUrl: 'https://selat.example.com/about',
			reason: 'Finance lead named on the About page.'
		}
	],
	{ source: 'research' },
	now - 86_400_000
);

console.log(`Demo data added. Open /admin/events/${today} (and /admin/events/${today}/display).`);
console.log(
	`Guest lists: /admin/events/${today}/invitations and /admin/events/${dinner}/invitations.`
);
