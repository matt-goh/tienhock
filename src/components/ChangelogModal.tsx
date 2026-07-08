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
    date: "2026-07-08",
    ms: "Bahan dan varian yang sudah dinyahaktifkan kini boleh dipadam secara kekal walaupun mempunyai rekod stok; rekod stok berkaitan akan dibuang bersama. Jika bahan atau varian pernah digunakan dalam invois belian, pemadaman kekal masih disekat supaya sejarah belian kekal terpelihara.",
    en: "Inactive materials and variants can now be permanently deleted even when they have stock records; the related stock records are removed together. Permanent deletion is still blocked when the material or variant has been used in purchase invoices, so purchase history stays intact.",
  },
  {
    date: "2026-07-08",
    ms: "Halaman Kemasukan Pengeluaran Jelly Polly kini mempunyai satu lajur input bagi setiap kod bayaran yang dipetakan kepada produk. Setiap pekerja memasukkan kuantiti karton secara berasingan untuk setiap kod bayaran (contohnya dua konfigurasi karton), dan setiap kuantiti dibayar mengikut kadar kod berkenaan dalam gaji. Sebelum ini hanya satu kotak input dipaparkan dan hanya satu kod bayaran dibayar. Susunan kad pekerja (drag-and-drop) dikekalkan, dan jumlah karton semua kod bayaran dikira sebagai stok produk.",
    en: "The Jelly Polly Production Entry page now shows one input column per pay code mapped to the product. Each worker enters carton quantities separately for each pay code (e.g. two carton configurations), and each quantity is paid at that code's rate in payroll. Previously only a single input was shown and only one pay code was ever paid. Worker drag-and-drop ordering is kept, and the cartons across all pay codes add up to the product's stock.",
  },
  {
    date: "2026-07-08",
    ms: "Lejar Akaun untuk Public Bank Berhad (BANK_PBB) kini turut memaparkan baris tunai diterima (CASH SALES RECEIVED, CASH RECEIVED/CR. SALES) sebagai wang masuk (lajur Debit), supaya lejar bank membaca seperti buku tunai. Baki pembukaan, berjalan dan penutup turut mengambil kira baris ini.",
    en: "The Account Ledger for Public Bank Berhad (BANK_PBB) now also lists the cash-received rows (CASH SALES RECEIVED, CASH RECEIVED/CR. SALES) as money in (the Debit column), so the bank ledger reads like a cash book. The opening, running and closing balances include these rows too.",
  },
  {
    date: "2026-07-08",
    ms: "Belian Am Tempatan kini boleh mengeluarkan e-Invois bil sendiri apabila perlu (dimatikan secara lalai). Hidupkan 'Issue e-invoice', pilih jenis penjual (individu dengan MyKad, individu dengan TIN sendiri, atau perniagaan), isi butiran pembekal, kemudian Save & Submit e-Invoice. Sebelum menghantar, satu pengesahan memaparkan jenis penjual yang layak untuk e-Invois bil sendiri (boleh tukar antara Bahasa Melayu dan Bahasa Inggeris). Nombor TIN dan pengenalan pembekal ditetapkan mengikut jenis penjual seperti kehendak LHDN.",
    en: "Local General Purchases can now issue a self-billed e-Invoice when needed (off by default). Turn on 'Issue e-invoice', pick the seller type (individual with MyKad, individual with their own TIN, or a business), fill in the supplier details, then Save & Submit e-Invoice. Before submitting, a confirmation shows the seller types allowed for self-billed e-invoices (switchable between Bahasa Melayu and English). The supplier's TIN and identification number are set automatically to match the seller type as required by LHDN.",
  },
  {
    date: "2026-07-08",
    ms: "Halaman butiran kakitangan (Tien Hock dan Jelly Polly) kini menunjukkan lokasi kakitangan: lokasi yang diberikan terus kepada mereka (sama seperti di halaman Location) serta lokasi yang diwarisi daripada kerja mereka. Borang kakitangan kini membolehkan anda menetapkan lokasi, dan borang Jelly Polly menggunakan senarai lokasi Jelly Polly (bukan Tien Hock).",
    en: "Staff details pages (Tien Hock and Jelly Polly) now show a staff member's locations: those assigned directly to them (in sync with the Location page) plus locations inherited from their jobs. Staff forms now let you set locations, and the Jelly Polly forms use the Jelly Polly location list (not Tien Hock's).",
  },
  {
    date: "2026-07-08",
    ms: "Jelly Polly kini mempunyai halaman Lokasi sendiri (Catalogue -> Location): cipta lokasi dan petakan kerja serta pekerja kepadanya, sama seperti Tien Hock. Lapan lokasi telah disediakan (Office, Maintenance, Salesman, Ikut Lori, Ice Polly Machine, Jelly Cup Machine, Plastic Machine, dan Ice Polly & Jelly Cup Packing). Laporan Gaji Jelly Polly kini dikumpulkan mengikut lokasi ini menggantikan kumpulan jenis kerja lama.",
    en: "Jelly Polly now has its own Location page (Catalogue -> Location): create locations and map jobs and employees to them, just like Tien Hock. Eight locations are set up (Office, Maintenance, Salesman, Ikut Lori, Ice Polly Machine, Jelly Cup Machine, Plastic Machine, and Ice Polly & Jelly Cup Packing). The Jelly Polly Salary Report is now grouped by these locations instead of the old job-type groups.",
  },
  {
    date: "2026-07-08",
    ms: "Halaman Daily Machine Plastic Jelly Polly kini menggunakan entri kod bayaran untuk setiap pekerja. Pilih kod yang dipetakan kepada kerja Plastic atau pekerja, masukkan kuantiti dan kadar, kemudian simpan atau kosongkan setiap pekerja secara berasingan. Pilihan shift Day/Night dan lajur tetap 30ml/70ml telah dibuang.",
    en: "Jelly Polly Daily Machine Plastic now uses pay-code entry for each staff member. Select codes mapped to the Plastic job or the staff member, enter quantity and rate, then save or clear each staff member separately. The Day/Night shift option and fixed 30ml/70ml columns have been removed.",
  },
  {
    date: "2026-07-08",
    ms: "Laporan Trial Balance, Income Statement, Balance Sheet dan CoGM kini menunjukkan angka sebenar daripada rekod jualan, belian, gaji dan bayaran. Butang Panduan (BM/EN) ditambah pada setiap laporan untuk menerangkan dari mana setiap angka datang. Tarikh laporan juga dibetulkan supaya hari terakhir bulan tidak tertinggal.",
    en: "The Trial Balance, Income Statement, Balance Sheet and CoGM reports now show real figures from sales, purchases, payroll and payment records. A Guide button (BM/EN) was added on each report explaining where every amount comes from. Report dates were also fixed so the last day of the month is no longer left out.",
  },
  {
    date: "2026-07-08",
    ms: "Laporan Bank Statement kini disatukan di Account Ledger. Untuk akaun BANK_PBB, buka Accounting -> Reports -> Account Ledger dan pilih BANK_PBB; baki pembukaan, transaksi, baki berjalan dan cetakan PDF masih tersedia di sana.",
    en: "Bank Statement is now folded into Account Ledger. For BANK_PBB, open Accounting -> Reports -> Account Ledger and select BANK_PBB; opening balance, transactions, running balance and PDF printing are still available there.",
  },
  {
    date: "2026-07-07",
    ms: "Senarai jabatan pekerja kini boleh diurus dari Catalogue -> Others. Borang pekerja Tien Hock dan Jelly Polly menggunakan senarai jabatan yang sama, termasuk pilihan baharu DRIVER HABUK.",
    en: "Staff departments can now be managed from Catalogue -> Others. Tien Hock and Jelly Polly staff forms use the same shared department list, including the new DRIVER HABUK option.",
  },
  {
    date: "2026-07-07",
    ms: "Setiap bil jualan Tien Hock (bil tunai dan invois kredit) kini direkodkan secara automatik ke dalam sistem perakaunan. Anda boleh mencetak lejar akaun CASH SALES dan CREDIT SALES dari Perakaunan → Laporan → Account Ledger untuk melihat semua sumber jualan dalam satu dokumen, seperti lejar lama. Duit tunai yang diterima kini masuk ke akaun terima tunai yang betul (jualan tunai hari itu berbanding bayaran hutang lama). Apabila jumlah sesuatu bil tunai diubah, catatan perakaunannya turut dikemas kini automatik. Jualan lama dari 1 Jun 2026 telah dimasukkan.",
    en: "Every Tien Hock sales bill (cash bills and credit invoices) is now recorded automatically into the accounting system. You can print the CASH SALES and CREDIT SALES account ledgers from Accounting → Reports → Account Ledger to see all sources of sales in one document, just like the old ledger. Cash received now lands in the correct cash-received accounts (same-day cash sales vs. payment of old bills). When a cash bill's amount is edited, its accounting entry updates automatically too. Existing sales from 1 June 2026 have been backfilled.",
  },
  {
    date: "2026-07-06",
    ms: "Baucar gaji JVSL kini dijana sepadan 100% dengan sistem lama: setiap jabatan mempunyai SATU baris Gaji yang merangkumi keseluruhan gaji kasar (gaji, OT, komisen, cuti/cuti tahunan, bonus, bayaran ikut produk dan Others semuanya dimasukkan di sini — termasuk pembundaran), diikuti caruman majikan EPF/SOCSO/SIP, dan satu baris Accrual (Salary Payables). Anda tidak perlu lagi memetakan akaun berasingan untuk OT/komisen/cuti/pembundaran — jadi ralat 'pemetaan tidak lengkap' yang menyekat penjanaan JVSL sebelum ini telah hilang. Pilihan pemetaan yang tidak diperlukan pada halaman Location Account Mappings juga telah dibuang.",
    en: "The JVSL payroll voucher now generates as a 100% match to the legacy system: each department has ONE Salary line covering its full gross pay (salary, OT, commission, cuti/annual leave, bonus, product-based pay and Others all fold in here — including the rounding), followed by the employer EPF/SOCSO/SIP contributions and one Accrual (Salary Payables) line. You no longer need to map separate accounts for OT/commission/cuti/rounding — so the 'incomplete mappings' error that previously blocked JVSL generation is gone. Unnecessary mapping options on the Location Account Mappings page have also been removed.",
  },
  {
    date: "2026-07-06",
    ms: "Butang baharu 'Payroll Summary' pada halaman Penjana Baucar Gaji mencetak ringkasan gaji yang mengkategorikan Pengarah dan Pekerja: GAJI, BONUS, GAJI KASAR, EPF/SOCSO/SIP (Majikan & Pekerja) dengan jumlah, PCB, Jumlah Gaji, Jumlah Digenapkan dan Gaji Bersih — serta jumlah baucar JV-DIRECTOR (JVDR) dan JV-WORKERS (JVSL) dengan jumlah besar. Ia dikira terus daripada data gaji, jadi boleh dicetak walaupun sebelum baucar dijana.",
    en: "New 'Payroll Summary' button on the Payroll Voucher Generator prints a salary summary categorized into Director and Workers: GAJI, BONUS, GAJI KASAR, EPF/SOCSO/SIP (employer & employee) with totals, PCB, Jumlah Gaji, Jumlah Digenapkan and Gaji Bersih — plus the JV-DIRECTOR (JVDR) and JV-WORKERS (JVSL) voucher totals with a grand total. It's computed straight from payroll data, so it prints even before the vouchers are generated.",
  },
  {
    date: "2026-07-06",
    ms: "Penjana Baucar Gaji kini memaparkan pratonton catatan jurnal sebenar (kod akaun, keterangan, debit, kredit dan jumlah) — sama persis dengan baucar yang akan disimpan, jadi anda boleh semak baris demi baris sebelum menjananya. Halaman Penjana Baucar dan Bayaran Gaji Bank juga kini mengingati bulan terakhir yang anda lihat.",
    en: "The Payroll Voucher Generator now shows a live preview of the actual journal entry (account codes, descriptions, debit, credit and totals) — exactly matching the voucher that will be posted, so you can check it line by line before generating. The Voucher Generator and Payroll Bank Payment pages now also remember the last month you viewed.",
  },
  {
    date: "2026-07-06",
    ms: "Catatan jurnal kini boleh dicetak sebagai Journal Voucher PDF (butang Print Voucher pada halaman butiran catatan) — sepadan dengan cetakan baucar sistem lama: kod akaun, keterangan, debit/kredit, jumlah dan particulars. Baucar gaji JVSL kini merangkumi KESEMUA gaji kasar (upah packing/mesin ikut produk, bayaran cuti, rekod Others, komisen) — sebelum ini sebahagian komponen tercicir dan jumlah baucar terkurang nyata berbanding sistem lama. Jika ada pemetaan akaun yang belum lengkap, mesej ralat kini menyenaraikan lokasi dan komponen yang tepat. Jurnal JVDR/JVSL juga kini mempunyai penapis jenis tersendiri di halaman Journal Entries.",
    en: "Journal entries can now be printed as a Journal Voucher PDF (Print Voucher button on the entry details page) — matching the legacy voucher print: account codes, descriptions, debit/credit, totals and particulars. The JVSL payroll voucher now covers ALL of gross pay (product/packing piece pay, leave pay, Others records, commissions) — previously some components fell through and the voucher understated the legacy totals. When account mappings are incomplete, the error message now lists the exact locations and components. JVDR/JVSL journals also now have their own type filters on the Journal Entries page.",
  },
  {
    date: "2026-07-06",
    ms: "Tab Transaction History pelanggan kini mempunyai penapis status dan jenis bayaran yang boleh ditekan, serta lajur Payment Type supaya jenis Cash atau Invoice boleh dilihat terus. Apabila invois dibuka dari tab ini, butang Back dan pautan pelanggan akan kembali ke tab Transaction History.",
    en: "Customer Transaction History now has clickable status and payment-type filters, plus a Payment Type column so Cash or Invoice can be seen at a glance. When an invoice is opened from this tab, Back and the customer link return to Transaction History.",
  },
  {
    date: "2026-07-06",
    ms: "Baucar gaji (JVDR/JVSL) kini mengikut kaedah pembundaran sistem lama: gaji bersih setiap pekerja/pengarah digenapkan ke ringgit penuh sebelum dikreditkan ke akaun akruan, dengan baris 'Rounding Adjustment' untuk perbezaannya — jumlah baucar kini sepadan dengan cetakan sistem lama (cth. JVDR Jun 12,940.00). Kad pratonton 'Salary Payable' juga diperbetulkan — sebelum ini ia terkurang nyata kerana tidak mengambil kira komisen.",
    en: "Payroll vouchers (JVDR/JVSL) now follow the legacy rounding method: each employee's/director's net pay is rounded up to the whole ringgit before crediting the accrual accounts, with a 'Rounding Adjustment' line for the difference — voucher totals now match the legacy prints (e.g. June JVDR 12,940.00). The 'Salary Payable' preview card is also fixed — it previously understated the figure by excluding commissions.",
  },
  {
    date: "2026-07-06",
    ms: "Laporan baharu: Account Ledger (Accounting → Reports). Cari mana-mana kod akaun (contohnya kod perbelanjaan seperti MGT untuk Menggatal atau MBRMF untuk boiler, akaun pembekal, atau akaun pengarah) dan lihat sejarah transaksi penuh untuk bulan tersebut — baki pembukaan, setiap catatan jurnal, baki berjalan dan jumlah penutup, dengan cetakan PDF.",
    en: "New report: Account Ledger (Accounting → Reports). Search any account code (e.g. expenditure codes like MGT for Menggatal or MBRMF for boiler, a supplier account, or a director account) and view its full transaction history for the month — opening balance, every journal entry, running balance and closing totals, with PDF printing.",
  },
  {
    date: "2026-07-06",
    ms: "Pembetulan Journal Entries: catatan jurnal yang dikunci secara manual kini terus dikira dalam laporan (Bank Statement, Trial Balance dan lain-lain) sebaik sahaja disimpan — sebelum ini ia tersimpan sebagai draf tersembunyi dan tidak pernah muncul dalam mana-mana laporan. Catatan yang dijana sistem (resit, pembelian, baucar gaji) tidak lagi boleh diedit secara terus — batalkan atau jana semula dari skrin asalnya. Pembetulan tambahan: tarikh catatan tidak lagi beranjak sehari ke belakang setiap kali catatan diedit, dan baucar JVSL/JVDR yang tidak seimbang (pemetaan akaun lokasi belum lengkap) kini disekat daripada dijana.",
    en: "Journal Entries fix: manually keyed journal entries now count in reports (Bank Statement, Trial Balance, etc.) as soon as they are saved — previously they were stored as hidden drafts and never appeared in any report. System-generated entries (receipts, purchases, payroll vouchers) can no longer be edited directly — cancel or regenerate them from their source screen. Also fixed: an entry's date no longer slips back one day each time it is edited, and unbalanced JVSL/JVDR vouchers (incomplete location account mappings) are now blocked from being generated.",
  },
  {
    date: "2026-07-06",
    ms: "Pembetulan invois: menukar jenis bayaran invois daripada CASH kepada INVOICE kini membatalkan bayaran automatik dengan betul (sebelum ini bayaran itu kekal aktif secara senyap, menyebabkan baki tertunggak berganda — cth. RM68 pada invois RM34 — apabila bayaran dibatalkan kemudian). Menukar INVOICE kepada CASH kini merekod bayaran untuk baki tertunggak sahaja dan mencatat resit dalam lejar. Pembatalan bayaran juga tidak lagi boleh menaikkan baki melebihi jumlah sebenar invois. Invois yang terjejas sebelum ini telah diperbetulkan.",
    en: "Invoice fix: changing an invoice's payment type from CASH to INVOICE now correctly cancels the automatic payment (previously it silently stayed active, causing the outstanding balance to double — e.g. RM68 on a RM34 invoice — when payments were later cancelled). Changing INVOICE to CASH now records a payment for the outstanding balance only and posts the receipt to the ledger. Cancelling a payment can also no longer push the balance above the invoice's actual total. Previously affected invoices have been corrected.",
  },
  {
    date: "2026-07-05",
    ms: "Laporan Debtors untuk Jelly Polly dan Green Target kini menggunakan susun atur yang sama seperti Tien Hock: pilihan bulan, mod All Time, carian, buka/tutup semua, ringkasan jumlah, butang Report, Debtor List, Statement dan Invoices, serta jadual invois dan bayaran yang boleh dibuka. PDF laporan, penyata pelanggan dan senarai debtor kini menggunakan nama syarikat yang betul.",
    en: "Jelly Polly and Green Target Debtors Reports now use the same layout as Tien Hock: month selection, All Time mode, search, expand/collapse all, total summaries, Report, Debtor List, Statement and Invoices buttons, plus expandable invoice and payment tables. Report, customer statement and debtor list PDFs now show the correct company name.",
  },
  {
    date: "2026-07-04",
    ms: "Pembetulan Salary Report: bagi pekerja yang mempunyai lebih daripada satu ID kerja, cuti yang direkodkan di bawah satu ID tidak lagi menggugurkan gaji kerja harian ID lain pada hari yang sama daripada lajur GAJI. Angka laporan kini sepadan dengan gaji kasar dan slip gaji.",
    en: "Salary Report fix: for staff with more than one job ID, leave recorded under one ID no longer removes the other ID's daily work pay for that day from the GAJI column. Report figures now match gross pay and the payslip.",
  },
  {
    date: "2026-07-04",
    ms: "Laporan Bank Statement: PDF kini mempunyai reka bentuk baharu yang lebih kemas (kepala surat syarikat berlogo, ringkasan baki pembukaan/penutupan dan jadual yang lebih mudah dibaca). Butang eksport kini terus membuka paparan cetak dan bukannya memuat turun fail — pada telefon, PDF akan dibuka dalam tab baharu.",
    en: "Bank Statement report: the PDF has a refreshed, cleaner design (company letterhead with logo, opening/closing balance summary and an easier-to-read table). The export button now opens the print view directly instead of downloading the file — on phones, the PDF opens in a new tab.",
  },
  {
    date: "2026-07-04",
    ms: "Halaman Journal Entries diperbaharui: penapis Type dan Status kini menggunakan butang pil berlabel (kod dan nama jenis) yang boleh ditekan untuk hidup/mati, dan lebih daripada satu boleh dipilih serentak. Kotak carian kini berada di sebelah kanan baris penapis. Pilihan penapis, julat tarikh dan jenis jurnal terakhir yang dipilih kini diingati secara automatik untuk lawatan seterusnya.",
    en: "Journal Entries page refreshed: the Type and Status filters are now labelled pill buttons (showing both the type code and name) you can toggle on/off, with multiple active at once. The search box now sits on the right of the filter row. Your filter selections, date range and last-used journal type are now remembered automatically for your next visit.",
  },
  {
    date: "2026-07-03",
    ms: "Pembetulan Salary Report: eksport fail bank di tab Bank kini hanya memasukkan pekerja yang dibayar melalui Bank. Pekerja Cash tidak lagi dimasukkan melalui butang Export atau pautan Export Link.",
    en: "Salary Report fix: the bank file export in the Bank tab now includes only staff paid by Bank. Cash staff are no longer included from the Export button or Export Link.",
  },
  {
    date: "2026-07-03",
    ms: "Jelly Polly kini mempunyai katalog sendiri yang berasingan daripada Tien Hock: halaman Staff, Pay Codes dan Cuti Management baharu di bawah menu Catalogue Jelly Polly. Semua pekerja, kod gaji, pemetaan kerja, kadar berjadual, cuti dan rekod pengeluaran JP kini disimpan berasingan — tiada lagi perkongsian dengan senarai Tien Hock. Pekerja JP dimasukkan melalui Catalogue → Staff JP, dan kad jumlah bawa pulang gabungan memadankan pekerja dua syarikat melalui nama yang sama.",
    en: "Jelly Polly now has its own catalogue separate from Tien Hock: new Staff, Pay Codes and Cuti Management pages under the Jelly Polly Catalogue menu. All JP staff, pay codes, job mappings, scheduled rates, leave and production records are now stored separately — nothing is shared with the Tien Hock lists anymore. JP staff are entered via the JP Catalogue → Staff page, and the combined take-home card matches dual-company staff by identical name.",
  },
  {
    date: "2026-07-02",
    ms: "Pembetulan Pinjam: pekerja yang mempunyai lebih daripada satu ID tetapi nama yang sama kini dipaparkan sebagai satu jumlah dalam halaman Pinjam. Untuk Butiran Gaji Tien Hock, kad Pinjam juga kini mengambil rekod pinjam daripada ID berkembar, supaya pinjam bulanan dan jumlah masuk bank sepadan dengan Salary Report.",
    en: "Pinjam fix: staff with more than one ID but the same name now show as one combined total on the Pinjam page. In Tien Hock Payroll Details, the Pinjam card now also picks up pinjam records from sibling IDs, so monthly pinjam and bank-in amount match the Salary Report.",
  },
  {
    date: "2026-07-02",
    ms: "Jelly Polly kini mempunyai sistem gaji dan pengeluaran sendiri: halaman Staff Assignment untuk menetapkan pekerja ke Office, Maintenance, Salesman, mesin harian, mesin plastik dan pengeluaran; kemasukan bulanan Office/Maintenance; kemasukan harian Salesman, Ice-Polly, Jelly Cup dan Mesin Plastik (karton 30ml/70ml); rekod cuti; Bonus, Pinjam, Others dan Gaji Pertengahan Bulan; Payrolls dengan slip gaji, Salary Report dan e-Caruman; serta Production Entry, Product Stock dan pemetaan pay code produk untuk produk JP. Gaji dikira semula secara automatik untuk pekerja terlibat setiap kali kemasukan disimpan. Pekerja yang bekerja untuk kedua-dua syarikat akan nampak kad jumlah bawa pulang gabungan (TH + JP) pada halaman butiran gaji.",
    en: "Jelly Polly now has its own payroll and production system: a Staff Assignment page to assign staff to Office, Maintenance, Salesman, daily machines, plastic machine and production; Office/Maintenance monthly entry; daily entries for Salesman, Ice-Polly, Jelly Cup and the Plastic Machine (30ml/70ml cartons); leave records; Bonus, Pinjam, Others and Mid-month Pay; Payrolls with payslips, Salary Report and e-Caruman; plus Production Entry, Product Stock and product pay-code mapping for JP products. Payroll is automatically recalculated for the affected staff whenever an entry is saved. Staff working for both companies see a combined take-home card (TH + JP) on the payroll details page.",
  },
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
