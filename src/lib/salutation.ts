// How a message addresses someone (D27): "Pak Kevin", "Bu Dewi", or "Bapak/Ibu Ade" when
// nothing says which. Pure, so the server renders it and the People page shows the same thing.

export type Salutation = 'pak' | 'bu';
/** Who said so: the person on the registration page, the team on their row, or a public page
 * research quoted. A guess from the name is never stored; it is worked out each time. */
export type SalutationSource = 'self' | 'team' | 'research';
export type SalutationLanguage = 'id' | 'en' | 'ms';

export const isSalutation = (v: unknown): v is Salutation => v === 'pak' || v === 'bu';

/** Stronger sources win: their own answer, then the team's, then research. */
export const SALUTATION_RANK: Record<SalutationSource, number> = { self: 3, team: 2, research: 1 };

function fold(s: string): string {
	return s
		.normalize('NFKD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}/]+/gu, '');
}

// Titles in front of a name, and what they say about it. Ungendered ones are only skipped.
const TITLES: Record<string, Salutation | null> = {
	bapak: 'pak',
	bpk: 'pak',
	pak: 'pak',
	mr: 'pak',
	sdr: 'pak',
	tuan: 'pak',
	tn: 'pak',
	encik: 'pak',
	en: 'pak',
	haji: 'pak',
	drs: 'pak',
	ibu: 'bu',
	bu: 'bu',
	mrs: 'bu',
	ms: 'bu',
	miss: 'bu',
	mdm: 'bu',
	madam: 'bu',
	sdri: 'bu',
	puan: 'bu',
	cik: 'bu',
	ny: 'bu',
	nyonya: 'bu',
	nona: 'bu',
	hjh: 'bu',
	hajah: 'bu',
	hajjah: 'bu',
	dra: 'bu',
	datin: 'bu',
	// Skipped without a guess: Hj. is Hajjah in Indonesia but Haji in Malaysia, and Dato' and
	// Datuk are conferred on women too.
	hj: null,
	dato: null,
	datuk: null,
	dr: null,
	prof: null,
	ir: null
};

// Muhammad and its spellings come first in many Indonesian and Malay men's names, which go by
// the name after it: "Muhammad Faiz Azhari" is Pak Faiz.
const MUHAMMAD = new Set([
	'muhammad',
	'muhamad',
	'mohammad',
	'mohamad',
	'mohammed',
	'muhammed',
	'mohamed',
	'moh',
	'moch',
	'mochamad',
	'mochammad',
	'muh',
	'mohd',
	'md'
]);

// Balinese names open with a marker (I for men, Ni for women) and a birth-order or caste name;
// people go by the name after them.
const BALINESE: Record<string, Salutation | null> = {
	i: 'pak',
	ni: 'bu',
	luh: 'bu',
	gede: 'pak',
	wayan: null,
	made: null,
	nyoman: null,
	ketut: null,
	putu: null,
	kadek: null,
	komang: null,
	nengah: null,
	gusti: null
};

// Chinese surnames written first ("Tan Wei Ming"): the given name is the rest.
const CHINESE_SURNAMES = new Set([
	'tan',
	'lim',
	'lee',
	'ng',
	'ong',
	'goh',
	'chan',
	'wong',
	'teo',
	'tay',
	'koh',
	'chua',
	'yeo',
	'low',
	'lau',
	'chong',
	'cheong',
	'lai',
	'liew',
	'yap',
	'foo',
	'khoo',
	'chen',
	'zhang',
	'wang',
	'liu',
	'huang',
	'zhou'
]);

// Given names that are clearly one or the other in Indonesia and Malaysia. Names used for both
// (Ade, Adek, Andi, Ari, Dian, Dwi, Eka, Endang, Kiki, Nanda, Nur, Nurul, Rizki, Tri, Yuli…)
// are deliberately absent: they get "Bapak/Ibu" until someone says.
const MALE = new Set(
	`abdul abdullah achmad adam adi adit aditya adji agung agus ahmad aiman akbar albert aldi
	aldo alex alexander alfian amir andika andreas andrew andy angga anthony anton antonius anwar
	ardi arief arif aris arya aryo azlan bagas bagus bambang bayu benny bima boby bonifasius
	brian budi budiman candra charles chandra christian daniel danny david dedi dedy denny dicky
	dimas dodi doni dony edi eddy edward edwin edy eko eric erick erik fadli fahmi fajar faisal
	farid fauzan fauzi felix ferdi ferry fikri frans fransiskus galih gilang gregorius guntur
	gunawan hafiz hakim hadi hamzah handoko hari haris hasan hendra hendrik hendro henry heru
	husin ibrahim ikhsan ilham imam imran indra irfan irwan iskandar ismail iwan jaka james jason
	jeffrey johan johannes john johny joko jonathan joseph joshua junaedi kevin khairul krisna
	kurniawan leonardo lukas lukman mahmud marcus mario mark martin michael mulyadi nazri nicholas
	nico pandu patrick paul peter philip prasetyo purnomo putra rahmat raj rama rangga raymond
	rendy reza richard ricky rio rizal robby robert robertus rudi rudy ryan samuel satria
	septian setiawan shahrul sigit simon slamet stanley stefanus steven stevanus sugeng surya
	susilo syafiq taufik teguh thomas timotius tommy toni tony umar victor vincent wahyu wawan
	wibowo william willy wilson wisnu yogi yoga yohanes yosua yudi yudha yusuf zainal zulkifli`.split(
		/\s+/
	)
);

const FEMALE = new Set(
	`agnes aina aisyah amalia amanda amelia aminah angela angelina anisa anita annisa astrid ayu
	bella catherine christine cindy citra clara claudia cynthia debora dewi diah diana dina dini
	dyah elisabeth elizabeth elsa evelyn evi farah fatimah felicia fitri fitria fransiska gita
	gloria grace halimah hana helen indah intan irene irma jessica jihan julia kartika kirana
	laras larasati laura lestari lia lina linda lisa lucy margaret maria marlina maya mega
	melati melinda melissa michelle mira monica mutiara nabila nadia natalia natasha nia nicole
	novi novita nurhayati olivia patricia permata pratiwi priya puspita putri rachel rahayu
	rahmawati ratih ratna rebecca rina rini riska rita rohani rosa sabrina salmah sandra sarah
	sari sekar shinta silvia sinta siska siti sofea sofia sophia sri stella stephanie susan susi
	syafiqah tania tari tiara tika tina utami valerie vanessa veronica vina vivian wati wendy
	widya winda wulan yanti yesi yulia yulianti yuni yvonne zahra zarina`.split(/\s+/)
);

const FEMALE_ENDINGS = ['wati', 'yanti', 'ningsih', 'ningrum', 'ningtyas', 'nengsih'];
const MALE_ENDINGS = ['wan', 'anto', 'yanto', 'ianto'];

function titleCase(word: string): string {
	if (word !== word.toUpperCase() && word !== word.toLowerCase()) return word;
	return word.toLowerCase().replace(/(^|[-'])\p{L}/gu, (m) => m.toUpperCase());
}

interface Parsed {
	callName: string;
	/** What the name itself says (a title, bin/binti, a Balinese marker, Muhammad), if anything. */
	hint: Salutation | null;
}

function parse(name: string): Parsed {
	const tokens = name.split(',')[0].trim().split(/\s+/).filter(Boolean);
	let hint: Salutation | null = null;
	const note = (s: Salutation | null) => {
		if (s && !hint) hint = s;
	};
	for (const t of tokens) {
		const w = fold(t);
		if (w === 'bin' || w === 'a/l') note('pak');
		if (w === 'binti' || w === 'bt' || w === 'binte' || w === 'bte' || w === 'a/p') note('bu');
	}
	let i = 0;
	const more = () => i < tokens.length - 1;
	while (more()) {
		const w = fold(tokens[i]);
		const next = fold(tokens[i + 1] ?? '');
		if ((w === 'tan' || w === 'puan') && next === 'sri') {
			note(w === 'tan' ? 'pak' : 'bu');
			i += 2;
		} else if (w in TITLES) {
			note(TITLES[w]);
			i++;
		} else if (w in BALINESE) {
			note(BALINESE[w]);
			i++;
		} else if (MUHAMMAD.has(w)) {
			note('pak');
			i++;
		} else if (w.length === 1) {
			i++; // an initial: "A. Rahman" goes by Rahman
		} else break;
	}
	const rest = tokens.slice(i);
	// "Tan Wei Ming": a Chinese surname first, then a two-part given name.
	if (
		rest.length === 3 &&
		CHINESE_SURNAMES.has(fold(rest[0])) &&
		fold(rest[1]).length <= 5 &&
		fold(rest[2]).length <= 5
	)
		return { callName: `${titleCase(rest[1])} ${titleCase(rest[2])}`, hint };
	return { callName: rest.length ? titleCase(rest[0].replace(/[.,]+$/, '')) : '', hint };
}

/** What goes after Pak or Bu: the given name people use, not "Muhammad" or a title. */
export function callName(name: string): string {
	return parse(name).callName;
}

/**
 * Pak or Bu from the name alone, or null when the name could be either. Read in this order:
 * what the name says outright (a title, bin/binti, I/Ni), then the given name it goes by.
 */
export function guessSalutation(name: string): Salutation | null {
	const { callName: given, hint } = parse(name);
	if (hint) return hint;
	const w = fold(given.split(' ')[0] ?? '');
	if (!w) return null;
	if (MALE.has(w)) return 'pak';
	if (FEMALE.has(w)) return 'bu';
	if (w.length >= 5 && FEMALE_ENDINGS.some((e) => w.endsWith(e))) return 'bu';
	if (w.length >= 5 && MALE_ENDINGS.some((e) => w.endsWith(e))) return 'pak';
	return null;
}

export interface Addressee {
	salutation: Salutation | null;
	/** Where it came from; 'name' is a guess, null means nothing said (Bapak/Ibu). */
	source: SalutationSource | 'name' | null;
	callName: string;
}

/** The stored answer when there is one, else the guess from the name. */
export function addressee(person: {
	name: string;
	call_name?: string | null;
	salutation?: Salutation | null;
	salutation_source?: SalutationSource | null;
}): Addressee {
	const given = person.call_name?.trim() || callName(person.name);
	if (person.salutation)
		return {
			salutation: person.salutation,
			source: person.salutation_source ?? 'team',
			callName: given
		};
	const guess = guessSalutation(person.name);
	return { salutation: guess, source: guess ? 'name' : null, callName: given };
}

const FORMS: Record<SalutationLanguage, Record<Salutation | 'either', string>> = {
	id: { pak: 'Pak', bu: 'Bu', either: 'Bapak/Ibu' },
	// Malaysian business letters: Encik for men, Puan for women, Tuan/Puan when unknown.
	ms: { pak: 'Encik', bu: 'Puan', either: 'Tuan/Puan' },
	en: { pak: '', bu: '', either: '' }
};

/** "Pak Kevin", "Bu Dewi", "Bapak/Ibu Ade"; in English just "Kevin". */
export function addressAs(
	who: Pick<Addressee, 'salutation' | 'callName'>,
	language: SalutationLanguage
): string {
	const form = FORMS[language][who.salutation ?? 'either'];
	return (
		[form, who.callName].filter(Boolean).join(' ') ||
		(language === 'en' ? 'there' : FORMS[language].either)
	);
}

/** The honorific alone, as the row's picker names the choices for a language. */
export function salutationWord(s: Salutation | null, language: SalutationLanguage): string {
	return FORMS[language === 'en' ? 'id' : language][s ?? 'either'];
}
