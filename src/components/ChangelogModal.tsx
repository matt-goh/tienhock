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
