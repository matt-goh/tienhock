// src/components/ChangelogModal.tsx
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "./Button";

type Language = "ms" | "en";

type ChangelogEntry = {
  date: string; // ISO yyyy-mm-dd
  ms: string;
  en: string;
};

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-07-02",
    ms: "Menu cetak slip gaji: slip MEE dan BIHUN kini boleh dipilih mengikut kerja (contoh MEE_ROLL atau BIHUN_SANGKUT), bukan lagi satu bahagian MEE/BIHUN sahaja. Bahagian lain kekal dicetak mengikut bahagian seperti biasa.",
    en: "Payroll print menu: MEE and BIHUN payslips can now be selected by job (for example MEE_ROLL or BIHUN_SANGKUT) instead of one whole MEE/BIHUN section. Other sections keep the same section-based printing.",
  },
  {
    date: "2026-07-02",
    ms: "Semasa membuat Credit Note, Debit Note atau Refund Note untuk Tien Hock dan Jelly Polly, nombor dokumen kini boleh ditukar pada nombor terakhir sahaja. Sistem akan menghalang nombor yang sedang digunakan oleh dokumen aktif, tetapi nombor daripada dokumen yang sudah dibatalkan boleh digunakan semula.",
    en: "When creating a Tien Hock or Jelly Polly Credit Note, Debit Note, or Refund Note, the final document running number can now be changed. The system blocks numbers used by active documents, while numbers from cancelled documents can be reused.",
  },
  {
    date: "2026-06-30",
    ms: "Senarai General Purchases kini memaparkan nombor penghantaran dalam lajur Reference, dan menggunakan nombor order jika nombor penghantaran tiada. Butang refresh e-invois juga disembunyikan apabila status e-invois sudah Valid.",
    en: "The General Purchases list now shows the shipping number in the Reference column, and uses the order number when the shipping number is missing. The e-invoice refresh button is also hidden when the e-invoice status is already Valid.",
  },
  {
    date: "2026-06-30",
    ms: "Pemilih \"Stock Item\" dalam pembelian General kini boleh dicari terus, ditapis mengikut tarikh pembelian stok, dan memuatkan lebih banyak item melalui butang \"Load more...\". Ini memudahkan memilih item General Stock sedia ada apabila senarai item semakin panjang.",
    en: "The \"Stock Item\" picker in General Purchases is now searchable, can be filtered by stock purchase date, and can load more items with a \"Load more...\" button. This makes it easier to pick an existing General Stock item as the item list grows.",
  },
  {
    date: "2026-06-30",
    ms: "Halaman General Stock kini mengurus kategori melalui tetingkap khas. Tekan butang \"Manage\" atau klik mana-mana kategori untuk membuka tetingkap di mana anda boleh menambah, menamakan semula, dan memadam kategori di satu tempat. Kotak pintasan \"New category\" masih ada untuk menambah kategori dengan cepat. Paparan kategori di halaman juga diperkemas dan lebih jelas.",
    en: "The General Stock page now manages categories through a dedicated pop-up. Press the \"Manage\" button or click any category to open a window where you can add, rename, and delete categories in one place. The quick \"New category\" box is still there for fast adding. The category list shown on the page has also been tidied up and made clearer.",
  },
  {
    date: "2026-06-30",
    ms: "Green Target kini mempunyai halaman \"E-Caruman\" baharu di bawah menu Payroll untuk menjana fail caruman berkanun: KWSP (CSV), gabungan SOCSO + EIS/SIP (fail teks PERKESO), dan PCB (fail teks LHDN CP39) — sama format seperti Tien Hock tetapi menggunakan data Green Target. Kod pendaftaran majikan (kod majikan PERKESO, MyCoID/SSM, nombor E LHDN) kini boleh dimasukkan terus pada halaman ini dan disimpan dalam pangkalan data untuk kegunaan akan datang. Halaman ini juga menunjukkan pratonton bilangan pekerja dan jumlah caruman, serta memberi amaran jika ada pekerja yang mencarum KWSP tetapi tiada nombor KWSP.",
    en: "Green Target now has a new \"E-Caruman\" page under the Payroll menu to generate statutory contribution files: EPF (CSV), combined SOCSO + EIS/SIP (PERKESO text file), and PCB (LHDN CP39 text file) — same formats as Tien Hock but using Green Target data. The employer registration codes (PERKESO employer code, MyCoID/SSM, LHDN E-number) can now be entered on the page and are saved in the database for reuse. The page also previews the employee counts and contribution totals, and warns if any employee has an EPF contribution but no EPF number.",
  },
  {
    date: "2026-06-30",
    ms: "Green Target kini mempunyai halaman \"Salary Report\" baharu di bawah menu Payroll. Laporan ini dikumpulkan mengikut jenis kerja (Office / Driver) — Green Target tiada lokasi — dan memaparkan setiap pekerja dengan lajur GAJI, OT, BONUS, C/I/O, CUTI, gaji kasar, KWSP/SOCSO/SIP (majikan & pekerja), PCB, gaji bersih, pendahuluan separuh bulan dan jumlah digenapkan. Terdapat paparan Bulanan dan Tahunan (ringkasan + pecahan setiap pekerja mengikut bulan), serta cetak/muat turun PDF.",
    en: "Green Target now has a new \"Salary Report\" page under the Payroll menu. The report is grouped by job type (Office / Driver) — Green Target has no locations — and lists each employee with GAJI, OT, BONUS, C/I/O, CUTI, gross, EPF/SOCSO/SIP (employer & employee), PCB, net pay, mid-month advance and rounded totals. It has Monthly and Annual views (summary + per-employee monthly breakdown), with print/download to PDF.",
  },
  {
    date: "2026-06-30",
    ms: "Penambahbaikan cetakan & laporan gaji Green Target: (1) Slip gaji kini memaparkan Bonus, Advance dan Kerja Luar OT sebagai baris berasingan, serta potongan Advance — jadi gaji kasar tolak potongan berkanun tolak advance = gaji bersih boleh disemak dengan jelas (halaman Butiran Gaji juga menunjukkan pecahan ini). (2) Halaman Gaji Bulanan kini ada butang cetak/muat turun slip gaji secara pukal untuk semua pekerja sekali gus. (3) Halaman Pinjam kini ada cetak/muat turun ringkasan Pinjam (PDF). (4) Halaman Mid-month kini ada laporan PDF dan eksport fail bank Public Bank (IBG .txt) untuk pekerja yang dibayar melalui Bank.",
    en: "Green Target payroll printing & reports improvements: (1) Payslips now show Bonus, Advance and Kerja Luar OT as their own lines, plus the Advance deduction — so gross minus statutory deductions minus advance = net pay is clearly visible (the Payroll Details page also shows this breakdown). (2) The Monthly Payroll page now has buttons to print/download all employees' payslips in one batch. (3) The Pinjam page now has print/download of the Pinjam summary (PDF). (4) The Mid-month page now has a report PDF and a Public Bank (IBG .txt) bank-file export for Bank-payment employees.",
  },
  {
    date: "2026-06-29",
    ms: "Green Target kini mempunyai halaman baharu \"Daily Lori Habuk\" di bawah menu Payroll untuk merekod trip pemandu lori habuk setiap hari. Pilih satu tarikh dan setiap pemandu dipaparkan sebagai kad dengan senarai trip pada hari itu. Trip daripada sewaan (rental) yang telah lengkap diisi secara automatik (placement & pickup), trip habuk manual boleh ditambah di atasnya, dan bonus \"> 6 trip sehari\" (TRIP_LB6) dikira secara automatik. PENTING: gaji trip pemandu kini diambil daripada log harian yang DISIMPAN semasa memproses gaji bulanan — bukan lagi dikira terus daripada rekod sewaan. Jadi log harian setiap pemandu mesti disimpan untuk hari-hari berkenaan; jika tiada log disimpan untuk sesuatu bulan, pemandu hanya menerima gaji pokok sahaja (rekod sewaan hanya mengisi cadangan, tidak lagi membayar secara automatik).",
    en: "Green Target now has a new \"Daily Lori Habuk\" page under the Payroll menu to record each driver's daily habuk-lorry trips. Pick a date and every driver shows as a card listing that day's trips. Completed rentals prefill automatically (placement & pickup), manual habuk trips can be added on top, and the \"more than 6 trips a day\" bonus (TRIP_LB6) is worked out automatically. IMPORTANT: driver trip pay is now taken from the SAVED daily log when monthly payroll is processed — it is no longer calculated directly from rental records. So each driver's daily log must be saved for the relevant days; if no log is saved for a month, the driver receives base salary only (rentals only prefill the suggestion, they no longer pay automatically).",
  },
  {
    date: "2026-06-29",
    ms: "Halaman General Stock kini mempunyai butang pintasan ke senarai General Purchases, pembelian local baharu dan pembelian foreign baharu. Senarai General Purchases juga kini mempunyai pintasan kembali ke General Stock.",
    en: "The General Stock page now has shortcut buttons to the General Purchases list, a new local purchase, and a new foreign purchase. The General Purchases list also has a shortcut back to General Stock.",
  },
  {
    date: "2026-06-29",
    ms: "Muat turun SQL backup kini lebih cepat dan lebih stabil. Sistem tidak lagi membuat salinan database sementara semasa menukar backup kepada SQL, jadi muat turun yang dibatalkan akan berhenti dengan kemas dan tidak memperlahankan laman web. Semasa muat turun sedang berjalan, tetingkap backup akan kekal terbuka dan navigasi keluar akan disekat sehingga selesai.",
    en: "Backup SQL downloads are now faster and more stable. The system no longer creates a temporary database copy when converting a backup to SQL, so cancelled downloads stop cleanly and do not slow down the website. While a download is running, the backup window stays open and navigation away is blocked until it finishes.",
  },
  {
    date: "2026-06-29",
    ms: "General Purchase kini memasukkan jumlah, cukai dan akaun GL di peringkat invois, bukan lagi di setiap item. Item pembelian kini fokus kepada stok sahaja, boleh menambah beberapa item untuk pembelian local dan foreign, serta boleh pilih item General Stock sedia ada untuk menambah baki ke item tersebut dengan pratonton baki baharu.",
    en: "General Purchase now enters amount, tax, and GL account at invoice level instead of per item. Purchase items now focus on stock only, local and foreign purchases can both contain multiple items, and an item can append quantity to an existing General Stock item with a new-balance preview.",
  },
  {
    date: "2026-06-29",
    ms: "Green Target kini mempunyai tiga halaman baharu di bawah menu Payroll: \"Bonus\", \"Others (Advance)\" dan \"Others (Kerja Luar OT)\" — sama seperti Tien Hock. Bonus menambah jumlah kepada gaji kasar dan gaji bersih pekerja. Others (Advance) menambah kepada gaji kasar tetapi ditolak semula sebagai pendahuluan (advance), jadi tiada kesan bersih. Others (Kerja Luar OT) merekod kerja ikut kod gaji, kadar dan kuantiti, dan menambah kepada gaji kasar. Semua tiga jenis ini kini diambil kira secara automatik semasa memproses gaji bulanan Green Target. Setiap halaman hanya memaparkan pekerja payroll Green Target sahaja.",
    en: "Green Target now has three new pages under the Payroll menu: \"Bonus\", \"Others (Advance)\", and \"Others (Kerja Luar OT)\" — matching Tien Hock. Bonus adds an amount to the employee's gross and net pay. Others (Advance) adds to gross pay but is deducted back as an advance, so it has no net effect. Others (Kerja Luar OT) records work by pay code, rate, and quantity, and adds to gross pay. All three now feed into Green Target's monthly payroll processing automatically. Each page only lists Green Target payroll employees.",
  },
  {
    date: "2026-06-29",
    ms: "Entri bulanan Office bagi Green Target kini menyokong kod gaji (pay codes), sama seperti Tien Hock. Setiap pekerja office kini mempunyai butang \"Activities\" untuk memilih kod gaji yang berkenaan (gaji pokok, kerja lebih masa, elaun dan sebagainya) serta menetapkan jumlahnya. Yang penting, kod gaji peribadi pekerja itu (contohnya gaji bulanan) kini diambil secara automatik — sebelum ini entri Office hanya merekod jam kerja sahaja.",
    en: "Green Target's Office monthly entry now supports pay codes, just like Tien Hock. Each office employee now has an \"Activities\" button to choose which pay codes apply (basic salary, overtime, allowances, etc.) and set their amounts. Importantly, the employee's own pay codes (such as their monthly salary) are now picked up automatically — previously the Office entry only recorded hours.",
  },
  {
    date: "2026-06-28",
    ms: "Kod gaji jenis Tambahan kini boleh ditetapkan sebagai \"Default\" (ditanda secara automatik semasa membuat entri kerja baharu) melalui tetingkap edit kadar, sama seperti kod gaji Base. Sebagai permulaan, semua kod Tambahan ditetapkan TIDAK default kecuali \"SAPU1\" (SAPU SELURUH KAWASAN KILANG) — jadi SAPU1 kini ditanda secara automatik apabila membuat entri kerja harian dan bulanan baharu (boleh dibuang secara manual jika tidak berkenaan), manakala semua kod Tambahan lain kekal tidak ditanda. Tetingkap edit kadar untuk kod Tambahan kini juga mempunyai butang \"Unlink Pay Code\" untuk menanggalkan kaitan kod itu, sama seperti kod gaji lain.",
    en: "Tambahan pay codes can now be set as \"Default\" (auto-ticked when creating new work entries) from the rate edit window, just like Base pay codes. To start, all Tambahan codes were set to NOT default except \"SAPU1\" (SAPU SELURUH KAWASAN KILANG) — so SAPU1 is now auto-ticked when creating new daily and monthly work entries (you can untick it manually if it doesn't apply), while all other Tambahan codes stay unticked. The rate edit window for Tambahan codes now also has an \"Unlink Pay Code\" button to remove the association, just like other pay codes.",
  },
  {
    date: "2026-06-28",
    ms: "Mengklik kad kakitangan kini membuka halaman butiran ringkas (baca sahaja) yang memaparkan semua maklumat kakitangan tersebut dengan pantas, dengan hanya bahagian Pay Codes yang masih boleh diedit di situ. Untuk menyunting maklumat lain, klik butang \"Edit\" untuk membuka borang penuh seperti biasa. Bagi kakitangan yang berkongsi nama yang sama, kepala (Head) kini boleh ditetapkan terus dari pemilih di bahagian atas halaman butiran (sebelah ID). Kad kakitangan juga kini mempunyai butang Edit (sebelah butang padam) yang terus membuka borang suntingan. Kotak carian di halaman Staff dan Customer kini difokuskan secara automatik apabila halaman dibuka. Kad pelanggan pula kini mempunyai dua butang pintasan baharu: terus ke tab \"Credit & Pricing\" dan ke tab \"Transaction History\".",
    en: "Clicking a staff card now opens a quick read-only details page showing all of that staff member's information at a glance, with only the Pay Codes section still editable there. To edit other information, click the \"Edit\" button to open the full form as before. For staff who share the same name, the Head can now be set directly from a selector in the details page header (next to the ID). Staff cards also now have an Edit button (next to the delete button) that goes straight to the edit form. The search box on the Staff and Customer pages is now auto-focused when the page opens. Customer cards now have two new shortcut buttons: jump straight to the \"Credit & Pricing\" tab and to the \"Transaction History\" tab.",
  },
  {
    date: "2026-06-28",
    ms: "Halaman pelanggan kini mempunyai tab baharu \"Transaction History\" yang memaparkan semua aktiviti pelanggan tersebut di satu tempat — invois, pembayaran, serta Nota Kredit/Debit/Bayaran Balik — disusun mengikut tarikh (terkini di atas). Terdapat penapis tarikh (Bulan/Julat/Tahun) yang lalai kepada 30 hari lepas, kad ringkasan Jumlah Diinvois / Jumlah Dibayar / bilangan pelarasan, dan setiap baris boleh diklik untuk terus membuka invois atau dokumen berkenaan. Sejarah ini juga boleh dicetak atau dimuat turun sebagai PDF.",
    en: "The customer page now has a new \"Transaction History\" tab that shows everything for that customer in one place — invoices, payments, and Credit/Debit/Refund Notes — sorted by date (newest first). It has a date filter (Month/Range/Year) defaulting to the last 30 days, summary cards for Total Invoiced / Total Paid / number of adjustments, and every row is clickable to jump straight to the related invoice or document. The history can also be printed or downloaded as a PDF.",
  },
  {
    date: "2026-06-27",
    ms: "Foreign General Purchase kini menyokong beberapa item dalam satu pembelian. Daripada memasukkan semua barang dalam satu kotak penerangan, anda kini boleh tambah baris item berasingan dengan kuantiti, harga seunit, jumlah foreign, jumlah MYR, akaun GL, kategori stok General, dan cukai masing-masing.",
    en: "Foreign General Purchase now supports multiple items in one purchase. Instead of typing every item into one description box, you can now add separate item rows with their own quantity, unit price, foreign amount, MYR amount, GL account, General stock category, and tax.",
  },
  {
    date: "2026-06-27",
    ms: "Butang kemas kini status e-invois untuk Foreign General Purchase kini lebih jelas sebagai \"Refresh E-Invoice\". Senarai General Purchases juga kini mempunyai butang refresh e-invois pada setiap pembelian foreign yang sudah dihantar, jadi status Pending boleh disemak terus dari senarai tanpa membuka rekod.",
    en: "The Foreign General Purchase status refresh button is now clearer as \"Refresh E-Invoice\". The General Purchases list also has an e-invoice refresh button on each submitted foreign purchase, so Pending statuses can be checked directly from the list without opening the record.",
  },
  {
    date: "2026-06-27",
    ms: "Ciri \"Finalize\" / muktamadkan payroll telah dibuang sepenuhnya (Tien Hock dan Green Target). Tiada lagi butang Finalize/Revert/Unlock atau label status Processing/Finalized — payroll kini sentiasa boleh diedit. Sebagai gantinya, halaman Payroll mempunyai butang teks baharu untuk menukar paparan antara \"Groups\" (pekerja dikumpulkan ikut kerja) dan \"Recent\" (senarai rata tanpa kumpulan). Kedua-dua paparan kini disusun dengan yang terkini diakses/diproses di atas — kumpulan atau pekerja yang baru dibuka akan naik ke atas. Pilihan paparan diingati oleh sistem. Butang buka/tutup semua hanya muncul dalam paparan Groups. Setiap baris pekerja kini mempunyai butang Process untuk memproses semula pekerja itu sahaja terus dari senarai.",
    en: "The payroll \"Finalize\" feature has been removed entirely (Tien Hock and Green Target). There are no more Finalize/Revert/Unlock buttons or Processing/Finalized status labels — payrolls are now always editable. In its place, the Payroll page has a new text button to switch the view between \"Groups\" (employees grouped by job) and \"Recent\" (a flat, ungrouped list). Both views are now ordered with the most recently opened/processed at the top — a group or employee you just opened floats to the top. Your chosen view is remembered. The expand/collapse-all button only appears in the Groups view. Each employee row now has a Process button to re-process just that person straight from the list.",
  },
  {
    date: "2026-06-27",
    ms: "Catatan Jurnal jenis \"C - Cash Payment\" kini mempunyai medan \"Cheque No\" baharu untuk nombor cek. Nombor cek diisi secara automatik mengikut turutan (bermula dari PBB350779, kemudian PBB350780 dan seterusnya) tetapi masih boleh diubah secara manual. Nombor cek turut dipaparkan pada halaman butiran catatan jurnal.",
    en: "Journal Entries of type \"C - Cash Payment\" now have a new \"Cheque No\" field for the cheque number. The cheque number is auto-filled in sequence (starting from PBB350779, then PBB350780 and so on) but can still be edited manually. The cheque number is also shown on the journal entry details page.",
  },
  {
    date: "2026-06-27",
    ms: "Jumlah keseluruhan di bahagian atas halaman Payroll kini menunjukkan jumlah \"Setelah Digenapkan\" (gaji penuh yang diperoleh) dan bukan lagi gaji kasar. Angka ini sepadan dengan Laporan Gaji. Nota ringkas di sebelahnya memaparkan jumlah tunai dibawa pulang serta jumlah pendahuluan komisen/bonus yang telah dibayar lebih awal — menerangkan sebab jumlah ini lebih tinggi daripada lajur \"Net\" di bawah.",
    en: "The grand total at the top of the Payroll page now shows the \"Setelah Digenapkan\" total (full earned salary) instead of gross pay. This figure matches the Salary Report. A compact note beside it shows the take-home amount and the commission/bonus advances already paid earlier — explaining why this total is higher than the \"Net\" column below.",
  },
  {
    date: "2026-06-27",
    ms: "Pemilih tarikh baharu yang lebih ringkas kini digunakan di banyak halaman bersenarai data dan laporan — antaranya Senarai Invois (Tien Hock, Jelly Polly, Green Target), Pembayaran, Jurnal, Nota Pelarasan, Log Harian, laporan Jualan, Pembelian Material & General, Bayaran Pembekal, Senarai Pengeluaran, Log Bulanan, Laporan Gaji, serta halaman tambahan Payroll (Bonus, Bayaran Pertengahan Bulan, Pinjam, Others). Ia menggantikan kotak tarikh serta penanda hari/bulan/tahun yang berasingan. Klik butang tarikh untuk menukar antara mod Hari, Bulan, Julat dan Tahun (mengikut halaman), memilih pintasan pantas (Hari Ini, Bulan Ini, 7/30 Hari Lepas dan lain-lain), atau pilih dari kalendar. Anak panah kiri/kanan di sebelahnya melangkah mengikut pilihan semasa, dan tidak akan melepasi tarikh hari ini.",
    en: "A new, more compact date picker is now used across many data-list and report pages — including Invoice lists (Tien Hock, Jelly Polly, Green Target), Payments, Journal Entries, Adjustment Documents, Daily Logs, the Sales reports, Material & General Purchases, Supplier Payments, the Production list, Monthly Logs, the Salary Report, and the Payroll add-on pages (Bonus, Mid-Month, Pinjam, Others). It replaces the separate date boxes and day/month/year steppers. Click the date button to switch between Day, Month, Range and Year modes (depending on the page), pick a quick preset (Today, This Month, Last 7/30 Days and more), or choose from the calendar. The left/right arrows beside it step through your current selection and won't move past today.",
  },
  {
    date: "2026-06-26",
    ms: "Stok General dan Stok Material kini dipisahkan kepada dua halaman berasingan dalam menu Stock. Halaman General Stock hanya memaparkan stok General, manakala halaman Material Stock mengandungi tab Mee, Bihun dan Shared.",
    en: "General Stock and Material Stock are now split into two separate pages in the Stock menu. General Stock now only shows general stock, while Material Stock contains the Mee, Bihun and Shared tabs.",
  },
  {
    date: "2026-06-26",
    ms: "Halaman Pelarasan Stok kini mempunyai tab baharu \"Other Products\" yang membolehkan anda merekod pelarasan ADJ+/ADJ- untuk Sisa Mi, Sisa Mihun, Empty Bag dan Empty Bag (Small), selain produk Bihun dan Mee yang sedia ada. Keempat-empat produk ini juga kini boleh dipilih dalam halaman Pergerakan Stok.",
    en: "The Stock Adjustments page now has a new \"Other Products\" tab that lets you record ADJ+/ADJ- adjustments for Sisa Mi, Sisa Mihun, Empty Bag and Empty Bag (Small), in addition to the existing Bihun and Mee products. These four products can now also be selected on the Stock Movement page.",
  },
  {
    date: "2026-06-26",
    ms: "Dalam menu navigasi yang dipaparkan sebagai grid berbilang lajur (seperti Catalogue dan Payroll), pintasan akses pantas (cth. \"New Entry\") kini muncul sebagai butang \"+\" terus di dalam baris item, bukan lagi popover yang terbuka ke kanan dan menutup item di lajur sebelah. Klik \"+\" untuk terus ke halaman cipta baharu. Menu satu lajur kekal seperti biasa.",
    en: "In navigation menus shown as a multi-column grid (like Catalogue and Payroll), the quick-access shortcuts (e.g. \"New Entry\") now appear as a \"+\" button right inside the item row, instead of a popover that opened to the right and covered the item in the next column. Click the \"+\" to go straight to the create page. Single-column menus are unchanged.",
  },
  {
    date: "2026-06-26",
    ms: "Laporan Debtors kini mempunyai butang buka/tutup semua yang membuka kumpulan salesman dan semua butiran pelanggan sekaligus. Laporan Tien Hock dan Jelly Polly juga boleh buka/tutup setiap salesman bersama semua pelanggan di bawahnya, dengan ruang yang lebih selesa apabila kumpulan dibuka. Jumlah kecil pelanggan kini turut dipaparkan di bawah jadual invois seperti dalam PDF, dan jumlah keseluruhan juga ditunjukkan di bahagian bawah laporan.",
    en: "Debtors Reports now have an expand/collapse-all button that opens both salesman groups and every customer detail at once. Tien Hock and Jelly Polly can also expand/collapse each salesman together with all customers under that salesman, with more breathing room when a group is open. Customer subtotals now also appear below the invoice table like the PDF, and the overall total is shown at the bottom of the report.",
  },
  {
    date: "2026-06-26",
    ms: "Senarai Dokumen Pelarasan kini menunjukkan status e-invois invois asal bersebelahan status e-invois dokumen pelarasan, supaya lebih mudah tahu sama ada invois asal sudah sedia sebelum menghantar nota pelarasan.",
    en: "The Adjustment Docs list now shows the original invoice e-invoice status next to the adjustment document e-invoice status, so it is easier to see whether the original invoice is ready before submitting an adjustment note.",
  },
  {
    date: "2026-06-26",
    ms: "Tab \"General\" dalam halaman Pelarasan Stok kini mempunyai kotak carian untuk menapis baris mengikut kategori, penerangan item, pembekal, atau nombor pembelian (bukan nombor/kuantiti). Pemilih bulan juga ditambah pada tab ini, jadi senarai kini hanya memaparkan pembelian bagi bulan yang dipilih.",
    en: "The \"General\" tab on the Stock Adjustments page now has a search box to filter rows by category, item description, supplier, or purchase number (not numbers/quantities). A month selector was also added to this tab, so the list now only shows purchases from the selected month.",
  },
  {
    date: "2026-06-26",
    ms: "Nombor dokumen pelarasan (Nota Kredit/Debit/Bayaran Balik) kini menggunakan format baharu seperti TH/CN/26/1 — kependekan syarikat (TH, JP, GT), jenis nota (CN/DN/RN), tahun, dan nombor berjalan. Penomboran bermula semula dari 1 untuk setiap syarikat, jenis, dan tahun. Dokumen lama kekal dengan nombor asalnya. Format baharu ini dipaparkan dalam senarai, halaman butiran, PDF, dan e-invois.",
    en: "Adjustment document numbers (Credit/Debit/Refund Notes) now use a new format like TH/CN/26/1 — company code (TH, JP, GT), note type (CN/DN/RN), year, and a running number. Numbering restarts from 1 per company, type, and year. Existing documents keep their original numbers. The new format shows on the list, details page, PDF, and e-invoice.",
  },
  {
    date: "2026-06-26",
    ms: "Semasa menghantar beberapa e-invois dokumen pelarasan sekaligus, satu tetingkap kemajuan kini menghalang sebarang tindakan sehingga penghantaran selesai, supaya proses besar tidak terganggu.",
    en: "When submitting several adjustment-document e-invoices at once, a progress dialog now blocks any interaction until the submission finishes, so large batches can't be interrupted mid-way.",
  },
  {
    date: "2026-06-26",
    ms: "Laporan Gaji mengikut lokasi kini meletakkan setiap pekerja di SATU lokasi sahaja, jadi jumlah kecil (subtotal) setiap lokasi kini benar-benar menjumlah kepada jumlah besar. Sebelum ini, pekerja yang dipetakan ke beberapa lokasi dikira penuh di setiap lokasi, menyebabkan jumlah kecil lokasi melebihi jumlah besar. Lokasi pekerja kini mengikut lokasi KETUA (Head) pekerja tersebut — semua ID di bawah nama yang sama masuk ke lokasi Ketua. Terpakai pada tab \"Location\" (Bulanan/Tahunan), paparan Pekerja mengikut Lokasi, serta jadual mengikut lokasi dalam tab \"Annual\". Jumlah besar tidak berubah.",
    en: "The by-location Salary Report now places each employee in just ONE location, so each location's subtotal truly adds up to the grand total. Previously an employee mapped to several locations was counted in full under each one, making the location subtotals exceed the grand total. An employee's location now follows their HEAD's location — all IDs under the same name go into the Head's location. Applies to the \"Location\" tab (Monthly/Yearly), the Employee-by-Location view, and the by-location table in the \"Annual\" tab. Grand totals are unchanged.",
  },
  {
    date: "2026-06-25",
    ms: "Halaman Rekod Pengeluaran kini menyenaraikan pekerja dalam setiap produk mengikut susunan kad pekerja yang sama (susunan seret-dan-lepas) seperti halaman Kemasukan Pengeluaran, bukan lagi mengikut abjad.",
    en: "The Production Records page now lists workers under each product in the same worker order (the drag-and-drop arrangement) as the Production Entry page, instead of alphabetically.",
  },
  {
    date: "2026-06-25",
    ms: "Laporan Gaji kini memaparkan Cuti Tahunan bagi pekerja yang tiada rekod gaji aktif pada bulan tersebut tanpa menolak Gaji Pertengahan Bulan sekali lagi. Jumlah cuti tidak lagi kelihatan negatif, dan baris tersebut tidak akan dimasukkan ke dalam senarai bayaran bank kerana bayaran telah dibuat sebelum ini.",
    en: "Salary Report now shows Annual Leave for employees without an active payroll that month without deducting their mid-month salary again. The leave amount no longer appears as a negative figure, and those rows are excluded from the bank payment list because the payment was already made.",
  },
  {
    date: "2026-06-25",
    ms: "Laporan Gaji mengikut lokasi (tab \"Location\" untuk Bulanan/Tahunan, dan jadual lokasi di bahagian bawah tab \"Annual\") kini lebih kemas: baris lokasi yang tidak digunakan (16, 17, 19, 20, 21, 22, 24, 05, 12, 15) telah dialih keluar, dan label pemisah \"COMMISSION\" telah dibuang (baris pemisah kekal). Berlaku pada paparan skrin dan PDF. Jumlah besar tidak berubah.",
    en: "The by-location Salary Report (the \"Location\" tab for Monthly/Yearly, and the location table at the bottom of the \"Annual\" tab) is tidier: the unused location rows (16, 17, 19, 20, 21, 22, 24, 05, 12, 15) have been removed, and the \"COMMISSION\" divider label is gone (the spacer row stays). Applies on screen and in the PDFs. Grand totals are unchanged.",
  },
  {
    date: "2026-06-24",
    ms: "Tab \"Annual\" pada Laporan Gaji kini mempunyai dua paparan melalui suis \"Summary\" / \"Breakdown\": Summary menunjukkan jumlah setahun mengikut bulan dan lokasi (seperti sebelum ini), manakala Breakdown yang baharu memaparkan pekerja dipecahkan ikut bulan (Januari–Disember), beserta jumlah bagi setiap pekerja dan jumlah besar lokasi — sepadan dengan laporan kertas lama. Kerana laporan ini besar, ia dipaparkan satu halaman pada satu masa — setiap halaman mengumpulkan lokasi secara automatik sehingga kira-kira 30 pekerja (guna butang Prev/Next atau senarai pilihan halaman). Butang Print/Download mengeluarkan halaman yang sedang dipaparkan, dan butang \"Batch Print\" membolehkan anda mencetak/memuat turun mana-mana halaman terus.",
    en: "The Salary Report's \"Annual\" tab now has two views via a \"Summary\" / \"Breakdown\" switch: Summary shows the year's totals by month and by location (as before), while the new Breakdown shows employees broken down month-by-month (January–December), plus a per-employee total and a location grand total — matching the old paper report. Because this report is large, it is shown one page at a time — each page automatically groups locations up to about 30 staff (use Prev/Next or the page dropdown). The Print/Download buttons output the page currently shown, and a \"Batch Print\" button lets you print or download any page directly.",
  },
  {
    date: "2026-06-24",
    ms: "Laporan Gaji kini mempunyai tab \"Annual\" baharu yang memaparkan jumlah gaji setahun: jadual mengikut bulan (Januari–Disember) di atas, dan jadual mengikut lokasi di bawah, kedua-duanya berkongsi lajur yang sama dan menjumlah kepada jumlah besar yang sama.",
    en: "The Salary Report now has a new \"Annual\" tab showing the year's totals: a table broken down by month (January–December) on top, and a table by location below, both sharing the same columns and reconciling to the same grand total.",
  },
  {
    date: "2026-06-24",
    ms: "Paparan Tahunan (Yearly) bagi Laporan Gaji: lajur DIGENAPKAN dan SETELAH DIGENAPKAN kini menjumlahkan angka digenapkan setiap bulan, bukan menggenapkan jumlah setahun sekali. Angka tahunan kini sepadan dengan jumlah 12 bulan dan dengan laporan kertas. Lajur lain tidak berubah.",
    en: "Yearly view of the Salary Report: the DIGENAPKAN and SETELAH DIGENAPKAN columns now add up each month's rounded figure instead of rounding the whole-year total once. The yearly numbers now match the sum of the 12 months and the paper report. All other columns are unchanged.",
  },
  {
    date: "2026-06-23",
    ms: "Slip Gaji dan Butiran Gaji untuk jualan Jelly Polly kini menggunakan unit Ctn (carton). Jumlah carton termasuk unit percuma (FOC), dan kadar serta jumlah bayaran tidak berubah.",
    en: "Jelly Polly sales now use the Ctn (carton) unit on Payslips and Payroll Details. Carton totals include free (FOC) units, while rates and payment amounts are unchanged.",
  },
  {
    date: "2026-06-23",
    ms: "Laporan Pinjam kini mempunyai bahagian \"Pinjam Breakdown\" yang menunjukkan jumlah keseluruhan bagi setiap jenis pinjam (contoh: ROSE, AIR, PINJAM, OTHERS) beserta jumlah besar. Pada skrin, anda boleh klik mana-mana jenis untuk melihat siapa yang menyumbang kepada jenis itu dan jumlahnya. Terdapat juga butang \"Breakdown\" baharu untuk mencetak/memuat turun PDF pecahan mengikut jenis (senarai pekerja bagi setiap jenis) berasingan daripada laporan pinjam biasa. Jenis dikumpulkan secara automatik mengikut keterangan yang dimasukkan.",
    en: "The Pinjam Report now has a \"Pinjam Breakdown\" section showing the grand total for each pinjam type (e.g. ROSE, AIR, PINJAM, OTHERS) plus an overall total. On screen you can click any type to expand and see who contributed to it and their amounts. There is also a new \"Breakdown\" button to print/download a by-type breakdown PDF (staff listed under each type) separately from the regular pinjam report. Types are grouped automatically by the description entered.",
  },
  {
    date: "2026-06-23",
    ms: "Laporan Pinjam (skrin dan PDF) kini memaparkan butiran setiap pinjam (keterangan dan jumlah) di bawah nama setiap pekerja, supaya anda tahu pinjam tersebut untuk apa. Pekerja yang mempunyai lebih daripada satu pinjam akan menunjukkan setiap satu secara berasingan. Jumlah Pinjam dan jumlah keseluruhan tidak berubah.",
    en: "The Pinjam Report (on-screen and PDF) now shows the details of each pinjam (description and amount) under each employee's name, so you can tell what each deduction is for. Employees with more than one pinjam show each one separately. The Total Pinjam and grand totals are unchanged.",
  },
  {
    date: "2026-06-23",
    ms: "Laporan Gaji: bayaran kod FULL (FULL HARIAN) dan HADIR_MEETING (SEMINAR/MESYUARAT) kini sentiasa dipaparkan di lajur Gaji untuk semua pekerja, bukan lagi di lajur C/I/O. Jumlah Gaji Kasar tidak berubah — hanya lajur paparan diperbetulkan.",
    en: "Salary Report: payments using the FULL (FULL HARIAN) and HADIR_MEETING (SEMINAR/MESYUARAT) pay codes now always show in the Gaji column for all employees, instead of C/I/O. The Gross (Gaji Kasar) total is unchanged — only the display column is corrected.",
  },
  {
    date: "2026-06-23",
    ms: "Kadar gaji kini boleh ditetapkan mengikut bulan berkuat kuasa. Pada skrin kadar Kod Gaji, kakitangan, dan kerja, anda kini boleh menambah \"perubahan kadar\" yang bermula dari bulan tertentu, dengan senarai sejarah perubahan. Setiap bulan gaji akan menggunakan kadar yang berkuat kuasa untuk bulan itu apabila diproses semula — jadi menaikkan kadar mulai bulan tertentu tidak lagi mengubah bulan-bulan sebelumnya. Skrin kemasukan kerja harian, bulanan dan jurujual kini memaparkan kadar mengikut bulan log tersebut supaya sepadan dengan slip gaji.",
    en: "Pay rates can now be set to take effect from a specific month. On the Pay Code, employee, and job rate screens you can add a \"rate change\" that starts from a chosen month, with a history list of changes. Each payroll month uses the rate in force for that month when re-processed — so raising a rate from a certain month no longer alters earlier months. The daily, monthly, and salesman work-log entry screens now preview the rate for that log's month so it matches the payslip.",
  },
  {
    date: "2026-06-22",
    ms: "Potongan SIP (Sistem Insurans Pekerjaan) kini tidak dikenakan ke atas pekerja bawah umur 18 tahun. Kelayakan ditentukan mengikut umur pekerja pada bulan gaji berkenaan — jadi apabila pekerja mencecah umur 18 pada bulan kemudian, bulan-bulan terdahulu tidak akan terjejas dan tidak perlu diubah semula.",
    en: "SIP (Employment Insurance) is no longer deducted from employees under 18. Eligibility is decided from the employee's age during that payroll month — so when an employee turns 18 in a later month, earlier months are unaffected and don't need to be changed.",
  },
  {
    date: "2026-06-22",
    ms: "Slip gaji jurujual kini menunjukkan bilangan beg produk yang termasuk beg percuma (FOC). Sebelum ini bilangan beg hanya menunjukkan beg yang dijual walaupun jumlah bayaran sudah mengira beg percuma, jadi bilangan beg kini sepadan dengan jumlah bayaran.",
    en: "Salesman payslips now show product bag counts that include free (FOC) bags. Previously the bag count showed only sold bags even though the amount already counted the free bags, so the bag count now matches the amount.",
  },
  {
    date: "2026-06-22",
    ms: "Fail eksport Bank Gaji Pertengahan Bulan kini menggabungkan pekerja yang mempunyai lebih daripada satu ID staf menjadi satu baris sahaja, menggunakan nama dan akaun bank ketua (utama) dengan jumlah dicampurkan. Sebelum ini setiap ID muncul sebagai baris berasingan.",
    en: "The Mid-month Payroll Bank export file now combines employees who have more than one staff ID into a single line, using the head (main) name and bank account with the amounts added together. Previously each ID appeared as a separate line.",
  },
  {
    date: "2026-06-22",
    ms: "Semasa memproses gaji, komisen dan rekod Lain-lain (Kerja Luar) kini dikumpulkan mengikut nama pekerja, sama seperti cuti. Ini membetulkan jumlah gaji dan amaun Bank bagi pekerja yang mempunyai lebih daripada satu ID staf, yang sebelum ini tertinggal komisen atau bayaran tertentu.",
    en: "When processing payroll, commission and Others (Kerja Luar) records are now gathered by employee name, just like leave. This corrects the gross pay and Bank amounts for employees with more than one staff ID, who could previously have certain commission or payments left out.",
  },
  {
    date: "2026-06-22",
    ms: "Dalam Butiran Gaji, keseluruhan kad Pinjam kini boleh diklik untuk membuka halaman Pinjam bagi bulan dan pekerja tersebut. Halaman Pinjam akan terus memilih bulan yang betul dan mengisi carian pekerja, termasuk pada senarai rekod di bawah.",
    en: "In Payroll Details, the whole Pinjam card can now be clicked to open Pinjam for that month and employee. Pinjam immediately selects the correct month and pre-fills the employee search, including for the records list below.",
  },
  {
    date: "2026-06-22",
    ms: "Laporan Gaji kini mengira jumlah setiap Kod Gaji daripada jumlah jam/unit dahulu sebelum dibundarkan, sama seperti Butiran Gaji dan sistem lama. Ini membetulkan perbezaan beberapa sen pada lajur seperti Gaji, OT dan C/I/O tanpa mengubah rekod kerja asal.",
    en: "Salary Report now totals each Pay Code's hours/units before rounding, matching Payroll Details and the legacy system. This fixes a few-sen difference in columns such as Gaji, OT, and C/I/O without changing the underlying work records.",
  },
  {
    date: "2026-06-21",
    ms: "Laporan Gaji kini mempunyai butang panduan lajur di bawah jadual. Panduan ini menerangkan cara Gaji, OT, Bonus, C/I/O dan Cuti ditetapkan, termasuk keutamaan tetapan manual dan cara bayaran pembungkusan F/HARIAN dikendalikan.",
    en: "Salary Report now has a column guide button below the table. It explains how Gaji, OT, Bonus, C/I/O, and Cuti are assigned, including manual-setting priority and how F/HARIAN packing pay is handled.",
  },
  {
    date: "2026-06-21",
    ms: "Laporan Gaji: bagi pekerja pembungkusan sepenuhnya, bayaran F/HARIAN kini dipaparkan di lajur Gaji. Bagi pekerja yang turut mempunyai gaji ikut jam/hari, bayaran itu kekal di C/I/O. Jumlah Gaji Kasar dan potongan tidak berubah; hanya pembahagian lajur laporan diperbetulkan.",
    en: "Salary Report: for pure packing workers, F/HARIAN pay now appears under Gaji. For workers who also have hourly/daily wages, it remains under C/I/O. Gross pay and deductions do not change; only the report column split is corrected.",
  },
  {
    date: "2026-06-21",
    ms: "Kod Gaji (Pay Code) kini boleh ditetapkan untuk sentiasa dipaparkan di lajur Laporan Gaji yang dipilih (Gaji, OT, Bonus, C/I/O atau Cuti) melalui pilihan baharu 'Salary Report Column' pada borang Pay Code. Tetapan ini digunakan untuk kedua-dua item gaji biasa dan entri Lain-lain (Kerja Luar OT) yang menggunakan kod tersebut. Jika satu entri Lain-lain mempunyai pilihan lajurnya sendiri, pilihan entri itu tetap diutamakan. Biarkan 'Automatic' jika tiada keperluan untuk menetapkannya.",
    en: "A Pay Code can now be set to always appear under a chosen Salary Report column (Gaji, OT, Bonus, C/I/O, or Cuti) via the new 'Salary Report Column' option on the Pay Code form. This applies to both regular pay items and Others (Kerja Luar OT) entries that use that code. If an individual Others entry has its own column choice, that per-entry choice still takes precedence. Leave it on 'Automatic' when no override is needed.",
  },
  {
    date: "2026-06-21",
    ms: "Dalam Butiran Gaji, klik pada potongan Bayaran Pendahuluan (Mid-month Advance) untuk terus membuka halaman Mid-month Payroll bagi bulan dan pekerja tersebut. Halaman itu kini mempunyai carian pekerja untuk menapis senarai dengan cepat.",
    en: "In Payroll Details, click the Mid-month Advance deduction to open Mid-month Payroll directly for that month and employee. That page now has an employee search for quickly filtering the list.",
  },
  {
    date: "2026-06-21",
    ms: "Butiran Gaji kini dibuka dalam paparan Terperinci (Detailed) secara lalai supaya setiap rekod dan tarikh sumber terus kelihatan. Anda masih boleh memilih paparan Ringkasan (Summary) apabila diperlukan.",
    en: "Payroll Details now opens in the Detailed view by default, so each record and its source date are visible immediately. You can still switch to the Summary view when needed.",
  },
  {
    date: "2026-06-21",
    ms: "Halaman butiran log kerja Harian dan Bulanan kini mempunyai carian ringkas untuk menapis pekerja dan rekod cuti mengikut nama, ID atau kerja. Apabila rekod harian atau bulanan diklik dari Butiran Gaji, carian pada log terus diisi untuk pekerja tersebut. Dalam Butiran Gaji, rekod kerja bulanan kini memaparkan bulan yang boleh diklik terus ke log kerja bulanan berkenaan, menggantikan tanda '-'.",
    en: "Daily and Monthly work-log details now have a compact search to filter employees and leave records by name, ID, or job. When a daily or monthly record is opened from Payroll Details, its log search is pre-filled for that employee. In Payroll Details, monthly work records now show a clickable month that opens the corresponding monthly work log instead of a '-'.",
  },
  {
    date: "2026-06-21",
    ms: "Halaman Payroll dan Laporan Gaji kini mengingati bulan terakhir yang anda buka pada pelayar ini. Laporan Gaji juga mengingati tab terakhir yang dibuka. Apabila anda kembali ke halaman tersebut, bulan dan tab itu dibuka secara automatik; pautan yang memilih bulan atau tab tertentu masih menggunakan pilihan pada pautan tersebut.",
    en: "The Payroll and Salary Report pages now remember the last month you opened in this browser. Salary Report also remembers the last tab you opened. When you return, that month and tab open automatically; links that specify a month or tab still use the choices in the link.",
  },
  {
    date: "2026-06-21",
    ms: "Butiran Gaji: dalam paparan Terperinci (Detailed), setiap rekod Bonus / Insentif, Lain-lain (Kerja Luar OT), dan Cuti Tahunan kini dipaparkan pada barisnya sendiri dengan tarikh yang boleh diklik terus ke halaman kemasukannya (Bonus, Others (Advance), atau Lain-lain/Kerja Luar), dan kotak carian di halaman tersebut akan diisi dengan nama pekerja. Insentif (IXT) yang dimasukkan melalui log kerja harian/bulanan kini menghala ke log kerja berkenaan, bukan lagi tersilap ke halaman Bonus. Baris gaji pembungkusan/produksi (termasuk bonus) kini turut boleh diklik untuk terus ke halaman Production Entry pada tarikh berkenaan, dan carian pekerja akan diisi dengan nama pekerja itu apabila produk dipilih. Paparan ringkasan (Consolidated) kekal dipadatkan seperti biasa dengan tanda ×N. Selain itu, halaman Bonus dan Others (Advance) kini mempunyai kotak carian.",
    en: "Payroll Details: in the Detailed view, each Bonus / Insentif, Others (Kerja Luar OT), and Cuti Tahunan record now shows on its own row with a clickable date that opens the page where it was entered (Bonus, Others (Advance), or Others/Kerja Luar), pre-filling that page's search box with the employee's name. Incentives (IXT) entered through a daily/monthly work log now link to that work log instead of incorrectly going to the Bonus page. Production/packing pay rows (including bonuses) are now also clickable, opening the Production Entry page for that date and pre-filling the worker search with that worker once a product is selected. The summary (Consolidated) view stays compacted as before with the ×N badge. The Bonus and Others (Advance) pages now also have a search box.",
  },
  {
    date: "2026-06-21",
    ms: "Laporan Gaji: entri Lain-lain/Kerja Luar yang menggunakan kod BONUS kini dipaparkan dengan betul di lajur Bonus, bukan lagi tersilap masuk ke lajur Gaji. Jumlah Gaji Kasar tidak berubah — hanya pembahagian lajur diperbetulkan. Jika anda mahu satu entri masuk lajur lain, pilihan 'Salary report column' pada borang Lain-lain masih boleh digunakan.",
    en: "Salary Report: Others/Kerja Luar entries using the BONUS pay code now correctly appear in the Bonus column instead of being mistakenly counted under Gaji. The Gross (Gaji Kasar) total is unchanged — only the column split is corrected. To force an entry into a different column, the 'Salary report column' option on the Others form still applies.",
  },
  {
    date: "2026-06-19",
    ms: "Laporan Gaji: cara gaji setiap pekerja dibahagikan kepada lajur Gaji, OT, Bonus, C/I/O dan Cuti telah diperbaharui. Gaji biasa/Ahad kekal di Gaji, semua kerja lebih masa (termasuk OT Kerja Luar) kini dipaparkan di lajur OT, kerja ikut bungkus/unit serta insentif (IXT, komisen, kehadiran penuh, dan seumpamanya) masuk ke C/I/O, dan Cuti Tahunan — termasuk yang dimasukkan melalui Lain-lain/pendahuluan — dipaparkan di Cuti. Jumlah yang direkod di bawah ID pekerja yang lain (pekerja berbilang ID) kini turut dimasukkan dalam baris pekerja itu, dan seorang pekerja tidak lagi dipaparkan dua kali. Jumlah dan Digenapkan dalam laporan kini menunjukkan jumlah gaji penuh termasuk amaun yang telah dibayar pendahuluan (senarai Bank dan slip gaji masih menunjukkan gaji bersih sebenar).",
    en: "Salary Report: reworked how each worker's pay is split across the Gaji, OT, Bonus, C/I/O and Cuti columns. Regular/Sunday wages stay in Gaji, all overtime (including Kerja Luar OT) now shows under the OT column, packing/piece-rate work and incentives (IXT, commission, full-attendance, etc.) go to C/I/O, and Cuti Tahunan — including those entered via Others/advances — shows under Cuti. Amounts recorded under a worker's other staff IDs (multi-ID staff) are now included in their row, and a person is no longer shown twice. The report's Jumlah and Digenapkan now reflect total salary including amounts already paid in advance (the Bank list and payslip still show the actual take-home).",
  },
  {
    date: "2026-06-19",
    ms: "Laporan Gaji: anda kini boleh memilih lajur mana sesuatu entri Lain-lain/Kerja Luar dipaparkan. Borang Tambah/Edit Lain-lain mempunyai pilihan baharu 'Salary report column' (Gaji, OT, Bonus, C/I/O atau Cuti) untuk menetapkan lajur secara manual bagi entri tertentu; biarkan pada Automatic untuk entri biasa. Berguna apabila kod yang sama patut masuk lajur berbeza bagi pekerja berbeza.",
    en: "Salary Report: you can now choose which column an Others/Kerja Luar entry appears in. The Add/Edit Others form has a new 'Salary report column' option (Gaji, OT, Bonus, C/I/O or Cuti) to override the automatic placement for specific entries; leave it on Automatic for normal entries. Handy when the same pay code should sit in different columns for different workers.",
  },
  {
    date: "2026-06-10",
    ms: "Sistem gaji Green Target dipertingkatkan dengan ciri-ciri penuh seperti Tien Hock: halaman baharu 'Mid-month Payroll' untuk merekod bayaran pendahuluan (ditolak automatik daripada gaji akhir bulan) dan halaman baharu 'Pinjam' untuk merekod pinjaman pekerja (jenis Mid-Month atau Monthly). Gaji bersih kini digenapkan ke ringgit penuh (Jumlah Digenapkan) selepas menolak bayaran pendahuluan, dan slip gaji memaparkan baris Bayaran Pendahuluan serta jumlah digenapkan. Butang 'Add Item' pada halaman butiran gaji kini berfungsi — caruman KWSP/PERKESO/SIP/PCB dikira semula secara automatik setiap kali item ditambah atau dibuang. Gaji yang sudah Finalized juga tidak lagi boleh diproses semula secara tidak sengaja. Menu Payroll Green Target kini mempunyai dropdown, halaman Driver Trips dibuang (trip pemandu dikira automatik daripada rekod sewaan semasa Process), pekerja yang dibuang daripada senarai pekerja GT akan dikeluarkan daripada gaji apabila Process ditekan semula, dan pekerja dalam senarai gaji GT tidak lagi muncul dalam halaman kemasukan jam kerja bulanan Tien Hock (elak gaji dua kali).",
    en: "The Green Target payroll system was upgraded with the full Tien Hock feature set: a new 'Mid-month Payroll' page to record advances (deducted automatically from the end-of-month pay) and a new 'Pinjam' page to record employee loans (Mid-Month or Monthly type). Net pay is now rounded up to the whole ringgit (Jumlah Digenapkan) after deducting the mid-month advance, and the payslip shows the Bayaran Pendahuluan line plus the rounded total. The 'Add Item' button on the pay details page now works — EPF/SOCSO/SIP/PCB contributions are recalculated automatically whenever an item is added or removed. Finalized payrolls can also no longer be accidentally re-processed. The Green Target Payroll menu now has a dropdown, the Driver Trips page was removed (driver trips are calculated automatically from rental records during Process), employees removed from the GT employee list are dropped from the payroll on the next Process, and staff on the GT payroll list no longer appear in Tien Hock's monthly hour-entry pages (prevents double payroll).",
  },
  {
    date: "2026-06-10",
    ms: "Cetakan slip gaji kini mencetak slip pecahan individu (individual breakdown) secara lalai di semua tempat — butang cetak pada baris pekerja, halaman Butiran Gaji, dan cetak ikut bahagian — kerana itu yang paling kerap diperlukan. Slip gabungan tidak lagi dicetak secara automatik. Butang baharu 'Print Combined' ditambah pada halaman Butiran Gaji untuk mencetak slip gabungan sahaja apabila diperlukan (hanya muncul untuk pekerja berbilang kerja).",
    en: "Printing payslips now prints the individual breakdown slips by default everywhere — the employee-row print button, the Payroll Details page, and print-by-section — since that's what's needed most often. The combined slip is no longer printed automatically. A new 'Print Combined' button on the Payroll Details page prints the combined slip only when needed (it appears only for multi-job employees).",
  },
  {
    date: "2026-06-09",
    ms: "Slip gaji individu (individual breakdown) bagi pekerja yang berkongsi nama: tajuk 'Kerja N of M (Individual Breakdown)' telah dibuang. Slip pekerja Ketua (Head) — yang ditetapkan dalam borang Staf — kini disenaraikan dahulu selepas slip gabungan dan memaparkan potongan KWSP/SOCSO/SIP/PCB serta jumlah Gaji Bersih. Jika tiada Head ditetapkan, potongan kekal hanya pada slip gabungan seperti biasa. Pada slip gabungan, baris 'Jumlah Lain-lain' yang mengelirukan (mengira semula item Tambahan yang sudah termasuk dalam subtotal setiap kerja) tidak lagi dipaparkan apabila tiada item lain-lain sebenar. Selain itu, bayaran pendahuluan (advance) kini dipaparkan pada slip gabungan walaupun ia direkodkan di bawah ID pekerja yang berkongsi nama — sebelum ini jumlahnya ditolak daripada gaji akhir tetapi barisnya tidak ditunjukkan.",
    en: "Individual breakdown payslips for same-name staff: the 'Kerja N of M (Individual Breakdown)' title was removed. The Head's slip — set in the Staff form — now appears first after the combined slip and shows the EPF/SOCSO/SIP/PCB deductions plus a Net Pay total. If no Head is set, deductions stay on the combined slip only, as before. On the combined slip, the misleading 'Jumlah Lain-lain' row (which re-summed Tambahan items already included in each job's subtotal) no longer appears when there are no genuine other items. Also, advance payments now show on the combined slip even when recorded under a same-name sibling ID — previously the amount was subtracted from the final total but its line item was hidden.",
  },
  {
    date: "2026-06-09",
    ms: "Halaman baharu 'Payroll Bank Payment' (di bawah Perakaunan). Ia menyenaraikan bayaran gaji bersih, gaji separuh bulan, dan caruman KWSP/SOCSO/SIP/PCB bagi bulan yang dipilih, dengan jumlah diisi automatik daripada payroll (gaji bersih tolak pinjam). Setiap jumlah, tarikh dan akaun bank boleh diubah supaya sepadan dengan bayaran sebenar, kemudian dicatat terus ke lejar bank sebagai bayaran keluar.",
    en: "New 'Payroll Bank Payment' page (under Accounting). It lists net salary, half-month salary, and the EPF/SOCSO/SIP/PCB remittances for the selected month, with amounts pre-filled from payroll (take-home minus pinjam). Every amount, date and bank account is editable to match the actual transfer, then posts straight to the bank ledger as an outgoing payment.",
  },
  {
    date: "2026-06-09",
    ms: "Penyata Bank kini boleh ditetapkan baki pembukaan (opening balance). Klik 'Set opening balance', pilih tarikh dan jumlah, dan laporan akan bermula dari baki itu serta mengabaikan semua catatan sebelum tarikh tersebut — berguna untuk memadankan baki dengan penyata bank sebenar.",
    en: "The Bank Statement report now supports a starting (opening) balance. Click 'Set opening balance', pick a date and amount, and the report starts from that figure and ignores everything before that date — useful for tying the book balance to the real bank statement.",
  },
  {
    date: "2026-06-09",
    ms: "Slip gaji kini sama tanpa mengira dari mana ia dicetak (butang cetak pada baris pekerja, halaman butiran gaji, atau cetak ikut bahagian). Sebelum ini cetakan dari baris pekerja kadangkala tertinggal baris Bayaran Pendahuluan, dan cetakan ikut bahagian kadangkala menolak advance Insentif Tidak Tetap dua kali — kedua-duanya kini diselaraskan.",
    en: "Payslips are now identical no matter where they're printed from (the employee row print button, the payroll details page, or print-by-section). Previously a row print could miss the mid-month advance (Bayaran Pendahuluan) line, and a print-by-section could deduct an Insentif Tidak Tetap advance twice — both are now consistent.",
  },
  {
    date: "2026-06-09",
    ms: "Pembetulan slip pecahan individu (Individual Breakdown) bagi pekerja gabungan: advance Insentif Tidak Tetap kini ditolak pada slip pecahan yang memaparkan pendapatan advance itu, supaya \"Jumlah Selepas Advances\" pada slip tersebut lengkap. Sebelum ini advance itu ditunjukkan sebagai pendapatan tetapi tidak ditolak pada slip yang sama.",
    en: "Individual Breakdown fix for combined employees: an Insentif Tidak Tetap advance is now deducted on the same breakdown slip that shows its income, so that slip's \"Jumlah Selepas Advances\" is complete. Previously the advance appeared as income but was not deducted on the same slip.",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan slip gaji Packing Bihun: aktiviti harian yang tiada kuantiti tidak lagi dikira sebagai 1 beg/bundle, dan rekod Hancur/Karung tidak lagi menaikkan jumlah beg harian untuk bonus F/HARIAN. Ini membetulkan kes seperti RAMBU_PB supaya bonus dan jumlah gaji kasar sepadan dengan slip lama. Gaji bulan yang terlibat perlu diproses semula.",
    en: "Packing Bihun payslip fix: daily activities with no quantity no longer count as 1 bag/bundle, and Hancur/Karung records no longer increase the daily bag count for F/HARIAN bonus eligibility. This fixes cases like RAMBU_PB so the bonus and gross pay match the legacy payslip. Affected months should be re-processed.",
  },
  {
    date: "2026-06-07",
    ms: "Slip gaji gabungan kini menyusun baris mengikut kerja dahulu. Untuk setiap kerja, bayaran asas, tambahan dan OT dipaparkan bersama di bawah bahagian kerja itu, jadi tambahan Packing Bihun contohnya tidak lagi muncul jauh di bawah kerja lain.",
    en: "Combined payslips now group rows by work first. For each work section, base pay, additional pay and OT appear together under that work, so a Packing Bihun additional line no longer appears far below other work sections.",
  },
  {
    date: "2026-06-07",
    ms: "Payroll kini boleh diproses semula secara terpilih. Jika carian digunakan, butang Process hanya memproses pekerja yang sedang dipaparkan. Pekerja yang ditanda juga boleh diproses melalui butang Process Selected, dan halaman Payroll Details kini mempunyai butang Re-process untuk pekerja tersebut sahaja.",
    en: "Payroll can now be reprocessed selectively. When a search is active, the Process button only processes the employees currently shown. Checked employees can also be processed with Process Selected, and Payroll Details now has a Re-process button for that employee only.",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan: pada slip pecahan individu (Individual Breakdown) bagi pekerja gabungan, \"Bahagian\" kini menunjukkan bahagian kerja itu sendiri (contohnya MEE_PACKING → Mee), bukan lagi bahagian gabungan (kerja utama). Sebelum ini slip MEE_PACKING ROSMINA tersilap menunjukkan Bahagian: Bihun.",
    en: "Fix: on the Individual Breakdown slip for combined employees, \"Bahagian\" now shows that job's own section (e.g. MEE_PACKING → Mee) instead of the combined payroll's (primary job's) section. Previously ROSMINA's MEE_PACKING slip wrongly showed Bahagian: Bihun.",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan KWSP: bayaran kerja lebih masa (OT/Overtime) tidak lagi dimasukkan dalam asas pengiraan KWSP. Sebelum ini entri OT yang dimasukkan melalui Others (Kerja Luar OT) — contohnya \"OT (TARIK MEE-DRYER)\" — tersilap dikira dalam gaji asas KWSP, menyebabkan potongan KWSP terlebih. OT masih dikira dalam Gaji Kasar dan dalam SOCSO/SIP/PCB seperti biasa; hanya KWSP yang berubah. Gaji bulan yang terlibat perlu diproses semula.",
    en: "EPF fix: overtime (OT) pay is no longer included in the EPF wage base. Previously OT entered via Others (Kerja Luar OT) — e.g. \"OT (TARIK MEE-DRYER)\" — was wrongly counted in the EPF base, overstating the EPF deduction. OT still counts towards Gross Pay and towards SOCSO/SIP/PCB as before; only EPF changes. Affected months should be re-processed.",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan: bonus F/HARIAN kini menggunakan kod (dan kadar) yang ditetapkan kepada pekerja apabila sesuatu produk mempunyai lebih daripada satu kod untuk tahap yang sama. Contohnya bagi Bihun 3U(600G), sistem tersilap memilih kadar 0.17 sedangkan pekerja ditetapkan kadar 0.19, menyebabkan bonus terkurang bayar. Gaji bulan yang terlibat perlu diproses semula.",
    en: "Fix: the F/HARIAN bonus now uses the code (and rate) assigned to the worker when a product has more than one code for the same tier. For example on Bihun 3U(600G) the system wrongly picked the 0.17 rate when the worker was assigned 0.19, underpaying the bonus. Affected months should be re-processed.",
  },
  {
    date: "2026-06-07",
    ms: "Slip gaji: bahagian asas kini sentiasa menunjukkan baris subtotal \"Jumlah Base\" dengan garis pemisah, supaya ia jelas berasingan daripada \"Jumlah Lain-lain\". Baris itu hanya menunjukkan jumlah amaun — label \"Rate/Bag\" dan \"Jumlah Bag\" dibuang kerana ia mengelirukan apabila pekerja mempunyai beberapa paycode asas pada kadar berbeza. Selain itu, baris F/HARIAN yang digabungkan tidak lagi memaparkan label \"(N bags)\" sehari yang mengelirukan (contohnya \"(130 bags)\" di sebelah \"1492 Bag\") — kuantiti penuh tetap dipaparkan di lajur kuantiti.",
    en: "Payslip: the base section now always shows a \"Jumlah Base\" subtotal row with a separating line, so it reads as clearly separate from \"Jumlah Lain-lain\". That row shows only the total amount — the \"Rate/Bag\" and \"Jumlah Bag\" labels were removed because they're misleading when a worker has several base paycodes at different rates. Also, merged F/HARIAN lines no longer show the misleading single-day \"(N bags)\" tag (e.g. \"(130 bags)\" next to \"1492 Bag\") — the full quantity still appears in the quantity column.",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan: pada slip pecahan individu (Individual Breakdown) bagi pekerja gabungan, baris \"Gross Pay\" kini sentiasa sama dengan jumlah subtotal yang dipaparkan di atasnya. Sebelum ini ia kadangkala tersasar beberapa sen (contohnya 1195.10 berbanding 1195.05) kerana ia menjumlahkan amaun harian yang digenapkan satu per satu, manakala subtotal dikira sekali gus (kadar × jumlah kuantiti).",
    en: "Fix: on the Individual Breakdown slip for combined employees, the \"Gross Pay\" row now always equals the subtotals shown above it. Previously it could be a few cents off (e.g. 1195.10 vs 1195.05) because it summed each day's separately-rounded amount, while the subtotals are computed once (rate × total quantity).",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan: bagi pekerja gabungan (satu orang dengan beberapa ID/kerja, contohnya Packing + Roll), bayaran pendahuluan pertengahan bulan setiap ID kini dikira dengan betul. Slip gabungan kini menolak JUMLAH semua bayaran pendahuluan (contohnya 250 + 200 = 450), dan setiap slip pecahan individu memaparkan bayaran pendahuluannya sendiri serta \"Jumlah Selepas Advances\". Sebelum ini hanya satu bayaran pendahuluan diambil kira, jadi baki seperti 200 itu hilang dan tidak ditolak. Gaji bulan yang terlibat perlu diproses semula.",
    en: "Fix: for combined employees (one person with several IDs/jobs, e.g. Packing + Roll), each ID's mid-month advance is now handled correctly. The combined slip now deducts the TOTAL of all advances (e.g. 250 + 200 = 450), and every individual breakdown slip shows its own advance and a \"Jumlah Selepas Advances\" line. Previously only one advance was counted, so an amount like the extra 200 went missing and was never deducted. Affected months should be re-processed.",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan: bonus F/HARIAN Packing Mee kini dibayar mengikut setiap produk pada kadar produk itu sendiri. Pada hari pekerja membungkus lebih daripada satu jenis produk (contohnya 350G dan MNL pada hari yang sama), sistem dahulunya menggunakan satu kadar untuk semua beg hari itu, menyebabkan jumlah tidak sepadan dengan slip lama. Kelayakan masih berdasarkan jumlah beg sehari. Gaji bulan yang terlibat perlu diproses semula.",
    en: "Fix: the Packing Mee F/HARIAN bonus is now paid per product at each product's own rate. On days a worker packs more than one product type (e.g. 350G and MNL on the same day), the system previously applied a single rate to the whole day's bags, making totals disagree with the legacy slips. Qualification is still based on the combined daily bag count. Affected months should be re-processed.",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan: pengiraan bonus F/HARIAN untuk Packing Mee diperbetulkan dalam tiga keadaan. (1) Hari yang membungkus lebih 140 beg tidak lagi kehilangan bonus F/HARIAN — sebelum ini bonus untuk hari tersebut hilang sepenuhnya kerana Mee tiada kadar \">140\". (2) Hari yang mencapai tepat ambang (100 beg untuk Mee, 70 beg untuk Bihun) kini layak menerima bonus — sebelum ini hanya \"lebih daripada\" ambang yang dikira. (3) Kadar asas kini mengikut paycode yang ditetapkan kepada pekerja; sebelum ini sesetengah produk (2UDG/3UDG) tersilap memilih kadar mesin (0.45) dan bukan kadar pekerja (0.25). Gaji bulan yang terlibat perlu diproses semula untuk membetulkan jumlah tersimpan.",
    en: "Fix: the Packing Mee F/HARIAN bonus calculation is corrected in three cases. (1) Days packing more than 140 bags no longer lose their F/HARIAN bonus — previously the whole day's bonus disappeared because Mee has no \">140\" rate. (2) Days that hit exactly the threshold (100 bags for Mee, 70 bags for Bihun) now qualify for the bonus — previously only days strictly above the threshold counted. (3) The base rate now follows the pay code assigned to each worker; previously some products (2UDG/3UDG) wrongly picked the machine rate (0.45) instead of the worker's rate (0.25). Affected months should be re-processed to correct the stored totals.",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan: paycode yang menggunakan unit \"Bill\" (contohnya BILL — jual lebih 10 bil/hari untuk salesman) kini mengira amaun berdasarkan kuantiti bil yang dimasukkan (kadar × bilangan bil), sama seperti unit \"Day\". Sebelum ini paparan di halaman Daily Log Details menunjukkan amaun/kuantiti yang tidak konsisten kerana unit \"Bill\" dikira ikut jam (salesman tiada jam). Amaun pada slip gaji tidak berubah.",
    en: "Fix: paycodes using the \"Bill\" unit (e.g. BILL — sell more than 10 bills/day for salesmen) now calculate the amount from the entered bill count (rate × number of bills), the same as the \"Day\" unit. Previously the Daily Log Details page showed an inconsistent amount/quantity because the \"Bill\" unit was computed from hours (salesmen have no hours). Payslip amounts are unchanged.",
  },
  {
    date: "2026-06-07",
    ms: "Pembetulan: pada modal Others (Kerja Luar OT), paycode yang menggunakan unit \"Tray\" kini mengira amaun dengan betul (kadar × kuantiti). Sebelum ini menukar kuantiti tidak mengubah amaun (kekal 0) walaupun ada kadar.",
    en: "Fix: in the Others (Kerja Luar OT) modal, paycodes using the \"Tray\" unit now calculate the amount correctly (rate × quantity). Previously changing the quantity didn't affect the amount (stayed 0) even though a rate was set.",
  },
  {
    date: "2026-06-06",
    ms: "Pembetulan: baris Advance Payment (bayaran pertengahan bulan) kini muncul dengan betul pada slip gaji yang dicetak. \"Print Payslips\" (cetak ikut seksyen) dahulunya hanya menunjukkannya untuk pekerja yang telah ditanda; selain itu, pada bulan yang mempunyai banyak bayaran pertengahan bulan, sesetengah slip tercetak tanpa baris ini walaupun pekerja telah dipilih. Kedua-dua keadaan kini diperbetulkan.",
    en: "Fix: the Advance Payment (mid-month) line now appears correctly on printed payslips. \"Print Payslips\" (print by section) previously only showed it for employees who were ticked first; separately, in months with many mid-month payments some payslips printed without this line even when the employee was selected. Both cases are now fixed.",
  },
  {
    date: "2026-06-06",
    ms: "Pembetulan: rekod (Bonus, Insentif, Kerja Luar/OT, dan cuti) yang bertarikh pada hari terakhir bulan kini dikira dengan betul semasa memproses gaji. Sebelum ini ia tertinggal daripada jumlah Gaji Kasar di senarai Payroll dan daripada potongan KWSP/SOCSO/SIP/cukai, walaupun ia betul pada slip gaji — menyebabkan jumlah di senarai berbeza dengan slip. Gaji bulan yang terlibat perlu diproses semula untuk membetulkan jumlah tersimpan.",
    en: "Fix: records (Bonus, Incentive, Others/OT, and leave) dated on the last day of the month are now counted correctly when processing payroll. Previously they were left out of the Gross Pay shown in the Payroll list and out of the EPF/SOCSO/SIP/tax deductions, even though the payslip was correct — making the list total disagree with the payslip. Affected months should be re-processed to correct the stored totals.",
  },
  {
    date: "2026-06-05",
    ms: "Salary Report (jadual Employee/Lokasi): lajur \"COMM\" dinamakan semula kepada \"C/I/O\" dan kini menjumlahkan Commission, semua bayaran Tambahan/Insentif (termasuk IXT, kerja Ahad/penyelenggaraan, dll. — kecuali Bonus) dan Others/Kerja Luar OT. Lajur \"GAJI\" kini menunjukkan gaji asas sahaja (bayaran Tambahan telah dipindahkan ke C/I/O). Lajur baharu \"CUTI\" ditambah yang menjumlahkan semua bayaran cuti (Cuti Umum, Sakit, Tahunan, Rawatan); Cuti Tahunan yang direkod sebagai komisen (lokasi 23) kini dikira di bawah CUTI, bukan lagi C/I/O.",
    en: "Salary Report (Employee/Location tables): the \"COMM\" column is renamed to \"C/I/O\" and now adds up Commission, all Tambahan/Insentif pay (including IXT, Sunday/maintenance work, etc. — except Bonus) and Others/Kerja Luar OT. The \"GAJI\" column now shows base salary only (Tambahan pay has moved into C/I/O). A new \"CUTI\" column is added that totals all leave pay (Cuti Umum, Sakit, Tahunan, Rawatan); Cuti Tahunan recorded as commission (location 23) now counts under CUTI instead of C/I/O.",
  },
  {
    date: "2026-06-05",
    ms: "Salary Report: tab baharu \"Cuti\" ditambah. Ia memaparkan ringkasan cuti bagi semua pekerja dengan setiap jenis cuti (Cuti Sakit, Cuti Tahunan, Cuti Umum, Cuti Rawatan) sebagai lajur, masing-masing menunjukkan hari (guna/jumlah kelayakan) dan amaun. Ia mengikut suis Bulanan/Tahunan: Bulanan menunjukkan cuti bulan dipilih, Tahunan menunjukkan jumlah setahun.",
    en: "Salary Report: added a new \"Cuti\" tab. It shows a leave summary for all employees with each leave type (Cuti Sakit, Cuti Tahunan, Cuti Umum, Cuti Rawatan) as columns, each showing days (used/total entitlement) and amount. It follows the Monthly/Yearly toggle: Monthly shows the selected month's leave, Yearly shows the full-year totals.",
  },
  {
    date: "2026-06-05",
    ms: "Payroll Details dan payslip: entri IXT kini digabungkan ke bahagian Insentif Tidak Tetap, jadi jumlah pendapatan Insentif Tidak Tetap menunjukkan amaun Advance dan IXT bersama-sama, bukan lagi sebagai baris Tambahan Pay berasingan. Cuti Tahunan kekal dipaparkan di bahagian Cuti.",
    en: "Payroll Details and payslips: IXT entries now combine into the Insentif Tidak Tetap section, so the Insentif Tidak Tetap earnings amount shows the Advance and IXT amounts together instead of a separate Tambahan Pay row. Cuti Tahunan stays in the Leave section.",
  },
  {
    date: "2026-06-05",
    ms: "Payslip: apabila insentif yang sama muncul sebagai Advance (commission) dan juga sebagai Others (Kerja Luar OT) dengan nama yang sama, kedua-duanya kini digabung menjadi satu baris pendapatan dengan jumlah penuh (contohnya Insentif Tidak Tetap 50 + 830 = 880). Potongan Advance di bahagian bawah payslip kekal hanya pada amaun Advance yang sebenar (50).",
    en: "Payslip: when the same incentive appears both as an Advance (commission) and as an Others (Kerja Luar OT) entry with the same name, the two are now combined into one earnings line showing the full total (e.g. Insentif Tidak Tetap 50 + 830 = 880). The Advance deduction at the bottom of the payslip still shows only the actual Advance amount (50).",
  },
  {
    date: "2026-06-05",
    ms: "Payslip: apabila kerja yang sama muncul dalam Tambahan dan juga Others (Kerja Luar OT) dengan paycode, kadar dan unit yang sama, kedua-duanya kini digabung menjadi satu baris dengan jumlah jam dan amaun yang betul pada payslip. Halaman Payroll Details kekal memaparkannya secara berasingan.",
    en: "Payslip: when the same work appears under Tambahan and also under Others (Kerja Luar OT) with the same paycode, rate and unit, the two are now combined into a single line with the correct total hours and amount on the payslip. The Payroll Details page still shows them separately.",
  },
  {
    date: "2026-06-05",
    ms: "Setiap pekerja kini boleh ditetapkan cara caruman EPF, SOCSO dan SIP dikira di bawah tab Documents pada borang pekerja. Contohnya, pekerja yang berumur 60 ke atas boleh diberi kadar EPF 'bawah 60', dan pekerja asing tanpa pasport Malaysia boleh ditanda 'Tidak Layak' supaya tiada caruman EPF/SOCSO/SIP dikira untuknya. Biarkan sebagai Auto untuk mengikut tarikh lahir dan kewarganegaraan seperti biasa. Payroll akan mengikut tetapan ini.",
    en: "You can now set how EPF, SOCSO and SIP are applied for each staff under the Documents tab of the staff form. For example, a staff aged 60 or above can be given the 'under 60' EPF rate, and a foreign worker without a Malaysian passport can be marked 'Not Eligible' so no EPF/SOCSO/SIP is calculated for them. Leave it as Auto to follow birthdate and nationality as before. Payroll follows these settings.",
  },
  {
    date: "2026-06-05",
    ms: "Halaman Production Entry kini membolehkan susunan kad pekerja diubah dengan menyeret pemegang pada kad. Susunan ini dikongsi untuk semua pengguna mengikut kumpulan kerja Bihun atau Mee, nilai yang sudah ditaip kekal bersama pekerja yang betul apabila kad dipindahkan, dan butang Refresh Order boleh digunakan untuk memuat semula susunan terkini.",
    en: "Production Entry now lets you reorder worker cards by dragging the handle on each card. The order is shared for all users by Bihun or Mee worker group, typed values stay with the correct worker when cards are moved, and the Refresh Order button can reload the latest order.",
  },
  {
    date: "2026-06-05",
    ms: "Payroll Details kini menunjukkan ringkasan Pinjam di bahagian bawah halaman apabila pekerja ada pinjam pada bulan itu, memaparkan gaji akhir selepas ditolak pinjam (Final Mid-Month Pay dan Jumlah Masuk Bank). Ringkasan ini hanya pada halaman dan tidak muncul dalam payslip. Di halaman Sistem Pinjam, klik pada badan kad pekerja untuk terus pergi ke ringkasan Pinjam di bahagian bawah Payroll Details pekerja itu.",
    en: "Payroll Details now shows a Pinjam summary at the bottom of the page when an employee has pinjam that month, displaying the final pay after pinjam deductions (Final Mid-Month Pay and Jumlah Masuk Bank). This summary is page-only and does not appear on the payslip. On the Pinjam System page, click an employee card's body to jump straight to the Pinjam summary at the bottom of that employee's Payroll Details.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan Gaji Kasar: kerja harian yang dicatat pada hari cuti tidak lagi ditambah ke dalam gaji kasar. Hari cuti sudah dibayar di bahagian Cuti, jadi kerja pada hari yang sama (contohnya bungkusan atau dulang) tidak lagi dikira dua kali. Jumlah Gaji Kasar dalam Payroll Details dan payslip kini sama dengan jumlah baris yang dipaparkan.",
    en: "Gross pay fix (RAMBU & DANISH, etc.): daily work recorded on a leave day is no longer added to gross pay. The leave day is already paid in the Cuti section, so work logged on the same day (e.g. packing bags or trays) is no longer double-counted. The Jumlah Gaji Kasar in Payroll Details and payslips now matches the sum of the lines shown.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan Payroll: entri Others (Kerja Luar OT) yang menggunakan paycode jenis Overtime kini dipaparkan dan dijumlahkan di bahagian Overtime dalam Payroll Details dan payslip.",
    en: "Payroll fix: Others (Kerja Luar OT) entries that use an Overtime paycode now appear and total under Overtime in Payroll Details and payslips.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan PCB: gaji dengan sen kini dipadankan kepada julat PCB yang betul, contohnya RM5,975.78 menggunakan julat RM5,976-RM5,980 supaya potongan PCB muncul dalam payslip.",
    en: "PCB fix: salary amounts with cents now match the correct PCB range, for example RM5,975.78 uses the RM5,976-RM5,980 range so the PCB deduction appears on the payslip.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan Sistem Pinjam: rekod pinjam kini boleh disimpan untuk ID staf yang panjang seperti JASSON_ROLL.",
    en: "Pinjam System fix: pinjam records can now be saved for longer staff IDs such as JASSON_ROLL.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan kerja lebih masa Bihun: apabila pekerja ada jam dalam ruangan OT 'jaga stim' di samping kerja lebih masa biasa, setiap baris OT kini dibayar mengikut jamnya sendiri, bukan kedua-dua baris dibayar mengikut jumlah gabungan. Ini membetulkan jumlah OT yang terlebih bayar dalam Payroll Details.",
    en: "Fixed Bihun overtime: when a worker has hours in the 'jaga stim' OT column on top of normal overtime, each overtime line is now paid for its own hours instead of both lines being paid the combined total. This corrects overstated OT amounts in Payroll Details.",
  },
  {
    date: "2026-06-04",
    ms: "Halaman Sistem Pinjam dikemas kini: ada kotak carian (atau terus menaip) untuk mencari pekerja dengan cepat mengikut nama atau ID kakitangan, kad pekerja kini lebih padat (hanya bahagian yang ada pinjam dipaparkan), butang tindakan kekal kelihatan di bahagian atas semasa menatal, dan halaman dibuka pada bulan sebelumnya sepanjang 1 hingga 7 hari bulan.",
    en: "The Pinjam System page has been refreshed: a search box — or just start typing — lets you quickly find an employee by name or staff ID, employee cards are now more compact (only the sections that have pinjam are shown), the action buttons stay visible at the top while you scroll, and the page opens to the previous month from the 1st through the 7th.",
  },
  {
    date: "2026-06-04",
    ms: "Pembetulan: Jumlah Bank dan Pinjam dalam Salary Report kini menggunakan gaji yang telah digenapkan sebelum menolak pinjam bulanan, supaya jumlah bayaran sepadan dengan Payroll Details dan halaman Pinjam.",
    en: "Fix: Bank and Pinjam totals in Salary Report now use the rounded salary before monthly pinjam is deducted, so payment amounts match Payroll Details and the Pinjam page.",
  },
  {
    date: "2026-06-03",
    ms: "Memproses semula gaji bulanan kini menggunakan kadar semasa setiap kod gaji untuk semua hari dalam bulan, jadi perubahan kadar selepas jam kerja direkod akan digunakan untuk semua hari (sebelum ini sesetengah hari mengekalkan kadar lama).",
    en: "Reprocessing a monthly payroll now applies each pay code's current rate to every day in the month, so a rate change made after hours were logged takes effect for all days (previously some days could keep the old rate).",
  },
  {
    date: "2026-06-03",
    ms: "Cuti dalam Log Harian kini menyimpan bayaran cuti tanpa menambah aktiviti kerja harian pada hari cuti — untuk semua pekerja, termasuk Salesman dan Salesman Ikut.",
    en: "Daily Log leave now keeps the leave pay amount without adding daily work activities on the leave day — for all workers, including Salesman and Salesman Ikut.",
  },
  {
    date: "2026-06-02",
    ms: "Halaman Payroll kini dibuka pada bulan sebelumnya sepanjang 1 hingga 7 hari bulan jika tiada bulan dipilih, supaya pemprosesan gaji bulan lepas lebih mudah.",
    en: "Payroll now opens to the previous month from the 1st through the 7th when no month is selected, making it easier to finish last month's payroll.",
  },
  {
    date: "2026-06-02",
    ms: "Halaman MEE Packing Cuti dan Bihun Packing Cuti kini ada pemilih tarikh supaya tarikh lebih awal boleh dibuka terus tanpa menekan butang hari sebelumnya berkali-kali.",
    en: "MEE Packing Cuti and Bihun Packing Cuti now have a date picker so earlier dates can be opened directly without repeatedly pressing the previous-day button.",
  },
  {
    date: "2026-05-28",
    ms: "Halaman Others (Kerja Luar OT) kini menyokong entri pelbagai tarikh dan pelbagai staf dalam satu langkah. Pilih beberapa hari pada satu staf/paycode untuk menyimpannya sebagai entri berkait — kadar, kuantiti, paycode dan keterangan akan sentiasa selaras merentas semua tarikh berkait. Gunakan butang \"Add multiple staff\" untuk menambah baris yang sama untuk beberapa staf sekaligus (sesuai untuk FULL HARIAN, HADIR_MEETING, dan sebagainya). Entri berkait ditanda dengan ikon rantai 🔗 pada senarai, dan padam akan mengeluarkan semua tarikh berkait setelah disahkan. Pembetulan: tarikh dalam modal edit Others tidak lagi tersusut sehari lebih awal.",
    en: "The Others (Kerja Luar OT) page now supports multi-date and multi-staff entries in one step. Pick several days for one staff/paycode to save them as a linked entry — the rate, quantity, paycode, and description stay in sync across every linked date. Use the new \"Add multiple staff\" button to fan out the same row to many staff at once (e.g. FULL HARIAN, HADIR_MEETING). Linked entries show a 🔗 badge in the list, and deleting one prompts to remove all the linked dates together. Fix: the edit modal no longer shows the date one day earlier than what was saved.",
  },
  {
    date: "2026-05-25",
    ms: "Eksport PCB di e-Caruman kini mengikut susun atur fail CP39 LHDN yang standard, termasuk medan nombor cukai, kod isteri, nama, nombor kad pengenalan, pasport, kod negara, amaun PCB dan CP38 pada panjang medan yang betul.",
    en: "The PCB export in e-Caruman now follows the standard LHDN CP39 file layout, with tax number, wife code, name, IC number, passport, country code, PCB amount, and CP38 amount written at the correct field lengths.",
  },
  {
    date: "2026-05-25",
    ms: "Halaman Payroll: butang cetak payslip pukal kini dinamakan \"Print Payslips\" dan membuka menu pilihan apabila dihover. Menu menyenaraikan semua bahagian kerja (contoh: Mee Production, Packing Mee, Packing Bihun, Office, Salesman) yang ada dalam payroll bulan tersebut. Setiap bahagian mempunyai kotak semak untuk pilih beberapa bahagian dicetak bersama dalam satu PDF, butang cetak pantas untuk mencetak bahagian itu sahaja, serta butang Select All di bahagian atas. Secara lalai semua bahagian ditandakan, jadi mengklik Print di bahagian bawah sama seperti mencetak semua payslip seperti sebelum ini.",
    en: "Payroll page: the bulk payslip print button is now labelled \"Print Payslips\" and opens a selection menu on hover. The menu lists all work sections (e.g. Mee Production, Packing Mee, Packing Bihun, Office, Salesman) present in that month's payroll. Each section has a checkbox to pick multiple sections to print together in one PDF, a quick-print button to print just that section, and a Select All toggle at the top. All sections are checked by default, so clicking Print at the bottom prints every payslip just like before.",
  },
  {
    date: "2026-05-24",
    ms: "Caruman SOCSO kini termasuk amaun SKBBK baharu yang diwajibkan PERKESO untuk gaji Jun 2026 dan seterusnya. Bagi pekerja di bawah 60 tahun, jumlah caruman pekerja ialah Keilatan + SKBBK; pekerja 60 tahun ke atas membayar SKBBK sahaja. Eksport SOCSO dan SIP kerajaan telah digabungkan menjadi satu fail SOCSO-SIP{MMYY}.TXT dalam folder SOCSO-SIP/. Kedua-dua kad SOCSO dan SIP di halaman e-Caruman kini memuat turun fail gabungan yang sama. Halaman Contribution Rates juga dikemas kini untuk menunjukkan kadar SKBBK baharu, yang boleh diedit.",
    en: "SOCSO contributions now include the new SKBBK amount required by PERKESO for June 2026 payrolls onward. For employees under 60, the employee contribution is Keilatan + SKBBK; employees 60 and above pay SKBBK only. The SOCSO and SIP government exports were merged into a single SOCSO-SIP{MMYY}.TXT file in the new SOCSO-SIP/ folder, and both the SOCSO and SIP cards on the e-Caruman page now download that same combined file. The Contribution Rates page was updated to show and allow editing of the new SKBBK rate.",
  },
  {
    date: "2026-05-23",
    ms: "Pembetulan: Tarikh cuti dalam Log Bulanan kadangkala dipaparkan sehari lebih awal daripada tarikh yang disimpan apabila halaman dibuka semula. Tarikh kini dipaparkan dengan betul.",
    en: "Fix: Leave dates in Monthly Logs sometimes displayed one day earlier than the saved date when the page was reopened. Dates now display correctly.",
  },
  {
    date: "2026-05-21",
    ms: "Pembetulan: Cuti Tahunan yang ditambah dalam Log Bulanan kini dikira sebagai bayaran cuti biasa, bukan sebagai pendahuluan. Hanya rekod Cuti Tahunan daripada Others (Advance) dikira sebagai pendahuluan.",
    en: "Fix: Annual Leave added in Monthly Logs is now treated as regular leave pay, not an advance. Only Annual Leave records from Others (Advance) are treated as advances.",
  },
  {
    date: "2026-05-21",
    ms: "Halaman MEE Packing Cuti dan Bihun Packing Cuti kini tersedia dalam Payroll untuk merekod cuti pekerja packing harian dengan jumlah bayaran manual. Rekod ini akan masuk dalam pengiraan gaji dan semakan baki cuti.",
    en: "MEE Packing Cuti and Bihun Packing Cuti pages are now available in Payroll for daily packing-worker leave with manual payment amounts. These records are included in payroll calculations and leave balance checks.",
  },
  {
    date: "2026-05-21",
    ms: "Log Bulanan kini boleh menetapkan jumlah bayaran cuti semasa menambah cuti, dengan RM65 sebagai jumlah asal. Jumlah cuti baharu dan yang sudah disimpan boleh diedit dan digunakan dalam pengiraan gaji.",
    en: "Monthly Logs can now set a leave payment amount when adding leave, with RM65 as the default. New and saved leave amounts can be edited and used in payroll calculations.",
  },
  {
    date: "2026-05-20",
    ms: 'Dokumen Pelarasan diperkenalkan dalam Sales: Nota Kredit, Nota Debit dan Nota Refund kini boleh dikeluarkan dari halaman butiran invois dan diuruskan di halaman baru "Adjustment Documents" di bawah Sales. Nota Kredit boleh mengeluarkan Nota Refund berpasangan secara automatik apabila invois sudah dibayar. Pembatalan dokumen akan membalikkan kesan kepada baki invois, kredit pelanggan, dan rekod perakaunan.',
    en: 'Adjustment Documents introduced in Sales: Credit, Debit, and Refund Notes can now be issued from the invoice details page and managed at a new "Adjustment Documents" page under Sales. Credit Notes can automatically issue a paired Refund Note when the invoice is already paid. Cancelling a document reverses its effect on the invoice balance, customer credit, and accounting entries.',
  },
  {
    date: "2026-05-20",
    ms: 'Halaman baru "Production Records" ditambah dalam Stock untuk melihat rekod pengeluaran mengikut hari, kategori, produk dan pekerja, dengan pautan terus untuk mengedit di Production Entry.',
    en: 'New "Production Records" page in Stock for viewing production records by day, category, product, and worker, with direct links back to Production Entry for editing.',
  },
  {
    date: "2026-05-19",
    ms: "Jelly Polly kini mempunyai halaman Ringkasan Jualan sendiri yang memaparkan hanya produk Jelly Polly. Ringkasan Jualan Tien Hock tidak lagi memasukkan data Jelly Polly, dan PDF Jelly Polly menggunakan \"JELLY POLLY FOOD INDUSTRIES\" sebagai tajuk syarikat.",
    en: "Jelly Polly now has its own Sales Summary page showing only Jelly Polly products. The Tien Hock Sales Summary no longer includes Jelly Polly data.",
  },
  {
    date: "2026-05-19",
    ms: "Pembetulan: Pekerja yang mempunyai lebih daripada satu ID kini berkongsi satu jumlah kelayakan cuti (Tahunan, Sakit, Umum, Rawatan) berdasarkan nama penuh — sama seperti cara sistem gaji mengumpulkannya.",
    en: "Fix: Staff with multiple IDs now share a single leave entitlement (Tahunan, Sakit, Umum, Rawatan) grouped by full name — matching how the payroll system already groups them.",
  },
  {
    date: "2026-05-19",
    ms: 'Kemasukan Pengeluaran kini menyokong EMPTY_BAG, EMPTY_BAG(S), SBH dan SMEE — dipaparkan dalam bahagian baru "Other Products". EMPTY_BAG dan EMPTY_BAG(S) memaparkan pekerja MEE dan BH; SBH hanya BH; SMEE hanya MEE. Produk ini juga boleh dibuka dalam modal Pemetaan Kod Bayaran Produk.',
    en: 'Production Entry now supports EMPTY_BAG, EMPTY_BAG(S), SBH, and SMEE — shown in a new "Other Products" section. EMPTY_BAG and EMPTY_BAG(S) list both MEE and BH packing workers; SBH lists BH only; SMEE lists MEE only. These products can also be opened in the Product Pay Code Mapping modal.',
  },
  {
    date: "2026-05-19",
    ms: "Jenis cuti baru ditambah: Cuti Rawatan (60 hari setahun) — boleh dipilih dalam Log Harian dan Log Bulanan, dan dipaparkan dalam Laporan Cuti.",
    en: "New leave type added: Cuti Rawatan / Hospital Leave (60 days per year) — selectable in Daily Log and Monthly Log, and shown in the Leave Report.",
  },
  {
    date: "2026-05-19",
    ms: 'Halaman baru "Others (Kerja Luar OT)" dalam Payroll untuk merekod OT kerja luar — entri akan keluar pada slip gaji setiap pekerja sebagai pendahuluan.',
    en: 'New "Others (Kerja Luar OT)" page in Payroll for recording outside-work overtime — entries appear on each employee\'s payslip as an advance.',
  },
  {
    date: "2026-05-19",
    ms: 'Rekod "Others (Advance)" dan "Others (Kerja Luar OT)" yang berulang dengan keterangan sama kini bergabung jadi satu baris dalam Payroll Details dan slip gaji.',
    en: 'Duplicate "Others (Advance)" and "Others (Kerja Luar OT)" entries with the same description now combine into a single line on the Payroll Details page and payslip.',
  },
  {
    date: "2026-05-19",
    ms: "Log Bulanan SAPU dan MAINTENANCE kini memisahkan jam biasa, OT, Ahad, OT Ahad, Umum, dan OT Umum supaya kiraan gaji ikut kadar yang betul.",
    en: "SAPU and MAINTENANCE Monthly Logs now separate regular, OT, Sunday, Sunday OT, Public Holiday, and Public Holiday OT hours so payroll uses the correct rates.",
  },
  {
    date: "2026-05-19",
    ms: "Pembetulan: Jumlah Gaji Kasar untuk salesman kini termasuk unit FOC, jadi jumlah asas dan payslip sepadan.",
    en: "Fix: Salesman gross pay now includes FOC units, so base totals and payslips match.",
  },
  {
    date: "2026-05-19",
    ms: "Pembetulan: Gaji Genap sebelum pinjam kini mengikut jumlah akhir gaji yang telah digenapkan.",
    en: "Fix: Gaji Genap before pinjam now matches the final rounded payroll amount.",
  },
  {
    date: "2026-05-18",
    ms: "Eksport PDF untuk gaji pertengahan bulan kini tersedia.",
    en: "Mid-month payroll PDF export is now available.",
  },
  {
    date: "2026-05-18",
    ms: "Jam kerja Ahad dan Hari Umum boleh ditambah dalam Log Bulanan.",
    en: "Sunday and Public Holiday hours can now be entered in the Monthly Log.",
  },
  {
    date: "2026-05-18",
    ms: "Jumlah bayaran cuti (Cuti Umum / Sakit / Tahunan) kini boleh diedit terus dalam Log Harian.",
    en: "Leave payment amounts (Cuti Umum / Sakit / Tahunan) can now be edited directly in the Daily Log.",
  },
  {
    date: "2026-05-18",
    ms: 'Kalendar Cuti kini ada kotak semak "Cuti Umum" — kelayakan tahunan Cuti Umum setiap pekerja dikira secara automatik daripada tarikh yang ditandakan.',
    en: 'The Holiday Calendar now has a "Cuti Umum" checkbox — each staff member\'s yearly Cuti Umum allowance is calculated automatically from the dates you tick.',
  },
  {
    date: "2026-05-18",
    ms: '"Commission" ditukar nama menjadi "Others (Advance)".',
    en: '"Commission" has been renamed to "Others (Advance)".',
  },
  {
    date: "2026-05-18",
    ms: 'Modal "Tambah Cuti" baharu — boleh menambah cuti untuk ramai pekerja sekaligus.',
    en: 'New "Add Leave" dialog — you can add leave for multiple staff at once.',
  },
  {
    date: "2026-05-18",
    ms: "Pembetulan: Jam lebih masa (OT) tidak lagi dikira dua kali dalam gaji asas.",
    en: "Fix: Overtime (OT) hours are no longer double-counted in base pay.",
  },
  {
    date: "2026-05-18",
    ms: "Pembetulan: Tarikh hari kelepasan kini dipaparkan dengan betul.",
    en: "Fix: Holiday dates now display correctly.",
  },
  {
    date: "2026-05-18",
    ms: '"Self Billed Invoice" telah dinaik taraf menjadi "General Purchase" — pembelian tempatan turut disokong sekarang.',
    en: '"Self Billed Invoice" has been upgraded to "General Purchase" — local purchases are now supported too.',
  },
  {
    date: "2026-05-18",
    ms: "Pembelian bahan kini berkait terus dengan stok.",
    en: "Material purchases are now linked directly to stock.",
  },
];

const MONTH_NAMES: Record<Language, string[]> = {
  ms: [
    "Januari",
    "Februari",
    "Mac",
    "April",
    "Mei",
    "Jun",
    "Julai",
    "Ogos",
    "September",
    "Oktober",
    "November",
    "Disember",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

const formatDate = (iso: string, language: Language): string => {
  const [yearStr, monthStr, dayStr] = iso.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const day = Number(dayStr);
  const monthName = MONTH_NAMES[language][monthIndex] ?? monthStr;
  return `${day} ${monthName} ${year}`;
};

const LABELS = {
  ms: {
    title: "Log Perubahan",
    close: "Tutup",
  },
  en: {
    title: "Changelog",
    close: "Close",
  },
} as const;

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  const [language, setLanguage] = useState<Language>("ms");

  useEffect(() => {
    if (isOpen) {
      setLanguage("ms");
    }
  }, [isOpen]);

  const labels = LABELS[language];

  const renderToggle = () => {
    const segmentBase =
      "px-3 py-1 text-sm font-medium transition-colors duration-150";
    const activeClasses =
      "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300";
    const inactiveClasses =
      "text-default-600 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700";

    return (
      <div
        className="inline-flex rounded-full border border-default-200 dark:border-gray-700 overflow-hidden"
        role="group"
        aria-label="Language toggle"
      >
        <button
          type="button"
          onClick={() => setLanguage("ms")}
          className={`${segmentBase} ${
            language === "ms" ? activeClasses : inactiveClasses
          }`}
        >
          BM
        </button>
        <button
          type="button"
          onClick={() => setLanguage("en")}
          className={`${segmentBase} ${
            language === "en" ? activeClasses : inactiveClasses
          }`}
        >
          ENG
        </button>
      </div>
    );
  };

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog
        className="fixed inset-0 z-50 overflow-y-auto"
        open={isOpen}
        onClose={onClose}
      >
        <div className="min-h-screen px-4 text-center">
          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <DialogPanel className="fixed inset-0 bg-black/50 dark:bg-black/70" />
          </TransitionChild>

          <span className="inline-block h-screen align-middle">&#8203;</span>

          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="inline-block w-full max-w-6xl p-4 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl">
              <div className="flex justify-between items-center">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  {labels.title}
                </DialogTitle>
                {renderToggle()}
              </div>

              <div className="mt-4 max-h-[67vh] overflow-y-auto pr-1">
                <ul className="list-disc pl-6 space-y-2 text-default-700 dark:text-gray-200">
                  {CHANGELOG_ENTRIES.map((entry, index) => (
                    <li key={index} className="leading-relaxed">
                      <span className="text-xs text-default-500 dark:text-gray-400 mr-1">
                        {formatDate(entry.date, language)} —
                      </span>
                      <span>{entry[language]}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end">
                <Button onClick={onClose} variant="outline">
                  {labels.close}
                </Button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ChangelogModal;
