# Panduan Gaji Green Target (Untuk Staf HR)

Panduan ini menerangkan cara mengurus dan memproses gaji pekerja Green Target dari awal bulan hingga slip gaji dicetak. Tidak perlu pengetahuan teknikal — ikut sahaja langkah demi langkah.

> **Nota penting:** Sistem gaji Green Target adalah **berasingan** daripada sistem gaji Tien Hock. Semua rekod Green Target (pinjam, bayaran pendahuluan, gaji) hanya muncul dalam halaman Green Target.

---

## 1. Gambaran Keseluruhan Bulanan

Setiap bulan, aliran kerja anda adalah seperti berikut:

1. Pastikan senarai pekerja Green Target lengkap (sekali sahaja, kecuali ada pekerja baru/berhenti).
2. Masukkan rekod kerja pekerja **OFFICE** (jam kerja bulanan).
3. Pastikan rekod sewaan tong pemandu (**DRIVER**) lengkap — trip dikira secara automatik daripada rekod sewaan semasa Process.
4. Masukkan **Bayaran Pendahuluan** (gaji separuh bulan) jika ada.
5. Masukkan rekod **Pinjam** jika ada.
6. **Cipta** gaji bulan tersebut, kemudian tekan **Process**.
7. Semak gaji setiap pekerja, tambah item manual jika perlu.
8. Cetak slip gaji.
9. Tekan **Finalize** untuk mengunci gaji bulan tersebut.

Semua halaman gaji boleh diakses melalui menu **Payroll** di bar atas — apabila tetikus dihalakan ke menu Payroll, senarai pilihan akan muncul: **Monthly Payroll**, **Office**, **Mid-month Payroll**, **Pinjam** dan **Payroll Settings**.

---

## 2. Mengurus Senarai Pekerja

**Lokasi:** Menu **Payroll** > butang **Employees** (penjuru kanan atas)

Sebelum gaji boleh diproses, pekerja mesti didaftarkan dalam senarai gaji Green Target. Setiap pekerja perlu ditetapkan sebagai:

- **OFFICE** — pekerja pejabat (gaji ikut jam kerja bulanan)
- **DRIVER** — pemandu lori (gaji ikut trip + elaun tambahan)

**Langkah:**

1. Buka halaman **Payroll** Green Target.
2. Tekan butang **Employees**.
3. Cari nama pekerja dalam kotak carian, pilih jenis kerja (OFFICE atau DRIVER), kemudian tekan tambah.
4. Untuk membuang pekerja, tekan butang buang di sebelah namanya.
5. Tekan **Save** untuk menyimpan semua perubahan.

> **Penting:** Pekerja yang berada dalam senarai gaji Green Target **tidak lagi muncul** dalam halaman kemasukan jam kerja bulanan Tien Hock — ini menghalang gaji dibayar dua kali. Jam kerja mereka dimasukkan di halaman **Office** Green Target sahaja (bahagian 3).
>
> Jika anda membuang pekerja daripada senarai ini selepas gaji bulan itu di-Process, tekan **Process** sekali lagi — nama pekerja itu akan dikeluarkan daripada gaji bulan tersebut secara automatik.

---

## 3. Rekod Kerja Pekerja OFFICE

**Lokasi:** Menu **Payroll** > **Office** (`/greentarget/payroll/office-log`), atau butang **Office Entry** di halaman Payroll

Di sini anda masukkan jam kerja bulanan pekerja pejabat.

**Langkah:**

1. Pilih bulan dan tahun.
2. Masukkan jam kerja biasa dan jam kerja lebih masa (OT) untuk setiap pekerja.
3. Tekan **Save** untuk menyimpan dan menghantar rekod tersebut.

---

## 4. Trip Pemandu (DRIVER)

Gaji pemandu **tidak perlu dimasukkan secara manual** — ia dikira secara automatik semasa anda menekan **Process** (bahagian 8), berdasarkan rekod sewaan tong yang **sudah diambil balik** (ada tarikh ambil) dalam bulan tersebut:

- **Hantar tong (Placement)** — bayaran ikut nilai invois (contoh: invois RM180 ke bawah = satu kadar, lebih RM180 = kadar lain).
- **Ambil tong (Pickup)** — bayaran ikut destinasi (contoh: Kilang, MD, Menggatal).
- **Tambahan (Add-on)** — kerja sampingan seperti hantar beras atau minyak, yang direkodkan pada sewaan tersebut.

Apa yang perlu anda pastikan sebelum Process:

1. Rekod sewaan (halaman **Rentals**) lengkap — terutamanya **tarikh ambil** dan **destinasi ambil**.
2. Invois sewaan telah dibuat (jika tiada invois, sistem guna nilai invois lalai daripada Settings).
3. Add-on (jika ada) telah direkodkan pada sewaan tersebut.

Selepas Process, semak pecahan bayaran trip setiap pemandu di halaman butiran gaji (bahagian 8.3).

> **Tip:** Jika bayaran trip nampak salah, semak dahulu rekod sewaan (tarikh ambil dan destinasi) dan invois, kemudian tekan **Process** semula. Jika masih salah, semak kadar dalam halaman **Rules** (lihat bahagian 5).

---

## 5. Tetapan Kadar Bayaran (Rules)

**Lokasi:** Menu **Payroll** > butang **Rules** (`/greentarget/payroll/settings`)

Di sinilah semua kadar bayaran pemandu ditetapkan. **Berhati-hati — perubahan di sini memberi kesan kepada pengiraan gaji semua pemandu.**

Halaman ini mempunyai beberapa bahagian:

- **Payroll Rules** — peraturan bayaran hantar tong (PLACEMENT) dan ambil tong (PICKUP). Setiap peraturan menentukan kod bayaran (contoh: TRIP5 = RM5) berdasarkan nilai invois atau destinasi.
- **Pickup Destinations** — senarai destinasi ambil tong (contoh: KILANG, MD, MENGGATAL).
- **Add-on Paycodes** — senarai kerja tambahan dan bayaran lalai masing-masing (contoh: Hantar Barang, 1 Beras, Minyak).
- **Settings** — tetapan umum seperti nilai invois lalai jika sewaan tiada invois.

> Kadar sebenar bagi setiap kod bayaran (TRIP5, TRIP10, dll.) disimpan dalam senarai **Pay Codes** sistem utama. Jika kadar perlu diubah, hubungi pentadbir sistem.

---

## 6. Bayaran Pendahuluan (Gaji Separuh Bulan)

**Lokasi:** Menu **Payroll** > **Mid-month Payroll** (`/greentarget/payroll/mid-month`)

Jika pekerja menerima bayaran awal pada pertengahan bulan, rekodkan di sini. Jumlah ini akan **ditolak secara automatik** daripada gaji akhir bulan pekerja tersebut.

**Langkah:**

1. Pilih bulan dan tahun.
2. Tekan **Add Payroll**.
3. Pilih pekerja, masukkan jumlah (contoh: RM500), dan pilih cara bayaran (Cash / Bank / Cheque).
4. Tekan **Create Payroll**.

Setiap pekerja hanya boleh ada **satu** bayaran pendahuluan sebulan. Untuk mengubah jumlah, tekan ikon pensel (Edit). Untuk membatalkan, tekan ikon tong sampah (Delete).

> **Penting:** Jika anda menambah atau mengubah bayaran pendahuluan **selepas** gaji bulan itu sudah di-Process, tekan **Process** sekali lagi supaya gaji dikira semula.

---

## 7. Pinjam

**Lokasi:** Menu **Payroll** > **Pinjam** (`/greentarget/payroll/pinjam`)

Rekodkan pinjaman/potongan pekerja di sini. Ada dua jenis:

- **Mid-Month** — ditolak daripada bayaran pendahuluan pekerja.
- **Monthly** — ditolak daripada gaji akhir bulan (selepas digenapkan).

**Langkah:**

1. Pilih bulan dan tahun.
2. Tekan **Record Pinjam**.
3. Untuk setiap baris: pilih pekerja, taip keterangan (contoh: PINJAM, HANDPHONE), dan masukkan jumlah dalam lajur **Mid-Month** atau **Monthly** (atau kedua-duanya).
4. Tekan **Save Records**.

Selepas disimpan, halaman Pinjam akan memaparkan kad ringkasan bagi setiap pekerja — jumlah pinjam dan **Final Pay** (gaji bersih selepas tolak pinjam).

> **Nota:** Pinjam **tidak** ditolak dalam pengiraan KWSP/PERKESO dan **tidak** dicetak pada slip gaji — ia ditolak semasa pembayaran tunai/bank sahaja, dan boleh dilihat pada halaman butiran gaji pekerja.

---

## 8. Memproses Gaji Bulanan

**Lokasi:** Menu **Payroll** (`/greentarget/payroll`)

### 8.1 Cipta gaji bulan baharu

1. Pilih bulan menggunakan anak panah di bahagian atas.
2. Jika belum ada gaji untuk bulan itu, tekan **Create Payroll**.

### 8.2 Process

1. Tekan **Process**. Sistem akan:
   - Ambil jam kerja OFFICE dan trip DRIVER,
   - Kira gaji kasar setiap pekerja,
   - Tolak caruman KWSP, PERKESO, SIP dan cukai (PCB) secara automatik mengikut kadar semasa,
   - Tolak bayaran pendahuluan dan genapkan jumlah akhir ke ringgit penuh.
2. Selepas siap, senarai pekerja akan dipaparkan mengikut kumpulan OFFICE dan DRIVER dengan Gaji Kasar dan Gaji Bersih masing-masing.

> Anda boleh tekan **Process** berulang kali — contohnya selepas membetulkan rekod kerja, trip, atau bayaran pendahuluan. Item manual yang anda tambah sendiri **tidak** akan hilang. Pekerja yang telah dibuang daripada senarai Employees akan dikeluarkan daripada gaji bulan itu apabila Process ditekan semula.

### 8.3 Semak butiran gaji pekerja

Klik nama mana-mana pekerja untuk melihat butirannya:

- **Earnings** — senarai bayaran (jam kerja, trip, elaun tambahan).
- **Statutory Deductions** — caruman KWSP, PERKESO, SIP, cukai (bahagian pekerja dan majikan).
- **Net Pay / Jumlah Digenapkan** — gaji bersih, tolak bayaran pendahuluan, dan jumlah akhir yang digenapkan.
- **Pinjam** — jika ada, pecahan pinjam dan jumlah akhir selepas tolak pinjam.

### 8.4 Tambah item manual (jika perlu)

Jika ada bayaran khas yang tidak datang daripada rekod kerja/trip (contoh: bonus khas, elaun lain):

1. Dalam halaman butiran pekerja, tekan **Add Item**.
2. Pilih kod bayaran, semak keterangan/kadar/kuantiti, dan simpan.
3. Gaji kasar, caruman dan gaji bersih akan **dikira semula secara automatik**.

Untuk membuang item manual, tekan ikon tong sampah di sebelah item tersebut (hanya item bertanda "Manual" boleh dibuang).

### 8.5 Cetak slip gaji

Dalam halaman butiran pekerja, tekan butang **Payslip** untuk memuat turun slip gaji PDF. Slip menunjukkan pendapatan, caruman, bayaran pendahuluan (jika ada) dan jumlah akhir yang digenapkan.

### 8.6 Finalize (kunci gaji)

Setelah semua disemak dan slip dicetak:

1. Kembali ke halaman **Payroll**.
2. Tekan **Finalize** dan sahkan.

Selepas Finalize, gaji bulan itu **dikunci** — tidak boleh Process semula, tambah, atau buang item. Jika perlu membuat pembetulan, tekan **Unlock** dahulu, buat pembetulan, Process semula, dan Finalize sekali lagi.

---

## 9. Soalan Lazim

**S: Saya dah ubah jam kerja / trip / bayaran pendahuluan, tapi gaji tak berubah?**
J: Tekan **Process** sekali lagi di halaman Payroll. Sistem hanya mengira semula apabila anda Process.

**S: Kenapa pekerja tiada dalam senarai selepas Process?**
J: Pastikan pekerja itu ada dalam senarai **Employees** (bahagian 2), dan ada rekod kerja (OFFICE) atau rekod sewaan/trip (DRIVER) untuk bulan itu.

**S: Caruman KWSP/PERKESO pekerja nampak salah?**
J: Caruman dikira daripada maklumat peribadi pekerja (tarikh lahir, warganegara, status perkahwinan, bilangan anak) dalam rekod Staff sistem utama. Semak maklumat tersebut dahulu.

**S: Mana nak tengok jumlah yang perlu dibayar tunai kepada pekerja?**
J: Halaman butiran gaji pekerja — **Jumlah Digenapkan** ialah jumlah akhir; jika ada pinjam bulanan, lihat **Final Pay** dalam kad Pinjam.

**S: Kenapa pekerja Green Target tidak muncul dalam halaman kemasukan jam kerja Tien Hock?**
J: Itu memang disengajakan. Pekerja dalam senarai gaji Green Target dikecualikan daripada halaman kemasukan Tien Hock supaya gaji tidak dibayar dua kali. Masukkan jam kerja mereka di halaman **Office** Green Target. Jika pekerja itu dibuang daripada senarai Green Target, dia akan muncul semula di Tien Hock secara automatik.

**S: Boleh saya padam gaji satu bulan dan mula semula?**
J: Boleh, selagi belum Finalize. Tetapi kebiasaannya cukup dengan tekan **Process** semula sahaja.
