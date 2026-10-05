// Indonesian for the admin app's planning strings. Keys are the English text exactly as written in
// the code; a missing key falls back to the English.
const id: Record<string, string> = {
	// Page head
	Planning: 'Perencanaan',
	'Check-in open': 'Check-in dibuka',
	'Check-in closed': 'Check-in ditutup',
	'Set the event date first': 'Atur tanggal acara terlebih dahulu',
	'Research keeps what it finds until the event starts, so it needs to know when that is.':
		'Riset menyimpan temuannya sampai acara dimulai, jadi riset perlu tahu kapan acaranya.',
	'Event settings': 'Pengaturan acara',

	// 1. Who should come?
	'Who should come?': 'Siapa yang perlu hadir?',
	'Claude researches against these answers, so the more specific the better.':
		'Claude melakukan riset berdasarkan jawaban ini, jadi makin spesifik makin baik.',
	'What is the event for?': 'Untuk apa acara ini?',
	'A breakfast briefing on Dynamics 365 Finance for manufacturers planning to replace their ERP in the next two years.':
		'Sarapan bersama dan pemaparan Dynamics 365 Finance untuk perusahaan manufaktur yang berencana mengganti ERP dalam dua tahun ke depan.',
	'Which roles or job titles?': 'Peran atau jabatan apa saja?',
	'CIO, CFO, Head of IT, ERP project lead': 'CIO, CFO, Kepala IT, pimpinan proyek ERP',
	'How senior?': 'Senioritas?',
	'Which departments?': 'Departemen apa saja?',
	'Others, comma-separated': 'Lainnya, pisahkan dengan koma',
	'Other departments': 'Departemen lain',
	'At most how many per company?': 'Maksimal berapa orang per perusahaan?',
	'Who should be left out?': 'Siapa yang tidak perlu diundang?',
	'Competitors, interns, people our sales team already meets':
		'Pesaing, karyawan magang, orang yang sudah rutin ditemui tim sales kita',
	'Roles and companies, not names: the brief Claude gets counts the people already known per company and never carries a name, so a line naming someone is left out of it.':
		'Tulis peran dan perusahaan, bukan nama: brief yang diterima Claude hanya menghitung orang yang sudah dikenal per perusahaan dan tidak pernah memuat nama, jadi baris yang menyebut nama seseorang tidak diikutkan.',
	Saved: 'Tersimpan',
	'Save answers': 'Simpan jawaban',

	// Seniority and department options (stored in English; shown translated)
	'C-level / owner': 'C-level / pemilik',
	'VP / Director': 'VP / Direktur',
	'Head / Manager': 'Kepala / Manajer',
	'Specialist / Lead': 'Spesialis / Lead',
	Executive: 'Eksekutif',
	IT: 'IT',
	Finance: 'Keuangan',
	Operations: 'Operasional',
	'Supply chain': 'Rantai pasok',
	'Sales & marketing': 'Penjualan & pemasaran',
	HR: 'SDM',

	// 2. Target companies
	'Target companies': 'Perusahaan target',
	'The companies to find people at. Add a focus to change the brief for one company (roles and departments, not names). The tick says whether the next run researches it: by default, until {n} contactable person is known there. A company researched in the last 24 hours is left out of the next run; the command takes the rest {cap} at a time.':
		'Perusahaan tempat mencari orang. Tambahkan fokus untuk mengubah brief bagi satu perusahaan (peran dan departemen, bukan nama). Centang menentukan apakah riset berikutnya meneliti perusahaan itu: secara bawaan, sampai {n} orang yang bisa dihubungi dikenal di sana. Perusahaan yang diriset dalam 24 jam terakhir tidak diikutkan di riset berikutnya; perintahnya mengerjakan sisanya {cap} sekaligus.',
	'The companies to find people at. Add a focus to change the brief for one company (roles and departments, not names). The tick says whether the next run researches it: by default, until {n} contactable people are known there. A company researched in the last 24 hours is left out of the next run; the command takes the rest {cap} at a time.':
		'Perusahaan tempat mencari orang. Tambahkan fokus untuk mengubah brief bagi satu perusahaan (peran dan departemen, bukan nama). Centang menentukan apakah riset berikutnya meneliti perusahaan itu: secara bawaan, sampai {n} orang yang bisa dihubungi dikenal di sana. Perusahaan yang diriset dalam 24 jam terakhir tidak diikutkan di riset berikutnya; perintahnya mengerjakan sisanya {cap} sekaligus.',
	'Blocked company': 'Perusahaan diblokir',
	'Research this company': 'Riset perusahaan ini',
	'Research {company}': 'Riset {company}',
	'{n} on the list': '{n} di daftar',
	'{n} to review': '{n} perlu ditinjau',
	'Phone country, set on the People tab': 'Negara telepon, diatur di tab Tamu',
	blocked: 'diblokir',
	'research by default': 'diriset secara bawaan',
	'{n} known, not researched': '{n} dikenal, tidak diriset',
	'researched {date}': 'diriset {date}',
	'requested {date}': 'diminta {date}',
	'Back to the computed default': 'Kembali ke bawaan yang dihitung',
	default: 'bawaan',
	'Focus for this company: roles and departments, not names':
		'Fokus untuk perusahaan ini: peran dan departemen, bukan nama',
	'Focus for {company}': 'Fokus untuk {company}',
	'Remove {company} from the targets? Its guests stay on the list.':
		'Hapus {company} dari target? Tamunya tetap ada di daftar.',
	'Remove {company}': 'Hapus {company}',
	'Companies to add': 'Perusahaan yang ditambahkan',
	'One company per line, with its website if you know it:':
		'Satu perusahaan per baris, beserta situs webnya jika Anda tahu:',
	'Added {n}': 'Ditambahkan {n}',
	'; {companies} already listed': '; {companies} sudah ada di daftar',
	'Add companies': 'Tambah perusahaan',
	'Add at least one company name.': 'Tambahkan setidaknya satu nama perusahaan.',

	// Copy from another event
	'Replace this event’s answers to “Who should come?” with {event}’s? Cancel keeps your answers; the companies are copied either way.':
		'Ganti jawaban acara ini untuk “Siapa yang perlu hadir?” dengan jawaban dari {event}? Batal mempertahankan jawaban Anda; perusahaannya tetap disalin.',
	'Copy brief + targets from…': 'Salin brief + target dari…',
	'Another event': 'Acara lain',
	'{n} company': '{n} perusahaan',
	'{n} companies': '{n} perusahaan',
	brief: 'brief',
	Copy: 'Salin',
	Copied: 'Tersalin',
	'Copied the brief and {companies}': 'Brief dan {companies} disalin',
	'Copied {companies}': '{companies} disalin',
	'{n} already listed': '{n} sudah ada di daftar',
	'your answers kept': 'jawaban Anda dipertahankan',
	'{parts} from {event}.': '{parts} dari {event}.',
	'Pick an event to copy from.': 'Pilih acara yang akan disalin.',

	// Dynamics 365 accounts
	'Paste a Dynamics 365 accounts export': 'Tempel ekspor akun Dynamics 365',
	'Open an Accounts view in Dynamics 365, export or copy it with its header row ({columns}) and paste it here. Each account becomes a target company recorded as a customer; its owner becomes the company’s owner when it names a team member and nobody owns it yet, otherwise it is kept as a note. The primary contact and phone are not kept: add people on the People tab.':
		'Buka tampilan Accounts di Dynamics 365, ekspor atau salin beserta baris judulnya ({columns}), lalu tempel di sini. Setiap akun menjadi perusahaan target yang dicatat sebagai pelanggan; owner-nya menjadi PIC perusahaan jika namanya anggota tim dan perusahaan itu belum punya PIC, jika tidak disimpan sebagai catatan. Kontak utama dan telepon tidak disimpan: tambahkan orang di tab Tamu.',
	'Dynamics 365 accounts export': 'Ekspor akun Dynamics 365',
	'The app couldn’t tell which column is which. Say what each one holds:':
		'Aplikasi tidak bisa mengenali kolom mana yang mana. Sebutkan isi setiap kolom:',
	'{matched} of {total} columns recognised, {n} company to add. Change any that landed in the wrong place:':
		'{matched} dari {total} kolom dikenali, {n} perusahaan akan ditambahkan. Ubah kolom yang salah tempat:',
	'{matched} of {total} columns recognised, {n} companies to add. Change any that landed in the wrong place:':
		'{matched} dari {total} kolom dikenali, {n} perusahaan akan ditambahkan. Ubah kolom yang salah tempat:',
	'Column {n}': 'Kolom {n}',
	Ignore: 'Abaikan',
	'Account name': 'Nama akun',
	Website: 'Situs web',
	'Primary contact': 'Kontak utama',
	Owner: 'PIC',
	Industry: 'Industri',
	'Main phone': 'Telepon utama',
	'The first line is a header row, not a company': 'Baris pertama adalah judul, bukan perusahaan',
	'{n} line without a name': '{n} baris tanpa nama',
	'{n} lines without a name': '{n} baris tanpa nama',
	'only the first 1000 lines were read': 'hanya 1000 baris pertama yang dibaca',
	'Blocked, not added: {companies}.': 'Diblokir, tidak ditambahkan: {companies}.',
	'Open a CSV file': 'Buka file CSV',
	'Check columns': 'Periksa kolom',
	'Add accounts': 'Tambah akun',
	'That file is too big. Export fewer rows, or paste the ones you need.':
		'File itu terlalu besar. Ekspor lebih sedikit baris, atau tempel yang Anda perlukan saja.',
	'That paste is too big.': 'Teks yang ditempel terlalu besar.',
	'No company names found. Include the header row.':
		'Tidak ada nama perusahaan. Sertakan baris judulnya.',

	// 3. Research
	'Find people with Claude': 'Cari orang dengan Claude',
	'Runs in your terminal with your own Claude Code sign-in. Claude only gets web search, never your Event Planner token, and everything it finds waits on the People tab for your approval.':
		'Berjalan di terminal Anda dengan akun Claude Code Anda sendiri. Claude hanya mendapat pencarian web, tidak pernah token Event Planner Anda, dan semua temuannya menunggu persetujuan Anda di tab Tamu.',
	'The event has started: research still runs, but the list has gone live, so what it finds now is not kept. Found rows nobody approved were deleted when it began.':
		'Acara sudah dimulai: riset tetap berjalan, tetapi daftar sudah aktif, jadi temuan sekarang tidak disimpan. Temuan yang belum disetujui siapa pun sudah dihapus saat acara dimulai.',
	'Add at least one target company first.': 'Tambahkan setidaknya satu perusahaan target dahulu.',
	'Answer “which roles”, “how senior” or “which departments” above and save first.':
		'Jawab “peran apa saja”, “senioritas” atau “departemen apa saja” di atas, lalu simpan dahulu.',
	'The next run researches {n} company': 'Riset berikutnya meneliti {n} perusahaan',
	'The next run researches {n} companies': 'Riset berikutnya meneliti {n} perusahaan',
	', in {batches} batches of up to {cap}, posting each batch back before the next':
		', dalam {batches} batch berisi maksimal {cap}, dan setiap batch dikirim balik sebelum batch berikutnya',
	'; the other ticked company was researched in the last 24 hours and is left out':
		'; satu perusahaan lain yang dicentang sudah diriset dalam 24 jam terakhir dan tidak diikutkan',
	'; the other {n} ticked companies were researched in the last 24 hours and are left out':
		'; {n} perusahaan lain yang dicentang sudah diriset dalam 24 jam terakhir dan tidak diikutkan',
	'The only ticked company was researched in the last 24 hours. Tick another company, or remove and re-add one to research it again today.':
		'Satu-satunya perusahaan yang dicentang sudah diriset dalam 24 jam terakhir. Centang perusahaan lain, atau hapus lalu tambahkan lagi sebuah perusahaan untuk merisetnya lagi hari ini.',
	'All {n} ticked companies were researched in the last 24 hours. Tick another company, or remove and re-add one to research it again today.':
		'Ke-{n} perusahaan yang dicentang sudah diriset dalam 24 jam terakhir. Centang perusahaan lain, atau hapus lalu tambahkan lagi sebuah perusahaan untuk merisetnya lagi hari ini.',
	// researchRefusal (the terminal prints these in English; the page shows them translated)
	'Set the event date first.': 'Atur tanggal acara terlebih dahulu.',
	'Answer “Who should come?” on the Planning page first (roles, seniority or departments).':
		'Jawab “Siapa yang perlu hadir?” di halaman Perencanaan dahulu (peran, senioritas, atau departemen).',
	'Add at least one target company on the Planning page first.':
		'Tambahkan setidaknya satu perusahaan target di halaman Perencanaan dahulu.',
	'No target company is ticked for research.':
		'Belum ada perusahaan target yang dicentang untuk riset.',
	'Access token': 'Token akses',
	'The command reads {variable} from your shell. Create one under {settings} and export it once in the terminal you research from (or in {profile}).':
		'Perintah ini membaca {variable} dari shell Anda. Buat token di {settings}, lalu ekspor sekali di terminal tempat Anda menjalankan riset (atau di {profile}).',
	'Settings › API tokens': 'Pengaturan › Token API',
	Command: 'Perintah',
	"Up to {cap} companies per batch, a few minutes per company; each batch is posted back before the next starts, and Claude's raw answers are saved as {files} files in the folder you run it from. If it stops part-way, run it again: companies researched in the last 24 hours are left out, and people already invited, suggested or dismissed are skipped.":
		'Maksimal {cap} perusahaan per batch, beberapa menit per perusahaan; setiap batch dikirim balik sebelum batch berikutnya dimulai, dan jawaban mentah Claude disimpan sebagai file {files} di folder tempat Anda menjalankannya. Jika berhenti di tengah jalan, jalankan lagi: perusahaan yang diriset dalam 24 jam terakhir tidak diikutkan, dan orang yang sudah diundang, disarankan, atau diabaikan dilewati.',

	// 4. Review
	'Review what it found': 'Tinjau temuannya',
	'{n} person waits under {tab} on the People tab: open the source, then Add or Skip each one.':
		'{n} orang menunggu di {tab} pada tab Tamu: buka sumbernya, lalu Tambah atau Lewati satu per satu.',
	'{n} people wait under {tab} on the People tab: open the source, then Add or Skip each one.':
		'{n} orang menunggu di {tab} pada tab Tamu: buka sumbernya, lalu Tambah atau Lewati satu per satu.',
	'To review': 'Perlu ditinjau',
	'Nothing to review yet. Suggestions appear on the People tab after a run.':
		'Belum ada yang perlu ditinjau. Saran muncul di tab Tamu setelah riset dijalankan.',
	'{n} added so far; anyone added or skipped is not suggested again.':
		'{n} sudah ditambahkan; orang yang sudah ditambahkan atau dilewati tidak disarankan lagi.',
	'Open People': 'Buka Tamu',

	// Planning data (retention)
	'Planning data': 'Data perencanaan',
	'What research finds is personal data with a short life: the names nobody approved go when the event starts, and everything left, skipped names and the research stamps on the companies, goes 90 days after the start. The brief and the target companies stay, so a later event can copy them.':
		'Temuan riset adalah data pribadi yang berumur pendek: nama yang tidak disetujui siapa pun dihapus saat acara dimulai, dan sisanya, yaitu nama yang dilewati dan cap riset pada perusahaan, dihapus 90 hari setelah acara dimulai. Brief dan perusahaan target tetap disimpan, agar acara berikutnya bisa menyalinnya.',
	'Planning data deleted {date}': 'Data perencanaan dihapus {date}',
	'; {n} found since': '; {n} temuan sejak itu',
	'Kept until {date}': 'Disimpan sampai {date}',
	'{n} found row now': '{n} baris temuan saat ini',
	'{n} found rows now': '{n} baris temuan saat ini',
	'Deleted {n}': 'Dihapus {n}',
	'Delete this event’s planning data now? {n} found row goes, with the research stamps. The brief and the companies stay. This is logged.':
		'Hapus data perencanaan acara ini sekarang? {n} baris temuan dihapus, beserta cap risetnya. Brief dan perusahaan tetap ada. Tindakan ini dicatat.',
	'Delete this event’s planning data now? {n} found rows go, with the research stamps. The brief and the companies stay. This is logged.':
		'Hapus data perencanaan acara ini sekarang? {n} baris temuan dihapus, beserta cap risetnya. Brief dan perusahaan tetap ada. Tindakan ini dicatat.',
	'Delete planning data': 'Hapus data perencanaan',

	// Invitation wording
	'Invitation wording': 'Teks undangan',
	'What the WhatsApp and email buttons open for people not yet invited. Leave it blank to use the {link} in each person’s language; text here is sent to everyone on this list as written. The opt-out line is always added at the end.':
		'Teks yang dibuka tombol WhatsApp dan email untuk orang yang belum diundang. Kosongkan untuk memakai {link} dalam bahasa masing-masing orang; teks di sini dikirim apa adanya ke semua orang di daftar ini. Baris berhenti berlangganan (opt-out) selalu ditambahkan di akhir.',
	'message default': 'teks bawaan pesan',
	'This event’s invitation': 'Undangan acara ini',
	'(optional)': '(opsional)',
	'Placeholders:': 'Placeholder:',
	'Blank means the {language} default shown above.':
		'Jika kosong, teks bawaan {language} yang tampil di atas yang dipakai.',
	Indonesian: 'Bahasa Indonesia',
	English: 'Bahasa Inggris',
	Malay: 'Bahasa Melayu',
	'Save wording': 'Simpan teks',
	'Leave out the opt-out and source lines: they are added to every message automatically.':
		'Jangan sertakan baris opt-out dan sumber: keduanya otomatis ditambahkan ke setiap pesan.',

	// Chase rules
	'Chase rules': 'Aturan tindak lanjut',
	'When people on this list become due: a chase so many working days after the last message, until the cap for that person is reached or the event is too close; a reminder shortly before for everyone attending. The {link} apply unless this event sets its own.':
		'Kapan orang di daftar ini perlu dihubungi: tindak lanjut sekian hari kerja setelah pesan terakhir, sampai batas untuk orang itu tercapai atau acara sudah terlalu dekat; pengingat sesaat sebelum acara untuk semua yang hadir. Aturan {link} berlaku kecuali acara ini menetapkan aturannya sendiri.',
	defaults: 'bawaan',
	'Use the defaults': 'Gunakan bawaan',
	'Chase after': 'Tindak lanjut setelah',
	'working days': 'hari kerja',
	'Stop chasing': 'Berhenti menindaklanjuti',
	'days before the event': 'hari sebelum acara',
	Remind: 'Ingatkan',
	'Most messages to a customer or past guest': 'Pesan maksimal ke pelanggan atau tamu sebelumnya',
	'Most messages to someone new': 'Pesan maksimal ke orang baru',
	'{field}: a whole number from 0 to {max}.': '{field}: bilangan bulat dari 0 sampai {max}.',
	'Save chase rules': 'Simpan aturan tindak lanjut',
	'Researched {date}': 'Sudah diriset {date}',
	Researched: 'Sudah diriset',
	'Research again': 'Riset lagi',
	'Put it back in the queue for the next run': 'Masukkan lagi ke antrean riset berikutnya',
	'Every ticked company has been researched. Press Research again on a company, or add new ones, to research more.':
		'Semua perusahaan yang dicentang sudah diriset. Tekan Riset lagi pada sebuah perusahaan, atau tambahkan perusahaan baru, untuk riset berikutnya.',
	'Added in the last {days} days': 'Ditambahkan {days} hari terakhir',
	'{n} new': '{n} baru',
	New: 'Baru',
	'Added since you last opened this page': 'Ditambahkan sejak Anda terakhir membuka halaman ini'
};

export default id;
