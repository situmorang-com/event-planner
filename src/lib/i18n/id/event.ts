// Indonesian for the admin app's event strings. Keys are the English text exactly as written in
// the code; a missing key falls back to the English.
const id: Record<string, string> = {
	// Events list (home)
	'{n} contact in your database': '{n} kontak di database Anda',
	'{n} contacts in your database': '{n} kontak di database Anda',
	'{n} check-in so far': '{n} check-in sejauh ini',
	'{n} check-ins so far': '{n} check-in sejauh ini',
	'New event': 'Acara baru',
	'Create your first event': 'Buat acara pertama Anda',
	'You’ll get a live QR code for the entrance screen (or a printable one), and every attendee who scans it lands in your contact database.':
		'Anda akan mendapatkan kode QR langsung untuk layar pintu masuk (atau versi cetak), dan setiap tamu yang memindainya masuk ke database kontak Anda.',
	'Open {name}': 'Buka {name}',
	'Check-in open': 'Check-in dibuka',
	Closed: 'Ditutup',
	'Entrance screen': 'Layar pintu masuk',
	'Open entrance screen for {name}': 'Buka layar pintu masuk untuk {name}',
	'checked in': 'sudah check-in',
	'latest {ago}': 'terakhir {ago}',
	'Yes {n}': 'Ya {n}',
	'{n} target': 'target {n}',
	'Confirmed {n}': 'Terkonfirmasi {n}',
	'Due today {n}': 'Tenggat hari ini {n}',

	// New event
	'You can change any of this later.': 'Semua ini bisa Anda ubah nanti.',
	Cancel: 'Batal',
	'Create event': 'Buat acara',

	// Event fields
	'Event name': 'Nama acara',
	Starts: 'Mulai',
	Ends: 'Selesai',
	'(optional)': '(opsional)',
	'Time zone: {zone}': 'Zona waktu: {zone}',
	'Registration links stop working then. Blank means six hours after the start.':
		'Tautan pendaftaran berhenti berfungsi pada waktu itu. Jika dikosongkan, berarti enam jam setelah mulai.',
	Venue: 'Lokasi',
	'Grand Ballroom, Jakarta': 'Grand Ballroom, Jakarta',
	Target: 'Target',
	'How many Yes replies you’re aiming for. The People tab counts up to it.':
		'Jumlah jawaban Ya yang Anda targetkan. Tab Tamu menghitung menuju angka ini.',
	'Phone country': 'Negara nomor telepon',
	'Reads local numbers like 0812… and picks the language of messages. A company can choose its own on the People tab.':
		'Membaca nomor lokal seperti 0812… dan menentukan bahasa pesan. Setiap perusahaan dapat memilih sendiri di tab Tamu.',
	'Message language': 'Bahasa pesan',
	'From the phone country': 'Ikuti negara nomor telepon',
	Indonesian: 'Bahasa Indonesia',
	English: 'Bahasa Inggris',
	Malay: 'Bahasa Melayu',
	'Invitations, reminders and the registration page for everyone on the list.':
		'Undangan, pengingat, dan halaman pendaftaran untuk semua orang di daftar.',
	'Co-hosts': 'Penyelenggara bersama',
	'Names the partner in the “share my name, company and title with…” consent box. Leave blank and the box isn’t shown.':
		'Nama mitra di kotak persetujuan “bagikan nama, perusahaan, dan jabatan saya dengan…”. Kosongkan jika kotak itu tidak perlu ditampilkan.',
	'How will people scan?': 'Bagaimana tamu akan memindai?',
	'Live screen': 'Layar langsung',
	Recommended: 'Disarankan',
	'A screen or tablet at the entrance shows a QR code that changes every 20 seconds. Photos of it stop working, so only people in the room can check in.':
		'Layar atau tablet di pintu masuk menampilkan kode QR yang berganti setiap 20 detik. Foto kode itu tidak akan berfungsi, jadi hanya orang yang ada di lokasi yang bisa check-in.',
	'Printed QR': 'QR cetak',
	'One fixed code for posters, table cards and badges. Anyone with the link can check in, so close check-in when the event ends.':
		'Satu kode tetap untuk poster, kartu meja, dan badge. Siapa pun yang punya tautannya bisa check-in, jadi tutup check-in saat acara selesai.',
	// Event form errors (from the server, shown by EventFields)
	'Give the event a name.': 'Beri nama acara ini.',
	'That date doesn’t look right.': 'Tanggal itu sepertinya tidak benar.',
	'Set the start first.': 'Atur waktu mulai terlebih dahulu.',
	'The end comes before the start.': 'Waktu selesai lebih awal dari waktu mulai.',
	'The target is a whole number of people.': 'Target berupa bilangan bulat jumlah orang.',

	// Event tabs
	'Check-ins': 'Check-in',
	People: 'Tamu',
	Planning: 'Perencanaan',
	'{n} to review': '{n} perlu ditinjau',
	'Event sections': 'Bagian acara',

	// QR code, arrivals chart, device split
	'QR code': 'Kode QR',
	'Arrivals per {n} minutes. Use the arrow keys to read each bar.':
		'Kedatangan per {n} menit. Gunakan tombol panah untuk membaca setiap batang.',
	'{n} arrival': '{n} kedatangan',
	'{n} arrivals': '{n} kedatangan',
	'Show as table': 'Tampilkan sebagai tabel',
	Time: 'Waktu',
	Arrivals: 'Kedatangan',
	'Other & staff': 'Lainnya & staf',

	// Event page: Check-ins tab
	'{n} row': '{n} baris',
	'{n} rows': '{n} baris',
	'the {list} list, {rows}': 'daftar {list}, {rows}',
	'Check-in closed': 'Check-in ditutup',
	'Updates arrive live': 'Pembaruan masuk secara langsung',
	'Reconnecting…': 'Menyambungkan ulang…',
	Live: 'Terhubung',
	Connecting: 'Menyambungkan',
	'Planning data deleted {date}': 'Data perencanaan dihapus {date}',
	'Planning data kept until {date}': 'Data perencanaan disimpan hingga {date}',
	'Close check-in': 'Tutup check-in',
	'Open check-in': 'Buka check-in',
	'Event created.': 'Acara dibuat.',
	'Open the entrance screen on a TV, laptop or tablet at the door and people can start scanning.':
		'Buka layar pintu masuk di TV, laptop, atau tablet di pintu, dan tamu bisa mulai memindai.',
	'Download the QR code below and put it on posters or table cards.':
		'Unduh kode QR di bawah ini dan pasang di poster atau kartu meja.',
	'Phones can’t open localhost. Set PUBLIC_BASE_URL, or connect this computer to Wi-Fi so the QR code can use its network address.':
		'Ponsel tidak bisa membuka localhost. Atur PUBLIC_BASE_URL, atau sambungkan komputer ini ke Wi-Fi agar kode QR bisa memakai alamat jaringannya.',
	'Checked in': 'Sudah check-in',
	'New to your database': 'Baru di database Anda',
	'Returning attendees': 'Tamu yang pernah hadir',
	'Busiest {n} minutes': '{n} menit tersibuk',
	'from {time}': 'mulai {time}',
	'Check-ins per {n} minutes': 'Check-in per {n} menit',
	'Arrivals will chart here as soon as people start checking in.':
		'Grafik kedatangan muncul di sini begitu tamu mulai check-in.',
	'The chart fills in once check-ins span a few minutes.':
		'Grafik terisi setelah check-in berlangsung beberapa menit.',
	Devices: 'Perangkat',
	'Which phones people checked in with': 'Ponsel yang dipakai tamu untuk check-in',
	'Live QR code': 'Kode QR langsung',
	'Printable QR code': 'Kode QR cetak',
	'Changes every 20 seconds. Show it on the entrance screen.':
		'Berganti setiap 20 detik. Tampilkan di layar pintu masuk.',
	'One fixed code for posters, badges and table cards.':
		'Satu kode tetap untuk poster, badge, dan kartu meja.',
	'Check-in QR code': 'Kode QR check-in',
	'Live check-in QR code': 'Kode QR check-in langsung',
	'Check-in link': 'Tautan check-in',
	'Copy link': 'Salin tautan',
	'Print poster': 'Cetak poster',
	'Open entrance screen': 'Buka layar pintu masuk',
	'Preview the attendee page': 'Pratinjau halaman tamu',
	Attendees: 'Daftar hadir',
	'{n} checked in': '{n} sudah check-in',
	'Search attendees': 'Cari tamu',
	'Search name, email, company': 'Cari nama, email, perusahaan',
	Add: 'Tambah',
	'For anyone who can’t scan: their phone is flat, or they’d rather not.':
		'Untuk tamu yang tidak bisa memindai: baterai ponselnya habis, atau mereka memilih tidak memindai.',
	Name: 'Nama',
	Email: 'Email',
	Mobile: 'Ponsel',
	Company: 'Perusahaan',
	'Check in': 'Check-in',
	'No one has checked in yet.': 'Belum ada yang check-in.',
	Via: 'Melalui',
	Actions: 'Tindakan',
	Returning: 'Pernah hadir',
	'Remove {name}’s check-in? Their contact stays in the database.':
		'Hapus check-in {name}? Kontaknya tetap ada di database.',
	'Remove check-in': 'Hapus check-in',
	'Remove {name}’s check-in': 'Hapus check-in {name}',
	'No one matches “{query}”.': 'Tidak ada yang cocok dengan “{query}”.',
	Activity: 'Aktivitas',
	'Exports, deletions, locks and merges on this event: who, when and how many':
		'Ekspor, penghapusan, penguncian, dan penggabungan di acara ini: siapa, kapan, dan berapa banyak',
	'Nothing logged yet.': 'Belum ada catatan.',
	Someone: 'Seseorang',
	'Event settings': 'Pengaturan acara',
	Saved: 'Tersimpan',
	'Save changes': 'Simpan perubahan',
	'Delete this event': 'Hapus acara ini',
	'Removes the event and its check-ins. Contacts stay in your database.':
		'Menghapus acara beserta check-in-nya. Kontak tetap ada di database Anda.',
	'Delete “{name}” and its {n} check-in?': 'Hapus “{name}” beserta {n} check-in-nya?',
	'Delete “{name}” and all {n} check-ins?': 'Hapus “{name}” beserta semua {n} check-in-nya?',
	'Delete event': 'Hapus acara',
	// How someone checked in (METHOD_LABEL) and on what (DEVICE_LABEL)
	Form: 'Formulir',
	'Contact card': 'Kartu kontak',
	'One-tap': 'Sekali ketuk',
	Staff: 'Staf',
	Computer: 'Komputer',
	Other: 'Lainnya',
	// The activity log (ACTIVITY_LABEL)
	Exported: 'Diekspor',
	Deleted: 'Dihapus',
	Purged: 'Dibersihkan',
	Imported: 'Diimpor',
	Merged: 'Digabungkan',
	'Bulk action': 'Tindakan massal',
	'Don’t contact again': 'Jangan dihubungi lagi',
	'Taken off the do-not-contact list': 'Dikeluarkan dari daftar jangan dihubungi',
	// Add-attendee errors (from the server)
	'Name is required.': 'Nama wajib diisi.',
	'Check the email.': 'Periksa email.',
	'Add an email or a mobile number.': 'Tambahkan email atau nomor ponsel.',

	// Entrance screen
	Entrance: 'Pintu masuk',
	Reconnecting: 'Menyambungkan ulang',
	'Scan to check in': 'Pindai untuk check-in',
	'Check-in is closed': 'Check-in sudah ditutup',
	'Open your phone camera and point it at the code. No app needed.':
		'Buka kamera ponsel Anda dan arahkan ke kode ini. Tanpa aplikasi.',
	'Latest arrivals': 'Kedatangan terbaru',
	'Be the first to check in 👋': 'Jadilah yang pertama check-in 👋',
	'Welcome,': 'Selamat datang,',
	'Phones can’t reach this address (localhost). Set PUBLIC_BASE_URL.':
		'Ponsel tidak bisa menjangkau alamat ini (localhost). Atur PUBLIC_BASE_URL.',
	Dashboard: 'Dasbor',
	'Exit full screen': 'Keluar dari layar penuh',
	'Full screen': 'Layar penuh',

	// Poster
	Poster: 'Poster',
	Back: 'Kembali',
	Print: 'Cetak',
	'This event uses a live QR code that changes every 20 seconds, so there’s nothing fixed to print.':
		'Acara ini memakai kode QR langsung yang berganti setiap 20 detik, jadi tidak ada kode tetap untuk dicetak.',
	'Switch the event to Printed QR in its settings, or open the entrance screen instead.':
		'Ubah acara ke QR cetak di pengaturannya, atau buka layar pintu masuk sebagai gantinya.',
	'Welcome to': 'Selamat datang di',
	'Open your phone camera and point it at the code. No app, about five seconds.':
		'Buka kamera ponsel Anda dan arahkan ke kode ini. Tanpa aplikasi, sekitar lima detik.',

	// Error page
	'Not found': 'Tidak ditemukan',
	'Something went wrong': 'Terjadi kesalahan',
	'We couldn’t find that page': 'Halaman itu tidak kami temukan',
	'If you scanned a QR code, it may belong to an event that has ended. Ask the team at the entrance for the current code.':
		'Jika Anda memindai kode QR, kode itu mungkin milik acara yang sudah selesai. Mintalah kode terbaru kepada tim di pintu masuk.',
	'Go home': 'Ke beranda',
	'Event not found': 'Acara tidak ditemukan'
};

export default id;
