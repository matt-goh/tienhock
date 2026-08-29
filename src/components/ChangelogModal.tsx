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
import i18n from "../i18n";

type Language = "ms" | "en";

type ChangelogEntry = {
  date: string; // ISO yyyy-mm-dd
  ms: string;
  en: string;
};

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-08-29",
    ms: "Apabila anda membuka pelanggan atau kakitangan daripada senarai invois dan kembali, halaman invois serta kedudukan tatal kini dikekalkan, termasuk pada halaman kedua dan seterusnya.",
    en: "When you open a customer or staff member from the invoice list and return, the invoice page and scroll position are now preserved, including on page 2 and later.",
  },
  {
    date: "2026-08-29",
    ms: "Setiap kad invois dalam senarai invois Tien Hock dan Jelly Polly kini mempunyai butang Cetak, supaya anda boleh mencetak satu invois terus tanpa memilihnya untuk tindakan pukal terlebih dahulu.",
    en: "Each invoice card in the Tien Hock and Jelly Polly invoice lists now has a Print button, so you can print one invoice directly without selecting it for a bulk action first.",
  },
  {
    date: "2026-08-29",
    ms: "Penapis Jurujual dan Cawangan pada halaman Pelanggan, penapis status dan jobs pada halaman Kakitangan, serta penapis Jurujual pada senarai invois Tien Hock dan Jelly Polly kini dipaparkan sebagai pilihan pill. Pada halaman Pelanggan dan Kakitangan, penapis menggunakan bar khas, manakala pilihan Jurujual pada senarai invois kekal di sebelah carian dan butang penapis. Tajuk halaman, carian dan tindakan pada halaman Pelanggan dan Kakitangan juga kini menggunakan susun atur yang lebih padat dan kekal kelihatan semasa menatal.",
    en: "Salesman and branch filters on the Customers page, status and job filters on the Staff page, and Salesman filters on the Tien Hock and Jelly Polly invoice lists are now shown as pill choices. The Customers and Staff pages use dedicated filter bars, while the invoice-list Salesman choices remain beside Search and the Filter button. Page titles, search and actions on the Customers and Staff pages also use a more compact layout that stays visible while scrolling.",
  },
  {
    date: "2026-08-29",
    ms: "Laporan Jualan mengikut Produk, laporan Jualan mengikut Jurujual dan PDF ringkasan jualan kini mengira kuantiti Ramen bersama semua produk lain sebagai unit. Jumlah tidak lagi dipecahkan kepada bukan Ramen dan paket Ramen, dan label PKT berulang telah dibuang. Setiap kad jurujual dalam laporan mengikut Produk turut menunjukkan pecahan unit mengikut setiap jenis produk yang dijual, termasuk Ramen, supaya pecahan sentiasa sepadan dengan jumlah keseluruhan.",
    en: "Sales by Products, Sales by Salesman and sales-summary PDFs now count Ramen quantities together with all other products as units. Totals are no longer split into non-Ramen units and Ramen packets, and repeated PKT labels have been removed. Each salesman card in Sales by Products also shows units for every product type sold, including Ramen, so the breakdown always reconciles to the overall total.",
  },
  {
    date: "2026-08-28",
    ms: "Pembelian yang e-Invoisnya sudah sah kini tidak lagi menunjukkan butang Muat Semula E-Invois. Maklumat e-Invois yang sah masih boleh dibuka melalui butang E-Invoice Details.",
    en: "General purchases with a valid e-Invoice no longer show the Refresh E-Invoice button. You can still open the valid e-Invoice through the E-Invoice Details button.",
  },
  {
    date: "2026-08-28",
    ms: "Tarikh pembelian dalam senarai Pembelian Am kini sepadan dengan tarikh dalam borang, termasuk apabila sistem digunakan dalam zon waktu yang berbeza.",
    en: "Purchase dates in the General Purchases list now match the dates shown in the form, including when the system is used in different time zones.",
  },
  {
    date: "2026-08-28",
    ms: "Pembelian am luar negara dengan keterangan penghantaran seperti kurier atau penghantaran udara kini boleh dihantar ke MyInvois tanpa ditolak kerana ralat panjang Incoterms.",
    en: "Foreign general purchases with shipping descriptions such as courier or air shipping can now be submitted to MyInvois without being rejected for an Incoterms length error.",
  },
  {
    date: "2026-08-28",
    ms: "Invois Green Target dan Jelly Polly kini boleh mempunyai lebih daripada satu Credit Note aktif, sama seperti Tien Hock. Setiap Credit Note mengurangkan baki invois yang sama, dan jumlah semua Credit Note aktif tidak boleh melebihi nilai invois selepas Debit Note diambil kira. Status pembatalan e-Invois juga hanya akan berubah selepas MyInvois menerima atau mengesahkan pembatalan tersebut.",
    en: "Green Target and Jelly Polly invoices can now have more than one active Credit Note, matching Tien Hock. Each Credit Note reduces the same invoice balance, and all active Credit Notes together cannot exceed the invoice value after Debit Notes are included. An e-Invoice cancellation status now changes only after MyInvois accepts or confirms the cancellation.",
  },
  {
    date: "2026-08-27",
    ms: "Mihun Cap 2UDG 300g (2-BH2) kini turut dipautkan kepada enam kod pengeluaran Merah: PBH_2UM, PBH_2UM_BAG, FULL_B2UM, FULL_B2UM_140, FULL_2UM_40 dan FULL_2UM_60. Kod Hijau yang sedia ada kekal, dan kadar gaji serta rekod lama tidak berubah.",
    en: "2UDG 300g Mihun (2-BH2) is now also linked to the six red production codes: PBH_2UM, PBH_2UM_BAG, FULL_B2UM, FULL_B2UM_140, FULL_2UM_40 and FULL_2UM_60. The existing green codes remain, and pay rates and previous records are unchanged.",
  },
  {
    date: "2026-08-26",
    ms: "Apabila jurujual menjual Mihun Cap 2UDG 300g (2-BH2), aktiviti Ikut Lori DME-2H kini dipilih secara automatik dengan kuantiti jualan. Produk 3UDG (2-BH) kekal menggunakan DME-300G.",
    en: "When a salesman sells 2UDG 300g Mihun (2-BH2), the DME-2H Ikut Lori activity is now selected automatically with the sold quantity. The 3UDG product (2-BH) continues to use DME-300G.",
  },
  {
    date: "2026-08-26",
    ms: "Satu invois Tien Hock kini boleh mempunyai lebih daripada satu Credit Note aktif. Setiap Credit Note mengurangkan baki invois yang sama, dan jumlah semua Credit Note aktif dihadkan supaya tidak melebihi nilai invois terlaras.",
    en: "A Tien Hock invoice can now have more than one active Credit Note. Each Credit Note reduces the same invoice balance, and their combined active amount is capped at the adjusted invoice value.",
  },
  {
    date: "2026-08-25",
    ms: "Cetakan bil daripada PC kini memaparkan kuantiti FOC dan barang dipulangkan (RTN) bagi setiap produk, sama seperti cetakan jurujual.",
    en: "Bills printed from the PC now show the FOC and returned-goods (RTN) quantity for each product, matching the salesman printout.",
  },
  {
    date: "2026-08-25",
    ms: "Penapis jenis produk serta penapis jenis dan status journal kini menggunakan pilihan berbentuk pill. Anda boleh memilih beberapa pilihan sekali gus, atau tekan ikon sasaran pada sesuatu pill untuk menunjukkan pilihan itu sahaja.",
    en: "Product type and Journal Entry type/status filters now use pill selections. You can select several options at once, or press the target icon on a pill to show only that option.",
  },
  {
    date: "2026-08-25",
    ms: "Katalog Produk kini mempunyai pengurus Kod Gaji bagi setiap produk. Semua pautan Pembungkusan/Pengeluaran, Komisen Jurujual dan Ikut Lori daripada katalog Tien Hock dan Jelly Polly dipaparkan di satu tempat, termasuk pautan yang dibuat di halaman lain. Anda boleh memautkan kod sedia ada, mencipta kod baharu, mengubah atau menyahaktifkan kod, membaiki pautan kerja yang tidak lengkap dan menyahpaut tanpa memadam sejarah gaji. Senarai penuh kod gaji hanya dimuatkan apabila pilihan tambah dibuka. ID produk sedia ada kini dikunci, dan semua pautan kod gajinya perlu dinyahpaut sebelum produk dipadam secara kekal supaya pautan serta sejarah kekal selamat.",
    en: "The Product Catalogue now has a Pay Code manager for every product. Packing/production, Salesman Commission and Ikut Lori links from both the Tien Hock and Jelly Polly catalogues appear in one place, including links created on other pages. You can link an existing code, create a new one, edit or deactivate it, repair incomplete job links, and unlink it without deleting payroll history. The full pay-code list loads only when you open the add options. Existing product IDs are now locked, and all pay-code links must be unlinked before permanently deleting a product so its links and history remain safe.",
  },
  {
    date: "2026-08-25",
    ms: "Invois yang telah dibatalkan tanpa sejarah bayaran, resit, dokumen pelarasan atau e-Invois kini boleh dipulihkan dari halaman invois. Ini menghidupkan semula bil FOC / nilai sifar bersama barisannya, supaya bil barang percuma yang tersilap dibatalkan boleh dibetulkan tanpa perlu menaip invois baharu.",
    en: "Cancelled invoices with no payment, receipt, adjustment or e-Invoice history can now be restored from the invoice page. This brings FOC / zero-value bills back to life with their line items, so a wrongly cancelled free-goods bill can be corrected without re-keying a new invoice.",
  },
  {
    date: "2026-08-24",
    ms: "Apabila menambah produk baharu, ralat \"Kod gaji ID diperlukan untuk kod gaji komisen jurujual\" tidak lagi muncul walaupun medan kod gaji menunjukkan ID produk. Kod gaji komisen jurujual kini sentiasa menggunakan ID produk secara automatik, jadi produk boleh disimpan tanpa perlu menaip semula.",
    en: "When adding a new product, the \"Pay code ID is required for Salesman commission pay code\" error no longer appears even though the pay code field showed the product ID. The salesman commission pay code now always uses the product ID automatically, so the product can be saved without retyping it.",
  },
  {
    date: "2026-08-24",
    ms: "Apabila menambah produk baharu (Mee, Bihun, Ramen, Bundle atau Jelly Polly), halaman Katalog Produk kini boleh mencipta dan memetakan kod gajinya secara automatik dalam satu langkah: kod gaji pembungkusan, komisen jurujual dan komisen jurujual Ikut Lori. Anda hanya perlu memasukkan kadar; kod gaji, pemetaan produk dan perkaitan kerja jurujual disediakan serentak, jadi jualan dan gaji jurujual untuk produk baharu dapat diisi secara automatik tanpa perlu menyediakan kod gaji secara manual.",
    en: "When adding a new product (Mee, Bihun, Ramen, Bundle or Jelly Polly), the Product Catalogue page can now create and map its pay codes in one step: the packing pay code, salesman commission and Ikut Lori salesman commission. You only enter the rates; the pay codes, product mapping and salesman job links are set up together, so sales and salesman pay for the new product auto-fill without any manual pay-code setup.",
  },
  {
    date: "2026-08-24",
    ms: "Sokongan Ramen kini lengkap dalam laporan jualan: jualan, trend, ringkasan mengikut jurujual dan PDF memaparkan Ramen secara berasingan, dan kuantiti paket tidak lagi dicampur dengan unit atau beg. Komisen Ramen untuk Jurujual dan Jurujual Ikut Lori kini menggunakan kadar PKT yang telah ditetapkan pengguna dan direkod sepenuhnya di bawah Mee dalam baucar gaji, bukan dibahagi dengan Bihun. Stock Kilang menerima produk Ramen, dan laporan Kos Anggaran Mee memasukkan nilai jualan Ramen tanpa mencampurkan paket ke dalam kiraan beg atau kos seunit. Jumlah jualan juga kini menggunakan amaun sebenar pada invois, mengecualikan invois gabungan dan mengelakkan cukai dikira dua kali dalam PDF.",
    en: "Ramen support is now complete across sales reporting: sales, trends, salesman summaries and PDFs show Ramen separately, and packet quantities are no longer mixed with other units or bags. Ramen commissions for Salesman and Salesman Ikut Lori now use the user-set PKT rates and are recorded fully under Mee in salary vouchers instead of being split with Bihun. Stock Kilang accepts Ramen products, and the Mee Estimated Cost report includes Ramen sales value without mixing packets into bag counts or unit cost. Sales totals now also use the actual invoice-line amounts, exclude consolidated invoices and avoid counting tax twice in PDFs.",
  },
  {
    date: "2026-08-24",
    ms: "Halaman log masuk dalam sistem development kini mempunyai butang Ganti Pangkalan Data daripada SQL, jadi sandaran penuh production boleh dimuatkan sebelum log masuk. Sandaran melalui cara ini menggunakan pengesahan dan amaran yang sama seperti dalam Database Backups, dan sistem development kini boleh membaca format keselamatan sandaran production terkini.",
    en: "The development login page now has a Replace Database from SQL button, so a full production backup can be loaded before signing in. It uses the same validation and warning as Database Backups, and the development system can now read the current production backup safety format.",
  },
  {
    date: "2026-08-24",
    ms: "Produk Ramen yang aktif kini muncul dalam senarai produk semasa membuat atau mengubah invois jualan. Produk Ramen baharu yang ditambah melalui Katalog Produk juga akan tersedia di bahagian Jualan secara automatik.",
    en: "Active Ramen products now appear in the product list when creating or editing sales invoices. New Ramen products added through the Product Catalogue will also become available in Sales automatically.",
  },
  {
    date: "2026-08-23",
    ms: "Pengeluaran ramen dan cuti Pembungkusan Mee kini saling menyekat pada tarikh yang sama. Aktiviti berkadar PKT atau PCS juga kini mengira gaji daripada kuantiti yang dimasukkan dan memaparkan jumlah unit yang betul pada butiran gaji serta slip gaji.",
    en: "Ramen production and Packing Mee leave now block each other on the same date. PKT- or PCS-rate activities also calculate pay from the entered quantity and show the correct unit totals in payroll details and payslips.",
  },
  {
    date: "2026-08-23",
    ms: "Pengeluaran ramen kini kekal di bawah Pembungkusan Mee semasa gaji diproses, jadi ia tidak lagi mewujudkan pecahan Bihun/mengikut kerja yang salah sehingga menyembunyikan potongan EPF, SOCSO, SIP dan PCB. Slip mengikut kerja yang telah terjejas juga kini meletakkan potongan tersebut pada slip Pembungkusan Mee; jumlah gabungan tidak berubah.",
    en: "Ramen production now stays under Packing Mee when payroll is processed, so it no longer creates an incorrect Bihun/per-job split that hides EPF, SOCSO, SIP and PCB deductions. Existing affected per-job slips also place those deductions on the Packing Mee slip; combined totals are unchanged.",
  },
  {
    date: "2026-08-22",
    ms: "Medan Cukai (Tax) pada produk telah dibuang daripada halaman Katalog Produk kerana ia tidak diperlukan lagi. Nilai cukai sedia ada pada produk lama dikekalkan secara automatik dan masih digunakan untuk resit/invois lama.",
    en: "The Tax field on products has been removed from the Product Catalogue because it is no longer needed. Existing tax values on older products are preserved automatically and still used for legacy invoices/receipts.",
  },
  {
    date: "2026-08-22",
    ms: "Jenis produk (Type) kini dipilih daripada senarai pilihan (Mee, Bihun, Ramen, Bundle, Jelly Polly, Lain-lain) dan bukannya ditaip sendiri. Ini mengelakkan kesilapan ejaan dan memastikan produk baharu jatuh ke kumpulan yang betul.",
    en: "Product type (Type) is now selected from a list (Mee, Bihun, Ramen, Bundle, Jelly Polly, Other) instead of being typed manually. This avoids typos and makes sure new products fall into the right group.",
  },
  {
    date: "2026-08-22",
    ms: "Dua unit ukuran baharu kini tersedia untuk kod gaji: PKT (bungkusan) dan PCS (keping). Produk ramen juga kini mempunyai kumpulan tersendiri dalam sistem, berasingan daripada Mee dan Bihun, supaya senang dikenal pasti dan ditambah pada masa hadapan.",
    en: "Two new measurement units are now available for pay codes: PKT (packet) and PCS (piece). Ramen products now have their own group in the system, separate from Mee and Bihun, making them easy to identify and add in the future.",
  },
  {
    date: "2026-08-22",
    ms: "Eksport Audit baharu membolehkan buku kerja LEDGERS dan DEBTORS tahunan dimuat turun untuk juruaudit. Kedua-dua fail boleh dimuat turun bersama daripada rekod perakaunan yang sama, atau secara berasingan apabila diperlukan.",
    en: "The new Audit Export downloads annual LEDGERS and DEBTORS workbooks for the auditors. Both files can be downloaded together from the same accounting records, or separately when needed.",
  },
  {
    date: "2026-08-22",
    ms: "Cetakan Lejar Akaun dan penyata bank untuk semua syarikat kini memaparkan lajur Debit, Kredit dan Baki sepenuhnya dalam halaman A4, termasuk lejar yang mempunyai senarai invois atau rujukan yang panjang.",
    en: "Printed Account Ledgers and bank statements for all companies now keep the Debit, Credit and Balance columns fully within the A4 page, including ledgers with long invoice or reference lists.",
  },
  {
    date: "2026-08-21",
    ms: "Penyata bank Green Target bagi Jun 2026 kini termasuk caj bank RM2.70 yang tertinggal: Journal Voucher JV2606-01 merekodkan caj proses cek RM1.50 dan caj pengendalian bank RM1.20 pada 30 Jun. Baki PBB_1 kini RM28,465.67 dan jumlah Bank Charges RM120.10; Trial Balance dan Balance Sheet kekal seimbang, manakala rekod import Jan–Jun yang lain masih dikunci.",
    en: "Green Target's June 2026 bank statement now includes the missing RM2.70 bank charge: Journal Voucher JV2606-01 records the RM1.50 cheque-process fee and RM1.20 bank-handling charges on 30 June. PBB_1 now closes at RM28,465.67 and total Bank Charges at RM120.10; the Trial Balance and Balance Sheet remain balanced, while the rest of the imported Jan–Jun records stay locked.",
  },
  {
    date: "2026-08-20",
    ms: "Senarai Penghutang Green Target bagi Julai 2026 kini mengikut angka audit: CD-CASH RM16,054.00, CD-DURA RM1,100.00, CD-LIST RM16,440.00 dan CD-SITI -RM10.00. Penyata Dura Foam kini membawa baki RM900.00 tanpa tanda negatif dan menutup pada RM1,100.00; jumlah ringkasan CD_SD kekal RM83,730.40.",
    en: "The Green Target Debtor List for July 2026 now follows the audited figures: CD-CASH RM16,054.00, CD-DURA RM1,100.00, CD-LIST RM16,440.00 and CD-SITI -RM10.00. Dura Foam's statement now brings forward RM900.00 without a negative sign and closes at RM1,100.00; the CD_SD summary total remains RM83,730.40.",
  },
  {
    date: "2026-08-20",
    ms: "Invois Green Target: halaman butiran invois kini mempunyai butang Edit yang jelas untuk membuka borang penuh. Untuk invois dalam tempoh perakaunan yang boleh diedit, anda boleh pergi ke bahagian Accounting dan membetulkan peruntukan hasil TGA, TGB atau WS_OTH tanpa memadam dan membuat semula invois, selagi invois tidak mempunyai sejarah Credit Note, Debit Note atau Refund Note dan jurnalnya belum diedit secara manual.",
    en: "Green Target invoices: the invoice details page now has a clear Edit button that opens the full form. For invoices in an editable accounting period, you can go to Accounting and correct the TGA, TGB or WS_OTH revenue allocation without deleting and recreating the invoice, provided the invoice has no Credit Note, Debit Note or Refund Note history and its journal has not been manually edited.",
  },
  {
    date: "2026-08-20",
    ms: "Bayaran invois Tien Hock: kumpulan bayaran cek yang masih belum selesai kini boleh dipinda tanpa dibatalkan terlebih dahulu, termasuk apabila pembatalan tidak dibenarkan kerana invois mempunyai Nota Kredit aktif. Kaedah boleh ditukar kepada Online atau Pindahan Bank dan amaun setiap invois boleh dibetulkan; pertukaran kaedah akan merekodkan bayaran serta-merta pada tarikh diterima dan mengemas kini baki invois. Invois yang hanya diliputi sebahagian oleh cek belum dijelaskan juga kekal tersedia untuk baki yang belum diliputi, dan borang memaparkan amaun yang masih boleh dibayar dengan betul.",
    en: "Tien Hock invoice payments: a pending cheque payment group can now be amended without cancelling it first, including when cancellation is unavailable because an invoice has an active credit note. Change the method to Online or Bank Transfer and correct each invoice's amount; changing the method records the payment immediately on its received date and updates the invoice balances. An invoice only partly covered by a pending cheque also remains available for its uncovered balance, and the form now shows the amount still available to pay.",
  },
  {
    date: "2026-08-19",
    ms: "Green Target dan Jelly Polly: halaman CP8D kini tersedia untuk kedua-dua syarikat (Payroll → CP8D) — pra-isi setahun daripada payroll syarikat masing-masing, laraskan butiran setiap pekerja, kemudian muat turun fail TXT untuk hantaran e-CP8D. Nombor E majikan diambil daripada tetapan e-Caruman syarikat; isikannya di halaman e-Caruman dahulu sebelum eksport.",
    en: "Green Target and Jelly Polly: the CP8D page is now available for both companies (Payroll → CP8D) — prefill a year from each company's own payroll, adjust each employee's particulars, then download the TXT file for e-CP8D submission. The employer E number is taken from the company's e-Caruman settings; key it in on the e-Caruman page before exporting.",
  },
  {
    date: "2026-08-18",
    ms: "Payroll: halaman CP8D baharu untuk fail tahunan pekerja LHDN — pra-isi setahun daripada payroll, laraskan butiran cukai setiap pekerja, kemudian muat turun fail TXT (contohnya P9112779708_2026.TXT) untuk hantaran e-CP8D.",
    en: "Payroll: new CP8D page for the yearly LHDN employee file — prefill a year from payroll, adjust each employee's tax particulars, then download the TXT file (e.g. P9112779708_2026.TXT) for e-CP8D submission.",
  },
  {
    date: "2026-08-18",
    ms: "Bayaran invois: wang yang telah diliputi oleh cek yang belum dijelaskan kini dianggap telah diperuntukkan — borang Record Payment memaparkan jumlah yang diliputi cek tersebut dan jumlah yang sama tidak boleh dikutip dua kali. Sebelum ini, bayaran penuh kedua masih boleh direkodkan, menyebabkan cek tersangkut yang tidak dapat disahkan kemudian.",
    en: "Invoice payments: money already covered by an uncleared cheque now counts as spoken for — the Record Payment form shows how much uncleared cheque(s) cover and the same amount cannot be collected twice. Previously a second full payment could still be recorded, leaving a stuck cheque that could never be confirmed.",
  },
  {
    date: "2026-08-18",
    ms: "Bil tunai baharu: 'Cheque' tidak lagi ditawarkan sebagai kaedah bayaran, kerana bil tunai tidak boleh memegang cek yang belum dijelaskan. Sebelum ini pilihan itu masih muncul dan penyimpanan gagal dengan ralat umum; kini mesej yang jelas dipaparkan jika ia berlaku melalui laluan lain.",
    en: "New cash bill: 'Cheque' is no longer offered as a payment method, since a cash bill cannot hold an uncleared cheque. Previously the option was still shown and saving failed with a generic error; a clear message now appears if it ever happens through another route.",
  },
  {
    date: "2026-08-18",
    ms: "Mengedit item invois kini mengekalkan pembundaran invois, supaya jumlahnya masih berkira sebagai subjumlah + cukai + pembundaran. Sebelum ini pembundaran digugurkan secara senyap selepas edit dan jumlah tidak lagi sepadan. Terpakai untuk Tien Hock dan Jelly Polly.",
    en: "Editing an invoice's items now keeps the invoice's rounding, so its total still adds up to subtotal + tax + rounding. Previously the rounding was silently dropped after an edit and the totals no longer matched. Applies to Tien Hock and Jelly Polly.",
  },
  {
    date: "2026-08-18",
    ms: "Perlindungan perakaunan Green Target: opening balance tidak lagi boleh disimpan atau dipadam dengan tarikh sebelum 1 Julai 2026 (melindungi rekod import yang dikunci), akaun DEBTOR dan BTFS tidak boleh memegang opening balance, dan jurnal bertarikh sebelum 1 Julai 2026 tidak boleh lagi diedit. Untuk Tien Hock, pembetulan tarikh bayaran kini ditolak jika jurnalnya pernah diedit secara manual — ubah tarikh jurnal itu dari halaman Journal Entries sebaliknya.",
    en: "Green Target accounting safeguards: opening balances can no longer be saved or deleted with a date before 1 July 2026 (protecting the locked imported records), the DEBTOR and BTFS accounts can no longer carry an opening balance, and a journal dated before 1 July 2026 can no longer be edited. For Tien Hock, correcting a payment's date is now refused if its journal was manually edited before — re-date that journal from the Journal Entries page instead.",
  },
  {
    date: "2026-08-18",
    ms: "Mengedit jurnal: baris yang tidak diubah kini mengekalkan rujukan resit dan cek setiap baris yang asal. Sebelum ini menyimpan jurnal yang dimiliki dokumen sumber akan membuang rujukan tersebut pada semua baris.",
    en: "Editing a journal: unchanged lines now keep their original per-line receipt and cheque references. Previously saving a source-owned journal would drop those references on every line.",
  },
  {
    date: "2026-08-15",
    ms: "Pembayaran Jelly Polly: kumpulan bayaran yang berkongsi rujukan, tarikh dan kaedah kini boleh dibatalkan sekaligus melalui butang Cancel Group. Semua invois dan jumlah dalam kumpulan dipaparkan untuk pengesahan, dan baki invois serta kredit pelanggan dipulihkan bersama. Butang Add Payment pada kumpulan turut membuka borang baharu dengan rujukan, tarikh dan kaedah kumpulan yang telah ditetapkan. Rujukan berulang yang disahkan sebagai pemindahan sama akan menyertai kumpulan sedia ada dan bukannya menjadi kumpulan berasingan.",
    en: "Jelly Polly payments: a group of payments sharing the same reference, date and method can now be cancelled together with a Cancel Group button. Every invoice and amount in the group is shown for confirmation, and the invoice balances and customer credit are restored together. An Add Payment button on the group opens a new form prefilled with that group's reference, date and method. A repeated reference confirmed as the same transfer now joins the existing group instead of becoming a separate group.",
  },
  {
    date: "2026-08-14",
    ms: "Bayaran Jelly Polly: merekod bayaran untuk beberapa invois dengan satu rujukan kini berjaya disimpan. Sebelum ini, invois kedua dan seterusnya gagal kerana sistem menganggap rujukan yang baru digunakan pada invois pertama sebagai pendua. Rujukan daripada cek yang masih belum dijelaskan juga tidak lagi menyekat bayaran baharu. Mesej ralat kini menunjukkan sebab sebenar (contohnya invois sudah berbayar atau jumlah melebihi baki) dan bukannya hanya \"Error creating payment\".",
    en: "Jelly Polly payments: recording one payment against several invoices with a single reference now saves successfully. Previously the second and later invoices failed because the system treated the reference just used on the first invoice as a duplicate. References from uncleared pending cheques no longer block a new payment. Error messages now show the real reason (for example an invoice is already paid or the amount exceeds the balance) instead of only \"Error creating payment\".",
  },
  {
    date: "2026-08-14",
    ms: "Jurnal Green Target: ruangan Cheque No kini tersedia pada voucher Cash Payment (C) dan Bank Payment (B), sama seperti Tien Hock. Untuk Cash Payment, nombor cek seterusnya diisi secara automatik (bermula PB384453), dan untuk Bank Payment ia diisi awal dengan PBE. Sistem turut memberi amaran jika nombor cek yang sama telah digunakan pada voucher lain.",
    en: "Green Target journals: the Cheque No field is now available on Cash Payment (C) and Bank Payment (B) vouchers, just like Tien Hock. Cash Payment prefills the next cheque number automatically (starting PB384453), and Bank Payment prefills PBE. A warning also appears if the same cheque number has already been used on another voucher.",
  },
  {
    date: "2026-08-14",
    ms: "Bayaran Green Target: bayaran pendahuluan kini boleh direkodkan. Sebelum ini, tarikh bayaran yang lebih awal daripada tarikh invois ditolak terus — sekarang satu pengesahan \"advance payment\" dipaparkan dan bayaran boleh disimpan. Ini terpakai di halaman Payments, blok Record Payment semasa mencipta invois, dan borang bayaran pada halaman butiran invois.",
    en: "Green Target payments: advance payments can now be recorded. Previously a payment dated before its invoice was rejected outright — now an \"advance payment\" confirmation appears and the payment saves. This applies on the Payments page, the Record Payment block when creating an invoice, and the payment form on the invoice details page.",
  },
  {
    date: "2026-08-14",
    ms: "Debtors: butang Ledger baharu di sebelah setiap pelanggan membuka ledger pelanggan itu terus. Bulan yang sedang dipilih turut dibawa ke halaman Ledger untuk Tien Hock, Jelly Polly dan Green Target. Bagi Green Target, butang ini menggantikan butang Invoices lama kerana rekod debitornya tidak mempunyai halaman invois berasingan.",
    en: "Debtors: a new Ledger button beside each customer opens that customer's ledger directly. The selected month is also carried to the Ledger page for Tien Hock, Jelly Polly and Green Target. For Green Target, it replaces the old Invoices button because its debtor records do not have separate invoice pages.",
  },
  {
    date: "2026-08-14",
    ms: "Jelly Polly Payroll: tarikh setiap baris kerja pada halaman butiran gaji pekerja kini betul. Sebelum ini baris yang direkodkan pada hari pertama bulan (contohnya 01/08/2026) dipaparkan sebagai hari terakhir bulan sebelumnya (31/07/2026), walaupun rekod sebenar disimpan pada tarikh yang betul — ini hanya masalah paparan, tiada data yang hilang atau salah.",
    en: "Jelly Polly Payroll: the date of each work line on an employee's payroll details page is now correct. Previously a line recorded on the first day of a month (e.g. 01/08/2026) was shown as the last day of the previous month (31/07/2026), even though the record itself was saved on the right date — this was a display issue only, no data was lost or wrong.",
  },
  {
    date: "2026-08-14",
    ms: "Jelly Polly: paparan By Customer di halaman Debtors kini mempunyai ruangan Debtor Opening untuk memasukkan baki pembukaan setiap pelanggan pada hari pertama bulan yang dipilih. Amaun positif bermaksud pelanggan berhutang (DR), manakala amaun negatif ialah kredit pelanggan (CR); kosongkan ruangan dan simpan untuk membuang baki pembukaan pada tarikh itu. Bal B/F, jumlah tertunggak, penyata pelanggan dan Account Ledger kini menggunakan baki pembukaan ini bersama invois, bayaran dan pelarasan selepas tarikhnya. Baki pembukaan juga boleh ditetapkan terus dari Account Ledger. Jika ID pelanggan ditukar, baki pembukaan ini akan dipindahkan ke ID baharu; jika pelanggan dipadam secara kekal, baki pembukaannya turut dibuang selepas pengesahan.",
    en: "Jelly Polly: the By Customer view on the Debtors page now has a Debtor Opening column for entering each customer's opening balance on the first day of the selected month. A positive amount means the customer owes money (DR), while a negative amount is customer credit (CR); clear the field and save to remove that date's opening. Bal B/F, outstanding totals, customer statements and Account Ledger now use this opening together with invoices, payments and adjustments after its date. The opening can also be set directly from Account Ledger. Changing a customer ID carries these openings to the new ID; permanently deleting a customer also removes their openings after confirmation.",
  },
  {
    date: "2026-08-13",
    ms: "Laporan Anggaran (MEE & BIHUN): perkataan untung/rugi dibuang mengikut kehendak bos. Laporan \"Anggaran P&L\" kini bernama \"Anggaran Kos\", dan baris-barisnya ditukar — PROFIT / (LOSS) menjadi ESTIMATE COST, FINAL PROFIT / (LOSS) menjadi FINAL ESTIMATE COST, dan ACCUMULATIVE P/L menjadi ACCUMULATIVE COST. Perubahan yang sama dibuat pada cetakan PDF. Semua angka dan cara pengiraan kekal sama.",
    en: "Estimated Reports (MEE & BIHUN): the profit/loss wording has been removed as the boss requested. The \"Estimated P&L\" report is now called \"Estimated Cost\", and its rows have been renamed — PROFIT / (LOSS) becomes ESTIMATE COST, FINAL PROFIT / (LOSS) becomes FINAL ESTIMATE COST, and ACCUMULATIVE P/L becomes ACCUMULATIVE COST. The same wording is used on the printed PDF. All figures and calculations stay exactly the same.",
  },
  {
    date: "2026-08-11",
    ms: "Invois Green Target: baris item pada bil kini boleh diubah semasa mencipta atau mengedit invois. Penerangan diisi awal mengikut akaun hasil — Rental Tong (A) untuk TGA, Rental Tong (B) untuk TGB, selainnya Waste Management (sebelum ini \"Waste Management Service\") — bersama kuantiti dan harga unit, dan baris tambahan seperti caj hari lebihan boleh ditambah. Amaun invois kini dikira sebagai jumlah baris item dan bukannya angka yang dimasukkan. Baris dikunci sebaik sahaja bil mempunyai bayaran, pelarasan atau e-Invois yang disahkan. Bil lama mengekalkan penerangan asalnya.",
    en: "Green Target invoices: the line items on a bill are now editable when creating or editing an invoice. The description is prefilled from the revenue account — Rental Tong (A) for TGA, Rental Tong (B) for TGB, otherwise Waste Management (previously \"Waste Management Service\") — with quantity and unit price, and extra lines such as extra-days charges can be added. The invoice amount is now calculated as the sum of the line items instead of a keyed figure. Lines lock once the bill has a payment, adjustment or validated e-Invoice. Older bills keep their original wording.",
  },
  {
    date: "2026-08-11",
    ms: "Stok Bahan: butang Cetak baharu pada tab MEE, BIHUN dan SHARED mencetak stok bulan yang dipilih sebagai PDF. Laporan mengikut pilihan Running Balance — tanpanya ia menjadi helaian kiraan stok (kos unit, kuantiti dan nilai), dan dengannya ia turut menunjukkan lajur pembukaan, belian dan penutup. Baris tanpa kiraan boleh disembunyikan daripada cetakan melalui kotak semak baris kosong yang sedia ada. Bahagian Stock Kilang dan Jumlah Keseluruhan turut disertakan.",
    en: "Material Stock: a new Print button on the MEE, BIHUN and SHARED tabs prints the selected month's stock as a PDF. The report follows the Running Balance toggle — off gives a stock count sheet (unit cost, quantity and value), on adds opening, purchases and closing columns. Rows with no count can be left out of the printout using the existing empty-rows checkbox. The Stock Kilang section and Grand Total are included.",
  },
  {
    date: "2026-08-11",
    ms: "Penyata Akaun (Green Target): penyata pelanggan kini dibaca terus dari lejar akaun penghutang, jadi baki pembukaan dari sistem lama, bil yang digabungkan ke dalam e-Invois CON, dan bayaran yang direkodkan terus dalam jurnal semuanya turut dipaparkan. Jumlah penyata kini sentiasa sepadan dengan Lejar Akaun pelanggan. Pelanggan yang tidak mempunyai akaun penghutang yang dipautkan tidak dapat dijana penyatanya.",
    en: "Statement of Account (Green Target): the customer statement is now read straight from the debtor's account ledger, so the opening balance carried from the old system, bills merged into a consolidated (CON) e-Invoice, and payments keyed directly into the journal all appear on it. The statement total now always matches the customer's Account Ledger. Customers without a linked debtor account cannot have a statement generated.",
  },
  {
    date: "2026-08-11",
    ms: "Jualan (Green Target): senarai Listing Debtor kini disusun mengikut nombor invois yang berlari (2026/01012, 2026/01013, 2026/01014 dan seterusnya) pada kedua-dua tab, bukan lagi mengikut tarikh. Ini memudahkan semakan silang dengan fail Excel yang bernombor giliran.",
    en: "Sales (Green Target): the Listing Debtor report is now sorted by running invoice number (2026/01012, 2026/01013, 2026/01014 and so on) on both tabs, instead of by date. This makes it easier to cross-check against a sequentially numbered Excel file.",
  },
  {
    date: "2026-08-11",
    ms: "Jualan (Green Target): setiap baris pada senarai Listing Debtor kini mempunyai nombor giliran (No.), dan terdapat butang Cetak baharu yang mencetak senarai yang sedang dipaparkan sebagai PDF. Ini memudahkan semakan silang senarai dengan fail Excel anda.",
    en: "Sales (Green Target): every row on the Listing Debtor report now shows a running number (No.), and there is a new Print button that prints the list currently on screen as a PDF. This makes it easier to cross-check the list against your Excel file.",
  },
  {
    date: "2026-08-11",
    ms: "Invois (Tien Hock): tarikh/masa bil yang telah dibatalkan kini boleh diubah. Sebelum ini butang ubah tarikh hilang selepas bil dibatalkan, jadi bil yang tersalah tarikh terpaksa dikeluarkan semula dengan nombor baharu. Apabila tarikh diubah, rekod jurnal dan rekod bayaran automatik bil itu turut berpindah ke hari yang sama, jadi semuanya sepadan. Medan lain pada bil yang dibatalkan kekal terkunci, jumlahnya kekal sifar, dan tiada apa-apa dalam lejar berubah.",
    en: "Invoices (Tien Hock): the date/time of a cancelled bill can now be changed. Previously the date edit button disappeared once a bill was cancelled, so a bill issued on the wrong day had to be re-issued under a new number. When you change the date, the bill's journal record and its automatic payment record move to the same day, so everything matches. All other fields on a cancelled bill stay locked, its amount stays zero, and nothing in the ledger changes.",
  },
  {
    date: "2026-08-11",
    ms: "Gaji (Green Target dan Jelly Polly): selepas gaji bulanan diproses, program kini memberi amaran apabila gaji kasar pekerja melebihi RM 3,000 tetapi tiada kadar cukai pendapatan yang meliputi julat gaji tersebut, sama seperti Tien Hock. Amaran menyenaraikan pekerja yang terlibat dan menyediakan pautan ke Kadar Cukai Pendapatan supaya potongan yang tertinggal boleh dibetulkan.",
    en: "Payroll (Green Target and Jelly Polly): after monthly payroll is processed, the program now warns you when an employee's gross pay is above RM 3,000 but no income tax rate covers that salary range, matching Tien Hock. The warning lists the affected employees and links to Income Tax Rates so missing deductions can be corrected.",
  },
  {
    date: "2026-08-10",
    ms: "Green Target: halaman Sales Summary baharu kini membolehkan anda melihat jualan untuk satu hari, bulan, julat tarikh tersuai atau tahun. Rekod lejar Januari hingga Jun 2026 digabungkan dengan invois sistem mulai Julai, supaya jualan dari 2026 dipaparkan dengan lengkap. Paparan Debtor Listing berbentuk helaian menyenaraikan jualan, bayaran, baki tertunggak dan perbezaan, manakala Butiran Jualan memberikan paparan menyeluruh. Rekod sebelum 2026 masih boleh dilihat, tetapi halaman akan memberi amaran bahawa liputannya tidak lengkap.",
    en: "Green Target: a new Sales Summary page now lets you view sales for a day, month, custom date range or year. January–June 2026 ledger records are combined with system invoices from July onward, giving complete sales coverage from 2026. The spreadsheet-style Debtor Listing shows sales, payments, outstanding balances and differences, while Sales Details provides the comprehensive view. Earlier records remain viewable, with a warning that pre-2026 coverage is incomplete.",
  },
  {
    date: "2026-08-07",
    ms: "Jelly Polly: menukar tarikh/masa invois tidak lagi menulis semula tarikh pada pembayarannya. Pembayaran mengekalkan tarikh sebenar ia dibuat, jadi bayaran pendahuluan dan invois bertarikh lampau kekal betul.",
    en: "Jelly Polly: changing an invoice's date/time no longer rewrites the dates on its payments. Payments keep the date they were actually made, so advance payments and backdated invoices stay correct.",
  },
  {
    date: "2026-08-07",
    ms: "Invois (Tien Hock dan Jelly Polly): semasa merekod bayaran pada borang invois, anda kini boleh memilih tarikh bayaran untuk setiap baris bayaran dan bukannya sentiasa menggunakan tarikh invois. Setiap bayaran lalai kepada hari yang sama dengan invois, dan setiap bayaran pecahan mengekalkan tarikh yang anda pilih untuknya.",
    en: "Invoices (Tien Hock and Jelly Polly): when recording a payment on the invoice form you can now choose a payment date for each payment line instead of always using the invoice date. Every payment defaults to the same day as the invoice, and each split payment keeps the date you pick for it.",
  },
  {
    date: "2026-08-07",
    ms: "Invois (Tien Hock dan Jelly Polly): pemilih tarikh dan masa pada borang invois serta dialog Change Date & Time kini menggunakan pemilih kalendar aplikasi dengan pemilih jam/minit yang kemas dan bukannya kotak masa lalai pelayar. Tingkah laku pembayaran dan perakaunan tidak berubah.",
    en: "Invoices (Tien Hock and Jelly Polly): the date and time picker on the invoice form and the Change Date & Time dialog now uses the app's calendar picker with a proper hour/minute selector instead of the browser's plain time box. Payment and accounting behaviour is unchanged.",
  },
  {
    date: "2026-08-07",
    ms: "Halaman Payments (Tien Hock): senarai kini memaparkan 200 bayaran pada satu masa dengan butang Previous/Next dan nombor halaman, dan bukannya memuatkan semua bayaran sekaligus. Penapis dan carian masih digunakan pada keseluruhan set hasil, dan bayaran pending masih dipaparkan dahulu.",
    en: "Payments page (Tien Hock): the list now shows 200 payments at a time with Previous/Next and page numbers, instead of loading every payment at once. Filters and search still apply to the whole result set, and pending payments are still shown first.",
  },
  {
    date: "2026-08-07",
    ms: "Pembayaran (Tien Hock): anda kini boleh membetulkan tarikh kumpulan bayaran tunai, pindahan bank atau dalam talian terus dari halaman Payments atau butiran kumpulan bayaran. Resit, rekod pembayaran dan catatan jurnal yang disiarkan semuanya bergerak ke tarikh baharu. Tunai bergerak secara automatik antara akaun kutipan hari jualan dan kutipan kemudian apabila tarikh baharu ialah hari jualan invois. Bayaran tunai yang telah dibank masuk hanya boleh dipindahkan ke tarikh pada atau sebelum tarikh bank masuk; jika tidak, batalkan bank masuk dahulu. Bayaran cek mengekalkan tingkah laku sedia ada: hanya tarikh diterima yang berubah, dan jurnal kekal pada tarikh penjelasan cek.",
    en: "Payments (Tien Hock): you can now correct the date on a cash, bank transfer or online payment group directly from the Payments page or the payment group details. The receipt, its payment records and the posted journal entry all move to the new date together. Cash automatically moves between the same-day and later-collection accounts when the new date is the invoice's sale day. A cash payment that has already been banked in can only be moved to a date on or before its bank-in date; otherwise reverse the bank-in first. Cheque payments keep the existing behaviour: only the received date changes, and the journal stays on the cheque's clearance date.",
  },
  {
    date: "2026-08-07",
    ms: "Resit tunai C015353/C015360/C015364/C015372 (ROSE, RM91.60) telah dipindahkan dari 7 Ogos ke 7 Julai 2026. Resit, catatan jurnal dan rekod pembayarannya kini semuanya menunjukkan 7 Julai, jadi lejer Julai merangkumi tunai ini dan Ogos tidak lagi. Tunai telah dibank masuk pada 10 Julai, yang kini sepadan dengan resit.",
    en: "Cash receipt C015353/C015360/C015364/C015372 (ROSE, RM91.60) has been moved from 7 August to 7 July 2026. The receipt, its journal entry and the payment records all now show 7 July, so the July ledgers include this cash and August no longer does. The cash was banked in on 10 July, which now matches the receipt.",
  },
  {
    date: "2026-08-07",
    ms: "Green Target: invois kini boleh merekod nombor Delivery Order (DO) sebagai rujukan sahaja. Masukkan DO pada borang invois (pilihan) dan ia dipaparkan pada kad senarai invois serta halaman butiran invois. Ia tidak menjejaskan jumlah, e-Invois, sewaan atau pembayaran. Halaman Delivery Order lama di bawah Sewaan telah dibuang; rujukan DO kini direkod terus pada invois.",
    en: "Green Target: invoices can now record a Delivery Order (DO) number as a reference only. Enter the DO on the invoice form (optional) and it appears on the invoice list cards and the invoice details page. It does not affect totals, e-Invoices, rentals or payments. The old Delivery Order page under Rentals has been removed; DO references are now recorded directly on the invoice.",
  },
  {
    date: "2026-08-07",
    ms: "Green Target: halaman Opening Balances baharu kini tersedia di bawah Accounting, sama seperti Tien Hock. Ia memaparkan baki pembukaan semua akaun pada satu tarikh dalam satu helaian, disusun mengikut nota penyata kewangan, dan anda boleh menaip terus ke dalam ruangan Debit atau Kredit mana-mana baris serta menyimpan semua perubahan sekali gus. Mengosongkan kedua-dua ruangan akan membuang baki pembukaan akaun itu semasa disimpan, dan butang Print mengeluarkan PDF dengan susun atur jadual juruaudit. Halaman Account Ledger Green Target juga kini mempunyai butang set baki pembukaan untuk akaun GL, sama seperti Tien Hock.",
    en: "Green Target: a new Opening Balances page is now available under Accounting, matching Tien Hock. It shows every account's opening balance for one date on a single sheet, grouped by financial statement note, and you can type straight into the Debit or Credit column of any row and save all your changes at once. Clearing both columns removes that account's opening balance when you save, and the Print button produces a PDF laid out like the auditor's schedule. The Green Target Account Ledger page also now has a set-opening-balance button for GL accounts, just like Tien Hock.",
  },
  {
    date: "2026-08-07",
    ms: "Catatan jurnal (Tien Hock dan Green Target): anda kini boleh menukar jenis catatan selepas menyimpannya, walaupun catatan itu dicipta dengan jenis sistem seperti Nota Kredit (CN). Sebelum ini, catatan yang dikunci secara manual dengan jenis sedemikian kekal terkunci pada jenis tersebut, jadi Nota Kredit tidak boleh ditukar kepada Jurnal. Catatan yang dimiliki oleh dokumen sumber (seperti invois atau nota kredit yang diterbitkan dari Sales) masih mengekalkan jenisnya apabila disunting, supaya dokumen tersebut masih boleh dibatalkan dengan betul.",
    en: "Journal entries (Tien Hock and Green Target): you can now change a journal's type after saving it, even when it was created with a system type such as Credit Note (CN). Previously, journals keyed manually with such a type stayed locked to it, so a Credit Note could not be re-typed to a Journal. Journals owned by a source document (such as an invoice or a credit note issued from Sales) still keep their type when edited, so those documents can still be cancelled correctly.",
  },
  {
    date: "2026-08-07",
    ms: "Butiran invois dan dokumen pelarasan (Tien Hock): jurnal invois itu sendiri kini dipautkan dari pengepala invois, jadi anda boleh membuka jurnal jualan terus dari halaman invois. Setiap dokumen pelarasan (nota kredit/debit/bayaran balik) juga memautkan jurnalnya sendiri, sama ada dari bahagian dokumen pelarasan pada halaman invois atau dari halaman butiran dokumen itu. Halaman butiran jurnal kini menunjukkan jurnal berkaitan: jurnal jualan invois menyenaraikan jurnal dokumen pelarasan invois tersebut, dan jurnal dokumen pelarasan menyenaraikan jurnal jualan invois serta jurnal pelarasan lain, semuanya dengan pautan. Senarai bayaran tidak lagi memaparkan baris kutipan tunai automatik yang dibatalkan yang tertinggal daripada bil yang ditukar daripada Tunai kepada Invois, yang sebelum ini kelihatan seperti bayaran atau jurnal dibatalkan. Rujukan jurnal pada invois kini memaparkan rujukan yang anda masukkan (contohnya TR280726) dan bukannya nombor dalaman sistem.",
    en: "Invoice and adjustment document details (Tien Hock): the invoice's own journal entry is now linked from the invoice header, so you can open the sale journal directly from the invoice page. Each adjustment document (credit/debit/refund note) also links to its own journal, both from the adjustment documents section on the invoice page and from the document's own details page. The journal details page now shows related journals: an invoice's sales journal lists that invoice's adjustment-document journals, and an adjustment document's journal lists the invoice's sales journal plus the other adjustment journals, all with links. The payments list no longer shows a cancelled automatic cash-collection row left over from a bill that was changed from Cash to Invoice, which previously looked like a cancelled payment or journal. Journal references on the invoice now show the reference you keyed (for example TR280726) instead of an internal system number.",
  },
  {
    date: "2026-08-07",
    ms: "Pembetulan lanjut akaun Jun 2026 (Tien Hock): tiga baris yang dikelas semula pada 6 Ogos telah dikembalikan kepada nilai asalnya kerana rekod program lama itu sendiri tersilap kunci. Resit KFC RM40.00 kembali ke Staff Messing (Kilang) dan bukan Cleaning Expenses, dan resit PAUMIN RM709.00 dipecahkan semula kepada Repair & Maintenance (Factory) RM565.00 + Safety & Health RM144.00. Baki lejer Jun berubah bagi empat akaun sahaja: MBC 919.10, MBSM_K 3,126.49, MBRMF 5,135.60, MBSAF 1,329.55. Laporan Estimated Unit Cost BIHUN Jun turut berubah pada empat baris tersebut, tetapi jumlah perbelanjaan (64,238.82) dan FINAL (14.0504) kekal sama. Jumlah keseluruhan Trial Balance Jun tidak berubah.",
    en: "Further June 2026 account corrections (Tien Hock): three lines reclassified on 6 August have been returned to their original accounts, because the legacy program's own records were the ones keyed wrongly. The KFC receipt of RM40.00 goes back to Staff Messing (Factory) rather than Cleaning Expenses, and the PAUMIN receipt of RM709.00 is split again as Repair & Maintenance (Factory) RM565.00 + Safety & Health RM144.00. June ledger balances change for four accounts only: MBC 919.10, MBSM_K 3,126.49, MBRMF 5,135.60, MBSAF 1,329.55. The June BIHUN Estimated Unit Cost report changes on those same four lines, but the expenses total (64,238.82) and FINAL (14.0504) are unchanged. The June Trial Balance grand total is unchanged.",
  },
  {
    date: "2026-08-07",
    ms: "Trial Balance (Tien Hock dan Green Target): anda kini boleh mengawal susunan akaun dalam laporan. Butang susunan di sebelah butang Panduan membolehkan anda memilih antara Susunan Manual (susun sendiri dengan seret atau anak panah) dan Susunan Piawai (mengikut urutan Carta Akaun). Kumpulan besar seperti Trade Debtors, Stok Penutup/Pembukaan dan Trade Creditors dipaparkan sebagai satu baris dengan bilangan item, supaya anda boleh menggerakkan seluruh kumpulan sekaligus. Dalam Susunan Piawai, akaun dikumpulkan di bawah tajuk kategori (Aset, Liabiliti, Ekuiti, Revenue, Perbelanjaan) yang boleh dikembangkan/ditutup. Terdapat juga kotak semak untuk hanya memaparkan akaun yang muncul dalam Trial Balance bulan yang dipilih (dihidupkan secara lalai), dan pilihan ini diingat. Pilihan susunan anda diingat dan digunakan pada skrin dan dalam PDF.",
    en: "Trial Balance (Tien Hock and Green Target): you can now control the order of accounts in the report. The order button next to the Guide button lets you choose between Manual Order (arrange it yourself by dragging or using the arrows) and Standard Order (following the Chart of Accounts sequence). Large groups such as Trade Debtors, Closing/Opening Stock and Trade Creditors are shown as one row with their item count, so you can move the whole group at once. In Standard Order, accounts are grouped under collapsible category headings (Assets, Liabilities, Equity, Revenues, Expenses). A checkbox can filter the order modal to only the accounts that appear in the selected month's Trial Balance (on by default), and this choice is remembered. Your order choice is remembered and applied on screen and in the PDF.",
  },
  {
    date: "2026-08-06",
    ms: "Nama syarikat Tien Hock pada semua dokumen dan PDF kini dieja \"TIEN HOCK FOOD INDUSTRIES SDN BHD\" dan bukannya \"S/B\". Ini terpakai pada laporan perakaunan, slip gaji, penyata, invois dan e-invois akan datang. Nama fail PDF yang disimpan juga kini menunjukkan SDN_BHD dan bukannya S_B.",
    en: "Tien Hock's company name on all documents and PDFs is now spelled \"TIEN HOCK FOOD INDUSTRIES SDN BHD\" instead of \"S/B\". This applies to accounting reports, payslips, statements, invoices and future e-invoices. Saved PDF filenames now show SDN_BHD instead of S_B.",
  },
  {
    date: "2026-08-06",
    ms: "PDF laporan kini memaparkan nama yang lebih jelas semasa dicetak atau dibuka, dan fail PDF yang disimpan menggunakan nama yang sama, contohnya \"Trial Balance as at 2026-06-30 - Tien Hock\" dan bukannya nama tab generik seperti \"Trial Balance _ Tien Hock ERP\". Ini terpakai untuk semua laporan perakaunan, stok, gaji, penyata dan invois-e.",
    en: "Report PDFs now show a clear title when printed or opened, and the saved PDF file uses the same name, for example \"Trial Balance as at 2026-06-30 - Tien Hock\" instead of the generic tab name like \"Trial Balance | Tien Hock ERP\". This applies to all accounting, stock, payroll, statement and e-invoice PDFs.",
  },
  {
    date: "2026-08-06",
    ms: "Trial Balance (Tien Hock): senarai akaun kini disusun mengikut abjad kod akaun dari A hingga Z dalam satu senarai, pada halaman dan dalam PDF. Sebelum ini akaun disusun mengikut kumpulan (Bank, Stok, GL, Pemiutang dan sebagainya), jadi akaun pemiutang seperti CR_BF dan CR_UN tercampak ke halaman akhir walaupun kodnya bermula dengan C. Susunan baharu meletakkan setiap akaun pada tempat abjadnya, jadi semua kod CR_* kini berada bersama kod C yang lain. Jumlah keseluruhan tidak berubah.",
    en: "Trial Balance (Tien Hock): the account list is now sorted alphabetically by account code from A to Z in one sequence, on the page and in the PDF. Previously accounts were grouped by type (Bank, Stock, GL, Creditors and so on), which pushed creditor accounts such as CR_BF and CR_UN to the final pages even though their codes start with C. The new order puts every account at its alphabetical position, so all CR_* codes now sit together with the other C codes. Grand totals are unchanged.",
  },
  {
    date: "2026-08-06",
    ms: "Pembetulan akaun Jun 2026 (Tien Hock): 31 baris buku tunai/bank bulan Jun telah dikelas semula mengikut rekod program lama (contohnya perbelanjaan yang salah masuk ke akaun Office Refreshment, Staff Messing, diesel atau repair kenderaan dipindahkan ke akaun yang betul, dan beberapa amaun dibaiki mengikut resit asal). Baki lejer Jun untuk akaun-akaun berkaitan (BRM, MBC, MBOR, MBRM, MBRMF, MBSAF, MBSM_K/O, OIL*, R9698, MRM, MGT) kini sepadan dengan cetakan lama sehingga ke sen, dan laporan Estimated Unit Cost BIHUN Jun kini mengikut angka yang telah dibetulkan (FINAL 14.0504). Jumlah keseluruhan Trial Balance Jun tidak berubah.",
    en: "June 2026 account corrections (Tien Hock): 31 June cash/bank voucher lines have been reclassified to match the legacy program's records (e.g. expenses wrongly keyed to Office Refreshment, Staff Messing, vehicle diesel or repair accounts were moved to the correct accounts, and a few amounts were corrected to the original receipts). June ledger balances for the affected accounts (BRM, MBC, MBOR, MBRM, MBRMF, MBSAF, MBSM_K/O, OIL*, R9698, MRM, MGT) now match the legacy printouts to the cent, and the June BIHUN Estimated Unit Cost report now shows the corrected figures (FINAL 14.0504). The June Trial Balance grand total is unchanged.",
  },
  {
    date: "2026-08-06",
    ms: "Senarai Journal Entries (Tien Hock dan Green Target): kini ada butang batal pada setiap baris, jadi anda boleh membatalkan catatan terus dari senarai tanpa membukanya. Butang batal dan butang padam tidak boleh ditekan bagi catatan yang dimiliki oleh dokumen sumbernya (invois, resit dan sebagainya) — batal atau buang dokumen itu sebaliknya, sama seperti di halaman butiran catatan. Tajuk halaman, tarikh dan penapis juga kekal di bahagian atas semasa anda menatal senarai.",
    en: "Journal Entries list (Tien Hock and Green Target): each row now has a cancel button, so you can cancel an entry straight from the list without opening it. Both the cancel and delete buttons are disabled for entries owned by their source document (invoice, receipt and so on) — cancel or remove that document instead, the same as on the entry details page. The page title, date and filters now also stay at the top while you scroll the list.",
  },
  {
    date: "2026-08-06",
    ms: "Borang invois kini menerima bayaran sebahagian dan bayaran campur. TIEN HOCK & JELLY POLLY: bahagian bayaran kini mempunyai kotak \"Amount\" yang sentiasa kelihatan dan sudah diisi dengan jumlah penuh bil — kurangkannya untuk merekod bayaran sebahagian, dan bakinya kekal tertunggak untuk dikutip kemudian di halaman Payments seperti biasa. Butang \"Split payment\" pula menambah baris bayaran, jadi satu bil boleh direkod sebagai contohnya RM392 tunai dan RM596 online. Bil TUNAI mesti dibayar penuh kerana ia tunai-dan-bawa; jika jumlah yang dimasukkan kurang, sistem akan meminta anda menukar bil kepada jenis Invois. Kotak \"Mark as Paid\" pada invois kredit kini bernama \"Record Payment\" kerana ia tidak semestinya melunaskan bil sepenuhnya. GREEN TARGET: borang invois mendapat kotak \"Amount Received\" — biarkan kosong untuk jumlah penuh invois, atau masukkan jumlah yang lebih kecil untuk bayaran sebahagian.",
    en: "The invoice form now accepts partial and split payments. TIEN HOCK & JELLY POLLY: the payment section now has an \"Amount\" box that is always visible and pre-filled with the full bill — lower it to record a part payment, and the rest stays outstanding to be collected later on the Payments page as usual. A \"Split payment\" button additionally adds payment lines, so one bill can be recorded as, for example, RM392 cash and RM596 online. A CASH bill must still be paid in full because it is cash-and-carry; if you enter less, the system asks you to change the bill to the Invoice type. The \"Mark as Paid\" checkbox on a credit invoice is now called \"Record Payment\", since it no longer necessarily settles the whole bill. GREEN TARGET: the invoice form gains an \"Amount Received\" box — leave it blank for the full invoice, or enter less for a part payment.",
  },
  {
    date: "2026-08-06",
    ms: "Wang tunai yang diterima pada hari jualan kini masuk ke akaun yang betul. Sebelum ini semua bayaran tunai atas invois kredit dimasukkan ke akaun kutipan hutang (CH_REV2) tanpa mengira tarikh. Sekarang sistem menyemak tarikh: tunai yang diterima pada hari bil itu dikeluarkan masuk ke kutipan jualan tunai hari itu (CH_REV1) dan boleh dibank-in bersama duit tunai hari tersebut, manakala tunai yang dikutip kemudian kekal di CH_REV2 seperti biasa. Jenis bil dan akaun jualan tidak berubah. Satu bayaran tunai tidak boleh mencampurkan bil hari ini dengan bil lama kerana kedua-duanya dibank-in dengan cara berbeza — key secara berasingan.",
    en: "Cash received on the sale day now goes to the correct account. Previously every cash payment against a credit invoice went to the debt collection account (CH_REV2) regardless of date. The system now checks the date: cash taken on the same day the bill was issued goes to that day's cash sales collection (CH_REV1) and can be banked in together with that day's cash, while cash collected later stays in CH_REV2 as before. The bill type and the sales account are unchanged. One cash payment cannot mix today's bills with older bills, because the two are banked in differently — record them separately.",
  },
  {
    date: "2026-08-06",
    ms: "Bil tunai yang dibayar sebahagiannya melalui bank kini boleh dikey terus. Sebelum ini bil tunai terus ditanda \"Paid\" dan tiada tempat langsung untuk merekod bahagian yang diterima secara online atau pindahan bank, jadi bil bayaran campur terpaksa ditukar menjadi invois kredit — dan wang tunainya tersalah masuk ke akaun kutipan hutang (CH_REV2) dan bukannya kutipan jualan tunai hari itu (CH_REV1). Sekarang butang Payment tetap ada pada bil tunai: masukkan bahagian yang diterima melalui bank, dan baki wang tunai kekal sebagai kutipan tunai hari jualan tersebut secara automatik. Bil tunai juga boleh dipilih di halaman Payments. Wang tunai tidak boleh direkod ke atas bil tunai (memang sudah direkod), cek yang belum jelas tidak diterima, dan jumlahnya tidak boleh melebihi wang tunai yang dikutip. Membatalkan bayaran itu akan memulangkan jumlahnya kepada kutipan tunai hari tersebut, dan sistem akan menghalang jika wang hari itu sudah dimasukkan ke bank.",
    en: "Cash bills that were partly paid by bank can now be keyed directly. Previously a cash bill was marked \"Paid\" immediately with no way at all to record the part received online or by bank transfer, so mixed-payment bills had to be converted to credit invoices — and their cash then landed in the debt collection account (CH_REV2) instead of that day's cash sales collection (CH_REV1). The Payment button now stays available on a cash bill: enter the part received through the bank, and the remaining cash automatically stays as the sale day's cash collection. Cash bills can also be selected on the Payments page. Cash cannot be recorded against a cash bill (it is already recorded), uncleared cheques are not accepted, and the amount cannot exceed the cash collected. Cancelling such a payment returns the amount to that day's cash collection, and the system blocks the change if that day's cash has already been banked in.",
  },
  {
    date: "2026-08-06",
    ms: "Halaman Opening Balances: setiap kategori (nota penyata kewangan) kini boleh dibuka atau ditutup dengan menekan barisan tajuknya, dan ada butang \"Collapse all\" / \"Expand all\" untuk semua sekali. Jika kategori yang ditutup mengandungi baris yang belum disimpan atau jumlah yang salah, bilangannya dipaparkan pada barisan tajuk itu. Kategori yang ditutup diingat bersama tarikh dan penapis anda apabila anda keluar dan kembali ke halaman ini. Tarikh, penapis, butang dan jalur status baki juga kekal di bahagian atas semasa anda menatal senarai.",
    en: "Opening Balances page: each category (financial statement note) can now be collapsed or expanded by clicking its heading row, with a \"Collapse all\" / \"Expand all\" button for all of them at once. If a collapsed category contains unsaved rows or invalid amounts, the count is shown on its heading row. Which categories are collapsed is remembered along with your date and filters when you leave the page and come back. The date, filters, buttons and the balance status strip now also stay at the top while you scroll the list.",
  },
  {
    date: "2026-08-06",
    ms: "Perakaunan → Opening Balances: halaman baharu yang memaparkan baki pembukaan semua akaun pada satu tarikh dalam satu helaian, disusun mengikut nota penyata kewangan seperti jadual juruaudit. Anda boleh menaip terus ke dalam ruangan Debit atau Kredit mana-mana baris dan menyimpan semua perubahan sekali gus, dan mengosongkan kedua-dua ruangan akan membuang baki pembukaan akaun itu semasa disimpan. Jumlah Debit dan Kredit dipaparkan di atas supaya anda nampak serta-merta jika baki tidak seimbang, dan butang Print mengeluarkan PDF dengan susun atur yang sama seperti jadual juruaudit. Cara lama (buka satu kod pada satu masa di halaman Account Ledger) masih berfungsi seperti biasa.",
    en: "Accounting → Opening Balances: a new page showing every account's opening balance for one date on a single sheet, grouped by financial statement note like the auditor's schedule. You can type straight into the Debit or Credit column of any row and save all your changes at once, and clearing both columns removes that account's opening balance when you save. Debit and Credit totals are shown at the top so you can see immediately if they don't balance, and the Print button produces a PDF laid out the same way as the auditor's schedule. The old way (opening one code at a time from the Account Ledger page) still works as before.",
  },
  {
    date: "2026-08-06",
    ms: "Borang invois (Tien Hock, Jelly Polly dan Green Target): ruangan Tarikh kini menggunakan pemilih kalendar dengan anak panah untuk ke hari sebelum atau selepas. Pada borang Tien Hock dan Jelly Polly, ruangan Jenis, Tarikh dan Masa kini berkongsi satu baris, begitu juga Pelanggan dan ID Pelanggan.",
    en: "Invoice forms (Tien Hock, Jelly Polly and Green Target): the Date field now uses a calendar picker with arrows to step to the previous or next day. On the Tien Hock and Jelly Polly forms, Type, Date and Time now share one row, as do Customer and Customer ID.",
  },
  {
    date: "2026-08-06",
    ms: "Green Target: Tong, Tarikh Letak dan Tarikh Ambil kini pilihan semasa membuat sewaan — hanya pelanggan dan pemandu diperlukan. Ini membolehkan anda merekod tapak dan alamat pelanggan sahaja, kemudian terus ke invois, bayaran dan perakaunan, sementara pergerakan tong direkod di tempat lain. Pada senarai dan halaman sewaan, label \"Active/Completed\" digantikan dengan status bil: No Invoice, Unpaid, Partly Paid, Overdue atau Paid. Butang \"Mark as Picked Up\" hanya muncul untuk sewaan yang mempunyai Tarikh Letak. Sewaan tanpa Tarikh Letak sentiasa dipaparkan walaupun anda menapis mengikut julat tarikh. Tapisan \"Active Rentals Only\" telah dibuang kerana ia tidak lagi bermakna; tapisan \"No Invoice Only\" kekal.",
    en: "Green Target: Dumpster, Placement Date and Pickup Date are now optional when creating a rental — only the customer and driver are required. This lets you record just the customer's site and address and move straight on to the invoice, payment and accounting, while the tong movement is recorded elsewhere. On the rental list and rental page, the \"Active/Completed\" label is replaced with the billing status: No Invoice, Unpaid, Partly Paid, Overdue or Paid. The \"Mark as Picked Up\" button only appears for rentals that have a Placement Date. Rentals with no Placement Date always show, even when you filter by a date range. The \"Active Rentals Only\" filter has been removed since it no longer means anything; the \"No Invoice Only\" filter stays.",
  },
  {
    date: "2026-08-06",
    ms: "Material Stock: membetulkan ralat \"Every product must be a BH product\" yang kadangkala muncul semasa menyimpan jadual Stock Kilang selepas bertukar antara tab Mee dan Bihun — senarai produk tab sebelumnya boleh terbawa sebentar. Jika ralat ini masih berlaku, mesej kini menyatakan produk mana yang bermasalah, senarai produk dimuat semula secara automatik (nombor yang anda taip dikekalkan), dan tiada apa-apa yang disimpan separuh jalan — sebelum ini baris bahan di atas sudah tersimpan walaupun jadual Stock Kilang gagal.",
    en: "Material Stock: fixed the \"Every product must be a BH product\" error that could appear when saving the Stock Kilang table after switching between the Mee and Bihun tabs — the previous tab's product list could briefly carry over. If the error still happens, the message now names the product causing it, the product list refreshes automatically (the figures you keyed are kept), and nothing is saved halfway — previously the material rows above were already saved even though the Stock Kilang table failed.",
  },
  {
    date: "2026-08-05",
    ms: "Green Target: tetingkap \"Create Invoice\" pada halaman sewaan kini membenarkan anda memasukkan nombor invois sendiri, sama seperti borang invois penuh. Biarkan ruangan itu kosong untuk menjana nombor secara automatik seperti biasa; jika nombor yang dimasukkan sudah digunakan, anda akan diberitahu sebelum invois disimpan.",
    en: "Green Target: the \"Create Invoice\" dialog on the rental page now lets you enter your own invoice number, the same as the full invoice form. Leave it blank to auto-generate the number as before; if the number you type is already in use, you are warned before the invoice is saved.",
  },
  {
    date: "2026-08-05",
    ms: "Green Target: kadar gaji pekerja kini boleh ditetapkan secara berasingan daripada Tien Hock, termasuk perubahan kadar berjadual untuk bulan-bulan akan datang (Payroll → Kadar Gaji Pekerja). Ini membolehkan kakitangan yang berada dalam penggajian kedua-dua syarikat, seperti para pengarah, dibayar pada kadar yang berbeza oleh setiap syarikat.",
    en: "Green Target: employee pay rates can now be set separately from Tien Hock, including scheduled rate changes for future months (Payroll → Employee Pay Rates). This lets staff who are on both companies' payrolls, like the directors, be paid a different rate by each company.",
  },
  {
    date: "2026-08-05",
    ms: "Laporan gaji Green Target dan Jelly Polly: tab \"Employee\" kini mempunyai pilihan \"Individual\" dan \"Location\", sama seperti Tien Hock. Pilihan \"Location\" memaparkan pekerja yang sama tetapi dikumpulkan mengikut lokasi kerja, dengan subjumlah bagi setiap lokasi dan satu jumlah besar di bawah. Tab \"Employee\" dan \"Location\" juga mempunyai pilihan \"Monthly\" dan \"Yearly\" — pilihan Yearly mencampurkan semua bulan yang telah diproses dalam tahun tersebut menjadi satu baris bagi setiap pekerja. Butang Print dan Download mengikut pilihan yang sedang dipaparkan. Tab Bank dan Pinjam kekal mengikut bulan seperti biasa.",
    en: "Green Target and Jelly Polly salary reports: the \"Employee\" tab now has \"Individual\" and \"Location\" options, just like Tien Hock. The \"Location\" option shows the same employees grouped under their work location, with a subtotal for each location and one grand total at the bottom. The \"Employee\" and \"Location\" tabs also gain \"Monthly\" and \"Yearly\" options — Yearly adds up every processed month of the year into one row per employee. Print and Download follow whichever options are on screen. The Bank and Pinjam tabs stay month-based as before.",
  },
  {
    date: "2026-08-05",
    ms: "Laporan Anggaran (Anggaran Untung/Rugi dan Anggaran Kos Seunit): butang \"Print\" tunggal kini digantikan dengan tiga butang — \"Print MEE\", \"Print BIHUN\" dan \"Print All\" — supaya anda boleh mencetak satu barisan produk sahaja bagi bulan yang dipilih, atau kedua-duanya sekali seperti sebelum ini.",
    en: "Estimated reports (Estimated P&L and Estimated Unit Cost): the single \"Print\" button is replaced by three buttons — \"Print MEE\", \"Print BIHUN\" and \"Print All\" — so you can print just one product line for the selected month, or both together as before.",
  },
  {
    date: "2026-08-04",
    ms: "Slip gaji Green Target: lajur \"Rate\" untuk item gaji tetap (Fixed) kini memaparkan amaun gaji yang sebenar diisi — contohnya gaji pengarah GOH THAI HO dan WONG SHUK FUN kini dipaparkan sebagai 1,700.00, bukannya kadar katalog 3,500.00 seperti sebelum ini. Amaun gaji tidak berubah; paparan kadar sahaja yang diperbetulkan.",
    en: "Green Target payslip: the \"Rate\" column for fixed (Fixed) salary items now shows the actual keyed salary amount — e.g. directors GOH THAI HO and WONG SHUK FUN now show 1,700.00 instead of the 3,500.00 catalogue rate as before. The salary amount is unchanged; only the displayed rate was corrected.",
  },
  {
    date: "2026-08-04",
    ms: "Laporan gaji tahunan (mengikut nama dan mengikut lokasi) kini menggabungkan pekerja yang mempunyai lebih daripada satu ID kakitangan kepada satu baris sahaja — contohnya JASSON_ROLL dan JASSON_PM kini dipaparkan sebagai satu baris JASSON JIEM dengan jumlah yang dicampurkan.",
    en: "The yearly salary report (by name and by location) now combines workers who have more than one staff ID into a single row — e.g. JASSON_ROLL and JASSON_PM now appear as one JASSON JIEM row with the amounts added together.",
  },
  {
    date: "2026-08-04",
    ms: "Laporan Gaji: tab \"Location\" kini tersedia untuk Green Target dan diperbaiki untuk Jelly Polly, sama seperti Tien Hock. Ia memaparkan satu baris jumlah keseluruhan bagi setiap bahagian kerja (contohnya Director's Remuneration, Office, Pengangkutan Habuk) beserta jumlah besar — sebelum ini tab Green Target dihimpunkan mengikut jenis pekerjaan (Office/Driver), manakala tab Jelly Polly menyenaraikan setiap pekerja satu persatu tanpa ringkasan jumlah setiap bahagian. Cetakan PDF tab ini turut menggunakan susun atur ringkasan yang sama.",
    en: "Salary Report: the \"Location\" tab is now available for Green Target and improved for Jelly Polly, just like Tien Hock. It shows one lump-sum totals row per work section (e.g. Director's Remuneration, Office, Pengangkutan Habuk) plus a grand total — previously the Green Target tab was grouped by job type (Office/Driver), while the Jelly Polly tab listed every employee individually without per-section totals. The tab's PDF printout uses the same summary layout.",
  },
  {
    date: "2026-08-04",
    ms: "Pembaikan Penjana Baucar (Voucher Generator): jumlah baucar JVSL (gaji pekerja) sebelum ini kurang daripada Ringkasan Payroll apabila Jurujual mempunyai bayaran C/I/O — contohnya Julai 2026 terkurang RM251.37. Jumlah baucar kini sepadan tepat dengan baris JV-WORKERS pada Ringkasan Payroll. Jika baucar bulan ini sudah dijana, sila batalkan dan jana semula.",
    en: "Voucher Generator fix: the JVSL (workers salary) voucher total previously fell short of the Payroll Summary whenever the Salesman had C/I/O pay — July 2026 was short by exactly RM251.37. The voucher total now matches the JV-WORKERS row of the Payroll Summary exactly. If this month's voucher was already generated, please cancel and regenerate it.",
  },
  {
    date: "2026-08-04",
    ms: "Sistem kini menyokong tiga bahasa: English, Bahasa Melayu dan 简体中文. Bahasa lalai mengikut tetapan bahasa peranti anda, dan anda boleh menukarnya bila-bila masa melalui menu pengguna di penjuru atas kanan (baris \"Bahasa\"). Buat masa ini bar navigasi, menu dan halaman utama telah diterjemahkan; halaman lain akan menyusul secara berperingkat.",
    en: "The system now supports three languages: English, Bahasa Melayu and 简体中文. The default language follows your device's language setting, and you can change it anytime from the user menu at the top right (the \"Language\" row). For now the navigation bar, menus and home page are translated; other pages will follow in stages.",
  },
  {
    date: "2026-08-03",
    ms: "Perlindungan akaun Tien Hock diperketatkan. Jenis bayaran invois (Tunai/Invois) dan butiran barang invois tidak lagi boleh diubah pada invois yang sudah dibatalkan, atau pada invois yang mempunyai Nota Kredit/Debit aktif — sebelum ini perubahan sedemikian boleh menghidupkan semula invois yang dibatalkan atau menjadikan bakinya tidak sepadan dengan nota berkenaan. Menukar jenis bayaran kini meminta pengesahan terlebih dahulu, dan semua ikon pensil edit disorokkan pada invois yang dibatalkan. Jika perubahan barang invois membatalkan bayaran cek yang belum dijelaskan, sistem kini memaklumkan anda. Selain itu, catatan jurnal yang dimiliki oleh sesuatu dokumen (invois, bayaran, bank-in) tidak lagi boleh dibatalkan terus dari halaman Jurnal — batalkan dokumen sumbernya supaya baki dan jurnal kekal sepadan — dan menyimpan perubahan pada jurnal sedemikian kini memaparkan amaran bahawa ia akan terpisah daripada dokumen sumbernya.",
    en: "Tien Hock accounting safeguards have been tightened. An invoice's payment type (Cash/Invoice) and its line items can no longer be changed on a cancelled invoice, or on an invoice with an active Credit/Debit Note — previously such changes could revive a cancelled invoice or leave its balance disagreeing with the note. Changing the payment type now asks for confirmation first, and all edit pencils are hidden on cancelled invoices. If editing an invoice's items cancels an uncleared cheque payment, the system now tells you. In addition, journal entries owned by a document (invoice, payment, bank-in) can no longer be cancelled directly from the Journal page — cancel the source document instead so balances and the journal stay in sync — and saving changes to such a journal now warns that it will be detached from its source document.",
  },
  {
    date: "2026-08-03",
    ms: "Bayaran lebih (overpayment) pelanggan kini lebih selamat. Resit yang bayaran lebihnya sudah digunakan untuk melangsaikan invois lain, atau sudah dibayar balik, tidak lagi boleh dibatalkan sehingga penggunaan itu diselesaikan dahulu — sebelum ini pembatalan sedemikian boleh menjadikan akaun deposit pelanggan negatif. Apabila merekod bayaran baru, bayaran lebih yang dipegang kini TIDAK digunakan secara automatik — tandakan kotaknya hanya jika anda mahu menggunakannya. Semasa mengesahkan cek, pemilih tarikh kini bermula dari tarikh cek diterima dan secara lalai memilih hari ini atau tarikh diterima, yang mana lebih lewat.",
    en: "Customer overpayments are now safer. A receipt whose overpayment has already been used to settle other invoices, or has been refunded, can no longer be cancelled until that usage is dealt with first — previously such a cancellation could drive the customer deposit account negative. When recording a new payment, held overpayment is no longer applied automatically — tick its box only if you want to use it. When confirming a cheque, the date picker now starts from the date the cheque was received and defaults to today or the received date, whichever is later.",
  },
  {
    date: "2026-08-04",
    ms: "Pengurusan Cawangan (Branch) pelanggan telah diperbaiki. Senarai cawangan kini terus dikemas kini selepas anda menambah, membuang atau menukar cawangan utama — sebelum ini skrin masih memaparkan maklumat lama walaupun tindakan itu berjaya, dan selepas membuat kumpulan baru skrin masih berkata pelanggan itu tiada kumpulan, jadi kumpulan yang sama mudah dibuat dua kali. Menambah cawangan kini meminta pengesahan yang menyenaraikan dengan tepat pelanggan mana yang maklumat e-Invois, nombor telefon dan harga khasnya akan diganti dengan maklumat cawangan utama; membuang cawangan juga meminta pengesahan. Menukar cawangan utama kini menyalin maklumat e-Invois cawangan utama baru ke semua cawangan lain (sebelum ini kumpulan masih menggunakan maklumat cawangan utama lama). Satu pelanggan hanya boleh berada dalam satu kumpulan cawangan sahaja, dan pelanggan yang sudah ada kumpulan tidak lagi dipaparkan dalam senarai pilihan.",
    en: "Customer Branch management has been fixed. The branch list now updates immediately after you add, remove or change the main branch — previously the screen kept showing the old information even though the action succeeded, and after creating a group it still said the customer had no group, making it easy to create the same group twice. Adding branches now asks for confirmation that lists exactly which customers will have their e-Invoice details, phone number and custom prices replaced by the main branch's; removing a branch now also asks for confirmation. Changing the main branch now copies the new main branch's e-Invoice details to all other branches (previously the group kept using the old main branch's details). A customer can only belong to one branch group, and customers already in a group are no longer offered in the selection lists.",
  },
  {
    date: "2026-08-04",
    ms: "Halaman Customers kini mempunyai penapis \"Branches\" untuk memaparkan pelanggan mengikut kumpulan cawangan tertentu, atau hanya pelanggan yang ada/tiada kumpulan cawangan. Kotak carian juga kini mencari nama kumpulan cawangan. Pada kad pelanggan, nama kumpulan cawangan boleh diklik terus untuk membuka pengurusan cawangan kumpulan itu, dan bilangan cawangan lain dalam kumpulan dipaparkan di sebelahnya. Butang \"Branch\" telah dinamakan semula kepada \"Branches\" berserta bilangan kumpulan.",
    en: "The Customers page now has a \"Branches\" filter to show customers in a specific branch group, or only those with/without a branch group. The search box now also searches branch group names. On the customer card, the branch group name can be clicked to open branch management for that group directly, and the number of other branches in the group is shown beside it. The \"Branch\" button is now named \"Branches\" and shows the number of groups.",
  },
  {
    date: "2026-08-03",
    ms: "Laporan Gaji Jelly Polly dan Green Target kini mempunyai butang \"Export\" dan \"Export Link\" pada bahagian Bank, sama seperti Tien Hock. \"Export\" memuat turun fail teks bayaran gaji bank (format PBB) bagi pekerja yang dibayar melalui bank untuk bulan yang dipaparkan, manakala \"Export Link\" menyalin pautan untuk digunakan dengan Excel Power Query.",
    en: "The Jelly Polly and Green Target Salary Reports now have \"Export\" and \"Export Link\" buttons on the Bank tab, just like Tien Hock. \"Export\" downloads the bank salary payment text file (PBB format) for bank-paid employees in the month on screen, while \"Export Link\" copies a link for use with Excel Power Query.",
  },
  {
    date: "2026-08-03",
    ms: "Halaman Stock Movement kini mempunyai butang \"Print Stock Card\" untuk mencetak kad stok produk yang dipilih bagi bulan atau tempoh yang dipaparkan, dengan lajur B/F, PRODUCTION, ADJ/IN, RETURN, SOLD/OUT, DEFECT, FOC dan C/F serta baris jumlah — sama seperti kad stok yang dicetak sebelum ini. Lajur ADJ/IN dan DEFECT ialah nilai ADJ+ dan ADJ- yang dikunci masuk di halaman Stock Adjustments, manakala RETURN ialah kuantiti pulangan pada invois.",
    en: "The Stock Movement page now has a \"Print Stock Card\" button that prints the selected product's stock card for the month or period on screen, with B/F, PRODUCTION, ADJ/IN, RETURN, SOLD/OUT, DEFECT, FOC and C/F columns plus a totals row — the same as the stock card printed before. The ADJ/IN and DEFECT columns are the ADJ+ and ADJ- amounts keyed on the Stock Adjustments page, and RETURN is the returned quantity on invoices.",
  },
  {
    date: "2026-08-03",
    ms: "Setiap halaman Production Records (Mee, Bihun, Bundle, SBH & SMEE, Empty Bag dan Jelly Polly) kini mempunyai butang \"Print Summary\" untuk mencetak ringkasan pengeluaran bulanan bagi halaman tersebut: satu baris bagi setiap produk berserta jumlah keseluruhan. Cetakan sentiasa meliputi semua produk halaman itu untuk tempoh yang dipilih, walaupun penapis produk atau kotak carian sedang digunakan.",
    en: "Every Production Records page (Mee, Bihun, Bundle, SBH & SMEE, Empty Bag and Jelly Polly) now has a \"Print Summary\" button that prints that page's monthly production summary: one row per product with a grand total. The printout always covers all of that page's products for the selected period, even when the product filter or search box is in use.",
  },
  {
    date: "2026-08-03",
    ms: "Slip gaji Green Target kini memaparkan bayaran cuti sebagai barisnya sendiri (contoh \"Cuti Tahunan - 1 Hari\") berserta \"Jumlah Cuti\", sama seperti Tien Hock dan Jelly Polly. Sebelum ini jumlah cuti hanya tersembunyi di dalam Jumlah Gaji Kasar apabila slip dicetak secara pukal dari halaman Payroll, jadi slip tidak boleh dikira semula. Halaman butiran gaji Green Target juga menambah jadual \"Leave Pay\" yang menyenaraikan setiap tarikh, jenis cuti, bilangan hari dan amaun. Tiada amaun gaji berubah.",
    en: "Green Target pay slips now show leave pay as its own line (e.g. \"Cuti Tahunan - 1 Hari\") with a \"Jumlah Cuti\" total, the same as Tien Hock and Jelly Polly. Previously the leave amount was only hidden inside Jumlah Gaji Kasar when slips were printed in bulk from the Payroll page, so the slip could not be added up. The Green Target payroll details page also gains a \"Leave Pay\" table listing each date, leave type, days and amount. No pay amounts change.",
  },
  {
    date: "2026-08-03",
    ms: "Slip gaji tidak lagi memaparkan baris kosong RM0.00 seperti \"CUTI SAKIT\", \"CUTI TAHUNAN\" dan \"CUTI UMUM\" apabila kod gaji itu hanya ditanda dalam rekod kerja tetapi tiada bayaran. Cuti yang benar-benar dibayar masih dipaparkan seperti biasa di bahagian Cuti. Berkuat kuasa untuk Tien Hock, Jelly Polly dan Green Target; jumlah gaji tidak berubah.",
    en: "Pay slips no longer print empty RM0.00 lines such as \"CUTI SAKIT\", \"CUTI TAHUNAN\" and \"CUTI UMUM\" when the pay code was only ticked on the work log but paid nothing. Leave that is actually paid still shows as usual in the Cuti section. Applies to Tien Hock, Jelly Polly and Green Target; no pay amounts change.",
  },
  {
    date: "2026-08-03",
    ms: "Slip gaji, Laporan Gaji dan laporan Gaji Pertengahan Bulan Green Target dan Jelly Polly kini memaparkan nama penuh syarikat di bahagian atas: \"GREEN TARGET WASTE TREATMENT IND. SDN. BHD.\" (sebelum ini \"GREEN TARGET SDN. BHD.\") dan \"JELLY-POLLY FOOD INDUSTRIES\" (sebelum ini \"JELLY POLLY\"). Dokumen Tien Hock tidak berubah.",
    en: "Green Target and Jelly Polly pay slips, Salary Reports and Mid-Month Payroll reports now show the full company name at the top: \"GREEN TARGET WASTE TREATMENT IND. SDN. BHD.\" (previously \"GREEN TARGET SDN. BHD.\") and \"JELLY-POLLY FOOD INDUSTRIES\" (previously \"JELLY POLLY\"). Tien Hock documents are unchanged.",
  },
  {
    date: "2026-08-02",
    ms: "Mengklik seorang pelanggan kini membuka halaman butiran pelanggan, bukan borang kemasukan. Semua maklumat pelanggan dipaparkan sekali imbas sebagai teks biasa, manakala bahagian Kredit & Harga (had kredit, kredit digunakan dan harga khas produk) dan Sejarah Transaksi kekal boleh diubah terus di halaman itu — bahagian Kredit & Harga mempunyai butang Simpan tersendiri. Untuk mengubah nama, alamat, salesman atau maklumat e-Invois, tekan butang \"Edit\" di penjuru atas kanan. Pada senarai pelanggan, butang pintasan kad kini ialah Edit (terus ke borang) dan Sejarah Transaksi (terus ke bahagian berkenaan di bahagian bawah halaman butiran); pintasan Kredit & Harga dibuang kerana ia berada pada halaman yang sama. Borang kemasukan itu sendiri tidak lagi menggunakan tab: semua maklumat kini berada pada satu halaman dengan satu butang simpan.",
    en: "Clicking a customer now opens a customer details page instead of the entry form. All customer information is shown at a glance as plain text, while the Credit & Pricing section (credit limit, credit used and custom product prices) and Transaction History stay editable right there — Credit & Pricing has its own Save button. To change the name, address, salesman or e-Invoice information, press the \"Edit\" button at the top right. On the customer list, the card shortcut buttons are now Edit (straight to the form) and Transaction History (jumps to that section at the bottom of the details page); the Credit & Pricing shortcut is gone because it is on the same page. The entry form itself no longer uses tabs: everything is on one page with one save button.",
  },
  {
    date: "2026-08-02",
    ms: "Pilihan pendek pada skrin kemasukan kini dipaparkan sebagai butang bulat, bukan senarai lungsur — semua pilihan kelihatan serentak dan hanya perlu satu klik. Kini digunakan untuk: jenis cuti di semua tempat ia direkod dalam ketiga-tiga syarikat — halaman Packing Cuti, bahagian Cuti Green Target dan Jelly Polly, tetingkap Tambah Cuti pada Log Bulanan, dan jadual Cuti pada halaman Log Harian dan Log Harian Salesman (termasuk pilihan \"SET ALL\", yang kini tidak menyerlahkan sebarang jenis apabila pekerja yang ditanda mempunyai jenis cuti berbeza); pilihan Shift pada halaman Log Harian Tien Hock dan Jelly Polly; Kaedah Bayaran dan akaun bank (Deposit To / Bank Account) pada semua skrin merekod bayaran — borang bayaran, halaman Butiran Invois, halaman Invois, borang bayaran Green Target, borang bayaran pembekal dan tetingkap pengesahan cek; kaedah bayaran pendahuluan pertengahan bulan (Tien Hock, Green Target, Jelly Polly); Kaedah Bayaran Balik dan akaun bank pada borang Nota Kredit/Debit/Bayaran Balik (Tien Hock dan Green Target); jenis invois (Tunai/Invois) pada borang invois dan tetingkap Tukar Jenis Bayaran; Kategori, Digunakan Untuk dan Status pada borang Bahan; Salesman pada borang Invois Baharu (Tien Hock dan Jelly Polly); serta Jenis pada halaman Catatan Jurnal, di mana kod jenis kini dipaparkan sebagai satu baris butang penuh di bahagian atas borang — tuding pada mana-mana kod untuk melihat nama penuhnya, dan nama jenis yang dipilih turut dipaparkan di sebelah label. Pilihan dan cara ia disimpan tidak berubah — hanya paparannya sahaja.",
    en: "Short choices on entry screens are now shown as round buttons instead of a dropdown — every option is visible at once and takes a single click. This now applies to: the leave type everywhere it is recorded across all three companies — the Packing Cuti pages, the Green Target and Jelly Polly Leave sections, the Add Leave window on the Monthly Logs, and the Leave table on the Daily Log and Salesman Daily Log pages (including the \"SET ALL\" choice, which now highlights nothing when the ticked workers have different leave types); the Shift choice on the Tien Hock and Jelly Polly Daily Log pages; Payment Method and the bank account (Deposit To / Bank Account) on every record-payment screen — the payment form, Invoice Details, the invoice pages, the Green Target payment form, the supplier payment forms and the cheque confirmation window; the mid-month advance payment method (Tien Hock, Green Target, Jelly Polly); Refund Method and its bank account on the Credit/Debit/Refund Note forms (Tien Hock and Green Target); the invoice type (Cash/Invoice) on the invoice form and the Change Payment Type window; Category, Applies To and Status on the Material form; the Salesman on the New Invoice form (Tien Hock and Jelly Polly); and the Type on the Journal Entry page, where the type codes are now one full-width button row at the top of the form — hover any code to see its full name, and the selected type's name is also shown next to the label. The choices themselves, and what gets saved, are unchanged — only how they are shown.",
  },
  {
    date: "2026-08-02",
    ms: "Green Target: medan \"Transaction ID\" / \"Transaction Reference\" dibuang daripada semua skrin merekod bayaran. Bayaran online dan pindahan bank dikenali melalui nombor RV masing-masing, dan medan itu hampir tidak pernah diisi. Medan \"Cheque No.\" kekal untuk bayaran cek, kerana nombor cek itulah yang memadankan cek dengan penyata bank semasa ia dijelaskan. Nombor rujukan yang telah direkodkan sebelum ini masih dipaparkan seperti biasa pada senarai bayaran, tetingkap resit dan penyata pelanggan.",
    en: "Green Target: the \"Transaction ID\" / \"Transaction Reference\" field has been removed from every record-payment screen. Online payments and bank transfers are identified by their RV number, and the field was almost never filled in. The \"Cheque No.\" field stays for cheque payments, because the cheque number is what matches a cheque to the bank statement when it clears. References recorded previously are still shown as before on the payment list, the receipt window and customer statements.",
  },
  {
    date: "2026-08-02",
    ms: "Semakan nombor rujukan bayaran kini merangkumi semua skrin. Green Target: kotak \"Add this payment to that receipt\" kini ditanda secara automatik apabila rujukan yang anda taip sememangnya milik resit sedia ada — buang tanda jika ia bayaran berasingan. Semakan dan pilihan gabung ini kini turut ada di halaman Butiran Invois dan halaman Bayaran, jadi beberapa invois boleh ditambah ke satu resit sedia ada; tarikh, kaedah dan rujukan cek resit itu dipaparkan dan tidak boleh diubah semasa menggabung. Tien Hock: jika nombor rujukan yang anda masukkan sudah digunakan, sistem kini memaparkan bayaran sedia ada itu (tarikh, jumlah, bilangan invois) dan secara automatik menambah bayaran baharu ini ke kumpulan yang sama — tarikh, kaedah dan akaun kumpulan itu digunakan terus dan tiada rekod sedia ada diubah. Buang tanda pada kotak itu jika ia sebenarnya bayaran berasingan yang kebetulan berkongsi nombor rujukan. Jelly Polly: rujukan yang sudah digunakan pada invois LAIN kini dipaparkan berserta senarai invois berkenaan dan perlu disahkan — sebelum ini hanya rujukan berulang pada invois yang sama dihalang. Selain itu, halaman Payment Management kini mengumpulkan bayaran tunai mengikut rujukan resit sebenar: sebelum ini bayaran tunai yang meliputi beberapa invois terpecah kepada satu baris setiap invois, dan bayaran yang ditambah ke kumpulan sedia ada tidak kelihatan di dalam kumpulan itu.",
    en: "The payment reference number check now covers every screen. Green Target: the \"Add this payment to that receipt\" box is now ticked automatically when the reference you typed does belong to an existing receipt — untick it if it is a separate payment. That check and join option are now also on the Invoice Details page and the Payments page, so several invoices can be added to one existing receipt; the receipt's date, method and cheque reference are shown and cannot be changed while joining. Tien Hock: if the reference number you enter is already used, the system now shows the existing payment (date, total, number of invoices) and automatically adds this new payment to the same group — the group's date, method and account are used as they are and nothing already recorded is changed. Untick the box if it really is a separate payment that happens to share the reference number. Jelly Polly: a reference already used on OTHER invoices is now shown with the list of those invoices and must be confirmed — previously only a repeated reference on the same invoice was blocked. Payment Management also now groups cash payments by their actual receipt reference: previously a cash payment covering several invoices split into one row per invoice, and a payment added to an existing group did not appear inside that group.",
  },
  {
    date: "2026-08-02",
    ms: "Green Target: semakan kod identiti CD/SD baharu pada borang invois kini lebih tepat. Kod yang anda taip disemak terhadap semua kod sedia ada — termasuk identiti penghutang lama yang tidak lagi dipaparkan dalam senarai pilihan dan kod akaun lejar am — jadi kod yang ditunjukkan sebagai kosong benar-benar boleh digunakan. Medan kod bertukar merah dan invois tidak akan disimpan selagi kod bertindih itu tidak diubah, dan anda dimaklumkan sama ada sistem sedang menyemak, kod itu kosong, atau semakan tidak dapat dijalankan buat sementara waktu.",
    en: "Green Target: the new CD/SD identity code check on the invoice form is now accurate. The code you type is checked against every existing code — including older debtor identities that no longer appear in the picker and general ledger account codes — so a code shown as free really is free. The code field turns red and the invoice will not save until a clashing code is changed, and you are told whether the check is running, the code is free, or the check could not be run right now.",
  },
  {
    date: "2026-08-02",
    ms: "Green Target: halaman Bayaran kini turut memautkan bayaran lama sebelum pemindahan ke catatan jurnalnya, termasuk kutipan tunai kaunter. Bayaran seperti ini tidak mempunyai jurnal sendiri kerana wangnya sudah berada di dalam lejar yang diimport, jadi pautan \"View Journal\" membawa anda ke catatan invois berkenaan dan ditanda \"Imported\". Bayaran sebelum Januari 2026 masih tiada catatan jurnal kerana ia terkandung di dalam baki pembukaan — tanda \"-\" kini menerangkan sebabnya apabila anda menuding padanya.",
    en: "Green Target: the Payments page now also links older pre-changeover payments to their journal entry, including counter cash collections. These payments have no journal of their own because their money is already inside the imported ledger, so \"View Journal\" takes you to the invoice's own entry and is marked \"Imported\". Payments before January 2026 still have no journal entry because they sit inside the opening balances — hovering the \"-\" now explains why.",
  },
  {
    date: "2026-08-02",
    ms: "Green Target: semasa merekod bayaran daripada borang invois atau Butiran Sewaan, nombor rujukan Green Target yang sudah digunakan kini boleh disambungkan kepada resit sedia ada selepas anda mengesahkannya. Tarikh, kaedah dan rujukan cek/transaksi resit itu dikekalkan, dan satu resit boleh meliputi beberapa invois. Klik nombor rujukan Green Target pada halaman Butiran Invois, Butiran Sewaan atau Sunting Sewaan untuk membuka tetingkap resit terus di halaman yang sama — tanpa meninggalkan halaman itu — dan tetingkap tersebut menunjukkan setiap invois yang dijelaskan oleh resit itu serta sewaan di belakang setiap satu.",
    en: "Green Target: when recording a payment from the invoice form or Rental Details, a Green Target reference that is already in use can now be joined to its existing receipt after you confirm it. The receipt's date, method and cheque/transaction reference stay unchanged, and one receipt can cover several invoices. Click the Green Target reference number on Invoice Details, Rental Details or Rental Edit to open the receipt window right there — without leaving the page you are on — showing every invoice that receipt settles and the rentals behind each one.",
  },
  {
    date: "2026-08-02",
    ms: "Green Target: semasa mencipta invois untuk pelanggan yang belum mempunyai identiti penghutang, kotak \"Cipta identiti CD/SD baharu\" kini ditanda secara automatik dan kod identiti dicadangkan terus daripada nama pelanggan supaya anda hanya perlu mengesahkan atau mengubahnya. Sistem memberitahu serta-merta jika kod tersebut sudah digunakan oleh pelanggan lain, dan identiti hanya dicipta apabila invois disimpan — jika anda menutup tetingkap tanpa menyimpan, tiada nama baharu ditinggalkan dalam jadual penghutang. Buang tanda pada kotak itu untuk memilih identiti sedia ada seperti biasa. Tetingkap Cipta Invois di halaman Penyewaan juga dilebarkan.",
    en: "Green Target: when creating an invoice for a customer that has no debtor identity yet, the \"Create a new CD/SD identity\" box is now ticked automatically and the identity code is suggested from the customer's name, so you only confirm or edit it. You are told straight away if that code already belongs to another customer, and the identity is only created when the invoice is saved — closing the window without saving leaves no new name in the Trade Debtors schedule. Untick the box to pick an existing identity as before. The Create Invoice window on the Rental page is also wider.",
  },
  {
    date: "2026-08-02",
    ms: "Green Target: halaman Cipta Invois kini terus memaparkan semua penyewaan tong yang masih belum diinvois, dikumpulkan mengikut pelanggan dan lengkap dengan Site/alamat, tanpa perlu memilih pelanggan dahulu. Senarai ini dipaparkan 20 penyewaan satu halaman dengan butang Previous/Next, dan carian mengikut nama pelanggan, Site, alamat, no. tong, pemandu atau no. penyewaan mencari kesemua rekod, bukan halaman semasa sahaja. Tandakan penyewaan yang hendak diinvoiskan; pelanggan invois diisi secara automatik daripada penyewaan pertama yang ditanda, dan selepas itu senarai hanya memaparkan penyewaan pelanggan tersebut. Satu invois masih untuk satu pelanggan sahaja — butang \"Change customer\" membersihkan pilihan untuk menukar pelanggan. Penyewaan yang sudah ditanda kekal dipilih walaupun anda menukar halaman atau membuat carian baharu. Carian penyewaan di halaman senarai Penyewaan kini turut mencari mengikut Site.",
    en: "Green Target: the Create Invoice page now lists every rental still waiting to be invoiced right away, grouped by customer and showing each Site/address, instead of asking you to pick a customer first. The list shows 20 rentals per page with Previous/Next buttons, and searching by customer name, Site, address, dumpster no., driver or rental no. searches all records, not just the page you are on. Tick the rentals to bill; the invoice customer is filled in automatically from the first rental you tick, after which the list narrows to that customer's rentals. One invoice still covers one customer — \"Change customer\" clears the selection so you can switch. Rentals you have already ticked stay selected when you change page or run a new search. The Rentals list page search now finds rentals by Site as well.",
  },
  {
    date: "2026-08-01",
    ms: "Jelly Polly: halaman baharu \"Packing Cuti\" di bawah Gaji → Log Harian untuk merekod cuti pekerja pembungkusan Ice Polly & Jelly Cup, sama seperti halaman Packing Cuti Tien Hock. Pilih tarikh, tanda pekerja yang bercuti, pilih jenis cuti dan masukkan amaun bayaran; baki cuti setiap pekerja dipaparkan terus di dalam senarai. Amaun yang disimpan terus ditambah ke gaji kasar bulan tersebut. Cuti tidak boleh direkod untuk pekerja yang sudah ada rekod pengeluaran pada hari yang sama, atau yang sudah ada cuti direkod dari halaman lain.",
    en: "Jelly Polly: a new \"Packing Cuti\" page under Payroll → Daily Logs for recording leave for the Ice Polly & Jelly Cup packing workers, matching the Tien Hock Packing Cuti page. Pick a date, tick the workers on leave, choose the leave type and enter the amount paid; each worker's remaining leave balance is shown in the list. Saved amounts are added to that month's gross pay straight away. Leave cannot be recorded for a worker who already has production recorded on the same day, or who already has leave recorded from another page.",
  },
  {
    date: "2026-08-01",
    ms: "Green Target: invois kini menyimpan identiti penghutang CD/SD secara berasingan walaupun jurnal kekal masuk ke akaun kawalan CD_SD, supaya jadual penghutang mengikut nama pelanggan sama seperti sistem lama. Invois dan Nota Kredit/Debit juga boleh membahagikan jumlah hasil mengikut susunan TGA, TGB dan WS_OTH. Laporan Trade Debtors rasmi kini mengekalkan susunan dan jumlah rekod lama, dengan pilihan menyembunyikan pelanggan hanya apabila ketiga-tiga amaun mereka sifar. Medan utama invois dikunci selepas mempunyai sejarah resit atau pelarasan supaya rujukan dan baki tidak terpisah.",
    en: "Green Target: invoices now retain a separate CD/SD debtor identity even though the journal continues posting to the CD_SD control, so the named customer schedule works like the legacy system. Invoices and Credit/Debit Notes can also split revenue in order across TGA, TGB and WS_OTH. The official Trade Debtors report preserves the legacy order and totals, with an option to hide customers only when all three amounts are zero. Key invoice fields are locked once receipt or adjustment history exists so references and balances cannot drift apart.",
  },
  {
    date: "2026-08-01",
    ms: "Carta Akaun: akaun induk seperti DEBTOR dan CL_TP kini boleh dibuka dan ditutup seperti akaun induk yang lain. Sebelum ini, induk yang semua anaknya adalah akaun biasa dipaparkan sebagai folder tanpa anak panah, jadi senarai anaknya langsung tidak boleh dilihat kecuali melalui carian. Anak akaun kekal tersembunyi sehingga anda membukanya, jadi paparan asal masih ringkas seperti biasa.",
    en: "Chart of Accounts: parent accounts such as DEBTOR and CL_TP can now be opened and closed like any other parent. Previously, a parent whose children were all ordinary accounts showed as a folder with no arrow, so its children could not be seen at all except by searching. Children stay hidden until you open the parent, so the default view is still as compact as before.",
  },
  {
    date: "2026-08-01",
    ms: "Green Target: apabila membatalkan resit dari tetingkap butiran, anda kini boleh memasukkan sebab pilihan dan sebab itu akan dipaparkan apabila resit dibuka semula. Nota Kredit/Debit kini menggunakan akaun penghutang dan hasil yang sama seperti invois asal; invois lama yang tiada jurnal masih mengikut kaedah lama TGA/TGB/WS_OTH. Pemilih Tong dalam borang invois juga kini membaca tarikh kutipan mengikut tarikh Malaysia, jadi tarikh tidak lagi beralih sehari lebih awal.",
    en: "Green Target: when cancelling a receipt from its details window, you can now enter an optional reason and see it when the receipt is reopened. Credit and Debit Notes now use the same debtor and revenue accounts as their original invoice; old invoices with no journal keep the legacy TGA/TGB/WS_OTH rule. The Dumpster picker on the invoice form now also reads pickup dates as Malaysia dates, so they no longer shift one day earlier.",
  },
  {
    date: "2026-07-31",
    ms: "Green Target — Senarai invois tertunggak kini diselaraskan dengan lejar lama, yang merupakan rekod sebenar. Oleh sebab sistem ini dahulunya hanya digunakan untuk mengeluarkan e-Invois, 24 invois lama berjumlah RM5,270.00 (SINOFLEX, FOREGAL, NEW TECH, YNH JAYA dan MEKAR INDAH) sebenarnya sudah pun dibayar secara tunai di kaunter dan direkodkan dalam lejar lama — invois tersebut kini ditandakan sebagai telah dijelaskan. Hanya satu bil SINOFLEX (2026/01000, RM230.00) yang benar-benar masih tertunggak. Selain itu, 13 pelanggan telah dipadankan dengan akaun penghutang lama mereka, termasuk SUTERA SERIMEWAH. Tiada catatan perakaunan dicipta atau diubah.",
    en: "Green Target — The outstanding invoice list has been reconciled against the legacy ledger, which is the real record. Because this system was previously only used to issue e-Invoices, 24 old invoices totalling RM5,270.00 (SINOFLEX, FOREGAL, NEW TECH, YNH JAYA and MEKAR INDAH) had in fact already been paid in cash at the counter and recorded in the legacy ledger — those invoices are now marked as settled. Only one SINOFLEX bill (2026/01000, RM230.00) is genuinely still outstanding. Separately, 13 customers were matched to their existing legacy debtor accounts, including SUTERA SERIMEWAH. No accounting entry was created or changed.",
  },
  {
    date: "2026-07-31",
    ms: "Green Target — Membuat invois kini tidak lagi memerlukan anda memilih atau mencipta akaun penghutang. Sama seperti sistem lama, pelanggan tunai/kaunter terus masuk ke CD_SD dengan sendirinya, dan hanya pelanggan kredit bernama menggunakan akaun mereka sendiri. Akaun penghutang kini dipaparkan sebagai maklumat sahaja, dengan pilihan \"Assign a named account\" jika diperlukan. Akaun hasil pula dipilih dengan satu klik melalui butang TGA, TGB dan WS_OTH, dengan TGA sebagai pilihan lalai kerana ia paling kerap digunakan dalam rekod lama. Tetingkap cipta invois pada halaman Tong kini turut memaparkan maklumat yang sama. Perubahan ini juga membolehkan invois dan bayaran direkodkan untuk pelanggan yang sebelum ini tersekat.",
    en: "Green Target — Creating an invoice no longer asks you to choose or create a debtor account. Just like the old system, cash/counter customers go straight to CD_SD on their own, and only named credit customers use their own account. The debtor account is now shown for information only, with an \"Assign a named account\" option if you ever need it. The revenue account is picked in one click from TGA, TGB and WS_OTH buttons, with TGA pre-selected because it is by far the most used in the legacy records. The create-invoice window on the Dumpster page now shows the same information. This also unblocks invoicing and recording payments for customers that previously could not be saved.",
  },
  {
    date: "2026-07-31",
    ms: "Green Target — Semua invois dan resit bulan Julai kini mempunyai jurnal perakaunan yang lengkap. Enam pelanggan baharu (Zexie Carmelia, MIZAN, ALIS WODI, ABE, Kelvin Yap dan MIMIE E) telah diberikan akaun penghutang mereka sendiri, manakala PAUMIN dan NURI kini menggunakan akaun lama mereka. Dua invois yang jurnalnya terbatal secara tidak sengaja telah dipulihkan, dan satu invois yang tersilap guna nombor bil lama (2026/01009) telah dibatalkan supaya jumlahnya tidak dikira dua kali. Baki penghutang Julai kini sepadan tepat dengan invois yang belum dijelaskan.",
    en: "Green Target — Every July invoice and receipt now has a complete accounting journal. Six new customers (Zexie Carmelia, MIZAN, ALIS WODI, ABE, Kelvin Yap and MIMIE E) were given their own debtor accounts, while PAUMIN and NURI now use their existing ones. Two invoices whose journals had been cancelled by mistake were restored, and one invoice that reused an older bill number (2026/01009) was cancelled so its amount is not counted twice. The July debtor balance now matches the outstanding invoices exactly.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Semasa membuat invois, pengguna kini boleh memilih akaun penghutang serta akaun hasil TGA, TGB atau WS_OTH, dan pilihan penghutang boleh disimpan sebagai lalai pelanggan. Satu rujukan bayaran untuk beberapa invois kini menghasilkan satu resit dan jurnal automatik ke PBB_1, termasuk tarikh pelepasan sebenar bagi cek. Invois yang mempunyai sejarah resit tidak lagi boleh dipadam secara paksa; rekod pembatalan disimpan sebagai jejak audit. Laporan CD/SD baharu memaparkan 746 akaun anak daripada rekod lama, dengan carian, PDF dan pilihan untuk menyembunyikan akaun yang semua nilainya sifar.",
    en: "Green Target — When creating an invoice, users can now select the debtor account and the TGA, TGB or WS_OTH revenue account, with the debtor choice saved as the customer's default. One payment reference covering several invoices now creates one receipt and one automatic journal to PBB_1, using the actual clearance date for cheques. Invoices with receipt history can no longer be force-deleted; cancelled records are retained as an audit trail. The new CD/SD report shows the 746 child accounts carried over from the legacy records, with search, PDF and an option to hide accounts whose values are all zero.",
  },
  {
    date: "2026-07-30",
    ms: "Lebih banyak halaman kini mengingati tapisan dan kedudukan skrol anda. Apabila anda membuka satu rekod dan menekan Back, halaman senarai itu kembali seperti anda tinggalkan — carian, bulan, tapisan, nombor halaman dan kedudukan skrol semuanya kekal. Ini kini berkuat kuasa pada: Payments (Tien Hock, Jelly Polly, Green Target), senarai invois Jelly Polly, Credit/Debit/Refund Notes (semua syarikat), Chart of Accounts, Cash Bank-In (RV), General Purchases, Supplier Payments, Suppliers, Trial Balance, Balance Sheet, Income Statement, CoGM, Estimated P&L & Unit Cost, Customer, Staff (Tien Hock & Jelly Polly), Product, Job Category, Pay Code (Tien Hock & Jelly Polly), senarai Pelanggan dan Tong Green Target, rekod kerja harian dan bulanan, Salary Report (semua syarikat), Payroll (Jelly Polly & Green Target), Bonus, Mid-month Payrolls, Others (Advance), Others (Kerja Luar OT) dan Pinjam (semua syarikat), Cuti Report, Holiday Calendar, Contribution Rates, e-Caruman, Payroll Rules Green Target, Production Records, Product Stock, Materials, Sales Summary, Location, Others (Catalogue), Staff Records, Location Account Mappings serta Voucher Generator.",
    en: "More pages now remember your filters and scroll position. When you open a record and press Back, the list comes back exactly as you left it — search, month, filters, page number and scroll position all preserved. This now applies to: Payments (Tien Hock, Jelly Polly, Green Target), the Jelly Polly invoice list, Credit/Debit/Refund Notes (all companies), Chart of Accounts, Cash Bank-In (RV), General Purchases, Supplier Payments, Suppliers, Trial Balance, Balance Sheet, Income Statement, CoGM, Estimated P&L & Unit Cost, Customer, Staff (Tien Hock & Jelly Polly), Product, Job Category, Pay Code (Tien Hock & Jelly Polly), the Green Target Customer and Dumpster lists, the daily and monthly work log records, Salary Report (all companies), Payroll (Jelly Polly & Green Target), Bonus, Mid-month Payrolls, Others (Advance), Others (Kerja Luar OT) and Pinjam (all companies), Cuti Report, Holiday Calendar, Contribution Rates, e-Caruman, the Green Target Payroll Rules page, Production Records, Product Stock, Materials, Sales Summary, Location, Others (Catalogue), Staff Records, Location Account Mappings and the Voucher Generator pages.",
  },
  {
    date: "2026-07-30",
    ms: "Butang Back di seluruh sistem kini membawa anda kembali ke halaman yang anda datang, bukan sentiasa ke senarai utama. Contohnya, jika anda membuka borang pelanggan daripada senarai invois, Back akan kembali ke senarai invois itu (lengkap dengan carian, bulan dan kedudukan skrol anda) dan bukan lagi melompat ke halaman Customer. Menyimpan borang kini mengikut peraturan yang sama: selepas mengemas kini rekod yang sudah ada, anda kembali ke tempat anda datang; selepas mencipta rekod baharu, anda dibawa terus ke halaman rekod baharu itu supaya boleh terus menyemaknya, dan menekan Back dari situ tetap membawa anda pulang ke tempat anda mula. Jika anda membuka halaman terus melalui pautan yang ditampal, dimuat semula, atau dalam tab baharu, Back masih membawa anda ke senarai berkaitan seperti sebelum ini. Selepas memadam rekod anda tetap dibawa ke senarai, dan amaran \"Discard Changes\" pada borang yang belum disimpan kekal sama.",
    en: "Back buttons across the system now return you to the page you actually came from, instead of always jumping to the main list. For example, if you open a customer form from an invoice list, Back now returns you to that invoice list (with your search, month and scroll position intact) rather than jumping to the Customer page. Saving now follows the same rule: after updating an existing record you return to where you came from, and after creating a new record you land on that new record's own page so you can review it straight away — pressing Back from there still returns you to where you started. If you opened a page directly from a pasted link, a refresh, or a new tab, Back still takes you to the related list as before. Deleting a record still returns you to its list, and the \"Discard Changes\" warning on unsaved forms is unchanged.",
  },
  {
    date: "2026-07-30",
    ms: "Payments — lajur Journal pada halaman Payments dan di dalam tetingkap kumpulan bayaran kini memaparkan pautan \"View Journal\" menggantikan kod dalaman seperti REC-202607-0223, dan kutipan bil tunai turut dipautkan ke jurnal invoisnya. Selepas melihat jurnal dan menekan Back, anda kembali tepat ke kedudukan asal: halaman Payments mengekalkan kedudukan skrol, dan kumpulan bayaran yang sedang dibuka terbuka semula secara automatik.",
    en: "Payments — the Journal column on the Payments page and inside the payment group dialog now shows a \"View Journal\" link instead of internal codes like REC-202607-0223, and cash-bill collections now link to their invoice's journal entry too. After viewing a journal and going Back, you land exactly where you were: the Payments page keeps your scroll position, and the payment group you had open re-opens automatically.",
  },
  {
    date: "2026-07-30",
    ms: "Estimated P&L / Unit Cost — Angka JAGUNG Bihun bulan Jun telah dibetulkan mengikut kiraan stok fizikal sebenar: stok penutup JAGUNG kini RM22,086.00 (sebelum ini RM21,546.00) dan stok pembuka RM33,209.00 (sebelum ini RM38,829.00), kerana kiraan beg yang dimasukkan sebelum ini tersilap satu digit. Jumlah stok, P/L, ACCUMULATIVE dan unit cost Bihun Jun turut berubah mengikut pembetulan ini. Add Back Jun (MEE 9,658.83 / BIHUN 6,662.66) juga telah dimasukkan, jadi baris FINAL P/L kini memaparkan jumlah akhir seperti yang dikira oleh bos.",
    en: "Estimated P&L / Unit Cost — June Bihun JAGUNG figures have been corrected to the actual physical stock counts: JAGUNG closing stock is now RM22,086.00 (was RM21,546.00) and opening stock RM33,209.00 (was RM38,829.00), because the previously keyed bag counts were off by one digit. June Bihun stock totals, P/L, ACCUMULATIVE and unit cost move accordingly. The June Add Back amounts (MEE 9,658.83 / BIHUN 6,662.66) have also been entered, so the FINAL P/L line now shows the final figures as worked out by the boss.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Pelanggan kini boleh mempunyai Alamat Bil berasingan (contohnya alamat pejabat), selain daripada lokasi servis/pickup mereka. Isi ruangan Billing Address baharu pada borang pelanggan dan ia akan dipaparkan sebagai Billing Address pada bahagian BILLING TO invois PDF dan e-Invois individu pelanggan itu; kosongkannya untuk terus menggunakan alamat lokasi sewaan seperti sebelum ini. Alamat bil ini boleh diubah pada bila-bila masa melalui halaman sunting pelanggan.",
    en: "Green Target — Customers can now have their own Billing Address (for example an office address), separate from their service/pickup locations. Fill in the new Billing Address field on the customer form and it appears as the Billing Address in the BILLING TO section of that customer's invoice PDFs and individual e-Invoices; leave it blank to keep billing to the rental location address as before. It can be changed anytime from the customer edit page.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Chart of Accounts: akaun pendua PBB1 telah dibuang. Akaun bank PBB yang sebenar ialah PBB_1 (PBB-A/C:3137836814); PBB1 hanyalah salinan dorman tanpa sebarang transaksi dan baki pembukaan sifar, jadi pembuangannya tidak mengubah sebarang baki atau jumlah laporan — ia hanya tidak lagi muncul sebagai baris 0.00 pada Trial Balance.",
    en: "Green Target — Chart of Accounts: the duplicate account PBB1 has been removed. The real PBB bank account is PBB_1 (PBB-A/C:3137836814); PBB1 was only a dormant copy with no transactions and a zero opening balance, so removing it changes no balance or report total — it simply no longer appears as a 0.00 row on the Trial Balance.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Chart of Accounts: akaun baharu yang tidak lagi diperlukan kini boleh dipadam, sama seperti di Tien Hock. Butang padam muncul pada senarai akaun dan halaman sunting akaun. Akaun sistem, akaun yang mempunyai sub-akaun, dan akaun yang sudah mempunyai catatan jurnal atau baki pembukaan tidak boleh dipadam — sistem akan menyekatnya dan menerangkan sebabnya, supaya sejarah perakaunan kekal selamat.",
    en: "Green Target — Chart of Accounts: account codes that are no longer needed can now be deleted, just like in Tien Hock. A delete button appears on the account list and on the account edit page. System accounts, accounts with sub-accounts, and accounts that already have journal entries or an opening balance cannot be deleted — the system blocks them and explains why, so accounting history stays safe.",
  },
  {
    date: "2026-07-30",
    ms: "Database Backups — Memuat turun backup tidak lagi kelihatan tersekat. Semasa backup dimuat turun, jumlah data yang diterima kini dipaparkan secara langsung (contohnya \"42.5 MB received\") supaya backup besar yang mengambil masa beberapa minit jelas sedang berjalan. Muat turun juga kini mempunyai had masa dan boleh dibatalkan dengan menutup tetingkap, jadi tetingkap backup tidak akan tersepit selamanya jika sambungan terputus.",
    en: "Database Backups — Downloading a backup no longer looks stuck. While a backup downloads, the amount of data received is now shown live (for example \"42.5 MB received\") so large backups that take several minutes are clearly progressing. The download also has a time limit and can be cancelled by closing the window, so the backup window can never be trapped forever if the connection stalls.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Setiap sewaan kini mempunyai halaman Butiran Sewaan sendiri. Klik mana-mana kad sewaan untuk melihat maklumat penuh sewaan tersebut (pelanggan, lokasi, tong, pemandu, tarikh, destinasi pickup dan catatan), bersama semua invois yang berkaitan dan setiap bayaran yang telah direkodkan padanya. Dari halaman ini anda juga boleh terus membuat invois — tandakan satu atau lebih sewaan pelanggan yang sama (amaun dikira automatik pada RM200 setiap sewaan dan boleh diubah), kemudian invois baharu terus dibuka. Jika pelanggan membayar serta-merta, tandakan Record Payment dalam borang yang sama untuk merekodkan bayaran penuh sekali gus — invois terus menjadi Paid. Menyunting sewaan kini dilakukan pada halaman sunting berasingan, sama seperti invois; butang pensil pada kad sewaan membawanya terus ke sana.",
    en: "Green Target — Every rental now has its own Rental Details page. Click any rental card to see the rental's full information (customer, location, tong, driver, dates, pickup destination and remarks) together with every invoice linked to it and each payment recorded against those invoices. You can also create an invoice right from this page — tick one or more of the same customer's rentals (the amount is worked out automatically at RM200 per rental and can be changed), and the new invoice opens straight away. If the customer pays on the spot, tick Record Payment in the same form to record the full payment in one go — the invoice becomes Paid immediately. Editing a rental now happens on a separate edit page, just like invoices; the pencil button on a rental card takes you there.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Journal Entries: senarai jurnal kini mempunyai tapisan jenis baucer seperti di Tien Hock. Klik pil jenis (contohnya C Cash Payment, REC Receipt, JV Journal Voucher) untuk memaparkan hanya jurnal jenis itu; pilih lebih daripada satu untuk gabungan, dan gunakan pil Active/Cancelled untuk tapisan status. Pilihan tapisan diingati apabila anda kembali ke halaman ini.",
    en: "Green Target — Journal Entries: the journal list now has voucher-type filters like Tien Hock. Click a type pill (for example C Cash Payment, REC Receipt, JV Journal Voucher) to show only journals of that type; select several to combine them, and use the Active/Cancelled pills to filter by status. Your filter choices are remembered when you return to the page.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Journal Entries: jenis baucer Cash Payment, Bank Payment dan Journal kini boleh dikunci terus di Green Target, sama seperti di Tien Hock. Pilih jenis tersebut semasa membuat jurnal baharu dan nombor rujukan diisi automatik (contohnya PCE001/07 untuk Cash Payment). Sesuai untuk memasukkan payment voucher ke dalam akaun Green Target.",
    en: "Green Target — Journal Entries: Cash Payment, Bank Payment and Journal voucher types can now be keyed directly in Green Target, just like in Tien Hock. Pick the type when creating a new journal and the reference number is filled in automatically (for example PCE001/07 for Cash Payment). This is where payment vouchers can now be entered into Green Target's accounts.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Senarai Sewaan dan senarai Invois kini mengingati paparan anda. Selepas membuka sewaan atau invois dan kembali semula, halaman yang sama, carian, julat tarikh, tapisan (termasuk \"Active Rentals Only\" serta tapisan pelanggan, status dan consolidation) dan kedudukan skrin dikekalkan — anda tidak perlu lagi menetapkannya semula setiap kali. Tetapan ini juga kekal apabila anda kembali ke halaman tersebut kemudian. Membuka senarai invois melalui pautan pelanggan tetap bermula pada halaman pertama seperti biasa.",
    en: "Green Target — The Rentals list and Invoices list now remember your view. After opening a rental or an invoice and coming back, the same page, search, date range, filters (including \"Active Rentals Only\" and the customer, status and consolidation filters) and scroll position are kept — you no longer have to set them again each time. They also stay in place when you return to the page later. Opening the invoice list from a customer link still starts on the first page as before.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Site lokasi kini dipaparkan bersama alamat di mana-mana sahaja alamat sewaan ditunjukkan: kad senarai Sewaan, butiran sewaan pada kad Invois, pemilihan sewaan semasa membuat atau menyunting invois, halaman butiran Invois, tooltip pada halaman Tong, dan Delivery Order. Alamat dipaparkan sebagai \"Site — Alamat\"; lokasi tanpa Site kekal memaparkan alamat sahaja.",
    en: "Green Target — A location's Site is now shown next to the address everywhere a rental address appears: the Rentals list cards, the rental details on Invoice cards, the rental picker when creating or editing an invoice, the Invoice details page, the Dumpsters page tooltip, and the Delivery Order. It reads as \"Site — Address\"; locations without a Site still show the address on its own.",
  },
  {
    date: "2026-07-30",
    ms: "Green Target — Invois: nombor invois yang pernah dibatalkan dan kemudian dipadam kini boleh digunakan semula. Sebelum ini, walaupun sistem memberitahu \"Invoice number is available\", menyimpan invois tersebut gagal dengan mesej ralat teknikal kerana rekod perakaunan invois lama masih memegang nombor itu. Rekod perakaunan yang telah dibatalkan kini dipadam bersama invoisnya, dan rekod lama yang tertinggal telah dibersihkan. Tiada kesan pada lejar: rekod yang dibatalkan tidak pernah masuk ke dalam mana-mana laporan atau baki akaun.",
    en: "Green Target — Invoices: an invoice number that was cancelled and then deleted can now be used again. Previously the system said \"Invoice number is available\" but saving failed with a technical error, because the old invoice's accounting record still held that number. The cancelled accounting record is now removed together with its invoice, and the leftover records have been cleaned up. Nothing changes in the ledger: a cancelled record never appeared in any report or account balance.",
  },
  {
    date: "2026-07-29",
    ms: "Green Target — Bayaran: tarikh bayaran diterima dan Nombor Rujukan Green Target (contohnya RV26/06/62) kini dikunci sendiri oleh pengguna. Satu rujukan boleh meliputi beberapa invois; pilih bil yang dibayar, masukkan amaun setiap bil dan pilih Tunai, Cek, Pindahan Bank atau Online, kemudian semuanya disimpan serentak. Nombor cek atau rujukan transaksi kekal sebagai ruangan berasingan. Apabila cek disahkan atau resit dibatalkan, semua invois di bawah rujukan itu diproses bersama. Rujukan GT kekal ditempah selepas pembatalan supaya sejarah resit tidak bercampur. Bayaran yang direkod di sini hanya mengemas kini baki invois dan sejarah bayaran — resit dimasukkan ke dalam akaun Green Target secara berasingan oleh pejabat, seperti sebelum ini.",
    en: "Green Target — Payments: users now key the date received and Green Target Reference No. (for example RV26/06/62) themselves. One reference can cover several invoices: choose the bills being paid, enter each amount and select Cash, Cheque, Bank Transfer or Online, then the whole entry is saved together. The cheque number or transaction reference remains a separate field. Confirming a cheque or cancelling a receipt processes every invoice under that reference together. A GT reference stays reserved after cancellation so receipt histories cannot merge. Recording a payment here only updates invoice balances and payment history — the receipt is keyed into Green Target's accounts separately by the office, as before.",
  },
  {
    date: "2026-07-28",
    ms: "Green Target — Voucher Generator (Accounting): gaji bulanan kini boleh dijurnal terus ke lejar Green Target, sama seperti di Tien Hock. Pilih bulan yang telah diproses gajinya, semak pratonton baris jurnal, kemudian jana dua baucer sekaligus: JBSL (gaji pekerja — dipisahkan mengikut Office dan Lori Habuk) dan JWDR (elaun pengarah GOH dan WONG). Pemandu Lori Habuk boleh ditetapkan ke keluarga akaun BW (Bongawan) atau SS melalui bahagian Driver Branch Mapping pada halaman yang sama. Baucer yang telah dijana tidak akan dijana dua kali.",
    en: "Green Target — Voucher Generator (Accounting): monthly payroll can now be journalled straight into the Green Target ledger, just like in Tien Hock. Pick a processed payroll month, review the journal-line preview, then generate the two vouchers together: JBSL (staff wages — split into Office and Lori Habuk) and JWDR (directors' remuneration for GOH and WONG). Each Lori Habuk driver can be assigned to the BW (Bongawan) or SS account family from the Driver Branch Mapping section on the same page. A voucher that has already been generated will not be generated twice.",
  },
  {
    date: "2026-07-28",
    ms: "Jualan (Tien Hock & Jelly Polly): semua bil berjumlah RM0.00 kini dilayan sama rata. Selain bil pulangan (\"Returns Only\") yang telah dikendalikan sebelum ini, bil yang hanya merekod barang percuma — sama ada dikunci di ruangan Free atau sebagai kuantiti pada harga 0.00 — kini dipaparkan dengan status \"Free Goods\", dan bil kosong tanpa sebarang kuantiti dipaparkan sebagai \"Zero Value\". Kesemua bil RM0.00 ini tidak lagi boleh dihantar sebagai e-Invois berasingan kerana LHDN sentiasa menolaknya: kotak \"Submit as e-Invoice\" dimatikan semasa bil dikunci, butang Submit e-Invoice tidak dipaparkan, dan bil sebegini dilangkau daripada penghantaran pukal. Status e-Invois pada bil ini dipaparkan sebagai \"Not Applicable\", bukan lagi \"Invalid\" berwarna merah. Tiada apa-apa yang hilang dari segi pematuhan — semuanya tetap termasuk dalam e-Invois disatukan bulanan. Bil yang mempunyai nilai jualan tidak terjejas langsung.",
    en: "Sales (Tien Hock & Jelly Polly): every bill totalling RM0.00 is now handled the same way. On top of the returns bills (\"Returns Only\") covered earlier, bills that only record free goods — whether keyed in the Free column or as a quantity at price 0.00 — now show a \"Free Goods\" status, and empty bills with no quantities at all show \"Zero Value\". None of these RM0.00 bills can be submitted as an individual e-Invoice any more, because LHDN always rejects them: the \"Submit as e-Invoice\" tick is switched off while keying the bill, the Submit e-Invoice button no longer appears, and they are skipped from bulk submission. Their e-Invoice status reads \"Not Applicable\" instead of a red \"Invalid\". Nothing is lost for compliance — they are all still picked up by the monthly consolidated e-Invoice. Bills that carry a sales value are completely unaffected.",
  },
  {
    date: "2026-07-28",
    ms: "Jualan (Tien Hock & Jelly Polly): jumlah e-Invois bagi bil yang mengandungi baris \"OTH\" atau \"LESS\" kini betul. Bagi baris OTH dan LESS, harga yang dikunci ialah jumlah baris itu sendiri dan kuantiti dibiarkan 0 — tetapi e-Invois dahulunya mengira baris tersebut sebagai kuantiti × harga, jadi nilainya menjadi RM0.00. Akibatnya bil yang hanya mempunyai baris OTH (contohnya jualan corn starch) dihantar sebagai RM0.00 dan sentiasa ditolak oleh LHDN, manakala potongan \"Less\" pada bil biasa langsung tidak dilaporkan. Kini baris OTH dan LESS dihantar pada nilai penuhnya, jadi jumlah e-Invois sepadan dengan jumlah invois. Anda tidak perlu mengubah cara mengunci bil — teruskan seperti biasa. e-Invois yang telah dihantar sebelum ini tidak berubah.",
    en: "Sales (Tien Hock & Jelly Polly): e-Invoice amounts for bills containing an \"OTH\" or \"LESS\" line are now correct. For OTH and LESS lines the price you key IS that line's total and the quantity is left at 0 — but the e-Invoice used to work them out as quantity × price, which came to RM0.00. As a result, bills made up only of OTH lines (corn starch sales, for example) were submitted as RM0.00 and always rejected by LHDN, while a \"Less\" discount on an ordinary bill was never declared at all. OTH and LESS lines are now submitted at their full value, so the e-Invoice total matches the invoice total. You do not need to change how you key bills — carry on as usual. e-Invoices already submitted are unchanged.",
  },
  {
    date: "2026-07-28",
    ms: "Material Stock: kos seunit kini boleh dikunci sehingga 4 tempat perpuluhan. Sebelum ini kos seperti 0.035 dibundarkan sendiri menjadi 0.04 apabila disimpan, menyebabkan nilai pelarasan tersalah kira. Selain itu, kotak kos seunit dan kuantiti pelarasan kini membenarkan anda menaip nombor perpuluhan terus — sebelum ini angka \"0\" dan titik perpuluhan hilang sebaik sahaja ditaip, jadi nilai seperti 0.005 memang tidak boleh dimasukkan. Kos yang anda taip kini disimpan tepat seperti yang dimasukkan dan dipaparkan penuh pada tooltip pengiraan. Kos seunit juga kini boleh disimpan dengan sendirinya: sebelum ini jika baris itu tiada kuantiti pelarasan, kos yang baru dikunci hilang semula selepas muat semula halaman — inilah sebabnya ia nampak \"kadang-kadang jadi, kadang-kadang tidak\". Nilai RM (pelarasan, baki akhir) kekal 2 tempat perpuluhan seperti biasa. Kos yang telah disimpan sebelum ini tidak berubah — jika ia sepatutnya 0.035, sila kunci semula.",
    en: "Material Stock: unit costs can now be keyed to 4 decimal places. Previously a cost like 0.035 was automatically rounded to 0.04 when saved, which made the adjustment value wrong. The unit cost and adjustment quantity boxes also let you type decimals straight through now — before this, the leading \"0\" and the decimal point were wiped as you typed, so a value like 0.005 simply could not be entered. The cost you type is now stored exactly as entered and shown in full in the calculation tooltip. A unit cost can also be saved on its own now: previously, if the row had no adjustment quantity, a newly keyed cost was dropped and reverted after a page refresh — which is why saving appeared to work only some of the time. RM values (adjustment, closing) stay at 2 decimals as before. Costs already saved are unchanged — if one should have been 0.035, please key it again.",
  },
  {
    date: "2026-07-28",
    ms: "Jualan (Tien Hock & Jelly Polly): bil yang dikeluarkan semata-mata untuk merekod barang pulangan — iaitu setiap baris tiada kuantiti jualan langsung, hanya kuantiti Return — kini dipaparkan dengan status \"Returns Only\" di kad senarai invois dan di halaman butiran, menggantikan status \"Paid\" yang mengelirukan. Bil sebegini tiada nilai jualan, jadi LHDN sentiasa menolaknya; oleh itu ia tidak lagi boleh dihantar sebagai e-Invois berasingan — kotak \"Submit as e-Invoice\" dimatikan semasa bil dikunci, butang Submit e-Invoice tidak lagi dipaparkan, dan bil sebegini dilangkau daripada penghantaran pukal. Status e-Invois pada bil ini kini dipaparkan sebagai \"Not Applicable\" dan bukan lagi \"Invalid\" berwarna merah. Tiada apa-apa yang hilang dari segi pematuhan: bil ini tetap termasuk dalam e-Invois disatukan (consolidated) bulanan seperti biasa. Bil yang mempunyai kuantiti jualan bersama pulangan tidak terjejas langsung.",
    en: "Sales (Tien Hock & Jelly Polly): bills issued purely to record returned goods — where every line has no sales quantity at all, only a Return quantity — now show a \"Returns Only\" status on the invoice list card and the details page, instead of the misleading \"Paid\". These bills carry no sales value, so LHDN always rejects them; they can therefore no longer be submitted as individual e-Invoices — the \"Submit as e-Invoice\" tick is switched off while keying the bill, the Submit e-Invoice button no longer appears, and they are skipped from bulk submission. Their e-Invoice status now reads \"Not Applicable\" instead of a red \"Invalid\". Nothing is lost for compliance: these bills are still picked up by the monthly consolidated e-Invoice as before. Bills that have sales quantities alongside returns are completely unaffected.",
  },
  {
    date: "2026-07-28",
    ms: "Green Target: perakaunan kini aktif sepenuhnya. Invois, bayaran dan nota kredit/debit/bayaran balik bertarikh 1 Julai 2026 dan selepasnya kini direkodkan secara automatik ke dalam lejar Green Target — setiap invois dan bayaran menghasilkan catatan jurnalnya sendiri, dan pembatalan turut membatalkan catatan itu. Anda juga boleh mengunci masuk jurnal manual baharu dari Accounting → Journal Entries, serta menyunting, membatalkan atau mengembalikan semula catatan sedia ada. Dokumen dan jurnal bertarikh sebelum 1 Julai 2026 dilindungi dan tidak boleh diubah, supaya angka Jan–Jun yang telah dimuktamadkan kekal tepat.",
    en: "Green Target: accounting is now fully live. Invoices, payments and credit/debit/refund notes dated 1 July 2026 onward are now recorded in the Green Target ledger automatically — every invoice and payment produces its own journal entry, and cancelling a document cancels that entry. You can also key in new manual journals from Accounting → Journal Entries, and edit, cancel or restore existing entries. Documents and journals dated before 1 July 2026 are protected and cannot be changed, so the finalised Jan–Jun figures stay exact.",
  },
  {
    date: "2026-07-28",
    ms: "Jelly Polly: invois yang dibatalkan kini menunjukkan RM0.00 sepenuhnya, sama seperti Tien Hock. Sebelum ini Total Payable dan kuantiti serta harga pada setiap baris masih memaparkan jumlah asal walaupun invois telah dibatalkan, walhal baki memang sudah RM0.00. Kod dan nama produk pada setiap baris kekal supaya anda masih nampak apa yang ada pada bil itu. Invois Jelly Polly yang telah dibatalkan sebelum ini turut dikemas kini, dan ini juga membetulkan baki bawa ke hadapan pada penyata pelanggan yang sebelum ini termasuk invois yang dibatalkan.",
    en: "Jelly Polly: cancelled invoices now show RM0.00 throughout, the same as Tien Hock. Previously the Total Payable and each line's quantity and price still displayed the original amounts on a cancelled invoice, even though the balance was already RM0.00. Each line keeps its product code and name so you can still see what was on the bill. Jelly Polly invoices cancelled before this change have been updated too, which also corrects the brought-forward balance on customer statements, where cancelled invoices were previously being counted.",
  },
  {
    date: "2026-07-28",
    ms: "Perakaunan: laporan baharu Estimated P&L dan Estimated Unit Cost kini tersedia sebagai dua halaman berasingan di bawah Accounting → Estimated Reports — laporan untung/rugi bulanan bagi MEE & BIHUN, dan laporan kos unit sebag, lengkap dengan input Add Back dan tetapan pemetaan laporan yang boleh diubah.",
    en: "Accounting: the new Estimated P&L and Estimated Unit Cost reports are now available as two separate pages under Accounting → Estimated Reports — a monthly MEE & BIHUN profit/loss report, and a per-bag unit cost report, with an Add Back input and editable report mappings.",
  },
  {
    date: "2026-07-28",
    ms: "Payment Management: tarikh bayaran yang tersilap kunci kini boleh dibetulkan terus dari senarai bayaran — klik ikon kalendar di sebelah tarikh. Jika satu cek meliputi beberapa invois, semua bayaran di bawah rujukan itu berpindah ke tarikh baharu serentak supaya kumpulan itu kekal pada satu baris. Bagi Jelly Polly, tarikh perakaunan (tarikh cek dijelaskan bank) juga boleh dibetulkan dan tidak boleh lebih awal daripada tarikh bayaran. Bagi Tien Hock hanya bayaran cek boleh dibetulkan, dan catatan jurnal tidak berubah kerana cek sentiasa direkod pada tarikh ia dijelaskan bank; bagi tunai, pindahan bank dan online, sila batalkan bayaran dan kunci semula pada tarikh yang betul. Jumlah bayaran dan baki invois tidak berubah.",
    en: "Payment Management: a mis-keyed payment date can now be corrected straight from the payments list — click the calendar icon next to the date. When one cheque covers several invoices, every payment under that reference moves to the new date together so the group stays on one row. For Jelly Polly the accounting date (the date the cheque cleared the bank) can also be corrected, and it cannot be earlier than the payment date. For Tien Hock only cheque payments can be corrected, and the journal entry does not change because a cheque is always recorded on the date it cleared the bank; for cash, bank transfer and online payments, cancel the payment and record it again on the correct date. Payment amounts and invoice balances are never changed.",
  },
  {
    date: "2026-07-28",
    ms: "Halaman Material Stock kini menyusun Unit Cost terus selepas Opening Qty, diikuti kumpulan Adjustment dan Closing yang jelas. Nilai Adjustment menunjukkan Qty x Unit Cost, manakala Closing Value diterangkan sebagai Opening + Movements. Lajur Purchases Qty yang tidak digunakan telah dibuang; nilai pembelian hanya dipaparkan dalam ringkasan RM apabila berkenaan, dan jumlah nilai kategori dipaparkan pada baris ringkasan berasingan.",
    en: "The Material Stock page now places Unit Cost directly after Opening Qty, followed by clearly grouped Adjustment and Closing columns. Adjustment Value shows Qty x Unit Cost, while Closing Value is explained as Opening + Movements. The unused Purchases Qty column has been removed; purchase value appears in the RM summaries only when applicable, and category value totals appear in a separate summary row.",
  },
  {
    date: "2026-07-28",
    ms: "Green Target: bahagian Accounting baharu kini tersedia — Journal Entries, Account Ledger, Trial Balance, Income Statement, Balance Sheet dan Chart of Accounts — memaparkan lejar akaun sebenar Jan–Jun 2026 yang diimport daripada sistem lama. Laporan Debtors kini juga membaca baki penghutang sebenar daripada lejar tersebut (jumlah Jun 2026: RM156,782.22), bukan lagi invois operasi, dan setiap penghutang boleh diklik untuk melihat penyata akaunnya. Semua halaman ini baca sahaja buat masa ini.",
    en: "Green Target: a new Accounting section is now available — Journal Entries, Account Ledger, Trial Balance, Income Statement, Balance Sheet and Chart of Accounts — showing the real Jan–Jun 2026 account ledger imported from the legacy system. The Debtors report now also reads the true debtor balances from that ledger (June 2026 total: RM156,782.22) instead of operational invoices, and each debtor can be clicked to view its account statement. All of these pages are read-only for now.",
  },
  {
    date: "2026-07-27",
    ms: "Jurnal: Bayaran Tunai (C) kini mengisi nombor cek fizikal yang betul semula, jadi tidak perlu lagi menaip ganti nombor tersebut. Sebelum ini ruangan cek terisi dengan nombor rujukan bank yang panjang (contohnya PBE2607240364268554) kerana sistem turut mengambil kira nombor transaksi bank daripada Bayaran Bank (B). Kini hanya buku cek Bayaran Tunai dikira, jadi nombor seterusnya terisi dengan betul (contohnya PBB350787). Tiada rekod sedia ada yang terjejas.",
    en: "Journals: Cash Payment (C) entries now prefill the correct physical cheque number again, so you no longer have to type over it. Previously the cheque field filled in with a long bank reference (e.g. PBE2607240364268554) because the system was also counting the bank transaction ids keyed on Bank Payment (B) entries. It now looks only at the Cash Payment cheque book, so the next number fills in correctly (e.g. PBB350787). No existing records are affected.",
  },
  {
    date: "2026-07-27",
    ms: "Jurnal: sistem kini memberi amaran apabila nombor cek yang sama telah digunakan pada Bayaran Bank (B) atau Bayaran Tunai (C) yang lain — sama seperti mesej \"ALREADY ISSUED ON\" dalam sistem lama. Semasa memasukkan nombor cek, amaran terus dipaparkan di bawah ruangan tersebut berserta pautan ke jurnal berkenaan; halaman butiran jurnal turut menandakan nombor cek berwarna kuning, dan senarai jurnal memaparkan label \"Cheque re-used\". Amaran ini hanya sebagai peringatan dan tidak menghalang penyimpanan. Jurnal yang telah dibatalkan turut disenaraikan dengan label \"Cancelled\". Nombor rujukan ringkas lama (contohnya PBE26060 yang dikongsi oleh banyak bayaran Jun) tidak diberi amaran.",
    en: "Journals: the system now warns when the same cheque number has already been used on another Bank Payment (B) or Cash Payment (C) — just like the old programme's \"ALREADY ISSUED ON\" message. While you are keying the cheque number, the warning appears right under the field with links to the entries concerned; the journal details page also highlights the cheque number in amber, and the journal list shows a \"Cheque re-used\" label. The warning is a reminder only and never blocks saving. Cancelled journals are listed too, marked \"Cancelled\". Old shorthand references (such as PBE26060, shared by many June payments) are not flagged.",
  },
  {
    date: "2026-07-25",
    ms: "Pergerakan Stok: jualan kini dikira mengikut tarikh sebenar bil, bukan lagi terawal 8 jam. Sebelum ini setiap bil yang dikeluarkan sebelum pukul 8 pagi dikira jatuh pada hari sebelumnya, jadi baris harian tersasar dan bil awal pagi pada 1 haribulan tertolak ke bulan sebelumnya — menyebabkan stok tutup bulan itu tersalah kira. Angka pergerakan stok dan stok tutup kini betul tanpa perlu apa-apa tindakan.",
    en: "Stock Movement: sales are now counted on the bill's actual date instead of 8 hours early. Previously every bill issued before 8am was counted on the previous day, so the daily rows were off and early-morning bills on the 1st of a month fell into the previous month — throwing off that month's closing stock. Stock movement and closing stock figures are now correct, with nothing for you to do.",
  },
  {
    date: "2026-07-25",
    ms: "Jelly Polly: bil TUNAI kini boleh disimpan semula. Sebelum ini menyimpan bil tunai baharu gagal dengan mesej ralat, dan ralat yang sama juga berlaku semasa mengubah produk pada bil tunai sedia ada atau menukar invois kredit kepada tunai.",
    en: "Jelly Polly: CASH bills can be saved again. Previously, saving a new cash bill failed with an error message, and the same error also occurred when editing the products on an existing cash bill or converting a credit invoice to cash.",
  },
  {
    date: "2026-07-24",
    ms: "Senarai dan butiran jurnal kini memaparkan nombor rujukan sebenar resit (contohnya T130726) — sama seperti yang dipaparkan pada penyata bank dan jurnal lama yang diimport — bukannya nombor dalaman REC-.... Carian jurnal juga kini menemui jurnal melalui nombor rujukan sebenar tersebut.",
    en: "The journal list and details now show the receipt's actual reference number (e.g. T130726) — matching what the bank statement and imported legacy journals already show — instead of the internal REC-... number. Journal search now also finds journals by that actual reference number.",
  },
  {
    date: "2026-07-24",
    ms: "Bayaran pelanggan dalam tempoh lama yang dikunci kini boleh digunakan untuk menjelaskan invois tertunggak apabila nombor rujukan, pelanggan, invois dan amaun sepadan tepat dengan bayaran yang sudah ada dalam lejar lama. Sistem menunjukkan tarikh lejar sebenar untuk pengesahan, menambah sejarah bayaran baca sahaja, mengemas kini baki/status invois dan mengira semula baki kredit pelanggan — wang dan catatan akaun tidak direkodkan kali kedua. Jika padanan tidak tepat atau meragukan, tempoh kekal dikunci. Contohnya, invois HIAPLEE-M 62586 boleh dipadankan dengan PBB111306 berjumlah RM523.50 pada tarikh lejar 15/04/2026 walaupun tarikh 13/04/2026 dimasukkan.",
    en: "Customer payments from the locked historical period can now clear outstanding invoices when the reference, customer, invoice and amount exactly match a payment already present in the old ledger. The system shows the authoritative ledger date for confirmation, adds a read-only payment-history record, updates the invoice balance/status and recalculates customer credit — it does not record the money or accounting entry a second time. If the match is not exact or is ambiguous, the period stays locked. For example, HIAPLEE-M invoice 62586 can be matched to PBB111306 for RM523.50 on the ledger date 15/04/2026 even when 13/04/2026 was entered.",
  },
  {
    date: "2026-07-23",
    ms: "Pembetulan data: 21 lagi invois lama yang sebenarnya telah pun dijelaskan tetapi masih kelihatan tertunggak kini ditandakan sebagai telah dibayar, mengurangkan jumlah tertunggak pelanggan berkenaan (dan Laporan Debtors) sebanyak RM12,410.00 secara keseluruhan. Bil-bil ini merupakan jualan yang telah dibayar tunai di tempat, dibayar kemudian melalui bank transfer/online, atau dilunaskan sepenuhnya setelah diskaun prompt payment atau nota kredit dikira — kesemuanya memang sudah terkandung dalam lejar akaun, jadi tiada catatan akaun baharu dibuat. Antara pelanggan yang terlibat: SABANAH SUPPLIER, ANGELA ENTERPRISE, NEVER CLOSE SUPERMARKET, CLS GEMILANG, U TEA RESOURCES dan MY SHOP - KOTA MARUDU 2.",
    en: "Data correction: 21 more old invoices that were actually already settled but still showed as outstanding are now marked paid, reducing the affected customers' outstanding totals (and the Debtors report) by RM12,410.00 in all. These were sales that had been paid on the spot in cash, paid later by bank transfer/online, or fully covered once a prompt-payment discount or credit note was applied — all already reflected in the account ledger, so no new accounting entries were made. Customers affected include SABANAH SUPPLIER, ANGELA ENTERPRISE, NEVER CLOSE SUPERMARKET, CLS GEMILANG, U TEA RESOURCES and MY SHOP - KOTA MARUDU 2.",
  },
  {
    date: "2026-07-22",
    ms: "Susunan produk dan pekerja kini boleh diubah dan dikongsi oleh semua pengguna: klik butang Reorder di halaman Catalogue → Product, Production Entry, Stock Movement atau Production Records, pilih tab produk (Mee, Bihun, Bundle, Other atau Jelly Polly) atau tab pekerja (Mee/Bihun), seret mengikut susunan yang dikehendaki dan simpan. Susunan produk digunakan di semua halaman produk dan pengeluaran — pemilihan Production Entry, Product Stock, Production Records dan kotak carian produk; susunan pekerja disegerakkan dengan grid pekerja di halaman Production Entry. Susunan asal produk Mee: 1-350G, 1-3UDG, 1-2UDG, 1-MNL.",
    en: "Product and worker ordering is now adjustable and shared by all users: click the Reorder button on the Catalogue → Product, Production Entry, Stock Movement or Production Records page, pick a product tab (Mee, Bihun, Bundle, Other or Jelly Polly) or a worker tab (Mee/Bihun), drag into the desired order and save. The product order is used across all product and production pages — the Production Entry selection, Product Stock, Production Records and the product search boxes; the worker order stays in sync with the worker grids on the Production Entry pages. Initial Mee product order: 1-350G, 1-3UDG, 1-2UDG, 1-MNL.",
  },
  {
    date: "2026-07-22",
    ms: "Halaman Production Records kini dipecahkan kepada lima halaman mengikut jenis produk — Mee, Bihun, Bundle, SBH & SMEE dan Empty Bag. Setiap hari kini memaparkan jumlah kuantiti yang dihasilkan, dan baris produk bermula dalam keadaan tertutup (klik untuk membuka butiran pekerja).",
    en: "The Production Records page is now split into five pages by product type — Mee, Bihun, Bundle, SBH & SMEE and Empty Bag. Each day now shows the total quantity produced, and product rows start collapsed (click to open worker details).",
  },
  {
    date: "2026-07-22",
    ms: "Pembetulan data: enam invois lama yang sebenarnya telah dijelaskan (mengikut lejar akaun) tetapi masih kelihatan tertunggak kini ditandakan sebagai telah dibayar — CHANKOPI 2004676, AMY 15309, LEE YX 026127, SHAB 34704, HIAPLEE-SC 63599 dan LAI 34367. Jumlah tertunggak pelanggan-pelanggan ini (dan Laporan Debtors) turun sebanyak RM4,265.00 secara keseluruhan; tiada catatan akaun baharu dibuat kerana bayaran tersebut memang sudah ada dalam lejar.",
    en: "Data correction: six old invoices that were actually settled (per the account ledger) but still showed as outstanding are now marked paid — CHANKOPI 2004676, AMY 15309, LEE YX 026127, SHAB 34704, HIAPLEE-SC 63599 and LAI 34367. These customers' outstanding totals (and the Debtors report) drop by RM4,265.00 in all; no new accounting entries were made because the payments were already in the ledger.",
  },
  {
    date: "2026-07-22",
    ms: "Halaman butiran jurnal kini memaparkan butang pautan ke dokumen yang mewujudkan jurnal tersebut secara automatik — contohnya invois, nota kredit/debit/bayaran balik, resit, bank-in (RV), belian am atau bayaran pembekal. Klik butang berkenaan untuk terus membuka dokumen sumber.",
    en: "The journal details page now shows a link button to the document that automatically created the journal — such as an invoice, credit/debit/refund note, receipt, bank-in (RV), general purchase or supplier payment. Click it to jump straight to the source document.",
  },
  {
    date: "2026-07-22",
    ms: "Laporan Debtors kini dibuka dengan paparan \"By Customer\" yang menyenaraikan semua pelanggan — termasuk yang tiada baki tertunggak — lengkap dengan baki bawa ke hadapan, invois semasa, bayaran dan jumlah perlu dibayar bagi bulan terpilih. Setiap pelanggan mempunyai butang Statement dan Invoices, dan anda boleh bertukar kembali ke paparan \"By Salesman\" seperti sebelum ini. Tab Transactions pada halaman pelanggan juga kini mempunyai butang Statement dengan pemilih bulan untuk mencetak penyata akaun pelanggan.",
    en: "The Debtors report now opens on a \"By Customer\" view listing every customer — including those with no outstanding balance — with the brought-forward balance, current invoices, payments and total due for the selected month. Each customer has Statement and Invoices buttons, and you can switch back to the \"By Salesman\" view as before.",
  },
  {
    date: "2026-07-22",
    ms: "Jelly Polly kini mempunyai halaman Account Ledger di bawah Accounting untuk menyemak lejar penghutang setiap pelanggan. Pilih pelanggan dan tempoh untuk melihat baki bawa ke hadapan, invois, bayaran selesai, nota kredit/debit, baki berjalan dan jumlah penutup, kemudian buka dokumen sumber atau cetak laporan untuk membandingkannya dengan laporan Debtors. Bayaran automatik bagi bil tunai juga kini menggunakan tarikh invois supaya baki bulanan dipaparkan pada tempoh yang betul.",
    en: "Jelly Polly now has an Account Ledger page under Accounting for checking each customer's debtor ledger. Select a customer and period to see the brought-forward balance, invoices, completed payments, credit/debit notes, running balance and closing total, then open the source documents or print the report for comparison with the Debtors report. Automatic cash-bill payments now also use the invoice date so monthly balances appear in the correct period.",
  },
  {
    date: "2026-07-22",
    ms: "Slip Pinjam yang dicetak kini lebih padat. Tajuk syarikat di bahagian atas telah dibuang (memandangkan slip dipotong untuk setiap pekerja), dan setiap slip kini hanya memaparkan bahagian yang ada rekod pinjam — jika pekerja hanya ada pinjam gaji pertengahan bulan, bahagian gaji bulanan tidak lagi dipaparkan, dan sebaliknya. Ini berlaku untuk Tien Hock, Green Target dan Jelly Polly.",
    en: "Printed Pinjam slips are now more compact. The company header at the top has been removed (since slips are cut out per worker), and each slip now only shows the half that actually has a pinjam record — if a worker only has a mid-month pinjam, the monthly section is no longer shown, and vice versa. This applies to Tien Hock, Green Target and Jelly Polly.",
  },
  {
    date: "2026-07-21",
    ms: "Sistem kegemaran kod akaun kini turut hadir dalam pemilih akaun di halaman Account Ledger dan borang Journal. Tandakan bintang pada mana-mana akaun dalam senarai juntai bawah untuk menambahkannya sebagai kegemaran — akaun kegemaran dipaparkan di bahagian atas senarai dengan latar kuning, sama seperti di halaman Account Codes. Klik bintang sekali lagi untuk membuangnya.",
    en: "The account code favourites system is now available in the account pickers on the Account Ledger page and the Journal form. Click the star on any account in the dropdown to favourite it — favourited accounts are pinned to the top of the list with an amber background, just like on the Account Codes page. Click the star again to remove it.",
  },
  {
    date: "2026-07-21",
    ms: "Pembelian luar negara (import) yang dimasukkan sebagai e-invois bil sendiri tidak lagi dicatat secara automatik ke dalam akaun dan tidak lagi dipaparkan dalam penyata kewangan. Sila rekodkan pembelian ini menggunakan jurnal pembelian manual anda sendiri seperti biasa. (Pembelian am tempatan tidak terjejas.)",
    en: "Overseas (foreign) purchases entered as self-billed e-invoices are no longer posted automatically to the accounts and no longer appear in the financial statements. Please record these purchases using your own manual purchase journals as usual. (Local general purchases are unaffected.)",
  },
  {
    date: "2026-07-21",
    ms: "Dua pembaharuan pada pemilih kod akaun. Pertama, carian di halaman Account Codes kini turut menemui akaun anak yang tiada anak sendiri (contohnya BRM dan MRM di bawah RM) — sebelum ini akaun anak sedemikian hanya muncul jika ditandakan sebagai kegemaran. Kedua, ruangan Account dalam borang Journal kini menggunakan pemilih hierarki yang sama seperti halaman Account Ledger, memaparkan akaun induk dan anak dalam bentuk pokok yang boleh dikembangkan, dengan butang + untuk menambah kod akaun baharu seperti sebelum ini.",
    en: "Two updates to the account code picker. First, searching on the Account Codes page now finds child accounts that have no children of their own (e.g. BRM and MRM under RM) — previously such child accounts only appeared if favourited. Second, the Account field in the Journal form now uses the same hierarchical picker as the Account Ledger page, showing parent and child accounts as an expandable tree, with the + button to add a new account code as before.",
  },
  {
    date: "2026-07-21",
    ms: "Halaman Cash Bank-In (RV) kini boleh merekodkan jurnal drawing — wang pendahuluan yang dibayar balik oleh pekerja dan dibankkan. Klik \"New Drawing (CA_WA)\", isi tarikh, bank, nombor RV, jumlah dan keterangan (boleh diubah, lalai \"FROM DRAWING WORKERS\"), kemudian Post. Jurnal yang dihasilkan mendebitkan akaun bank dan mengkreditkan CA_WA (Worker's Advance), dan disenaraikan bersama bank-in biasa dengan lencana \"Drawing\".",
    en: "The Cash Bank-In (RV) page can now record drawing journals — worker advance repayments that are banked in. Click \"New Drawing (CA_WA)\", fill in the date, bank, RV number, amount and description (editable, default \"FROM DRAWING WORKERS\"), then Post. The journal debits the bank account and credits CA_WA (Worker's Advance), and is listed alongside regular bank-ins with a \"Drawing\" badge.",
  },
  {
    date: "2026-07-21",
    ms: "Bayaran lebih pelanggan kini boleh digunakan untuk melangsaikan invois belum bayar. Dalam borang bayaran, ruangan \"Apply held overpayment\" muncul apabila pelanggan yang dipilih mempunyai bayaran lebih — jumlahnya boleh diubah atau dimatikan, dan selebihnya dibayar seperti biasa dengan tunai, cek atau pemindahan dalam satu transaksi yang sama. Bayaran lebih digunakan mengikut invois tertua dahulu. Permohonan boleh dibatalkan seperti bayaran biasa; pembatalan memulangkan jumlah tersebut kepada baki bayaran lebih pelanggan.",
    en: "Customer overpayments can now be used to settle unpaid invoices. In the payment form, an \"Apply held overpayment\" option appears when a selected customer has an overpayment — the amount can be adjusted or turned off, and the rest is paid as usual by cash, cheque or transfer in the same single transaction. The overpayment is used against the oldest invoice first. An application can be cancelled like a normal payment; cancelling returns the amount to the customer's overpayment balance.",
  },
  {
    date: "2026-07-21",
    ms: "Bayaran lebih daripada pelanggan kini dipaparkan dengan jelas. Penyata Akaun pelanggan menunjukkan nota \"Unapplied overpayment held\" di bawah jumlah perlu dibayar, laporan Debtors menambah ruangan \"Overpayment Held\" pada ringkasan pelanggan, dan halaman Account Ledger memaparkan lencana \"Overpayment held\" apabila akaun pelanggan dibuka. Jumlah ini adalah bayaran lebih yang disimpan sebagai deposit pelanggan dan tidak mengubah sebarang baki atau laporan kewangan.",
    en: "Customer overpayments are now clearly visible. The customer Statement of Account shows an \"Unapplied overpayment held\" note below the total amount due, the Debtors report adds an \"Overpayment Held\" figure to the customer summary, and the Account Ledger page shows an \"Overpayment held\" badge when a customer's ledger is opened. This amount is the excess payment kept as a customer deposit and does not change any balances or financial reports.",
  },
  {
    date: "2026-07-21",
    ms: "Senarai dan butiran Journal kini memaparkan nombor RV sebenar (contohnya RV076/06) untuk jurnal bank-in yang dihasilkan dari halaman Cash Bank-In, menggantikan rujukan dalaman \"BI-…\" yang tidak bermakna. Carian mengikut nombor RV turut menemui jurnal tersebut. Jurnal RV yang dikunci masuk secara manual tidak berubah.",
    en: "The Journal list and details pages now show the actual RV number (e.g. RV076/06) for bank-in journals created from the Cash Bank-In page, replacing the meaningless internal \"BI-…\" reference. Searching by RV number also finds these journals. Manually keyed RV journals are unchanged.",
  },
  {
    date: "2026-07-21",
    ms: "Halaman Cash Bank-In (RV) kini turut menyenaraikan jurnal RV yang dikunci masuk secara manual (contohnya bayaran balik pembekal atau bayaran balik pekerja) bersama bank-in biasa, mengikut tarikh dan nombor RV. Baris sedemikian ditandakan lencana \"Manual\" dan tidak boleh dibatalkan dari halaman ini — uruskannya melalui halaman Journal seperti biasa.",
    en: "The Cash Bank-In (RV) page now also lists manually keyed RV journals (such as supplier refunds or worker repayments) alongside regular bank-ins, interleaved by date and RV number. These rows carry a \"Manual\" badge and cannot be cancelled from this page — manage them through the Journal page as usual.",
  },
  {
    date: "2026-07-21",
    ms: "Dalam pengurusan e-Invois Disatukan, klik bilangan invois untuk membuka halaman baharu yang menunjukkan semua invois di dalam penyatuan itu. Paparan utama menyusun invois mengikut julat nombor resit yang sama seperti yang dicetak pada e-Invois Disatukan, jadi setiap baris boleh dipadankan terus dengan salinan yang dihantar; kembangkan mana-mana baris untuk melihat invois di dalamnya. Paparan kedua menyenaraikan semua invois mengikut tarikh. Anda boleh klik mana-mana invois untuk membukanya, mencari mengikut nombor invois atau nama pelanggan, menyemak sama ada jumlahnya sepadan dengan jumlah e-Invois Disatukan, dan mencetak salinan semua invois sekali gus.",
    en: "In Consolidated e-Invoice management, click the invoice count to open a new page showing every invoice inside that consolidation. The main view groups invoices by the same receipt number ranges printed on the consolidated e-Invoice, so each row matches a line on the submitted copy; expand any row to see the invoices behind it. A second view lists every invoice by date. You can click any invoice to open it, search by invoice number or customer name, check that the amounts add up to the consolidated total, and print copies of all the invoices at once.",
  },
  {
    date: "2026-07-21",
    ms: "Penyata Akaun dan Senarai Penghutang perniagaan kini mengikut peraturan laporan lama dengan tepat. Lajur CURRENT menunjukkan invois, nota debit dan nota bayaran balik bulan itu ditolak nota kredit, manakala lajur PAYMENT menunjukkan kutipan; sebelum ini nota kredit diletakkan dalam PAYMENT. Pecahan umur (current, 1, 2, 3+ bulan) kini dikira mengikut giliran dokumen tertua dahulu seperti laporan lama dan sentiasa berjumlah sama dengan Jumlah Perlu Dibayar. Pelanggan yang telah selesai sepenuhnya (baki sifar) tidak lagi disenaraikan dalam badan laporan, sama seperti cetakan lama.",
    en: "The Trade Debtor Statement of Account and list now follow the legacy report rules exactly. The CURRENT column shows the month's invoices, debit notes and refund notes less credit notes, while PAYMENT shows collections; previously credit notes were placed in PAYMENT. Aging buckets (current, 1, 2, 3+ months) are now allocated oldest-document-first like the legacy report and always add up to Total Amount Due. Fully settled (zero-balance) customers are no longer listed in the report body, matching the legacy printouts.",
  },
  {
    date: "2026-07-21",
    ms: "Nilai stok akhir bulan kini boleh disahkan terus di halaman Material Stock melalui kad baharu \"Closing Stock (Financial Statements)\". Isi tiga nilai — produk siap, bahan mentah dan bahan bungkusan — untuk bulan yang dipilih, kemudian Simpan; nilai tersebut dimasukkan ke dalam Balance Sheet, Income Statement dan CoGM bagi bulan itu. Setiap ruangan menunjukkan \"Page total\" yang dikira daripada data stok halaman itu sendiri sebagai rujukan — klik untuk menyalin nilainya ke dalam ruangan. Trial Balance sengaja tidak menunjukkan sebarang pergerakan stok akhir, sama seperti laporan lama.",
    en: "Month-end closing stock values can now be confirmed directly on the Material Stock page via the new \"Closing Stock (Financial Statements)\" card. Fill in the three values — finished goods, raw materials and packing materials — for the selected month, then Save; they are injected into the Balance Sheet, Income Statement and CoGM for that month. Each field shows a \"Page total\" computed from the page's own stock data as a reference — click it to copy the value into the field. The Trial Balance intentionally shows no closing-stock movement, matching the legacy reports.",
  },
  {
    date: "2026-07-20",
    ms: "Laporan Trial Balance, Income Statement, Balance Sheet dan CoGM kini menggunakan nilai stok awal 1 Januari 2026 yang telah disahkan daripada laporan lama. Baki pembukaan Trial Balance kini seimbang dan Balance Sheet Mei 2026 seimbang pada RM5,389,607.26 sebelum stok akhir. Income Statement dan Untung Tahun Semasa merangkumi stok awal produk siap, bahan mentah dan bahan bungkusan, manakala CoGM merangkumi stok awal bahan mentah dan bahan bungkusan sahaja. Nilai stok akhir bulanan belum dimasukkan dan akan ditambah dalam fasa seterusnya.",
    en: "The Trial Balance, Income Statement, Balance Sheet and CoGM reports now use the confirmed opening-stock values at 1 January 2026 from the legacy reports. The Trial Balance opening now balances, and the May 2026 Balance Sheet balances at RM5,389,607.26 before closing stock. The Income Statement and Current Year Profit include opening finished goods, raw materials and packing materials, while CoGM includes opening raw materials and packing materials only. Monthly closing stock is not included yet and remains for the next phase.",
  },
  {
    date: "2026-07-17",
    ms: "Baki RM41.05 PASAR MINI MY SHOP - SIKUATI telah dibetulkan. Kredit lama RM41.05 yang dibawa ke hadapan kini dikontra kepada invois 63864 bersama Nota Kredit RM51.30 dan bayaran RM1,617.65 bertarikh 01/07/2026, jadi invois tersebut serta invois lama 62297 kini Selesai dan baki pelanggan ialah RM0.00. Tiada bayaran bank atau catatan lejar baharu dicipta kerana kredit itu memang sudah ada dalam baki bawa hadapan. Pecahan umur dalam Penyata Akaun kini sentiasa sepadan dengan Jumlah Perlu Dibayar, termasuk kredit lama. Pemilih bulan pada halaman Penghutang juga kini dilabel sebagai \"Bulan invois\", manakala butang Penyata menunjukkan bahawa laporan dicetak setakat hujung bulan yang dipilih.",
    en: "PASAR MINI MY SHOP - SIKUATI's RM41.05 balance has been corrected. The RM41.05 old credit brought forward is now applied to invoice 63864 together with its RM51.30 Credit Note and RM1,617.65 payment dated 01/07/2026, so that invoice and old invoice 62297 are both Paid and the customer balance is RM0.00. No new bank payment or ledger entry was created because the credit was already included in the brought-forward balance. Statement aging now always reconciles to Total Amount Due, including old credits. The month selector on the Debtors page is also labelled \"Invoice month\", while the Statement button identifies the selected month-end cutoff.",
  },
  {
    date: "2026-07-16",
    ms: "Penukaran pelanggan untuk invois Tien Hock kini hanya dibenarkan bagi invois bersih dalam tempoh perakaunan terbuka. Jika invois mempunyai resit atau bayaran, Nota Kredit/Debit/Bayaran Balik aktif, atau berada dalam e-Invois konsolidasi, mesej pada skrin akan menyenaraikan rekod yang mesti dibatalkan dahulu serta cara merekodkannya semula. Invois dalam tempoh berkunci atau yang mempunyai jurnal Manual tidak boleh diubah sendiri; berikan nombor invois, ID pelanggan lama dan baharu serta bukti sokongan kepada akauntan atau pentadbir sistem. Bagi invois yang selamat diubah, lejar dan baki kredit pelanggan dipindahkan bersama-sama.",
    en: "Changing the customer on a Tien Hock invoice is now limited to clean invoices in the open accounting period. If a receipt or payment, active Credit/Debit/Refund Note, or consolidated e-Invoice blocks the change, an on-screen message lists the affected records, what must be cancelled first and what must be recorded again. Locked-period invoices and invoices with a Manual journal are not self-service changes; give the invoice number, old and new customer IDs, and supporting proof to the accountant or system administrator. For eligible invoices, the customer ledger and credit balance move together.",
  },
  {
    date: "2026-07-16",
    ms: "Jadual yang dikembangkan pada halaman Penghutang Tien Hock kini memaparkan Nota Kredit, Nota Debit dan Nota Bayaran Balik yang menjejaskan baki di bawah invois belum selesai yang berkaitan. Setiap baris menunjukkan kesan tambah atau tolak pada baki serta sebab dokumen, dan nombor dokumen boleh dibuka terus untuk melihat butirannya.",
    en: "The expanded table on the Tien Hock Debtors page now shows Credit Notes, Debit Notes and balance-affecting Refund Notes beneath their related outstanding invoices. Each row shows whether the document adds to or reduces the balance, includes its reason, and opens the document details directly.",
  },
  {
    date: "2026-07-16",
    ms: "Menukar pelanggan sesuatu invois kini turut memindahkan invois itu ke lejar dan penyata pelanggan baharu, berserta had kredit yang digunakan. Sebelum ini invois itu kekal dalam lejar pelanggan lama, jadi ia tidak dipaparkan dalam Penyata Akaun pelanggan baharu dan baki pelanggan lama menjadi lebih tinggi daripada sepatutnya. Invois 64072 yang terjejas telah dibetulkan: ia kini dipaparkan dalam penyata PASAR MINI MY SHOP-KM5 sebagai RM1,646.00 pada 09/07/2026 dengan jumlah perlu dibayar RM1,596.60 selepas Nota Kredit TH/CN/26/22 (sebelum ini penyata hanya menunjukkan -RM49.40). Baki PASAR MINI MYSHOP KOTA MARUDU turun RM1,646.00 kepada jumlah sebenarnya.",
    en: "Changing an invoice's customer now also moves that invoice into the new customer's ledger and statement, together with the credit used. Previously the invoice stayed in the old customer's ledger, so it did not appear on the new customer's Statement of Account and the old customer's balance was higher than it should be. The affected invoice 64072 has been corrected: it now appears on the PASAR MINI MY SHOP-KM5 statement as RM1,646.00 on 09/07/2026 with RM1,596.60 due after Credit Note TH/CN/26/22 (previously the statement showed only -RM49.40). PASAR MINI MYSHOP KOTA MARUDU's balance drops by RM1,646.00 to its true amount.",
  },
  {
    date: "2026-07-16",
    ms: "Satu bayaran tunai yang tidak pernah diterima telah dibuang daripada invois 015361 (YESOKEY, 13/06/2026, RM2,880). Bil itu asalnya dikunci masuk sebagai bil tunai, jadi sistem merekod bayaran secara automatik; apabila ia ditukar kepada invois kredit, bayaran automatik itu tertinggal dan kekal aktif. Invois 015361 kini kembali sebagai Belum Dibayar, baki YESOKEY pada 23/06/2026 kini RM18,168.00 (sebelum ini RM15,288.00) dan had kredit yang digunakan kini RM10,480.00. Lejar YESOKEY 2026 dan senarai penghutang Jun'26 kini sepadan dengan buku lama.",
    en: "A cash payment that was never actually received has been removed from invoice 015361 (YESOKEY, 13/06/2026, RM2,880). The bill was first keyed as a cash bill, so the system recorded a payment automatically; when it was later changed to a credit invoice, that automatic payment was left behind and stayed active. Invoice 015361 is now Unpaid again, YESOKEY's balance on 23/06/2026 is now RM18,168.00 (previously RM15,288.00) and its credit used is now RM10,480.00. The YESOKEY 2026 ledger and the June'26 debtors list now match the old book.",
  },
  {
    date: "2026-07-16",
    ms: "Halaman Kod Akaun kini dibuka dengan akaun induk aktif dan kod bebas dipaparkan serta cabang akaun induk dikembangkan secara lalai. Kotak pilihan akaun induk telah dibuang kerana paparan ini kini digunakan secara tetap. Kod induk atau anak boleh ditandakan sebagai kegemaran peribadi supaya kod tersebut dipaparkan terlebih dahulu. Ia juga mempunyai bar penapis yang lebih padat, kotak pilihan yang seragam dan pemilihan FS Note yang lebih mudah. Borang Kod Akaun kini menunjukkan susunan Control/Main A/C, ACC No./Code Bapa dan Code Anak, bersama baki pembukaan, amaun Januari hingga Disember, Balance B/F, amaun bulan semasa, jumlah terkumpul dan amaun bagi setiap akaun anak. Ikon anak panah dalam jadual akaun anak juga boleh digunakan untuk membuka akaun tersebut. Butang Kembali pada borang kini kembali ke halaman sebenar sebelumnya, termasuk daripada kod anak kepada kod induk. Tahun dan bulan semasa boleh dipilih untuk melihat tempoh lain. Pemilih akaun dalam Laporan Lejar Akaun kini turut menunjukkan susunan akaun secara bertingkat supaya kod induk dan anak lebih mudah dicari.",
    en: "The Account Codes page now opens with active parent accounts and standalone codes visible, with parent branches expanded by default. The parent-account checkbox has been removed because this view is now always used. You can mark any parent or child code as a personal favourite so that code appears first. It also has a more compact filter bar, consistent checkboxes and an easier FS Note picker. The Account Code form now shows the Control/Main A/C, ACC No./parent code and child-code hierarchy together with opening balance, January-to-December amounts, Balance B/F, current-month movement, accumulative balance and each child account's amount. The arrow in the child-account table can also be used to open that account. The form's Back button now returns to the actual previous page, including from a child code back to its parent. You can select the year and current month to view another period. The Account Ledger account picker now also shows the account hierarchy, making parent and child codes easier to find.",
  },
  {
    date: "2026-07-16",
    ms: "Halaman Rental dan Invois Green Target kini memuatkan satu halaman pada satu masa, jadi ia dibuka dengan lebih pantas walaupun rekod semakin banyak. Carian dan penapis kini mencari semua rekod, bukan hanya yang dipaparkan: taip carian anda kemudian tekan Enter atau klik di luar kotak untuk mencarinya. Halaman Rental kini mempunyai penapis tarikh mengikut tarikh letak, dan dibuka dengan 30 hari terakhir. Rental yang diletak lebih 30 hari lalu tidak dipaparkan pada mulanya walaupun ia masih aktif — pilih julat tarikh yang lebih luas atau klik butang \"X\" untuk melihat semua tarikh. Carian invois kini turut menemui pemandu, no. tong dan alamat lokasi rental berkaitan. Pilihan invois kini dikosongkan apabila anda menukar halaman atau penapis.",
    en: "The Green Target Rentals and Invoices pages now load one page at a time, so they open faster as records grow. Search and filters now look through every record instead of only the ones on screen: type your search then press Enter or click outside the box to run it. The Rentals page now has a date filter by placement date, and opens on the last 30 days. Rentals placed more than 30 days ago are not shown at first even if they are still active — pick a wider date range or click the \"X\" button to see all dates. Invoice search now also finds the driver, dumpster no. and location address of the linked rentals. Invoice selection is now cleared when you change page or filters.",
  },
  {
    date: "2026-07-16",
    ms: "Tab Pinjam dalam Laporan Gaji Jelly Polly dan Green Target kini juga mempunyai pilihan Month-End dan Mid-Month. Paparan Mid-Month menunjukkan amaun 1/2 Bulan, setiap pinjam pertengahan bulan dan baki pekerja selepas pinjam. Jumlah pada skrin serta PDF biasa dan Breakdown mengikut paparan yang dipilih.",
    en: "The Pinjam tab in the Jelly Polly and Green Target Salary Reports now also has Month-End and Mid-Month views. The Mid-Month view shows the 1/2 Bulan amount, each mid-month pinjam and the staff's remaining balance. On-screen totals, the regular PDF and the Breakdown PDF all follow the selected view.",
  },
  {
    date: "2026-07-16",
    ms: "Tab Pinjam dalam Laporan Gaji Tien Hock kini mempunyai pilihan Month-End dan Mid-Month. Paparan Mid-Month menunjukkan amaun 1/2 Bulan, setiap pinjam pertengahan bulan, dan baki pekerja selepas pinjam. Butang cetak, muat turun PDF dan Breakdown mengikut paparan yang dipilih. Pinjam Mid-Month kekal sebagai maklumat sahaja dalam laporan hujung bulan dan tidak ditolak kali kedua.",
    en: "The Pinjam tab in the Tien Hock Salary Report now has Month-End and Mid-Month views. The Mid-Month view shows the 1/2 Bulan amount, each mid-month pinjam and the staff's remaining balance. Print, PDF download and Breakdown actions follow the selected view. Mid-month pinjam remains informational in the month-end report and is not deducted a second time.",
  },
  {
    date: "2026-07-16",
    ms: "Halaman Gaji Pertengahan Bulan untuk Tien Hock, Jelly Polly dan Green Target kini mempunyai paparan Summary dan Pinjam. Paparan Pinjam menunjukkan amaun pendahuluan, jumlah pinjam, baki akhir dan pecahan setiap pinjam bagi setiap pekerja. PDF Gaji Pertengahan Bulan juga memaparkan pecahan pinjam di bawah baris pekerja, dan PDF Green Target kini menggunakan logo Green Target.",
    en: "The Mid-Month Payroll pages for Tien Hock, Jelly Polly and Green Target now have Summary and Pinjam views. The Pinjam view shows each staff member's advance, total pinjam, final balance and individual pinjam breakdown. The Mid-Month Payroll PDF also lists the pinjam breakdown below each staff row, and the Green Target PDF now uses the Green Target logo.",
  },
  {
    date: "2026-07-15",
    ms: "Laporan Gaji Jelly Polly dan Green Target kini sama seperti Tien Hock. Empat tab baharu ditambah: Employee (senarai rata semua pekerja dengan jumlah keseluruhan), Bank (nama, No. K/P dan nombor akaun bank untuk pembayaran bulan itu), Pinjam (gaji/genap tolak pinjam bulan itu, dengan setiap pinjam dipaparkan pada baris pekerja dan ringkasan \"Pinjam by Type\"), dan Cuti (hari diambil/kelayakan serta amaun bagi setiap jenis cuti). Semua tab boleh dicetak dan dimuat turun sebagai PDF, dan tab Pinjam mempunyai butang \"Breakdown\" untuk mencetak senarai pekerja mengikut jenis pinjam. Susun atur halaman kini mengikut Tien Hock. Pinjam jenis mid-month tidak dimasukkan kerana ia sudah ditolak daripada pendahuluan pertengahan bulan.",
    en: "The Jelly Polly and Green Target Salary Reports now match Tien Hock. Four new tabs were added: Employee (a flat list of every staff with grand totals), Bank (name, IC No. and bank account number for that month's payments), Pinjam (gaji/genap less that month's pinjam, with each pinjam shown on the staff's row and a \"Pinjam by Type\" summary), and Cuti (days taken/entitlement and amount for each leave type). Every tab can be printed and downloaded as a PDF, and the Pinjam tab has a \"Breakdown\" button that prints the staff behind each pinjam type. The page layout now follows Tien Hock. Mid-month pinjam is not included, as it is already deducted from the mid-month advance.",
  },
  {
    date: "2026-07-15",
    ms: "Jelly Polly dan Green Target: lajur GAJI BERSIH, JUMLAH dan SETELAH DIGENAPKAN dalam Laporan Gaji kini menunjukkan jumlah gaji yang diperoleh sepenuhnya, termasuk bonus/komisen yang telah dibayar awal (advance) — sama seperti Tien Hock. Sebelum ini advance sudah ditolak daripada angka tersebut. Tab Bank dan Pinjam pula menunjukkan wang sebenar yang akan diterima pekerja (selepas tolak advance), jadi angka pembayaran tidak berubah. Ini hanya memberi kesan kepada pekerja yang mempunyai rekod advance.",
    en: "Jelly Polly and Green Target: the GAJI BERSIH, JUMLAH and SETELAH DIGENAPKAN columns in the Salary Report now show the full salary earned, including any bonus/commission already paid out as an advance — the same as Tien Hock. Previously the advance was already subtracted from those figures. The Bank and Pinjam tabs still show the actual money the staff will receive (after the advance), so payment amounts are unchanged. This only affects staff who have advance records.",
  },
  {
    date: "2026-07-15",
    ms: "Membetulkan bilangan hari cuti pada slip gaji. Cuti sehari dicetak sebagai \"01.0 Hari\", dan dua hari cuti jenis yang sama dicetak sebagai \"01.01.0 Hari\" dengan jumlah bayaran yang salah. Kini ia dicetak dengan betul sebagai \"1 Hari\" dan \"2 Hari\", untuk semua jenis cuti dan semua syarikat.",
    en: "Fixed the number of leave days shown on payslips. One day of leave printed as \"01.0 Hari\", and two days of the same leave type printed as \"01.01.0 Hari\" with an incorrect total amount. They now print correctly as \"1 Hari\" and \"2 Hari\", for every leave type and all companies.",
  },
  {
    date: "2026-07-15",
    ms: "Pada bahagian Kod Gaji dalam halaman pekerja, butang \"Clear All\" kini dinamakan \"Clear All Default\" supaya lebih jelas fungsinya. Satu butang baharu \"Clear All Customized Rates\" juga ditambah pada bahagian Kod Gaji Khusus Pekerja — ia mengembalikan semua kadar khas pekerja itu kepada kadar asal sekali gus. Butang ini hanya muncul apabila ada kadar khas, dan ia menunjukkan berapa banyak yang akan dikosongkan sebelum anda mengesahkan.",
    en: "In the Pay Codes section of a staff page, the \"Clear All\" button is now named \"Clear All Default\" so its purpose is clearer. A new \"Clear All Customized Rates\" button has also been added to the Employee-Specific Pay Codes section — it resets all of that staff's customized rates back to the default rate at once. The button only appears when there are customized rates, and it shows how many will be cleared before you confirm.",
  },
  {
    date: "2026-07-15",
    ms: "Kadar RM0.00 kini boleh disimpan sebagai kadar khas (override) bagi kod gaji pekerja dan kerja. Sebelum ini menaip 0 dianggap kosong, jadi sistem kembali kepada kadar asal dan memaparkan \"No changes detected\". Ini berguna apabila seseorang tidak sepatutnya menerima kod gaji itu langsung — contohnya rekod salesman \"KILANG ICE-POLLY\" yang tidak sepatutnya menerima komisen. Garis masa perubahan kadar (Rate timeline) bagi Jelly Polly juga kini disimpan pada katalog Jelly Polly yang betul; sebelum ini ia gagal disimpan.",
    en: "A rate of RM0.00 can now be saved as an override on employee and job pay codes. Previously typing 0 was treated as blank, so the system fell back to the original rate and showed \"No changes detected\". This is useful when someone should not earn a pay code at all — for example the \"KILANG ICE-POLLY\" salesman record, which should not earn commission. The Rate timeline for Jelly Polly now also saves to the correct Jelly Polly catalogue; previously it failed to save.",
  },
  {
    date: "2026-07-15",
    ms: "Halaman Jelly Polly Mesin Plastik Harian kini mempunyai bahagian Cuti. Anda boleh merekod Cuti Tahunan, Cuti Sakit dan Cuti Rawatan untuk pekerja plastik pada tarikh yang dipaparkan (Cuti Umum hanya pada hari cuti umum), dengan semakan baki cuti semasa merekod. Bayaran cuti ditambah ke dalam gaji kasar semasa memproses gaji.",
    en: "The Jelly Polly Daily Machine Plastic page now has a Leave section. You can record Annual, Sick and Hospital leave for plastic staff on the date being shown (Public Holiday leave only on a public holiday), with balance checks while recording. Leave pay is added to gross pay during payroll processing.",
  },
  {
    date: "2026-07-14",
    ms: "Green Target kini mempunyai sistem cuti seperti syarikat lain. Anda boleh merekod Cuti Tahunan, Cuti Sakit, Cuti Umum dan Cuti Rawatan untuk pekerja Pejabat (log bulanan) dan Pemandu (Lori Habuk harian), dengan semakan baki cuti semasa merekod. Bayaran cuti ditambah ke dalam gaji kasar semasa memproses gaji dan dipaparkan pada slip gaji, dan halaman Laporan Cuti baharu menunjukkan baki serta penggunaan cuti setiap pekerja.",
    en: "Green Target now has a leave system like the other companies. You can record Annual, Sick, Public Holiday and Hospital leave for Office staff (monthly log) and Drivers (daily Lori Habuk), with balance checks while recording. Leave pay is added to gross pay during payroll processing and shown on the payslip, and a new Cuti Report page shows each employee's leave balances and usage.",
  },
  {
    date: "2026-07-14",
    ms: "Catatan jurnal yang dijana sistem kini boleh disunting terus — jualan (invois), belian, resit, bayaran pembekal, nota kredit/debit/bayaran balik dan baucar gaji. Sebaik sahaja anda menyuntingnya, jurnal itu ditandakan \"Manual\" dan dokumen sumbernya tidak lagi menulis gantinya secara automatik apabila sumber itu disunting — anda menguruskannya sendiri. Membatalkan dokumen sumber masih membatalkan jurnal. Jurnal import lama (IMP) kekal tidak boleh disunting.",
    en: "System-generated journal entries can now be edited directly — sales (invoice), purchases, receipts, supplier payments, credit/debit/refund notes and payroll vouchers. Once you edit one, it is marked \"Manual\" and its source document no longer overwrites it automatically when the source is edited — you manage it yourself. Cancelling the source document still cancels the journal. Legacy import (IMP) journals remain non-editable.",
  },
  {
    date: "2026-07-14",
    ms: "Membetulkan ralat pada halaman Jelly Polly yang menghalang pemilihan jenis cuti untuk pekerja (\"Gagal mengambil baki cuti\"). Baki cuti Jelly Polly kini dipaparkan dengan betul dan cuti boleh direkodkan seperti biasa.",
    en: "Fixed an error on Jelly Polly pages that blocked selecting a leave type for employees (\"Failed to fetch leave balances\"). Jelly Polly leave balances now load correctly and leave can be recorded as normal.",
  },
  {
    date: "2026-07-14",
    ms: "Nama Tapak kini pilihan untuk lokasi pelanggan Green Target. Borang pendaftaran awam hanya meminta alamat, manakala staf boleh menyimpan lokasi tanpa Tapak atau menambah nama Tapak kemudian jika diperlukan.",
    en: "Site names are now optional for Green Target customer locations. The public registration form only asks for an address, while staff can save a location without a Site or add one later when needed.",
  },
  {
    date: "2026-07-14",
    ms: "Pautan borang pendaftaran Green Target kini memaparkan tajuk, penerangan dan logo Green Target yang betul apabila dikongsi dalam aplikasi mesej atau media sosial. Pratonton pautan Tien Hock kekal tidak berubah.",
    en: "The Green Target registration form link now shows the correct Green Target title, description and logo when shared in messaging or social media apps. Tien Hock link previews remain unchanged.",
  },
  {
    date: "2026-07-14",
    ms: "Pemilihan Akaun Induk kini memaparkan kod akaun mengikut hierarki yang boleh dikembangkan atau dikecilkan, supaya akaun induk dan akaun anak lebih mudah dibezakan. Pilihan Tiada akaun induk sentiasa tersedia untuk akaun aras teratas, dan halaman suntingan akaun kini menyenaraikan semua akaun anak terus bersama statusnya.",
    en: "Parent Account selection now shows account codes in an expandable hierarchy, making parent and child accounts easier to distinguish. A No parent option remains readily available for top-level accounts, and account edit pages now list every direct child account with its status.",
  },
  {
    date: "2026-07-14",
    ms: "Catatan jurnal manual kini boleh disimpan semula selepas akaun pada barisnya diubah, termasuk pertukaran daripada BANK_PBB kepada akaun lain.",
    en: "Manual journal entries can now be saved after changing the account on one of their lines, including changing BANK_PBB to another account.",
  },
  {
    date: "2026-07-14",
    ms: "Harga seunit bagi Stok Kilang pada halaman Stok Bahan kini boleh diubah terus, sama seperti kuantiti. Harga ini disimpan untuk halaman itu sahaja mengikut bulan; jika tidak diubah, ia masih diambil daripada harga produk seperti biasa. Nilai stok dikira semula secara automatik apabila harga diubah.",
    en: "The unit price for Stock Kilang on the Material Stock page can now be edited directly, just like the quantity. This price is stored for that page only per month; if left unchanged, it is still taken from the product price as before. The stock value recalculates automatically when the price is changed.",
  },
  {
    date: "2026-07-14",
    ms: "Bahagian e-Invois pada borang pendaftaran pelanggan Green Target kini memaparkan No. ID selepas Jenis ID supaya maklumat pengenalan boleh disemak dalam urutan yang betul. E-mel kini pilihan, manakala negeri ditetapkan secara automatik kepada Sabah.",
    en: "The e-Invoice section of the Green Target customer registration form now shows ID Number after ID Type so identity details can be reviewed in the correct order. Email is now optional, while the state is set automatically to Sabah.",
  },
  {
    date: "2026-07-14",
    ms: "Pengesahan cek tertunda Jelly Polly kini menggunakan Tarikh Penjelasan yang bermula pada hari ini dan boleh diubah kepada tarikh sebenar pada penyata bank. Tarikh cek diterima kekal dalam sejarah bayaran, manakala penyata penghutang menggunakan tarikh penjelasan. Butang Sahkan dan Batal pada Pengurusan Bayaran Jelly Polly kini mengemas kini bayaran Jelly Polly yang betul.",
    en: "Jelly Polly pending-cheque confirmation now uses a Clearance Date picker starting on today, which can be changed to the actual bank-statement date. The cheque-received date remains in payment history, while debtor statements use the clearance date. Confirm and Cancel in Jelly Polly Payment Management now update the correct Jelly Polly payment.",
  },
  {
    date: "2026-07-14",
    ms: "Apabila Nombor Rujukan catatan jurnal manual diubah, Nombor Jurnal pada Lejar Akaun kini turut dikemas kini. PCE008/06 tidak lagi dipaparkan sebagai PV008/06 dalam lejar BANK_PBB; amaun, tarikh dan akaunnya tidak diubah.",
    en: "When a manual journal's Reference No. is changed, its Journal No. in Account Ledger now stays in sync. PCE008/06 no longer appears as PV008/06 in the BANK_PBB ledger; its amount, date, and accounts are unchanged.",
  },
  {
    date: "2026-07-14",
    ms: "Memadam catatan jurnal kini berjaya walaupun ia dipautkan kepada Nota Kredit, Debit atau Bayaran Balik — pautan ke nota itu dibuang secara automatik. Bagi jurnal yang dipautkan kepada rekod lain (invois, resit, bayaran, atau kemasukan bank), penjelasan yang jelas ditunjukkan dan bukannya ralat pangkalan data.",
    en: "Deleting a journal entry now works even when it is linked to a Credit, Debit, or Refund Note — the link to the note is cleared automatically. Journals linked to other records (invoices, receipts, payments, or bank-ins) still show a clear explanation instead of a database error.",
  },
  {
    date: "2026-07-14",
    ms: "Semasa mengesahkan bayaran cek Tien Hock yang tertunda, Tarikh Penjelasan diperlukan. Di Pengurusan Bayaran, pemilih tarikh bermula pada hari ini; ubahnya kepada tarikh sebenar pada penyata bank jika berbeza. Lejar akaun, laporan bank dan pengumuran penghutang menggunakan tarikh penjelasan itu. Empat cek HAPSENG dan TETAP JAYA berjumlah RM39,090.10 yang diterima pada Jun telah dipindahkan ke 7 dan 10 Julai.",
    en: "A Clearance Date is required when confirming a pending Tien Hock cheque payment. In Payment Management, the date picker starts on today; change it to the actual bank-statement date when different. Account ledgers, bank reports, and debtor aging use that clearance date. Four HAPSENG and TETAP JAYA cheques totalling RM39,090.10 that were received in June have been moved to 7 and 10 July.",
  },
  {
    date: "2026-07-14",
    ms: "Pelanggan Green Target kini boleh mempunyai nama Tapak bagi setiap lokasi. Semua nama Tapak berbeza daripada sewaan dalam satu invois disertakan selepas alamat bil pada e-Invois jualan individu dan nota pelarasannya. Borang pendaftaran awam kini menerima beberapa lokasi, mewajibkan maklumat asas, menggunakan logo Green Target, serta menyembunyikan maklumat e-Invois sehingga pelanggan memilih untuk memerlukannya; maklumat pengenalan e-Invois disahkan sebelum permintaan diterima. Senarai pilihan e-Invois pada borang pelanggan juga kekal di atas bar tindakan supaya semua pilihan boleh dipilih.",
    en: "Green Target customers can now have a Site name for each location. Every distinct Site from the rentals on an invoice is included after the billing address on individual sales e-Invoices and their adjustment notes. The public registration form now accepts multiple locations, requires the basic details, uses the Green Target logo, and hides e-Invoice information until the customer says they need it; e-Invoice identity details are verified before the request is accepted. E-Invoice selection lists on the customer form also remain above the action bar so every option can be selected.",
  },
  {
    date: "2026-07-14",
    ms: "Halaman Bayaran Green Target kini menggunakan susun atur yang lebih kemas dan mesra telefon, menunjukkan invois aktif serta tertunggak untuk bayaran, dan membolehkan tempoh carian invois ditukar. Amaun yang tidak sah diterangkan sebelum dihantar, manakala amaun melebihi baki disekat kerana Green Target tidak menyimpan lebihan itu sebagai kredit pelanggan. Bayaran cek tertunda juga boleh dibatalkan tanpa mengubah baki invois.",
    en: "Green Target Payments now uses a cleaner, mobile-friendly layout, includes both active and overdue invoices for payment, and lets users change the invoice search period. Invalid amounts are explained before submission, while amounts above the outstanding balance are blocked because Green Target does not store the excess as customer credit. Pending cheque payments can also be cancelled without changing the invoice balance.",
  },
  {
    date: "2026-07-14",
    ms: "Halaman senarai dan butiran Gaji Green Target kini menggunakan susun atur moden dengan carian pekerja, paparan Kumpulan atau Terkini, pilihan cetakan slip gaji, serta pecahan pendapatan dan potongan yang lebih jelas. Jumlah Digenapkan digunakan secara konsisten, dan cetakan slip gaji Green Target kini mengambil bayaran pertengahan bulan yang betul tanpa tersalah mengambil rekod syarikat lain. Bayaran pertengahan bulan yang dibatalkan tidak lagi ditolak daripada gaji atau laporan, dan item gaji manual kekal termasuk dalam jumlah apabila gaji diproses semula. Pautan pantas Driver Habuk kini tersedia bersebelahan Office Entry, manakala butang muat turun semua PDF telah dibuang; pilihan cetakan slip gaji kekal tersedia.",
    en: "Green Target Payroll list and details pages now use a modern layout with employee search, Groups or Recent views, selectable payslip printing, and clearer earnings and deduction breakdowns. Rounded Pay is used consistently, and Green Target payslip printing now includes the correct mid-month payment without accidentally loading another company's payroll record. Cancelled mid-month payments are no longer deducted from payroll or reports, and manual payroll items remain included in totals when payroll is reprocessed. A Driver Habuk shortcut is now available beside Office Entry, while the download-all-PDFs button has been removed; payslip printing options remain available.",
  },
  {
    date: "2026-07-14",
    ms: "Lejar Akaun kini memaparkan Baki Bawa Ke Hadapan dalam lajur Debit atau Kredit (mengikut sama ada baki itu debit atau kredit), selain lajur Baki, pada paparan skrin dan cetakan PDF — mengikut amalan perakaunan lejar biasa.",
    en: "The Account Ledger now shows the Balance Brought Forward in the Debit or Credit column (depending on whether it is a debit or credit balance), in addition to the Balance column, both on screen and in the printed PDF — following standard ledger accounting practice.",
  },
  {
    date: "2026-07-14",
    ms: "Catatan jurnal jenis Bank Payment kini mempunyai medan Cheque No seperti Cash Payment, dengan nilai lalai \"PBE\".",
    en: "Bank Payment journal entries now have a Cheque No field like Cash Payment, pre-filled with the default value \"PBE\".",
  },
  {
    date: "2026-07-14",
    ms: "Halaman Stok Bahan kini mengingati bulan yang dipilih dan kedudukan skrol, jadi apabila anda keluar dan kembali ke halaman itu, ia akan berada di tempat yang sama seperti sebelumnya.",
    en: "The Material Stock page now remembers the selected month and your scroll position, so when you leave and return to the page it stays where you left off.",
  },
  {
    date: "2026-07-14",
    ms: "Catatan jurnal legasi Januari hingga Mei kini memaparkan nombor rujukan asal, jenis dokumen yang sepadan dan keterangan berdasarkan particulars asal dalam senarai, butiran serta cetakan baucar. Nombor import dalaman tidak lagi dipaparkan, manakala tanda Legacy dan rekod sumber dikekalkan untuk jejak audit.",
    en: "January to May legacy journals now show their original reference numbers, matching document types, and descriptions based on the original particulars in journal lists, details, and voucher prints. Internal import numbers are no longer displayed, while a Legacy marker and source trace remain for auditability.",
  },
  {
    date: "2026-07-13",
    ms: "Catatan jurnal import legasi kini dilindungi daripada perubahan manual. Jenis IMP tidak lagi boleh dipilih semasa mencipta catatan jurnal, dan catatan yang diimport tidak boleh diedit, dibatalkan atau dipadam melalui aplikasi.",
    en: "Legacy-import journal entries are now protected from manual changes. The IMP type can no longer be selected when creating a journal entry, and imported entries cannot be edited, cancelled, or deleted through the app.",
  },
  {
    date: "2026-07-13",
    ms: "Baki faedah sewa beli belum matang kini dipaparkan bersama baki hutang sewa beli dalam Nota 16 Kunci Kira-Kira. Hanya faedah yang telah dilepaskan kekal sebagai kos kewangan dalam Nota 23, supaya laporan tidak mengira baki belum matang sebagai perbelanjaan.",
    en: "Hire-purchase interest-in-suspense balances are now shown with hire-purchase payables in Balance Sheet Note 16. Only released interest remains a finance cost in Note 23, so reports no longer treat unexpired interest balances as an expense.",
  },
  {
    date: "2026-07-13",
    ms: "Database Backups dalam sistem pembangunan kini mempunyai pilihan 'Replace Database from SQL'. Fail SQL disahkan terlebih dahulu, kemudian seluruh pangkalan data pembangunan semasa digantikan dengan kandungan sandaran tersebut dan bukannya menambah rekod pendua. Pengesahan yang jelas dipaparkan sebelum penggantian bermula.",
    en: "Database Backups in the development system now has a 'Replace Database from SQL' option. The SQL file is validated first, then the entire current development database is replaced with that backup instead of appending duplicate records. A clear confirmation is shown before replacement begins.",
  },
  {
    date: "2026-07-13",
    ms: "Laporan Trial Balance dan Balance Sheet kini menggunakan baki pembukaan akaun bersama pergerakan jurnal bagi tempoh yang dipilih, manakala Income Statement dan CoGM menggunakan jurnal sahaja. Balance Sheet turut memaparkan Untung Tahun Semasa. Rekod jualan, resit dan nota pelarasan Tien Hock bertarikh sebelum 1 Jun 2026 kini dilindungi daripada perubahan yang boleh memposkan semula catatan akaun lama secara tidak sengaja.",
    en: "Trial Balance and Balance Sheet reports now use account opening balances together with journal movements for the selected period, while the Income Statement and CoGM use journals only. The Balance Sheet also shows Current Year Profit. Tien Hock sales, receipts and adjustment notes dated before 1 June 2026 are now protected from changes that could accidentally repost historical accounting entries.",
  },
  {
    date: "2026-07-13",
    ms: "Bahagian Stock Kilang pada halaman Material Stock kini menjadi rekod kos bulanan yang berasingan. Kuantitinya hanya berubah melalui catatan pada halaman ini dan tidak lagi diambil daripada atau mengubah rekod pengeluaran, jualan atau stok produk. Semua produk MEE atau BIHUN yang aktif kini dipaparkan supaya kuantiti boleh dimasukkan walaupun belum mempunyai baki.",
    en: "The Stock Kilang section on Material Stock is now a separate monthly costing record. Its quantities change only through entries on this page and no longer come from or alter production, sales, or product-stock records. All active MEE or BIHUN products are now shown so quantities can be entered even when they have no balance yet.",
  },
  {
    date: "2026-07-13",
    ms: "Kumpulan bayaran cek tertunda kini boleh disahkan terus melalui 'Manage Group' atau butang pengesahan pada bayaran. Dialog pengesahan kini menerangkan bahawa semua bayaran tertunda dengan rujukan yang sama akan disahkan bersama, memaparkan akaun bank yang telah direkodkan, dan menunjukkan sebab sebenar jika pengesahan tidak dapat dibuat.",
    en: "Pending cheque payment groups can now be confirmed from 'Manage Group' or a payment's confirmation button. The refreshed confirmation dialog explains that every pending payment under the same reference will be confirmed together, shows the bank account already recorded, and displays the actual reason when confirmation cannot proceed.",
  },
  {
    date: "2026-07-13",
    ms: "Borang bayaran kini mempunyai pemilih tarikh yang seragam untuk tarikh bayaran serta tempoh carian invois. Susun atur baharu menggunakan ruang skrin yang tersedia dan memisahkan butiran bayaran serta invois terpilih daripada senarai carian supaya setiap bahagian boleh ditatal dengan lebih selesa, termasuk pada telefon. Senarai carian hanya menunjukkan baki perlu dibayar pada kebanyakan skrin, manakala jumlah asal invois boleh dilihat dengan meletakkan penuding pada baki; lajur Jumlah turut dipaparkan pada skrin desktop yang sangat lebar. Butang 'Add' tidak lagi cuba menghantar borang secara tidak sengaja, dan amaun kosong, sifar atau melebihi baki pada syarikat yang tidak menyokong lebihan bayaran kini diterangkan sebelum dihantar.",
    en: "The payment form now uses consistent date pickers for both the payment date and invoice search period. Its new layout uses the available screen space and separates payment details and selected invoices from the search results so each area scrolls more comfortably, including on phones. Search results show only the balance due on most screens, with the invoice's original total available by hovering over that balance; the Total column is also shown on very wide desktop screens. The 'Add' button no longer attempts to submit the form accidentally, and blank, zero or unsupported above-balance amounts are now explained before submission.",
  },
  {
    date: "2026-07-13",
    ms: "Tajuk tab pelayar kini menunjukkan halaman dan syarikat yang sedang digunakan. Borang pendaftaran pelanggan awam juga kini memaparkan Green Target dan tajuk dalam bahasa yang dipilih, bukannya Tien Hock ERP.",
    en: "Browser tab titles now show the current page and company. The public customer registration form also shows Green Target and the title in the selected language instead of Tien Hock ERP.",
  },
  {
    date: "2026-07-13",
    ms: "Payment Management dan Payment History kini memaparkan serta mengurus bayaran mengikut kumpulan rujukan, tanpa menunjukkan nombor rekod dalaman. Semua invois dengan rujukan, tarikh, kaedah dan akaun bank yang sama ditunjukkan bersama, dan pembatalan atau pengesahan melibatkan seluruh kumpulan supaya baki invois kekal tepat.",
    en: "Payment Management and Payment History now display and manage payments by reference group without showing internal record numbers. Every invoice with the same reference, date, method and bank account is shown together, and cancellation or confirmation applies to the full group so invoice balances remain correct.",
  },
  {
    date: "2026-07-13",
    ms: "Perubahan pada cawangan pelanggan (menambah, membuang atau menukar cawangan utama) dan harga khas produk pelanggan kini dipaparkan serta-merta selepas disimpan. Sebelum ini, perubahan tersebut boleh mengambil masa sehingga sejam untuk muncul walaupun selepas halaman dimuat semula.",
    en: "Changes to customer branches (adding, removing, or changing the main branch) and customer product custom prices now appear immediately after saving. Previously, these changes could take up to an hour to show even after refreshing the page.",
  },
  {
    date: "2026-07-13",
    ms: "Rujukan kumpulan bayaran kini boleh dibetulkan terus daripada butiran kumpulan tanpa membatalkan dan merekodkan semula bayaran. Rujukan baharu dikemas kini pada semua bayaran dan catatan jurnal berkaitan dalam kumpulan yang sama, manakala nombor cek, amaun dan baki invois tidak berubah.",
    en: "A payment group's reference can now be corrected directly from the group details without cancelling and recording the payments again. The new reference is updated across every related payment and journal entry in the same group, while cheque numbers, amounts and invoice balances remain unchanged.",
  },
  {
    date: "2026-07-13",
    ms: "Baris 'Multiple invoices' dalam Payment Management kini mempunyai butang 'Add Payment'. Butang ini membuka borang bayaran baharu dengan tarikh, kaedah, akaun bank dan rujukan yang sama supaya invois tambahan boleh direkodkan terus di bawah kumpulan rujukan tersebut.",
    en: "The 'Multiple invoices' row in Payment Management now has an 'Add Payment' button. It opens a new payment form with the same date, method, bank account and reference, so additional invoices can be recorded directly under that reference group.",
  },
  {
    date: "2026-07-13",
    ms: "Bayaran yang menggunakan rujukan yang sama kini menerangkan sebab satu bayaran tidak boleh dibatalkan secara berasingan pada Payment History dan Payment Management. Kedua-duanya menyediakan pautan ke kumpulan bayaran, semua invois berkaitan dan catatan jurnal selepas diposkan, serta pengesahan yang jelas sebelum semua bayaran dalam kumpulan dibatalkan bersama.",
    en: "Payments under the same reference now explain why one payment cannot be cancelled separately in both Payment History and Payment Management. Both provide links to the payment group, every related invoice and its journal entry once posted, with a clear confirmation before all payments in the group are cancelled together.",
  },
  {
    date: "2026-07-13",
    ms: "Permintaan pendaftaran pelanggan Green Target kini dipaparkan terus di atas senarai Customers supaya staf boleh menyemak, mencipta atau menolak permintaan tanpa membuka halaman berasingan.",
    en: "Green Target customer signup requests are now shown directly above the Customers list, so staff can review, create, or reject requests without opening a separate page.",
  },
  {
    date: "2026-07-13",
    ms: "Borang pendaftaran pelanggan Green Target kini boleh dihantar dengan betul dari greentarget.tienhock.com tanpa disekat oleh sambungan pelayan.",
    en: "The Green Target customer registration form can now be submitted correctly from greentarget.tienhock.com without being blocked by the server connection.",
  },
  {
    date: "2026-07-12",
    ms: "Borang pendaftaran pelanggan Green Target dalam talian telah ditambah — pelanggan baharu boleh mengisi nama/syarikat, no. IC/syarikat, no. telefon, alamat dan kaedah pembayaran (Tunai, Online Transfer atau QR) terus dari telefon mereka, dengan pilihan bahasa BM, Inggeris dan Cina serta kod QR DuitNow yang boleh dimuat turun. Setiap penghantaran masuk ke halaman baharu 'Signup Requests' di bawah Customers Green Target, di mana staf boleh menyemak dan mencipta pelanggan dengan satu klik.",
    en: "A new online Green Target customer registration form has been added — new customers can fill in their name/company, IC/company no., phone, address and payment method (Cash, Online Transfer or QR) straight from their phone, with a Malay/English/Chinese language switch and a downloadable DuitNow QR code. Each submission lands in a new 'Signup Requests' page under Green Target Customers, where staff can review it and create the customer with one click.",
  },
  {
    date: "2026-07-12",
    ms: "Halaman Material Purchases (senarai dan borang) telah dibuang — belian bahan kini direkodkan terus sebagai catatan jurnal jenis PUR. Halaman Material Stock kini mengambil nilai Purchases daripada jurnal yang diposkan: gunakan butang 'Mappings' baharu di halaman itu untuk memautkan kod akaun belian (contoh PU_BBER, PU_MTEP, PM_BPMS) kepada rekod stok bahan. Jumlah belian ini juga kini mengalir ke Income Statement dan laporan COGM di bawah nota Purchase of Raw Material / Purchases (Packing Material) / Purchase of Chemical.",
    en: "The Material Purchases pages (list and form) have been removed — material purchases are now keyed directly as PUR journal entries. The Material Stock page now takes its Purchases values from posted journals: use the new 'Mappings' button on that page to link purchase account codes (e.g. PU_BBER, PU_MTEP, PM_BPMS) to material stock records. These purchase amounts now also flow into the Income Statement and COGM reports under the Purchase of Raw Material / Purchases (Packing Material) / Purchase of Chemical notes.",
  },
  {
    date: "2026-07-12",
    ms: "Halaman Account Ledger kini lebih padat dan kemas: ia dibuka dengan senarai lejar yang baru dilihat untuk akses pantas, kotak carian kecil menapis transaksi lejar yang dibuka, setiap rujukan Journal boleh diklik untuk membuka catatan jurnal berkenaan, dan kedudukan skrol serta akaun dan tempoh yang dipilih diingati apabila anda kembali daripada halaman jurnal.",
    en: "The Account Ledger page is now more compact and cleaner: it opens with a list of your recently viewed ledgers for quick access, a small search box filters the transactions of an opened ledger, each Journal reference is clickable to open that journal entry, and your scroll position plus the selected account and period are remembered when you return from a journal page.",
  },
  {
    date: "2026-07-12",
    ms: "Pengarah GOH dan WONG kini kekal dipaparkan dalam kemasukan jam bulanan Office Tien Hock walaupun mereka turut berada dalam senarai gaji Green Target, supaya gaji kedua-dua syarikat boleh direkodkan. Pekerja Green Target yang lain masih dikecualikan daripada kemasukan bulanan Tien Hock untuk mengelakkan gaji berganda.",
    en: "Directors GOH and WONG now remain available in Tien Hock's monthly Office entry even while they are also on the Green Target payroll, allowing their pay from both companies to be recorded. Other Green Target employees remain excluded from Tien Hock monthly entries to prevent accidental double payroll.",
  },
  {
    date: "2026-07-12",
    ms: "Invois yang bakinya sudah RM0 (contohnya bil bernilai sifar atau invois yang diedit sehingga jumlahnya sifar) tidak lagi muncul dalam senarai 'Available Unpaid Invoices' pada borang bayaran, dan status invois kini bertukar kepada 'paid' secara automatik apabila baki mencapai sifar selepas invois diedit.",
    en: "Invoices with a RM0 balance (e.g. zero-value bills or invoices edited down to zero) no longer appear in the payment form's 'Available Unpaid Invoices' list, and an invoice's status now automatically switches to 'paid' when its balance reaches zero after an edit.",
  },
  {
    date: "2026-07-12",
    ms: "Baucar Resit Tunai kini dicetak terus (tanpa tetingkap pratonton) dan menyokong resit berkumpulan: semua invois dalam satu resit disenaraikan, rujukan Journal dan No. Cek/Pindahan dipaparkan berasingan, dan tunai yang belum dibankkan dilabel 'pending bank-in' dan bukannya didakwa sudah masuk bank.",
    en: "The Cash Receipt Voucher now prints directly (no preview window) and supports grouped receipts: every invoice in one receipt is listed, the Journal reference and Cheque/Transfer number are shown separately, and undeposited cash is labelled 'pending bank-in' instead of being claimed as already deposited.",
  },
  {
    date: "2026-07-10",
    ms: "Account Ledger kini menyokong sebarang julat tarikh, bulan penuh atau tahun penuh (termasuk pintasan 'This year'), dengan pautan yang boleh dikongsi dan PDF yang melabel tempoh dengan betul. Penyata Am penghutang dan Penyata Pelanggan kini dikira daripada lejar penghutang pelanggan: baki bawa ke hadapan (BAL B/F) mengikut baki pembukaan 1 Jun, transaksi merangkumi nota kredit/debit/bayaran balik, dan penyata bulan lepas tidak lagi berubah apabila bayaran kemudian diterima. Susunan umur hutang dikira pada tarikh akhir penyata.",
    en: "The Account Ledger now supports any date range, full month, or full year (including a 'This year' shortcut), with shareable links and PDFs that label the period correctly. The debtor General Statement and Customer Statement are now calculated from each customer's debtor ledger: the balance brought forward (BAL B/F) follows the 1 June opening balances, transactions include credit/debit/refund notes, and last month's statement no longer changes when later payments come in. Aging is calculated as at the statement end date.",
  },
  {
    date: "2026-07-10",
    ms: "Setiap pelanggan kini mempunyai lejar penghutang sendiri dalam Account Ledger: invois, bayaran, nota kredit/debit dan nota bayaran balik pelanggan itu dipaparkan dengan baki berjalan — sejarah lama turut dipindahkan. Trial Balance kekal ringkas dengan satu baris Trade Debtors (tapis jenis lejar TD untuk melihat setiap pelanggan).",
    en: "Every customer now has their own debtor ledger in Account Ledger: that customer's invoices, payments, credit/debit notes and refund notes appear with a running balance — historical activity has been migrated in too. The Trial Balance stays concise with a single Trade Debtors row (filter by ledger type TD to see each customer).",
  },
  {
    date: "2026-07-10",
    ms: "Laporan Account Ledger kini memaparkan rujukan Journal sebenar (nombor bil, nombor RV, THCN, rujukan pindahan seperti TF040626-2) dan lajur Cheque yang berasingan, dengan susunan baris dalam setiap hari mengikut cetakan buku lama. Lejar Jun 2026 telah disemak baris demi baris dengan buku lama untuk kelima-lima akaun utama.",
    en: "The Account Ledger report now shows the real Journal references (bill numbers, RV numbers, THCN, transfer references like TF040626-2) and a separate Cheque column, with rows within each day ordered exactly like the legacy book's printout. The June 2026 ledgers have been verified row-by-row against the legacy books for all five core accounts.",
  },
  {
    date: "2026-07-10",
    ms: "Nota Kredit kini mengurangkan lejar jualan asal (CREDIT SALES atau CASH SALES) dan bukannya akaun pulangan berasingan, dan Nota Debit menambah kepada lejar jualan yang sama. Catatan perakaunan nota pelarasan kini memaparkan nombor dokumen sebenar (contoh THCN/26/17) pada tarikh dokumen itu sendiri; nota kredit lama telah diselaraskan dengan buku lama supaya lejar CREDIT SALES Jun sepadan.",
    en: "Credit Notes now reduce the original sales ledger (CREDIT SALES or CASH SALES) instead of a separate returns account, and Debit Notes add to the same sales ledger. Adjustment note accounting entries now show the real document number (e.g. THCN/26/17) on the document's own date; the older credit notes have been aligned with the legacy book so the June CREDIT SALES ledger matches.",
  },
  {
    date: "2026-07-10",
    ms: "Halaman baharu Accounting > Cash Bank-In (RV): pilih tunai belum bank daripada kutipan jualan tunai harian (CH.REV 1) atau resit tunai invois kredit (CH.REV 2), masukkan jumlah separa jika perlu, dan sistem menjana nombor RV bulanan secara automatik (boleh diubah) serta catatan bank yang lengkap. Bank-in Jun 2026 daripada buku lama (RV001/06 hingga RV081/06) telah diimport, jadi lejar CH.REV dan bank kini sepadan dengan cetakan lama.",
    en: "New page Accounting > Cash Bank-In (RV): pick undeposited cash from daily cash-sales collections (CH.REV 1) or credit-invoice cash receipts (CH.REV 2), enter partial amounts when needed, and the system generates the monthly RV number automatically (editable) with the complete bank entry. The June 2026 bank-ins from the legacy book (RV001/06 to RV081/06) have been imported, so the CH.REV and bank ledgers now match the old printouts.",
  },
  {
    date: "2026-07-10",
    ms: "Rekod bayaran pelanggan Tien Hock kini disimpan sebagai satu resit berkumpulan: satu bayaran boleh meliputi beberapa invois dan pelanggan sekaligus, dengan satu catatan perakaunan yang lengkap. Tunai yang diterima untuk invois kredit kini kekal dalam akaun tunai belum bank sehingga dibankkan, cek berstatus tertunda tidak lagi mengubah baki sehingga ia tunai, dan bil tunai membawa catatan perakaunan pada tarikh bil itu sendiri. Lejar CASH SALES, CH.REV dan bank kini sepadan dengan buku lama untuk bulan Jun.",
    en: "Tien Hock customer payments are now saved as one grouped receipt: a single payment can cover several invoices and customers at once, with one complete accounting entry. Cash received for credit invoices now stays in the undeposited-cash account until it is banked in, pending cheques no longer change balances until they clear, and cash bills carry their accounting entry on the bill's own date. The CASH SALES, CH.REV and bank ledgers now match the legacy books for June.",
  },
  {
    date: "2026-07-10",
    ms: "Halaman Payroll dan Salary Report Jelly Polly kini menggunakan susun atur yang lebih kemas seperti Tien Hock, termasuk ringkasan gaji, jadual laporan gaji, pemilih tahun yang lebih mudah, butiran potongan dalam Deductions & Final Pay, ringkasan Pinjam, menu cetak slip mengikut bahagian, dan cetakan slip gaji yang menggunakan data Jelly Polly dengan betul.",
    en: "Jelly Polly Payroll and Salary Report now use a cleaner layout like Tien Hock, including payroll summaries, salary report tables, an easier year picker, deduction details in Deductions & Final Pay, the Pinjam summary, section-based payslip printing, and payslips that correctly use Jelly Polly data.",
  },
  {
    date: "2026-07-10",
    ms: "Semasa mengisi Journal Entry, Account Code baharu kini boleh ditambah terus dari pilihan Account. Selepas disimpan, akaun baharu itu terus dipilih pada baris journal yang sedang diisi.",
    en: "While entering a Journal Entry, a new Account Code can now be added directly from the Account picker. After saving, the new account is selected immediately on the journal line you were filling in.",
  },
  {
    date: "2026-07-09",
    ms: "Halaman Material Stock kini boleh menyimpan satu baris sahaja untuk bahan, varian dan Stock Kilang tanpa mengganggu perubahan lain yang belum disimpan. Tajuk halaman dan tajuk jadual juga kekal kelihatan semasa menatal, dan susunan bahan serta varian boleh diubah dengan drag-and-drop.",
    en: "The Material Stock page can now save one material, variant or Stock Kilang row at a time without disturbing other unsaved changes. The page and table headers also stay visible while scrolling, and material and variant order can be changed with drag-and-drop.",
  },
  {
    date: "2026-07-09",
    ms: "Stok Kilang dalam halaman Material Stock kini boleh dilaraskan terus. Masukkan kuantiti tambah atau tolak, kemudian Save; pelarasan itu disimpan dalam rekod stok produk dan jumlah penutup dikira semula.",
    en: "Stock Kilang on the Material Stock page can now be adjusted directly. Enter a plus or minus quantity, then Save; the adjustment is stored in product stock records and the closing total is recalculated.",
  },
  {
    date: "2026-07-09",
    ms: "Pembetulan pelanggan dan Account Codes: selepas pelanggan disimpan atau dipadam, senarai akaun Trade Debtors kini dikemas kini serta-merta tanpa perlu muat semula halaman.",
    en: "Customer and Account Codes fix: after a customer is saved or deleted, the Trade Debtors account list now refreshes immediately without needing a page reload.",
  },
  {
    date: "2026-07-09",
    ms: "Pembetulan Payroll dan laporan Pinjam: jumlah Gaji/Genap kini menolak komisen/bonus yang sudah dibayar tanpa dibundarkan sekali lagi, supaya pecahan jumlah bawa pulang dan advance tambah tepat.",
    en: "Payroll and Pinjam report fix: the Gaji/Genap total now subtracts already-paid commission/bonus advances without rounding it a second time, so the take-home and advance breakdown adds up correctly.",
  },
  {
    date: "2026-07-09",
    ms: "Pembetulan Salary Report: kiraan lajur GAJI kini menggunakan kaedah pembundaran sen yang sama seperti proses gaji, supaya GAJI dan G. KASAR sepadan tanpa perbezaan 1-4 sen.",
    en: "Salary Report fix: the GAJI column now uses the same cent-rounding method as payroll processing, so GAJI and G. KASAR match without 1-4 sen differences.",
  },
  {
    date: "2026-07-09",
    ms: "Nota Kredit, Nota Debit dan Nota Bayaran Balik kini boleh disimpan mengikut tarikh dokumen sebenar. Pilih tarikh dokumen sebelum Create; halaman butiran juga memaparkan tarikh dokumen dan masa ia dimasukkan secara berasingan.",
    en: "Credit Notes, Debit Notes and Refund Notes can now be saved using the actual document date. Pick the document date before Create; the details page now shows the document date separately from when it was keyed in.",
  },
  {
    date: "2026-07-09",
    ms: "Pelarasan Stok Produk kini boleh disimpan mengikut tarikh pelarasan sebenar. Pilih tarikh di bahagian atas halaman sebelum Save; rujukan lama yang sebelum ini tersimpan pada hujung bulan dikemas kini mengikut tarikh ia dimasukkan.",
    en: "Product Stock Adjustments can now be saved using the actual adjustment date. Pick the date at the top of the page before saving; older references that were previously stored at month-end have been updated to the date they were entered.",
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
      // Follow the app language; changelog entries only exist in ms/en,
      // so 简体中文 falls back to English (docs/I18N_HANDOVER.md §8).
      const appLanguage = i18n.resolvedLanguage || i18n.language;
      setLanguage(appLanguage === "en" || appLanguage === "zh-Hans" ? "en" : "ms");
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
