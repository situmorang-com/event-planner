import { describe, expect, it } from 'vitest';
import { parseGuestList, parseReply } from './guest-list';

const opts = { company: 'Batavia Foods', country: 'ID' };

describe('parseGuestList', () => {
	it('reads one person per line, details in any order after the name', () => {
		const text =
			'Rina Wijaya\n\n  \nAndi Pratama, IT Manager, ANDI@batavia.co.id, 0812-3456-7890\n';
		expect(parseGuestList(text, opts)).toMatchObject({
			guests: [
				{
					name: 'Rina Wijaya',
					company: 'Batavia Foods',
					jobTitle: '',
					email: null,
					phone: null,
					linkedin: null,
					reply: 'pending',
					note: ''
				},
				{
					name: 'Andi Pratama',
					company: 'Batavia Foods',
					jobTitle: 'IT Manager',
					email: 'andi@batavia.co.id',
					phone: '+6281234567890',
					linkedin: null,
					reply: 'pending',
					note: ''
				}
			],
			skipped: [],
			truncated: false
		});
	});

	it('keeps degrees with the name and picks up a reply', () => {
		const { guests } = parseGuestList(
			'1. Budi Santoso, S.Kom., M.M., Head of IT, APAC, hadir',
			opts
		);
		expect(guests[0]).toMatchObject({
			name: 'Budi Santoso, S.Kom., M.M.',
			jobTitle: 'Head of IT, APAC',
			reply: 'yes'
		});
	});

	it('reads a spreadsheet paste by its header row', () => {
		const text = [
			'No.\tNama\tPerusahaan\tJabatan\tNo. HP\tKonfirmasi',
			'1\tRina Wijaya\tSelat Energy\tCFO\t0812 3456 7890\tHadir',
			'2\tAndi Pratama\t\t"Head of IT, APAC"\t\tYes, with a colleague',
			'3\t\t\t\t\t'
		].join('\n');
		const { guests, skipped } = parseGuestList(text, opts);
		expect(guests).toEqual([
			expect.objectContaining({
				name: 'Rina Wijaya',
				company: 'Selat Energy',
				jobTitle: 'CFO',
				phone: '+6281234567890',
				reply: 'yes',
				note: ''
			}),
			expect.objectContaining({
				name: 'Andi Pratama',
				company: 'Batavia Foods',
				jobTitle: 'Head of IT, APAC',
				reply: 'pending',
				note: 'Yes, with a colleague'
			})
		]);
		expect(skipped).toEqual(['3']);
	});

	it('joins first and last names and prefers the job title in an Outlook export', () => {
		const text =
			'Title,First Name,Last Name,Company,Job Title,E-mail Address,Mobile Phone\n' +
			'Ms,Mei Ling,Chong,Sinar Digital,CTO,meiling@sinar.my,012-345 6789';
		const { guests } = parseGuestList(text, { company: '', country: 'MY' });
		expect(guests).toEqual([
			{
				name: 'Mei Ling Chong',
				company: 'Sinar Digital',
				jobTitle: 'CTO',
				email: 'meiling@sinar.my',
				phone: '+60123456789',
				linkedin: null,
				reply: 'pending',
				note: ''
			}
		]);
	});

	it('takes a LinkedIn link, on its own or with details, and reads the name from it', () => {
		const text = [
			'https://www.linkedin.com/in/rina-wijaya-4a1b2c',
			'Andi Pratama, CFO, linkedin.com/in/andi-p',
			'https://www.linkedin.com/in/rinaw88'
		].join('\n');
		const { guests, skipped } = parseGuestList(text, opts);
		expect(guests.map((g) => [g.name, g.jobTitle, g.linkedin])).toEqual([
			['Rina Wijaya', '', 'https://www.linkedin.com/in/rina-wijaya-4a1b2c'],
			['Andi Pratama', 'CFO', 'https://www.linkedin.com/in/andi-p']
		]);
		expect(skipped).toEqual(['https://www.linkedin.com/in/rinaw88']);
	});

	it('reads a LinkedIn column, and keeps nameless rows when asked to', () => {
		const text = 'Name\tLinkedIn\n\thttps://linkedin.com/in/rinaw88\nPutri\t';
		const { guests } = parseGuestList(text, { ...opts, keepNameless: true });
		expect(guests.map((g) => [g.name, g.linkedin])).toEqual([
			['', 'https://www.linkedin.com/in/rinaw88'],
			['Putri', null]
		]);
	});

	it('reports lines it has no name for', () => {
		expect(parseGuestList('rina@example.com\n0812 3456 7890', opts)).toMatchObject({
			guests: [],
			skipped: ['rina@example.com', '0812 3456 7890']
		});
	});

	it('says how it read the first line, so the review card can offer another mapping', () => {
		const typed = parseGuestList('Rina Wijaya, CFO\nAndi Pratama', opts);
		expect(typed).toMatchObject({ header: false, columns: {}, d365: false });
		expect(typed.headers).toEqual(['Rina Wijaya', 'CFO']);

		const pasted = parseGuestList('Name\tCompany\tMobile\nRina\tSelat\t0812 3456 7890', opts);
		expect(pasted).toMatchObject({
			header: true,
			columns: { name: 0, company: 1, phone: 2 },
			headers: ['Name', 'Company', 'Mobile']
		});
	});

	it('reads the rows with the mapping the organizer chose instead of the detected one', () => {
		// Nothing here names a column, so by shape the second cell would be a job title.
		const text = 'Person\tFirm\tCell\nRina Wijaya\tSelat Energy\t0812 3456 7890';
		expect(parseGuestList(text, opts).guests[0]).toMatchObject({
			name: 'Person',
			jobTitle: 'Firm, Cell'
		});
		const mapped = parseGuestList(text, { ...opts, columns: { name: 0, company: 1, phone: 2 } });
		expect(mapped.guests).toEqual([
			expect.objectContaining({
				name: 'Rina Wijaya',
				company: 'Selat Energy',
				phone: '+6281234567890'
			})
		]);
		expect(mapped).toMatchObject({ header: true, columns: { name: 0, company: 1, phone: 2 } });
		// The same mapping with no header row keeps the first line as a person.
		expect(
			parseGuestList(text, { ...opts, columns: { name: 0 }, header: false }).guests.map(
				(g) => g.name
			)
		).toEqual(['Person', 'Rina Wijaya']);
	});
});

describe('Dynamics 365 exports', () => {
	// A contacts view exported as a static worksheet, with its hidden leading columns.
	const header = [
		'(Do Not Modify) Contact',
		'(Do Not Modify) Row Checksum',
		'(Do Not Modify) Modified On',
		'Full Name',
		'Parent Customer',
		'Job Title',
		'Email Address 1',
		'Mobile Phone 1',
		'Owner',
		'Do not allow Emails',
		'Do not allow Phone Calls',
		'Send Marketing Materials',
		'Status'
	].join('\t');
	const row = (cells: string[]) =>
		['3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'abc==', '2026-09-30', ...cells].join('\t');

	it('reads the D365 headers, drops the hidden columns and keeps the flags on each row', () => {
		const text = [
			header,
			row([
				'Rina Wijaya',
				'Batavia Foods',
				'CFO',
				'rina@batavia.co.id',
				'0812 3456 7890',
				'Sari Dewi',
				'Do Not Allow',
				'Allow',
				'Send',
				'Active'
			]),
			row([
				'Andi Pratama',
				'Batavia Foods',
				'CIO',
				'',
				'',
				'Sari Dewi',
				'Allow',
				'Allow',
				'Do Not Send',
				'Active'
			]),
			row(['Budi Santoso', 'Selat Energy', 'CEO', '', '', '', 'Allow', 'Allow', 'Send', 'Inactive'])
		].join('\n');
		const parsed = parseGuestList(text, opts);
		expect(parsed).toMatchObject({ d365: true, header: true });
		expect(parsed.headers[0]).toBe('Full Name');
		expect(parsed.columns).toMatchObject({
			name: 0,
			company: 1,
			jobTitle: 2,
			email: 3,
			phone: 4,
			owner: 5,
			doNotEmail: 6,
			doNotPhone: 7,
			marketing: 8,
			d365Status: 9
		});
		expect(parsed.columns.reply).toBeUndefined();
		expect(parsed.guests).toEqual([
			expect.objectContaining({
				name: 'Rina Wijaya',
				company: 'Batavia Foods',
				email: 'rina@batavia.co.id',
				phone: '+6281234567890',
				reply: 'pending',
				extra: {
					isCustomer: true,
					doNotEmail: true,
					doNotPhone: false,
					suppressed: false,
					owner: 'Sari Dewi',
					status: 'Active'
				}
			}),
			expect.objectContaining({
				name: 'Andi Pratama',
				extra: expect.objectContaining({ suppressed: true, doNotEmail: false })
			}),
			expect.objectContaining({
				name: 'Budi Santoso',
				extra: expect.objectContaining({ suppressed: true, status: 'Inactive' })
			})
		]);
	});

	it('drops a leading GUID column when the header row was not copied', () => {
		const text = [
			'3f2504e0-4f89-11d3-9a0c-0305e82c3301\tRina Wijaya\tCFO',
			'7c9e6679-7425-40de-944b-e07fc1f90ae7\tAndi Pratama\t'
		].join('\n');
		expect(parseGuestList(text, opts).guests.map((g) => [g.name, g.jobTitle])).toEqual([
			['Rina Wijaya', 'CFO'],
			['Andi Pratama', '']
		]);
	});

	it('takes a Status column as replies only when its values read as replies', () => {
		const replies = 'Name\tStatus\nRina\tHadir\nAndi\tTentative\nBudi\t';
		expect(parseGuestList(replies, opts).guests.map((g) => g.reply)).toEqual([
			'yes',
			'maybe',
			'pending'
		]);
		expect(parseGuestList(replies, opts).columns).toEqual({ name: 0, reply: 1 });

		const states = 'Full Name\tStatus\nRina\tActive\nAndi\tInactive';
		const parsed = parseGuestList(states, opts);
		expect(parsed.columns).toEqual({ name: 0, d365Status: 1 });
		expect(parsed.guests.map((g) => [g.reply, g.note])).toEqual([
			['pending', ''],
			['pending', '']
		]);
		// Without any other D365 header the status alone says nothing about customers.
		expect(parsed.d365).toBe(false);

		const mixed = 'Full Name\tStatus\tOwner\nRina\tActive\tSari\nAndi\tInactive\tSari';
		const customers = parseGuestList(mixed, opts);
		expect(customers.d365).toBe(true);
		expect(customers.guests.map((g) => g.extra?.suppressed)).toEqual([false, true]);
	});

	it('understands the inverted marketing column and the Malay phone header', () => {
		const text =
			'Full Name\tTelefon Bimbit\tDo Not Send MM\nMei Ling\t012-345 6789\tYes\nChong\t\tNo';
		const { guests } = parseGuestList(text, { company: '', country: 'MY' });
		expect(guests.map((g) => [g.phone, g.extra?.suppressed])).toEqual([
			['+60123456789', true],
			[null, false]
		]);
	});
});

describe('parseReply', () => {
	it('understands English and Indonesian answers', () => {
		expect(['Yes', 'confirmed', 'Hadir', 'Akan hadir'].map(parseReply)).toEqual(
			Array(4).fill('yes')
		);
		expect(['Tentative', 'TBC', 'mungkin'].map(parseReply)).toEqual(Array(3).fill('maybe'));
		expect(['No.', 'Declined', 'Tidak hadir', 'berhalangan'].map(parseReply)).toEqual(
			Array(4).fill('no')
		);
		expect(['No reply', '-', 'belum konfirmasi'].map(parseReply)).toEqual(Array(3).fill('pending'));
		expect(parseReply('Yes, with a colleague')).toBeNull();
	});
});
