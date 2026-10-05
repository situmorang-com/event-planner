// Indonesian for the admin app's people strings. Keys are the English text exactly as written in
// the code; a missing key falls back to the English.
const id: Record<string, string> = {
	// The People tab: header and summary
	People: 'Tamu',
	'Check-in open': 'Check-in dibuka',
	'Check-in closed': 'Check-in ditutup',
	'Copy the open registration link: anyone with it can register, and their row waits for the company owner':
		'Salin tautan pendaftaran terbuka: siapa pun yang memilikinya bisa mendaftar, dan barisnya menunggu PIC perusahaan',
	'Copy the registration link': 'Salin tautan pendaftaran',
	Copied: 'Tersalin',
	'Registration link': 'Tautan pendaftaran',
	'For {cohosts}: who said yes, by name only with their consent to share':
		'Untuk {cohosts}: siapa yang menjawab hadir, dengan nama hanya jika mereka setuju dibagikan',
	'For {cohosts}: who checked in, by name only with their consent to share':
		'Untuk {cohosts}: siapa yang sudah check-in, dengan nama hanya jika mereka setuju dibagikan',
	'Partner list · before': 'Daftar mitra · sebelum',
	'Partner list · after': 'Daftar mitra · sesudah',
	'Add people': 'Tambah tamu',
	'Set the event date first': 'Atur tanggal acara terlebih dahulu',
	'The list counts down to the event: invitations, chases and what research may keep all depend on when it is.':
		'Daftar ini menghitung mundur ke acara: undangan, tindak lanjut, dan apa yang boleh disimpan riset semuanya bergantung pada kapan acaranya.',
	'Event settings': 'Pengaturan acara',
	'{n} contact': '{n} kontak',
	'{n} contacts': '{n} kontak',
	'Plan who you’re inviting': 'Rencanakan siapa yang Anda undang',
	'List people company by company, record each reply as it comes in, and see who turns up on the day.':
		'Daftarkan tamu per perusahaan, catat setiap jawaban saat masuk, dan lihat siapa yang datang pada hari-H.',
	Yes: 'Ya',
	'/ {n} target': '/ target {n}',
	'Set a target': 'Atur target',
	'{n} on the list': '{n} di daftar',
	'{n} to review': '{n} perlu ditinjau',
	Confirmed: 'Terkonfirmasi',
	'{n} checked in': '{n} sudah check-in',
	'registered or reconfirmed': 'terdaftar atau konfirmasi ulang',
	'Yes replies against the target': 'Jawaban hadir dibanding target',

	// Toolbar, chips and layout
	'Search the list': 'Cari di daftar',
	'Search names, companies, notes': 'Cari nama, perusahaan, catatan',
	Show: 'Tampilkan',
	'Rows owned by {name}': 'Baris dengan PIC {name}',
	'Pick your name first': 'Pilih nama Anda terlebih dahulu',
	Mine: 'Milik saya',
	'{n} due': '{n} tenggat',
	'Chases and reminders due today or earlier':
		'Tindak lanjut dan pengingat dengan tenggat hari ini atau sebelumnya',
	Due: 'Tenggat',
	'People you sent a LinkedIn connection request: check who accepted':
		'Tamu yang Anda kirimi permintaan koneksi LinkedIn: periksa siapa yang sudah menerima',
	'LinkedIn request sent': 'Permintaan LinkedIn terkirim',
	'Show skipped': 'Tampilkan yang dilewati',
	Layout: 'Tata letak',
	'Select rows for a bulk action': 'Pilih baris untuk tindakan massal',
	'Select rows': 'Pilih baris',
	'By company': 'Per perusahaan',
	'One list, soonest due first': 'Satu daftar, tenggat terdekat dulu',

	// The chips (CHIP_LABEL in $lib/people) and the replies (REPLY_LABEL in $lib/invitations)
	'To review': 'Perlu ditinjau',
	Shortlisted: 'Masuk daftar',
	Invited: 'Diundang',
	Attending: 'Hadir',
	Tentative: 'Mungkin',
	Declined: 'Menolak',
	'Checked in': 'Sudah check-in',
	'No-show': 'Tidak datang',
	Skipped: 'Dilewati',
	'No reply': 'Belum menjawab',

	// "How this list works"
	'How this list works': 'Cara kerja daftar ini',
	Steps: 'Tahap',
	'Everyone you add moves along the same five steps: <strong>Shortlisted</strong> → <strong>Invited</strong> → <strong>Replied</strong> (Attending, Tentative or Declined) → <strong>Confirmed</strong> (registered through their link) → <strong>Checked in</strong>. The track on each row shows where they are, and <strong>Next</strong> says what to do.':
		'Setiap tamu yang Anda tambahkan melewati lima tahap yang sama: <strong>Masuk daftar</strong> → <strong>Diundang</strong> → <strong>Menjawab</strong> (Hadir, Mungkin, atau Menolak) → <strong>Terkonfirmasi</strong> (mendaftar lewat tautannya) → <strong>Sudah check-in</strong>. Jalur di setiap baris menunjukkan posisi mereka, dan <strong>Berikutnya</strong> memberi tahu apa yang perlu dilakukan.',
	Answer: 'Jawaban',
	'Record what they said: <strong>Attending</strong>, <strong>Tentative</strong> or <strong>Declined</strong>. Tap it again to clear it.':
		'Catat jawaban mereka: <strong>Hadir</strong>, <strong>Mungkin</strong>, atau <strong>Menolak</strong>. Ketuk lagi untuk menghapusnya.',
	Send: 'Kirim',
	'Pick which message, then the channel: <strong>WhatsApp</strong>, <strong>Email</strong> or <strong>LinkedIn</strong>. The message is the invitation, a chase if they haven’t answered, a reminder before the event, or a thank-you or follow-up after they answer; it is not a step, and the right one is picked for you. LinkedIn can’t take the text in a link, so its button copies the draft and opens a message to them: paste (⌘V) and press Send. Every send is recorded and moves them on.':
		'Pilih pesannya, lalu salurannya: <strong>WhatsApp</strong>, <strong>Email</strong>, atau <strong>LinkedIn</strong>. Pesannya bisa berupa undangan, tindak lanjut jika mereka belum menjawab, pengingat sebelum acara, atau ucapan terima kasih atau tindak lanjut setelah mereka menjawab; pesan bukan tahap, dan yang tepat sudah dipilihkan untuk Anda. LinkedIn tidak bisa menerima teks lewat tautan, jadi tombolnya menyalin draf dan membuka pesan ke mereka: tempel (⌘V) lalu tekan Kirim. Setiap pengiriman dicatat dan memajukan tahap mereka.',
	'Your connection with them: <strong>Not connected</strong> → <strong>Request sent</strong> → <strong>Connected</strong>. <strong>Connect</strong> opens their profile to send the request and records it; press <strong>They accepted</strong> when they do (the <strong>LinkedIn request sent</strong> filter lists who to check). LinkedIn only lets you message connections, so the LinkedIn send button waits for this. Fix it from the ⋯ menu any time.':
		'Koneksi Anda dengan mereka: <strong>Belum terhubung</strong> → <strong>Permintaan terkirim</strong> → <strong>Terhubung</strong>. <strong>Hubungkan</strong> membuka profil mereka untuk mengirim permintaan dan mencatatnya; tekan <strong>Sudah diterima</strong> saat mereka menerimanya (filter <strong>Permintaan LinkedIn terkirim</strong> menampilkan siapa yang perlu diperiksa). LinkedIn hanya mengizinkan pesan ke koneksi, jadi tombol kirim LinkedIn menunggu langkah ini. Perbaiki kapan saja dari menu ⋯.',

	// Banners
	'Couldn’t add {names}: locked or at a blocked company.':
		'Tidak bisa menambahkan {names}: dikunci atau di perusahaan yang diblokir.',
	'Open {name}': 'Buka {name}',
	'Swipe a row under To review to the right to add them, or left to skip. Hold a company name to add everyone waiting there.':
		'Geser baris di Perlu ditinjau ke kanan untuk menambahkannya, atau ke kiri untuk melewatinya. Tahan nama perusahaan untuk menambahkan semua yang menunggu di sana.',
	'Got it': 'Mengerti',
	'Shortlisted {people}.': '{people} masuk daftar.',
	'Skipped {people}.': '{people} dilewati.',
	'Marked {people} invited.': '{people} ditandai diundang.',
	'Owner set on {people}.': 'PIC diatur untuk {people}.',
	'Stage set on {people}.': 'Tahap diatur untuk {people}.',
	'Copied {people} to {event}.': '{people} disalin ke {event}.',
	'Copied {people}.': '{people} disalin.',
	'Done for {people}.': 'Selesai untuk {people}.',
	'Not this one: {list}.': 'Kecuali yang ini: {list}.',
	'Not these {n}: {list}.': 'Kecuali {n} ini: {list}.',
	'{n} person': '{n} orang',
	'{n} people': '{n} orang',
	'{n} attending': '{n} hadir',

	// Company groups
	'Company name': 'Nama perusahaan',
	Save: 'Simpan',
	Cancel: 'Batal',
	'Select everyone at {company}': 'Pilih semua di {company}',
	'no company': 'tanpa perusahaan',
	'No company': 'Tanpa perusahaan',
	'Rename company': 'Ganti nama perusahaan',
	'Rename {name}': 'Ganti nama {name}',
	'Blocked company': 'Perusahaan diblokir',
	Blocked: 'Diblokir',
	'Phone country for {name}': 'Negara telepon untuk {name}',
	'Phone country: reads local numbers and picks the message language':
		'Negara telepon: membaca nomor lokal dan memilih bahasa pesan',
	'Event’s country': 'Negara acara',
	'Owner of {name}': 'PIC {name}',
	'No owner': 'Tanpa PIC',
	'Unblock {name}? People there can be added again.':
		'Buka blokir {name}? Orang di sana bisa ditambahkan lagi.',
	Unblock: 'Buka blokir',
	'Block {name}: nobody there can be added, researched or messaged. Why?':
		'Blokir {name}: tidak ada orang di sana yang bisa ditambahkan, diriset, atau dikirimi pesan. Alasannya?',
	'Block company': 'Blokir perusahaan',
	'Block…': 'Blokir…',
	'Add all {n}': 'Tambah semua {n}',
	'Skip all': 'Lewati semua',
	'Shortlist all {n} at {company}? They become people on the list.':
		'Masukkan semua {n} di {company} ke daftar? Mereka menjadi tamu di daftar.',

	// No match
	'No one matches “{query}”': 'Tidak ada yang cocok dengan “{query}”',
	'No one here': 'Tidak ada siapa pun di sini',
	'under {chips}': 'di {chips}',
	'due today': 'dengan tenggat hari ini',
	'waiting on a LinkedIn request': 'yang menunggu permintaan LinkedIn',
	'of yours': 'milik Anda',
	'Show everyone': 'Tampilkan semua',

	// The bulk bar
	'Copy {people} to {event}?': 'Salin {people} ke {event}?',
	'Bulk actions': 'Tindakan massal',
	selected: 'dipilih',
	'Clear all': 'Hapus semua pilihan',
	'Select all shown': 'Pilih semua yang tampil',
	'Invited via': 'Diundang lewat',
	Other: 'Lainnya',
	Email: 'Email',
	Shortlist: 'Masukkan ke daftar',
	Skip: 'Lewati',
	'Mark invited…': 'Tandai diundang…',
	'Set owner': 'Atur PIC',
	'Set owner…': 'Atur PIC…',
	'No owner (company’s)': 'Tanpa PIC (ikut perusahaan)',
	'Set stage': 'Atur tahap',
	'Set stage…': 'Atur tahap…',
	'Copy to another event': 'Salin ke acara lain',
	'Copy to event…': 'Salin ke acara…',
	Done: 'Selesai',

	// Server messages shown on the page
	'Start each line with the person’s name.': 'Awali setiap baris dengan nama orangnya.',
	'Add at least one name.': 'Tambahkan setidaknya satu nama.',
	'Name is required.': 'Nama wajib diisi.',
	'Check the email.': 'Periksa email.',
	'Use a profile link: linkedin.com/in/…': 'Gunakan tautan profil: linkedin.com/in/…',
	'Those details are on the do-not-contact list.': 'Data itu ada di daftar jangan dihubungi.',
	'They have checked in. Remove the check-in on the Check-ins tab instead.':
		'Mereka sudah check-in. Hapus check-in-nya di tab Check-in.',
	'Give the company a name.': 'Beri nama perusahaannya.',
	'Pick Indonesia, Malaysia or the event’s country.':
		'Pilih Indonesia, Malaysia, atau negara acara.',
	'That company is gone.': 'Perusahaan itu sudah tidak ada.',
	'That row is gone.': 'Baris itu sudah tidak ada.',
	'{name}: {reason}.': '{name}: {reason}.',
	'Pick some rows first.': 'Pilih beberapa baris terlebih dahulu.',
	'Say how they were invited.': 'Sebutkan bagaimana mereka diundang.',
	'Only Shortlisted and Invited can be set in bulk.':
		'Hanya Masuk daftar dan Diundang yang bisa diatur secara massal.',
	'Pick an event with a date to copy to.': 'Pilih acara bertanggal sebagai tujuan salinan.',
	'That date doesn’t look right.': 'Tanggal itu sepertinya tidak benar.',
	'Pick who to keep.': 'Pilih siapa yang dipertahankan.',
	'Those two can’t be merged.': 'Keduanya tidak bisa digabungkan.',

	// Why a row was refused (the reasons from $lib/server/bulk and event-people)
	'blocked company': 'perusahaan diblokir',
	'do not contact': 'jangan dihubungi',
	locked: 'dikunci',
	suppressed: 'dikecualikan (D365)',
	'not on this event': 'tidak ada di acara ini',
	'not on the list yet': 'belum ada di daftar',
	'already on the list': 'sudah ada di daftar',
	'not at that stage': 'tidak di tahap itu',
	skipped: 'dilewati',

	// Quick add
	'Add someone from {company}': 'Tambah seseorang dari {company}',
	'Add someone': 'Tambah seseorang',
	'Parked under To review.': 'Disimpan di Perlu ditinjau.',
	'{name} is already on the list.': '{name} sudah ada di daftar.',
	'They are already on the list.': 'Mereka sudah ada di daftar.',
	Add: 'Tambah',

	// Add people
	'{names} and {n} others': '{names} dan {n} lainnya',
	'Added {n} person from {company}.': '{n} orang dari {company} ditambahkan.',
	'Added {n} people from {company}.': '{n} orang dari {company} ditambahkan.',
	'Added {n} person.': '{n} orang ditambahkan.',
	'Added {n} people.': '{n} orang ditambahkan.',
	'{n} person waits under To review.': '{n} orang menunggu di Perlu ditinjau.',
	'{n} people wait under To review.': '{n} orang menunggu di Perlu ditinjau.',
	'{names} was already on the list.': '{names} sudah ada di daftar.',
	'{names} were already on the list.': '{names} sudah ada di daftar.',
	'Couldn’t add {names}.': 'Tidak bisa menambahkan {names}.',
	'Skipped {n} line without a name. Use “Check each field” to fill it in.':
		'{n} baris tanpa nama dilewati. Gunakan “Periksa setiap kolom” untuk mengisinya.',
	'Skipped {n} lines without a name. Use “Check each field” to fill them in.':
		'{n} baris tanpa nama dilewati. Gunakan “Periksa setiap kolom” untuk mengisinya.',
	'Only the first 1,000 lines were read.': 'Hanya 1.000 baris pertama yang dibaca.',
	'Couldn’t split those lines. Please try again.':
		'Baris-baris itu tidak bisa dipisahkan. Silakan coba lagi.',
	'That file is too big. Export fewer rows, or paste the ones you need.':
		'File itu terlalu besar. Ekspor lebih sedikit baris, atau tempel yang Anda perlukan saja.',
	'That didn’t work. Please try again.': 'Itu tidak berhasil. Silakan coba lagi.',
	Suppressed: 'Dikecualikan',
	'No email': 'Tanpa email',
	'No calls': 'Tanpa telepon',
	'Owner {name}': 'PIC {name}',
	'Add to the list': 'Tambahkan ke daftar',
	'Park {n} for review': 'Simpan {n} untuk ditinjau',
	'Add {n} to the list': 'Tambahkan {n} ke daftar',
	'Start the list': 'Mulai daftarnya',
	'List who you’re inviting, company by company, then record each reply as it comes in. On the day, everyone who checks in is ticked off.':
		'Daftarkan siapa yang Anda undang, per perusahaan, lalu catat setiap jawaban saat masuk. Pada hari-H, setiap orang yang check-in langsung tercentang.',
	'Pick people from the pool, type names, or paste rows from a spreadsheet.':
		'Pilih orang dari kumpulan kontak, ketik nama, atau tempel baris dari spreadsheet.',
	Close: 'Tutup',
	Company: 'Perusahaan',
	'Already known': 'Sudah dikenal',
	'{n} at {company}': '{n} di {company}',
	'People found or typed before, who never replied or attended':
		'Orang yang pernah ditemukan atau diketik, yang belum pernah menjawab atau hadir',
	Prospects: 'Prospek',
	Clear: 'Kosongkan',
	'Select all': 'Pilih semua',
	'On the list': 'Ada di daftar',
	'No prospects at this company.': 'Tidak ada prospek di perusahaan ini.',
	'Only prospects here so far.': 'Sejauh ini hanya ada prospek di sini.',
	'Check each person': 'Periksa setiap orang',
	'nothing is saved until you add them': 'belum ada yang disimpan sampai Anda menambahkannya',
	'Change columns': 'Ubah kolom',
	'Edit as text': 'Ubah sebagai teks',
	'A Dynamics 365 export: everyone here is recorded as a customer, and the <em>do not email</em>, <em>do not phone</em> and marketing flags are honoured. Rows marked <strong>Suppressed</strong> wait under To review and can’t be added.':
		'Ekspor Dynamics 365: semua orang di sini dicatat sebagai pelanggan, dan penanda <em>jangan email</em>, <em>jangan telepon</em>, serta pemasaran dipatuhi. Baris bertanda <strong>Dikecualikan</strong> menunggu di Perlu ditinjau dan tidak bisa ditambahkan.',
	'The app couldn’t tell which column is which. Say what each one holds:':
		'Aplikasi tidak bisa mengenali kolom mana yang mana. Sebutkan isi setiap kolom:',
	'{matched} of {total} columns recognised. Change any that landed in the wrong place:':
		'{matched} dari {total} kolom dikenali. Ubah yang masuk ke tempat yang salah:',
	'Column {n}': 'Kolom {n}',
	Ignore: 'Abaikan',
	'The first line is a header row, not a person.': 'Baris pertama adalah baris judul, bukan orang.',
	'Remove this row': 'Hapus baris ini',
	'Remove row {n}': 'Hapus baris {n}',
	Name: 'Nama',
	'Not in the link: type it': 'Tidak ada di tautan: ketik namanya',
	'Job title': 'Jabatan',
	Mobile: 'Ponsel',
	Reply: 'Jawaban',
	Note: 'Catatan',
	'Add a row': 'Tambah baris',
	'Anyone else': 'Orang lain',
	Names: 'Nama',
	'One person per line. After the name you can add a job title, email, mobile or LinkedIn link, separated by commas; a LinkedIn link on its own is enough. Pasting from a spreadsheet or a Dynamics 365 export? Include its header row (Name, Company, Email, Mobile…) and each column lands in the right place. Use <strong>Check each field</strong> to see and fix every field before anything is saved.':
		'Satu orang per baris. Setelah nama, Anda bisa menambahkan jabatan, email, ponsel, atau tautan LinkedIn, dipisahkan koma; tautan LinkedIn saja sudah cukup. Menempel dari spreadsheet atau ekspor Dynamics 365? Sertakan baris judulnya (Name, Company, Email, Mobile…) dan setiap kolom akan masuk ke tempat yang benar. Gunakan <strong>Periksa setiap kolom</strong> untuk melihat dan memperbaiki setiap kolom sebelum apa pun disimpan.',
	'Open a CSV file': 'Buka file CSV',
	'A spreadsheet or D365 export saved as CSV; it is read the same way.':
		'Spreadsheet atau ekspor D365 yang disimpan sebagai CSV; dibaca dengan cara yang sama.',
	'Park as Found: they wait under <strong>To review</strong> instead of joining the list now.':
		'Simpan sebagai Ditemukan: mereka menunggu di <strong>Perlu ditinjau</strong> alih-alih langsung masuk daftar.',
	'Lists over {n} rows always do.': 'Daftar lebih dari {n} baris selalu begitu.',
	'Where did you get their details?': 'Dari mana Anda mendapatkan data mereka?',
	'(asked once)': '(ditanyakan sekali)',
	'Business cards from the expo, a partner’s list…': 'Kartu nama dari pameran, daftar dari mitra…',
	'Check each field': 'Periksa setiap kolom',

	// The column names a paste can map to (COLUMN_LABEL in $lib/server/guest-list)
	'First name': 'Nama depan',
	'Middle name': 'Nama tengah',
	'Last name': 'Nama belakang',
	LinkedIn: 'LinkedIn',
	'Owner (D365)': 'PIC (D365)',
	'Do not email (D365)': 'Jangan email (D365)',
	'Do not phone (D365)': 'Jangan telepon (D365)',
	'Marketing materials (D365)': 'Materi pemasaran (D365)',
	'Status (D365)': 'Status (D365)',

	// The reply bar
	'{reply}: {n} of {total}': '{reply}: {n} dari {total}',
	// The add form's per-row problems (reviewedGuests in src/lib/server/people-page.ts).
	'Those rows didn’t arrive intact. Please try again.':
		'Baris-baris itu tidak terkirim utuh. Silakan coba lagi.',
	'Row {n}': 'Baris {n}',
	'Row {n} ({name})': 'Baris {n} ({name})',
	'{which} needs a name.': '{which} perlu nama.',
	'{which}: check the email.': '{which}: periksa email.',
	'{which}: that isn’t a LinkedIn profile link (linkedin.com/in/…).':
		'{which}: itu bukan tautan profil LinkedIn (linkedin.com/in/…).'
};

export default id;
