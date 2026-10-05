import { describe, expect, it } from 'vitest';
import { addressAs, addressee, callName, guessSalutation } from './salutation';

describe('callName', () => {
	it('is the given name people use', () => {
		expect(callName('Kevin Arismunandar Suhartono')).toBe('Kevin');
		expect(callName('KEVIN ARISMUNANDAR')).toBe('Kevin');
		expect(callName('Rina Wijaya, S.Kom.')).toBe('Rina');
	});

	it('skips titles, Muhammad, initials and Balinese markers', () => {
		expect(callName('Muhammad Faiz Azhari')).toBe('Faiz');
		expect(callName('Moch. Ridwan')).toBe('Ridwan');
		expect(callName('Mohd Azlan bin Ahmad')).toBe('Azlan');
		expect(callName('A. Rahman Hakim')).toBe('Rahman');
		expect(callName('Bapak Hendra Gunawan')).toBe('Hendra');
		expect(callName('Dr. Ir. Budi Santoso, M.T.')).toBe('Budi');
		expect(callName('Ni Made Ayu Lestari')).toBe('Ayu');
		expect(callName('I Gede Ngurah Bagus')).toBe('Ngurah');
		expect(callName('Tan Sri Ahmad Zaki')).toBe('Ahmad');
	});

	it('keeps a lone name, even one that is also a title', () => {
		expect(callName('Johari')).toBe('Johari');
		expect(callName('Muhammad')).toBe('Muhammad');
	});

	it('reads a Chinese surname written first', () => {
		expect(callName('Tan Wei Ming')).toBe('Wei Ming');
		expect(callName('Lim Kok Wing')).toBe('Kok Wing');
		// Not that shape: the first name stays.
		expect(callName('Lee Hendrawan Santoso')).toBe('Lee');
	});
});

describe('guessSalutation', () => {
	it('follows what the name says outright', () => {
		expect(guessSalutation('Bapak Ade Kurnia')).toBe('pak');
		expect(guessSalutation('Ibu Ade Kurnia')).toBe('bu');
		expect(guessSalutation('Drs. Nur Hidayat')).toBe('pak');
		expect(guessSalutation('Dra. Nur Hidayati')).toBe('bu');
		expect(guessSalutation('Nur Aisyah binti Rahman')).toBe('bu');
		expect(guessSalutation('Nur Hakim bin Rahman')).toBe('pak');
		expect(guessSalutation('Ni Kadek Dian')).toBe('bu');
		expect(guessSalutation('I Wayan Dian')).toBe('pak');
		expect(guessSalutation('Muhammad Ade Putra')).toBe('pak');
	});

	it('knows common given names one way or the other', () => {
		expect(guessSalutation('Kevin Arismunandar Suhartono')).toBe('pak');
		expect(guessSalutation('Eddy Gunawan')).toBe('pak');
		expect(guessSalutation('Dewi Kartika')).toBe('bu');
		expect(guessSalutation('Siti Rahmawati')).toBe('bu');
		expect(guessSalutation('Grace Tan')).toBe('bu');
		expect(guessSalutation('Kurniawati Halim')).toBe('bu');
		expect(guessSalutation('Hartanto Wijaya')).toBe('pak');
	});

	it('leaves names used for both, or unknown, to Bapak/Ibu', () => {
		for (const name of [
			'Ade Kurniawan',
			'Adek Steven',
			'Dian Sastro',
			'Nur Hidayat',
			'Rizki Amelia',
			'Andi Mallarangeng',
			'Tan Wei Ming',
			'Pristy Candra'
		])
			expect(guessSalutation(name), name).toBeNull();
	});

	it('reads a lone H. as an initial, not as Haji', () => {
		expect(guessSalutation('H. Dewi Lestari')).toBe('bu');
		expect(callName('H. Dewi Lestari')).toBe('Dewi');
	});

	it('does not read Hj. or Dato either way, since they mean different things', () => {
		expect(guessSalutation('Hj. Ade Rahman')).toBeNull();
		expect(guessSalutation('Dato Ade Rahman')).toBeNull();
	});
});

describe('addressee and addressAs', () => {
	it('uses a stored answer over the guess, and says where each came from', () => {
		expect(addressee({ name: 'Kevin Arismunandar' })).toEqual({
			salutation: 'pak',
			source: 'name',
			callName: 'Kevin'
		});
		expect(
			addressee({ name: 'Kevin Arismunandar', salutation: 'bu', salutation_source: 'self' })
		).toMatchObject({ salutation: 'bu', source: 'self' });
		expect(addressee({ name: 'Ade Kurniawan' })).toEqual({
			salutation: null,
			source: null,
			callName: 'Ade'
		});
		expect(addressee({ name: 'Muhammad Faiz Azhari', call_name: 'Iz' }).callName).toBe('Iz');
	});

	it('writes the greeting for each language', () => {
		expect(addressAs({ salutation: 'pak', callName: 'Kevin' }, 'id')).toBe('Pak Kevin');
		expect(addressAs({ salutation: 'bu', callName: 'Dewi' }, 'id')).toBe('Bu Dewi');
		expect(addressAs({ salutation: null, callName: 'Ade' }, 'id')).toBe('Bapak/Ibu Ade');
		expect(addressAs({ salutation: 'pak', callName: 'Azlan' }, 'ms')).toBe('Encik Azlan');
		expect(addressAs({ salutation: 'bu', callName: 'Aina' }, 'ms')).toBe('Puan Aina');
		expect(addressAs({ salutation: null, callName: 'Wei Ming' }, 'ms')).toBe('Tuan/Puan Wei Ming');
		expect(addressAs({ salutation: 'pak', callName: 'Kevin' }, 'en')).toBe('Kevin');
		expect(addressAs({ salutation: null, callName: '' }, 'en')).toBe('there');
	});
});
