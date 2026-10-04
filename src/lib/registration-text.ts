import type { Language } from './consent';

/*
 * Everything the public registration pages say (§4.6, §8), in the row's language. The server
 * picks the language (languageFor); the page looks its strings up here, so the texts stay
 * one file and the pages stay markup.
 */

export interface RegistrationText {
	title: string;
	/** §8 registration notice; the page splits it at the [Not me] · [Remove me] slots. */
	notice: string;
	notMe: string;
	removeMe: string;
	notMeConfirm: string;
	removeMeConfirm: string;
	rsvp: string;
	yes: string;
	maybe: string;
	no: string;
	name: string;
	company: string;
	jobTitle: string;
	email: string;
	mobile: string;
	note: string;
	optional: string;
	send: string;
	register: string;
	reconfirmTitle: string;
	reconfirm: string;
	changeReply: string;
	doneYes: string;
	doneMaybe: string;
	doneNo: string;
	reachYou: string;
	doneNotMe: string;
	doneRemoveMe: string;
	expired: string;
	expiredBody: string;
	footer: string;
	errors: {
		rsvp: string;
		name: string;
		contact: string;
		email: string;
		consent: string;
		refused: string;
		busy: string;
	};
}

export const REGISTRATION_TEXT: Record<Language, RegistrationText> = {
	en: {
		title: 'Register for {event}',
		notice: "We have your name and company from {org}'s invitation list. Not you?",
		notMe: 'Not me',
		removeMe: 'Remove me',
		notMeConfirm:
			'Tell {org} this invitation reached the wrong person? The contact it was sent to is removed from the list.',
		removeMeConfirm:
			'Remove your details from {org}’s lists? You won’t hear from us about events again.',
		rsvp: 'Will you join us?',
		yes: 'Yes, I’ll be there',
		maybe: 'Maybe',
		no: 'No, I can’t make it',
		name: 'Full name',
		company: 'Company',
		jobTitle: 'Job title',
		email: 'Email',
		mobile: 'Mobile',
		note: 'Note',
		optional: '(optional)',
		send: 'Send my reply',
		register: 'Register',
		reconfirmTitle: 'See you at {event}?',
		reconfirm: 'Yes, I’ll be there',
		changeReply: 'Can’t make it after all? Update your reply',
		doneYes: 'Thank you, {name}. You’re confirmed for {event}.',
		doneMaybe: 'Thank you, {name}. We’ve noted you as tentative for {event}.',
		doneNo: 'Thank you for letting us know, {name}. We hope to see you another time.',
		reachYou: 'We’ll reach you at {contact}.',
		doneNotMe: 'Thanks. That contact has been removed from the invitation.',
		doneRemoveMe: 'Done. We won’t contact you about events again.',
		expired: 'This link has expired',
		expiredBody: 'The event has ended, so this link no longer works.',
		footer: 'Your details go only to {org}. Never shared or sold.',
		errors: {
			rsvp: 'Please choose an answer.',
			name: 'Please add your name.',
			contact: 'Please add an email or a mobile number.',
			email: 'That email doesn’t look quite right.',
			consent: 'Please tick this so we can record your reply.',
			refused: 'We can’t register these details. Please contact {org}.',
			busy: 'Too many requests right now. Please try again in a moment.'
		}
	},
	id: {
		title: 'Daftar untuk {event}',
		notice: 'Kami memiliki nama dan perusahaan Anda dari daftar undangan {org}. Bukan Anda?',
		notMe: 'Bukan saya',
		removeMe: 'Hapus data saya',
		notMeConfirm:
			'Beri tahu {org} bahwa undangan ini salah alamat? Kontak yang dipakai untuk mengirimnya akan dihapus dari daftar.',
		removeMeConfirm:
			'Hapus data Anda dari daftar {org}? Anda tidak akan dihubungi lagi tentang acara.',
		rsvp: 'Apakah Anda akan hadir?',
		yes: 'Ya, saya hadir',
		maybe: 'Mungkin',
		no: 'Tidak bisa hadir',
		name: 'Nama lengkap',
		company: 'Perusahaan',
		jobTitle: 'Jabatan',
		email: 'Email',
		mobile: 'No. HP',
		note: 'Catatan',
		optional: '(opsional)',
		send: 'Kirim jawaban',
		register: 'Daftar',
		reconfirmTitle: 'Sampai jumpa di {event}?',
		reconfirm: 'Ya, saya hadir',
		changeReply: 'Ternyata tidak bisa hadir? Ubah jawaban Anda',
		doneYes: 'Terima kasih, {name}. Kehadiran Anda di {event} sudah terkonfirmasi.',
		doneMaybe: 'Terima kasih, {name}. Kami mencatat Anda sebagai tentatif untuk {event}.',
		doneNo: 'Terima kasih sudah memberi kabar, {name}. Semoga bisa bertemu di lain waktu.',
		reachYou: 'Kami akan menghubungi Anda di {contact}.',
		doneNotMe: 'Terima kasih. Kontak itu sudah dihapus dari undangan.',
		doneRemoveMe: 'Selesai. Kami tidak akan menghubungi Anda lagi tentang acara.',
		expired: 'Tautan ini sudah kedaluwarsa',
		expiredBody: 'Acara sudah berakhir, jadi tautan ini tidak berlaku lagi.',
		footer: 'Data Anda hanya untuk {org}. Tidak pernah dibagikan atau dijual.',
		errors: {
			rsvp: 'Mohon pilih jawaban.',
			name: 'Mohon isi nama Anda.',
			contact: 'Mohon isi email atau nomor HP.',
			email: 'Email itu sepertinya tidak benar.',
			consent: 'Mohon centang ini agar kami dapat mencatat jawaban Anda.',
			refused: 'Kami tidak dapat mendaftarkan data ini. Silakan hubungi {org}.',
			busy: 'Terlalu banyak permintaan saat ini. Silakan coba lagi sebentar lagi.'
		}
	},
	ms: {
		title: 'Daftar untuk {event}',
		notice: 'Kami mempunyai nama dan syarikat anda daripada senarai jemputan {org}. Bukan anda?',
		notMe: 'Bukan saya',
		removeMe: 'Buang data saya',
		notMeConfirm:
			'Beritahu {org} bahawa jemputan ini sampai kepada orang yang salah? Hubungan yang digunakan untuk menghantarnya akan dibuang daripada senarai.',
		removeMeConfirm:
			'Buang butiran anda daripada senarai {org}? Anda tidak akan dihubungi lagi tentang acara.',
		rsvp: 'Adakah anda akan hadir?',
		yes: 'Ya, saya hadir',
		maybe: 'Mungkin',
		no: 'Tidak dapat hadir',
		name: 'Nama penuh',
		company: 'Syarikat',
		jobTitle: 'Jawatan',
		email: 'E-mel',
		mobile: 'Telefon bimbit',
		note: 'Nota',
		optional: '(pilihan)',
		send: 'Hantar jawapan',
		register: 'Daftar',
		reconfirmTitle: 'Jumpa di {event}?',
		reconfirm: 'Ya, saya hadir',
		changeReply: 'Tidak dapat hadir? Kemas kini jawapan anda',
		doneYes: 'Terima kasih, {name}. Kehadiran anda di {event} telah disahkan.',
		doneMaybe: 'Terima kasih, {name}. Kami mencatat anda sebagai tentatif untuk {event}.',
		doneNo: 'Terima kasih kerana memaklumkan, {name}. Semoga dapat bertemu di lain masa.',
		reachYou: 'Kami akan menghubungi anda di {contact}.',
		doneNotMe: 'Terima kasih. Hubungan itu telah dibuang daripada jemputan.',
		doneRemoveMe: 'Selesai. Kami tidak akan menghubungi anda lagi tentang acara.',
		expired: 'Pautan ini telah tamat tempoh',
		expiredBody: 'Acara telah berakhir, jadi pautan ini tidak lagi berfungsi.',
		footer: 'Butiran anda hanya untuk {org}. Tidak pernah dikongsi atau dijual.',
		errors: {
			rsvp: 'Sila pilih jawapan.',
			name: 'Sila isi nama anda.',
			contact: 'Sila isi e-mel atau nombor telefon bimbit.',
			email: 'E-mel itu nampaknya tidak betul.',
			consent: 'Sila tandakan ini supaya kami dapat merekodkan jawapan anda.',
			refused: 'Kami tidak dapat mendaftarkan butiran ini. Sila hubungi {org}.',
			busy: 'Terlalu banyak permintaan sekarang. Sila cuba sebentar lagi.'
		}
	}
};
