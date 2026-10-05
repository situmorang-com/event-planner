import { describe, expect, it } from 'vitest';
import { parseAccounts, readAccountColumns } from './accounts-list';

describe('parseAccounts', () => {
	it('reads an Accounts view by its display-name headers, case-insensitively', () => {
		const text = [
			'Account Name\tWebsite\tPrimary Contact\tOwner\tIndustry\tMain Phone',
			'Batavia Foods\thttps://bataviafoods.co.id\tRina Wijaya\tDewi\tFood\t+62 21 555',
			'Selat Energy\t\tAndi Pratama\tSomeone Else\t\t'
		].join('\n');
		const parsed = parseAccounts(text);
		expect(parsed.header).toBe(true);
		expect(parsed.columns).toEqual({
			name: 0,
			website: 1,
			primaryContact: 2,
			owner: 3,
			industry: 4,
			mainPhone: 5
		});
		expect(parsed.accounts).toEqual([
			{
				name: 'Batavia Foods',
				website: 'https://bataviafoods.co.id',
				owner: 'Dewi',
				industry: 'Food'
			},
			{ name: 'Selat Energy', website: '', owner: 'Someone Else', industry: '' }
		]);
		// The primary contact and phone are read for the mapping but never kept.
		expect(JSON.stringify(parsed.accounts)).not.toContain('Rina');
		expect(JSON.stringify(parsed.accounts)).not.toContain('555');
	});

	it('knows the logical names and drops the hidden (Do Not Modify) columns', () => {
		const text = [
			'(Do Not Modify) Account\t(Do Not Modify) Row Checksum\t(Do Not Modify) Modified On\tname\twebsiteurl\tprimarycontactid\townerid\tindustrycode\ttelephone1',
			'{0A1B2C3D-0000-4000-8000-000000000001}\tabc==\t2026-10-01\tKopi Kita\tkopikita.id\tBudi\tDewi Lestari\tRetail\t021'
		].join('\n');
		const parsed = parseAccounts(text);
		expect(parsed.headers).toEqual([
			'name',
			'websiteurl',
			'primarycontactid',
			'ownerid',
			'industrycode',
			'telephone1'
		]);
		expect(parsed.columns).toMatchObject({ name: 0, website: 1, owner: 3, industry: 4 });
		expect(parsed.accounts).toEqual([
			{ name: 'Kopi Kita', website: 'kopikita.id', owner: 'Dewi Lestari', industry: 'Retail' }
		]);
	});

	it('reads lines without a header as "company, website" and skips nameless ones', () => {
		const parsed = parseAccounts('1. Batavia Foods, bataviafoods.co.id\n, nothing\nSelat Energy');
		expect(parsed.header).toBe(false);
		expect(parsed.columns).toEqual({});
		expect(parsed.accounts.map((a) => [a.name, a.website])).toEqual([
			['Batavia Foods', 'bataviafoods.co.id'],
			['Selat Energy', '']
		]);
		expect(parsed.skipped).toEqual([', nothing']);
	});

	it('takes a lone "Account Name" line as the header of a one-column view', () => {
		const parsed = parseAccounts('Account Name\nBatavia Foods\nSelat Energy');
		expect(parsed.header).toBe(true);
		expect(parsed.columns).toEqual({ name: 0 });
		expect(parsed.accounts.map((a) => a.name)).toEqual(['Batavia Foods', 'Selat Energy']);
	});

	it('takes the organizer’s own mapping over the detected one, and ignores a bad website', () => {
		const text = 'Perusahaan;Situs;PIC\nBatavia Foods;not a site;Rina\nSelat Energy;selat.com;Andi';
		// "Perusahaan" alone names a company column: one match is not a header on its own.
		expect(parseAccounts(text).header).toBe(false);
		const mapped = parseAccounts(text, { columns: { name: 0, website: 1 } });
		expect(mapped.header).toBe(true);
		expect(mapped.accounts).toEqual([
			{ name: 'Batavia Foods', website: '', owner: '', industry: '' },
			{ name: 'Selat Energy', website: 'selat.com', owner: '', industry: '' }
		]);
		expect(parseAccounts(text, { columns: { name: 0 }, header: false }).accounts).toHaveLength(3);
	});

	it('reads a mapping sent back from the page and drops junk', () => {
		expect(
			readAccountColumns({ name: '2', website: 0, bogus: 1, owner: -1, industry: 'x' })
		).toEqual({
			name: 2,
			website: 0
		});
		expect(readAccountColumns('nope')).toBeUndefined();
	});
});
