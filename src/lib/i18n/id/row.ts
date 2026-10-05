// Indonesian for the admin app's row strings. Keys are the English text exactly as written in
// the code; a missing key falls back to the English.
const id: Record<string, string> = {
	// Labels from src/lib/people.ts and src/lib/invitations.ts (looked up by value, so
	// src/lib/people-i18n.spec.ts checks each one is here).
	Invitation: 'Undangan',
	'Chase (no reply yet)': 'Tindak lanjut (belum menjawab)',
	'Reminder (before the event)': 'Pengingat (sebelum acara)',
	'Thanks (attending)': 'Terima kasih (hadir)',
	'Follow-up (tentative)': 'Tindak lanjut (mungkin)',
	'Thanks (declined)': 'Terima kasih (menolak)',
	'Legacy notice': 'Pemberitahuan tamu lama',
	Found: 'Ditemukan',
	Shortlisted: 'Masuk daftar',
	Invited: 'Diundang',
	Replied: 'Menjawab',
	Confirmed: 'Terkonfirmasi',
	'Checked in': 'Sudah check-in',
	'Not connected': 'Belum terhubung',
	'Request sent': 'Permintaan terkirim',
	Connected: 'Terhubung',
	Attending: 'Hadir',
	Tentative: 'Mungkin',
	Declined: 'Menolak',
	'No reply': 'Belum menjawab',

	// The track's help.
	'On the list, not invited yet': 'Sudah di daftar, belum diundang',
	'Invitation sent, waiting for an answer': 'Undangan terkirim, menunggu jawaban',
	'They answered: attending, tentative or declined': 'Sudah menjawab: hadir, mungkin, atau menolak',
	'Registered through their personal link, or reconfirmed':
		'Mendaftar lewat tautan pribadinya, atau dikonfirmasi ulang',
	'Arrived at the event': 'Sudah tiba di acara',

	// What to do next.
	'Send the invitation by WhatsApp or email': 'Kirim undangan lewat WhatsApp atau email',
	'Send the invitation by WhatsApp': 'Kirim undangan lewat WhatsApp',
	'Send the invitation by email': 'Kirim undangan lewat email',
	'Set PRIVACY_URL, then send the invitation': 'Atur PRIVACY_URL, lalu kirim undangan',
	'Send the invitation on LinkedIn': 'Kirim undangan di LinkedIn',
	'Wait for them to accept on LinkedIn, then send the invitation there':
		'Tunggu sampai ia menerima di LinkedIn, lalu kirim undangan di sana',
	'Connect with them on LinkedIn, or add a phone or email':
		'Terhubung dengannya di LinkedIn, atau tambahkan nomor ponsel atau email',
	'Check their phone or email (Edit), then invite them':
		'Periksa nomor ponsel atau emailnya (Ubah), lalu undang',
	'Find a phone, email or LinkedIn profile for them (Edit)':
		'Cari nomor ponsel, email, atau profil LinkedIn-nya (Ubah)',
	'Wait for their answer, then press Attending, Tentative or Declined':
		'Tunggu jawabannya, lalu tekan Hadir, Mungkin, atau Menolak',
	'Send the thank-you; a reminder follows before the event':
		'Kirim ucapan terima kasih; pengingat menyusul sebelum acara',
	'Follow up until they decide': 'Tindak lanjuti sampai ia memutuskan',
	'Declined: nothing more to send': 'Menolak: tidak ada lagi yang perlu dikirim',
	'Send a reminder before the event': 'Kirim pengingat sebelum acara',

	// The due line.
	'Chase · overdue since {day}': 'Tindak lanjut · terlambat sejak {day}',
	'Chase · due today': 'Tindak lanjut · tenggat hari ini',
	'Chase · due {day}': 'Tindak lanjut · tenggat {day}',
	'Reminder · overdue since {day}': 'Pengingat · terlambat sejak {day}',
	'Reminder · due today': 'Pengingat · tenggat hari ini',
	'Reminder · due {day}': 'Pengingat · tenggat {day}',

	// Markers.
	Locked: 'Dikunci',
	'Blocked company': 'Perusahaan diblokir',
	Suppressed: 'Dikecualikan',
	'Needs details': 'Perlu data kontak',
	'Self-registered, check company owner': 'Daftar sendiri, cek PIC perusahaan',
	'Chased ×{n}': 'Ditindaklanjuti ×{n}',
	'Chased ×{n}, last {day}': 'Ditindaklanjuti ×{n}, terakhir {day}',
	'No consent recorded': 'Belum ada persetujuan tercatat',
	'Not contactable': 'Tidak bisa dihubungi',
	'Legacy: kept, answered {day}': 'Tamu lama: dipertahankan, menjawab {day}',
	'Legacy: notice sent {day}, kept if they reply':
		'Tamu lama: pemberitahuan terkirim {day}, dipertahankan jika menjawab',
	'Legacy: past attendee, send the notice first':
		'Tamu lama: pernah hadir, kirim pemberitahuan dulu',

	// The greeting chip.
	'{first} chose this when registering.': '{first} memilih ini saat mendaftar.',
	'Set by the team.': 'Diatur oleh tim.',
	'From research: {note}.': 'Dari riset: {note}.',
	'a public page said so': 'menurut halaman publik',
	'Guessed from the name: pick Pak or Bu to confirm it.':
		'Ditebak dari nama: pilih Pak atau Bu untuk memastikan.',
	'The name could be either, so messages say Bapak/Ibu: pick Pak or Bu if you know.':
		'Nama ini bisa keduanya, jadi pesan memakai Bapak/Ibu: pilih Pak atau Bu jika Anda tahu.',
	'English messages use the name only.': 'Pesan berbahasa Inggris hanya memakai nama.',
	'Messages open “{greeting}”.': 'Pesan dibuka dengan “{greeting}”.',
	'Edit sets the name after it.': 'Nama setelahnya diatur lewat Ubah.',
	'How messages greet {name}': 'Sapaan pesan untuk {name}',
	'{word} (guessed from the name)': '{word} (ditebak dari nama)',
	'{word} (not sure)': '{word} (belum pasti)',

	// The name line and details.
	'Select {name}': 'Pilih {name}',
	Skipped: 'Dilewati',
	'Undo the latest touch': 'Urungkan kontak terakhir',
	'Open {first}’s LinkedIn profile': 'Buka profil LinkedIn {first}',
	'Where research found {first}': 'Tempat riset menemukan {first}',
	'Source: {host}': 'Sumber: {host}',
	'Where {first} is': 'Posisi {first}',
	'Next:': 'Berikutnya:',

	// Due date.
	'Due date for {name}': 'Tenggat untuk {name}',
	'Back to the date the chase rules compute': 'Kembali ke tanggal dari aturan tindak lanjut',
	'Use the rules': 'Pakai aturan',
	'Your own date; click to change or clear it':
		'Tanggal Anda sendiri; klik untuk mengubah atau menghapusnya',
	'From the chase rules; click to set your own date':
		'Dari aturan tindak lanjut; klik untuk mengatur tanggal sendiri',
	'set by hand': 'diatur manual',

	// Found rows.
	Add: 'Tambah',
	Skip: 'Lewati',
	Unskip: 'Batal lewati',

	// LinkedIn line.
	'LinkedIn connection': 'Koneksi LinkedIn',
	'Open {first}’s profile to send a connection request there; it is recorded as sent':
		'Buka profil {first} untuk mengirim permintaan koneksi di sana; dicatat sebagai terkirim',
	Connect: 'Hubungkan',
	'Already connected': 'Sudah terhubung',
	'They accepted': 'Sudah diterima',
	'Recorded as sent.': 'Dicatat sebagai terkirim.',
	Undo: 'Urungkan',

	// Send line.
	Send: 'Kirim',
	'Which message the buttons send. Picking one doesn’t move {first} to another step; sending it does.':
		'Pesan yang dikirim tombol-tombol ini. Memilihnya tidak memindahkan {first} ke langkah lain; mengirimnya yang memindahkan.',
	'Message for {name}': 'Pesan untuk {name}',
	'{kind} (suggested)': '{kind} (disarankan)',
	Invite: 'Undang',
	Chase: 'Tindak lanjuti',
	Remind: 'Ingatkan',
	Thank: 'Ucapkan terima kasih kepada',
	'Follow up with': 'Tindak lanjuti',
	Notify: 'Kirim pemberitahuan ke',
	'{purpose} {first} on WhatsApp': '{purpose} {first} lewat WhatsApp',
	'{purpose} {first} by email': '{purpose} {first} lewat email',
	'{purpose} {first} on LinkedIn: the draft is copied and a message to {first} opens, so it is paste and Send':
		'{purpose} {first} di LinkedIn: draf disalin dan pesan ke {first} terbuka, jadi tinggal tempel lalu Kirim',
	'Connect with {first} on LinkedIn first: LinkedIn only lets you message your connections':
		'Terhubunglah dulu dengan {first} di LinkedIn: LinkedIn hanya mengizinkan pesan ke koneksi Anda',
	Email: 'Email',
	'Copy the message, to paste anywhere else': 'Salin pesan, untuk ditempel di tempat lain',
	'Copy the message for {name}': 'Salin pesan untuk {name}',
	'Copy the message': 'Salin pesan',
	'Messages need PRIVACY_URL': 'Pesan memerlukan PRIVACY_URL',
	Copied: 'Tersalin',
	'Copy {first}’s registration link': 'Salin tautan pendaftaran {first}',
	'Copy the registration link': 'Salin tautan pendaftaran',

	// Sent note.
	'Draft copied. In LinkedIn, paste it (⌘V or Ctrl+V) and press Send.':
		'Draf tersalin. Di LinkedIn, tempel (⌘V atau Ctrl+V) lalu tekan Kirim (Send).',
	'The draft couldn’t be copied here:': 'Draf tidak bisa disalin di sini:',
	'copy it': 'salin',
	'and paste it in LinkedIn.': 'lalu tempel di LinkedIn.',
	'Recorded as {kind} on LinkedIn.': 'Dicatat sebagai {kind} di LinkedIn.',
	'Not sent after all: take the record back': 'Ternyata tidak terkirim: urungkan catatannya',
	OK: 'OK',

	// Answer and note.
	Answer: 'Jawaban',
	'Reply from {name}': 'Jawaban dari {name}',
	'Click again to clear the reply': 'Klik lagi untuk menghapus jawaban',
	'Add a note': 'Tambah catatan',
	'Note about {name}': 'Catatan tentang {name}',

	// Owner.
	'Owner: {owner}': 'PIC: {owner}',
	'No owner yet': 'Belum ada PIC',
	'Owner of {name}': 'PIC {name}',
	'{owner} (company)': '{owner} (perusahaan)',
	'No owner': 'Tanpa PIC',

	// The ⋯ menu.
	More: 'Lainnya',
	'More for {name}': 'Lainnya untuk {name}',
	Edit: 'Ubah',
	'Due date…': 'Tenggat…',
	'Merge into…': 'Gabungkan ke…',
	'Record invited on LinkedIn': 'Catat diundang di LinkedIn',
	'Undo the last message recorded for {name}?':
		'Urungkan pesan terakhir yang dicatat untuk {name}?',
	'Undo last recorded message': 'Urungkan pesan terakhir yang dicatat',
	Reviewed: 'Sudah ditinjau',
	'Clear the Dynamics 365 flags on {name}? This is logged.':
		'Hapus tanda Dynamics 365 pada {name}? Tindakan ini dicatat.',
	'Clear D365 flags': 'Hapus tanda D365',
	'Don’t contact {name} again. Why? (kept with the entry)':
		'Jangan hubungi {name} lagi. Alasannya? (disimpan bersama datanya)',
	'Don’t contact again…': 'Jangan hubungi lagi…',
	'Checked in: remove the check-in on the Check-ins tab.':
		'Sudah check-in: hapus check-in di tab Check-in.',
	'Remove {name} from this event?': 'Hapus {name} dari acara ini?',
	Remove: 'Hapus',

	// Edit and merge forms.
	Name: 'Nama',
	'Job title': 'Jabatan',
	Company: 'Perusahaan',
	Mobile: 'Ponsel',
	'Call name': 'Nama panggilan',
	'(after Pak or Bu)': '(setelah Pak atau Bu)',
	Cancel: 'Batal',
	Save: 'Simpan',
	'Merge {name} into {other}? {name}’s record is deleted.':
		'Gabungkan {name} ke {other}? Data {name} akan dihapus.',
	'Merge {name} into…': 'Gabungkan {name} ke…',
	'(the other record stays)': '(data yang lain tetap ada)',
	'Search by name, email or company': 'Cari berdasarkan nama, email, atau perusahaan',
	'No one else matches.': 'Tidak ada orang lain yang cocok.',
	Merge: 'Gabungkan',
	// The message hint from the server (src/lib/server/messaging.ts), shown as a tooltip.
	'Set PRIVACY_URL to message people found by research.':
		'Atur PRIVACY_URL untuk mengirim pesan ke orang yang ditemukan riset.'
};

export default id;
