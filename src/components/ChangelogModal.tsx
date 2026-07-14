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
  {
    date: "2026-07-08",
    ms: "Senarai Trade Debtors dalam Account Ledger kini sentiasa ikut senarai pelanggan. Pelanggan baharu akan muncul automatik, nama pelanggan yang ditukar akan dikemas kini, dan pelanggan lama yang sebelum ini tiada dalam senarai telah ditambah.",
    en: "The Trade Debtors list in Account Ledger now stays in sync with the customer list. New customers appear automatically, renamed customers update there too, and older customers that were missing have been added.",
  },
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
