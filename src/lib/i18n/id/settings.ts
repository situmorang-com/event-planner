// Indonesian for the admin app's settings strings: Settings, Contacts and the sign-in page.
// Keys are the English text exactly as written in the code; a missing key falls back to the
// English.
const id: Record<string, string> = {
	// Words shared across these pages
	Save: 'Simpan',
	Saved: 'Tersimpan',
	Cancel: 'Batal',
	Add: 'Tambah',
	Remove: 'Hapus',
	'Remove…': 'Hapus…',
	Name: 'Nama',
	Email: 'Email',
	Mobile: 'Ponsel',
	Company: 'Perusahaan',
	Reason: 'Alasan',
	Actions: 'Tindakan',
	Who: 'Siapa',
	When: 'Kapan',
	Source: 'Sumber',
	By: 'Oleh',
	Copy: 'Salin',
	Copied: 'Tersalin',
	Merge: 'Gabungkan',
	Unknown: 'Tidak diketahui',

	// Settings
	'Shared by everyone who signs in.': 'Berlaku untuk semua orang yang masuk.',
	'Team names': 'Nama tim',
	'Who can be picked as “me” in the header. The name is stamped on everything that person does: rows they add, people they invite, locks and exports.':
		'Siapa saja yang bisa dipilih sebagai “saya” di header. Nama ini dicatat pada semua yang dilakukan orang tersebut: baris yang ditambahkan, tamu yang diundang, penguncian, dan ekspor.',
	you: 'Anda',
	'Remove {name} from the team? Their past stamps stay as they are.':
		'Hapus {name} dari tim? Catatan namanya yang sudah ada tetap seperti semula.',
	'Remove {name}': 'Hapus {name}',
	'No names yet. Add the people who run events.':
		'Belum ada nama. Tambahkan orang-orang yang mengelola acara.',
	'Name, as you’d like it shown': 'Nama, seperti yang ingin ditampilkan',
	'Type a name first.': 'Ketik nama terlebih dahulu.',

	'API tokens': 'Token API',
	'For the research command on an event’s Planning tab. A token is shown once; only its hash is kept, and anything using a revoked one stops working.':
		'Untuk perintah riset di tab Perencanaan sebuah acara. Token hanya ditampilkan sekali; yang disimpan hanya hash-nya, dan apa pun yang memakai token yang dicabut akan berhenti berfungsi.',
	'Copy this now; it won’t be shown again. Run it in the terminal you’ll research from (or add it to':
		'Salin sekarang; token ini tidak akan ditampilkan lagi. Jalankan di terminal yang akan Anda pakai untuk riset (atau tambahkan ke',
	'created {when}': 'dibuat {when}',
	'last used {when}': 'terakhir dipakai {when}',
	'never used': 'belum pernah dipakai',
	'Revoke this token? Anything using it stops working.':
		'Cabut token ini? Apa pun yang memakainya akan berhenti berfungsi.',
	Revoke: 'Cabut',
	'No tokens yet.': 'Belum ada token.',
	'Label, e.g. Edmund’s MacBook': 'Label, mis. MacBook Edmund',
	'Token label': 'Label token',
	'Create a token': 'Buat token',

	'Phone country': 'Negara nomor telepon',
	'How local numbers such as 0812-3456-7890 are read when nothing says otherwise. New events start with this; each event and company can pick its own.':
		'Cara membaca nomor lokal seperti 0812-3456-7890 jika tidak ada keterangan lain. Acara baru memakai pengaturan ini; setiap acara dan perusahaan bisa memilih sendiri.',
	'Default phone country': 'Negara nomor telepon bawaan',
	'Pick Indonesia or Malaysia.': 'Pilih Indonesia atau Malaysia.',

	'Chase defaults': 'Aturan tindak lanjut bawaan',
	'When a row becomes due (D20): a chase so many working days after the last message, until the cap for that person is reached or the event is too close; a reminder for everyone attending shortly before. Working days are Monday to Friday in the event’s time zone. An event can set its own rules on its Planning tab.':
		'Kapan sebuah baris jatuh tempo (D20): tindak lanjut sekian hari kerja setelah pesan terakhir, sampai batas untuk orang tersebut tercapai atau acara sudah terlalu dekat; pengingat untuk semua yang hadir sesaat sebelumnya. Hari kerja adalah Senin sampai Jumat di zona waktu acara. Sebuah acara bisa menetapkan aturannya sendiri di tab Perencanaan.',
	'Chase after': 'Tindak lanjut setelah',
	'working days': 'hari kerja',
	'Stop chasing': 'Berhenti menindaklanjuti',
	'days before the event': 'hari sebelum acara',
	Remind: 'Ingatkan',
	'Most messages to a customer or past guest': 'Pesan maksimal ke pelanggan atau tamu sebelumnya',
	'Most messages to someone new': 'Pesan maksimal ke orang baru',
	'{field}: a whole number from 0 to {max}.': '{field}: bilangan bulat dari 0 sampai {max}.',
	'Save chase defaults': 'Simpan aturan tindak lanjut bawaan',

	'Message defaults': 'Pesan bawaan',
	'What the WhatsApp and email buttons open, per language. Each person gets the language of their company’s or event’s phone country unless the event picks one. The opt-out line, and for people found by research the source line, are added when a message opens, so they can’t be edited out. A blank box restores the built-in wording.':
		'Isi yang dibuka tombol WhatsApp dan email, per bahasa. Setiap orang mendapat bahasa sesuai negara nomor telepon perusahaan atau acaranya, kecuali acara memilih bahasa tertentu. Baris berhenti berlangganan, dan untuk tamu hasil riset juga baris sumbernya, ditambahkan saat pesan dibuka, sehingga tidak bisa dihapus. Kotak yang dikosongkan akan kembali ke teks bawaan.',
	Indonesian: 'Bahasa Indonesia',
	English: 'Bahasa Inggris',
	Malay: 'Bahasa Melayu',
	'Placeholders:': 'Placeholder:',
	'is the person’s own registration link; the reminder must include it.':
		'adalah tautan pendaftaran milik orang tersebut; pengingat wajib menyertakannya.',
	'Save {language}': 'Simpan {language}',
	'Pick a language.': 'Pilih bahasa.',
	'The reminder must include {link}: it is how people reconfirm.':
		'Pengingat wajib menyertakan {link}: dari situlah tamu mengonfirmasi ulang.',
	'Leave out the opt-out and source lines: they are added to every message automatically.':
		'Jangan sertakan baris opt-out dan sumber: keduanya otomatis ditambahkan ke setiap pesan.',

	Retention: 'Retensi data',
	'What the app deletes by itself, and when. Housekeeping runs when the server starts and once a day after that; an event’s own start step also runs as soon as one of its pages is opened. Every deletion is written to the activity log with ids and counts only.':
		'Apa yang dihapus aplikasi dengan sendirinya, dan kapan. Pembersihan berjalan saat server dinyalakan lalu sekali sehari setelahnya; langkah awal sebuah acara juga berjalan begitu salah satu halamannya dibuka. Setiap penghapusan dicatat di log aktivitas, hanya berisi ID dan jumlah.',
	'Last run {when}.': 'Terakhir berjalan {when}.',
	What: 'Data',
	'Kept until': 'Disimpan sampai',
	'Held now': 'Tersimpan sekarang',
	'Next run removes': 'Dihapus di proses berikutnya',
	'Research finds nobody approved': 'Hasil riset yang tidak disetujui siapa pun',
	'the event starts': 'acara dimulai',
	'Research finds that were skipped': 'Hasil riset yang dilewati',
	'{n} days after the event starts, or Delete planning data':
		'{n} hari setelah acara dimulai, atau saat Hapus data perencanaan',
	'People found by research or typed in who never replied':
		'Orang hasil riset atau yang diketik manual yang tidak pernah membalas',
	'{n} months after their last event': '{n} bulan setelah acara terakhir mereka',
	'Past attendees in Indonesia who never ticked “future events”':
		'Peserta lama di Indonesia yang tidak pernah mencentang “acara berikutnya”',
	'{n} days after the notice, unless they reply':
		'{n} hari setelah pemberitahuan, kecuali mereka membalas',
	'Attendees, customers and anyone who replied': 'Peserta, pelanggan, dan siapa pun yang membalas',
	'deleted by hand': 'dihapus secara manual',
	'Touch and activity logs': 'Log kontak dan aktivitas',
	'with the row or the event': 'bersama baris atau acaranya',
	'Do-not-contact entries': 'Entri daftar jangan dihubungi',
	'forever; removed by hand, with a reason': 'selamanya; dihapus secara manual, dengan alasan',

	'Do-not-contact list': 'Daftar jangan dihubungi',
	'People who asked not to hear from us. Only a hash of each email, mobile or name is kept, so the list shows masked labels. Anyone it matches is locked: no message buttons, channels blanked in exports, refused on every list. It never expires; an entry comes off only by hand, with a reason, and that is logged.':
		'Orang yang meminta untuk tidak dihubungi lagi. Yang disimpan hanya hash dari setiap email, nomor ponsel, atau nama, sehingga daftar ini menampilkan label yang disamarkan. Siapa pun yang cocok akan dikunci: tanpa tombol pesan, kontaknya dikosongkan di ekspor, dan ditolak di setiap daftar. Daftar ini tidak pernah kedaluwarsa; entri hanya bisa dihapus secara manual, dengan alasan, dan hal itu dicatat.',
	'Added.': 'Ditambahkan.',
	'Nobody in the pool matches it yet; anyone who turns up later is refused.':
		'Belum ada yang cocok di basis data; siapa pun yang muncul nanti akan ditolak.',
	'{n} person in the pool locked.': '{n} orang di basis data dikunci.',
	'{n} people in the pool locked.': '{n} orang di basis data dikunci.',
	'Name + company': 'Nama + perusahaan',
	Staff: 'Staf',
	staff: 'staf',
	'Replied STOP': 'Membalas STOP',
	'Not me': 'Bukan saya',
	'Remove me': 'Hapus saya',
	'removed {when} by {who}: {reason}': 'dihapus {when} oleh {who}: {reason}',
	'Why it comes off': 'Alasan dihapus',
	'Reason for removing {label}': 'Alasan menghapus {label}',
	'Nobody is on the list.': 'Belum ada siapa pun di daftar.',
	'Hide removed entries': 'Sembunyikan entri yang dihapus',
	'Show removed entries': 'Tampilkan entri yang dihapus',
	'Add by hand': 'Tambah secara manual',
	'What to block': 'Yang diblokir',
	'Email, mobile or name': 'Email, nomor ponsel, atau nama',
	'for a name': 'untuk nama',
	'Asked by email on 2 Oct': 'Diminta lewat email pada 2 Okt',
	'Add to the list': 'Tambahkan ke daftar',
	'Pick what to block.': 'Pilih yang akan diblokir.',
	'Check the email.': 'Periksa email.',
	'Check the mobile number.': 'Periksa nomor ponselnya.',
	'Type the person’s name.': 'Ketik nama orangnya.',
	'Nothing to block in that.': 'Tidak ada yang bisa diblokir dari isian itu.',
	'That entry is gone.': 'Entri itu sudah tidak ada.',
	'Say why it comes off the list.': 'Tuliskan alasan entri ini dihapus dari daftar.',

	// Contacts
	'{n} prospects: found or typed, never replied, attended or registered':
		'{n} prospek: hasil riset atau diketik manual, belum pernah membalas, hadir, atau mendaftar',
	'{n} people who attended, replied or registered, matched by email, mobile, LinkedIn and name across every event':
		'{n} orang yang pernah hadir, membalas, atau mendaftar, dicocokkan lewat email, nomor ponsel, LinkedIn, dan nama di semua acara',
	'Export CSV': 'Ekspor CSV',
	'Everyone else in the pool': 'Semua orang lain di basis data',
	'Prospects CSV': 'CSV prospek',
	'Search contacts': 'Cari kontak',
	'Search name, email, company or mobile': 'Cari nama, email, perusahaan, atau nomor ponsel',
	'People found or typed before, who never replied, attended or registered':
		'Orang hasil riset atau yang pernah diketik manual, yang belum pernah membalas, hadir, atau mendaftar',
	Prospects: 'Prospek',
	'{n} match': '{n} cocok',
	'{n} matches': '{n} cocok',
	'No one matches “{q}”.': 'Tidak ada yang cocok dengan “{q}”.',
	'No prospects: everyone in the pool has attended, replied or registered.':
		'Tidak ada prospek: semua orang di basis data sudah pernah hadir, membalas, atau mendaftar.',
	'Contacts appear here as soon as people check in, reply or register.':
		'Kontak muncul di sini begitu ada yang check-in, membalas, atau mendaftar.',
	Origin: 'Asal',
	Country: 'Negara',
	'Last seen': 'Terakhir terlihat',
	Kept: 'Disimpan',
	'Do not contact': 'Jangan dihubungi',
	Locked: 'Dikunci',
	'added by staff': 'ditambahkan oleh staf',
	'replied STOP': 'membalas STOP',
	'said “not me”': 'menjawab “bukan saya”',
	'asked to be removed': 'meminta dihapus',
	'Open in WhatsApp': 'Buka di WhatsApp',
	Registered: 'Mendaftar sendiri',
	'Checked in': 'Sudah check-in',
	Typed: 'Diketik manual',
	Research: 'Riset',
	'Ticked the future-events box': 'Mencentang kotak acara berikutnya',
	'Future events: yes, {date}': 'Acara berikutnya: ya, {date}',
	'Country of {name}': 'Negara {name}',
	'Legacy: until the notice is sent': 'Lama: sampai pemberitahuan dikirim',
	'Until {date} unless they reply': 'Sampai {date} kecuali mereka membalas',
	'Until deleted': 'Sampai dihapus',
	'Until {date}': 'Sampai {date}',
	'Merge into another record': 'Gabungkan ke data lain',
	'Merge {name} into…': 'Gabungkan {name} ke…',
	'Permanently delete {name}, their check-in history and every event row they are on? This is logged.':
		'Hapus permanen {name}, riwayat check-in, dan setiap baris acara yang memuatnya? Tindakan ini dicatat.',
	'Delete contact': 'Hapus kontak',
	'Delete {name}': 'Hapus {name}',
	'Merge {name} into {survivor}? {name}’s record is deleted.':
		'Gabungkan {name} ke {survivor}? Data {name} akan dihapus.',
	'(the other record stays)': '(data yang lain tetap ada)',
	'Search by name, email or company': 'Cari berdasarkan nama, email, atau perusahaan',
	'No one else matches.': 'Tidak ada orang lain yang cocok.',
	'Pick who to keep.': 'Pilih siapa yang dipertahankan.',
	'Those two can’t be merged.': 'Keduanya tidak bisa digabungkan.',

	// Sign in
	'Sign in': 'Masuk',
	'Organizer sign in': 'Masuk sebagai penyelenggara',
	'Run check-in, watch arrivals and export contacts.':
		'Jalankan check-in, pantau kedatangan, dan ekspor kontak.',
	'Sign-in is switched off until an': 'Fitur masuk dinonaktifkan sampai variabel lingkungan',
	'environment variable is set on the server.': 'diatur di server.',
	'Local development: the password is': 'Pengembangan lokal: kata sandinya',
	'until you set ADMIN_PASSWORD.': 'sampai Anda mengatur ADMIN_PASSWORD.',
	Password: 'Kata sandi',
	'Too many attempts. Wait a minute and try again.':
		'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
	'That password isn’t right.': 'Kata sandi itu salah.'
};

export default id;
