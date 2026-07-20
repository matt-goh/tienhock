// src/components/Accounting/ReportSourceGuide.tsx
// "Guide" button + modal for the financial report pages (Trial Balance, Income
// Statement, Balance Sheet, CoGM). Explains, in plain BM/EN, where every amount
// on the report comes from and what is NOT included yet.
import React, { Fragment, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconHelpCircle, IconX } from "@tabler/icons-react";
import Button from "../Button";

type ReportKind = "trial_balance" | "income_statement" | "balance_sheet" | "cogm";
type Lang = "ms" | "en";

interface SourceRow {
  label: string;
  detail: string;
}

interface GuideText {
  title: string;
  intro: string;
  sourcesHeading: string;
  sources: SourceRow[];
  missingHeading: string;
  missing: string[];
  footer: string;
}

const GUIDE_CONTENT: Record<ReportKind, Record<Lang, GuideText>> = {
  trial_balance: {
    ms: {
      title: "Dari mana angka-angka ini datang?",
      intro:
        "Senarai ini menunjukkan baki setiap akaun setakat akhir bulan yang dipilih. Sistem menggunakan baki pembukaan terkini, kemudian menambah semua catatan jurnal selepas tarikh baki itu. Akaun tanpa baki pembukaan bermula dari 1 Januari.",
      sourcesHeading: "Sumber angka",
      sources: [
        {
          label: "Invois jualan",
          detail:
            "Setiap invois/bil tunai yang dibuat menambah jumlah Jualan dan hutang pelanggan.",
        },
        {
          label: "Bayaran pelanggan",
          detail:
            "Resit bayaran menambah wang di bank/tunai dan mengurangkan hutang pelanggan.",
        },
        {
          label: "Invois belian bahan (Purchases)",
          detail:
            "Belian beras, tepung, bahan bungkusan dll. menambah jumlah Belian dan hutang kepada pembekal.",
        },
        {
          label: "Belian am (General Purchases)",
          detail:
            "Belian luar negara / Shopee / pembekal tempatan masuk ke akaun perbelanjaan yang dipilih semasa merekod.",
        },
        {
          label: "Bayaran kepada pembekal",
          detail:
            "Mengurangkan hutang pembekal dan wang di bank.",
        },
        {
          label: "Baucar gaji bulanan",
          detail:
            "Gaji, KWSP, PERKESO dan SIP setiap lokasi kerja direkod melalui halaman Voucher Generator.",
        },
        {
          label: "Bayaran gaji dari bank",
          detail:
            "Halaman Payroll Bank Payment merekod wang keluar dari bank untuk gaji dan caruman.",
        },
        {
          label: "Nota kredit/debit/refund",
          detail: "Pelarasan jualan mengurangkan jualan dan hutang pelanggan.",
        },
        {
          label: "Catatan manual (Journal Entries)",
          detail:
            "Perkara lain — caj bank, pinjaman, akaun pengarah dll. — direkod sendiri di halaman Journal Entries.",
        },
      ],
      missingHeading: "Belum termasuk",
      missing: [
        "Akaun tanpa baki pembukaan akan menunjukkan pergerakan dari 1 Januari sahaja.",
        "Stok awal 1 Januari telah dimasukkan. Nilai stok akhir bulanan dan susut nilai belum direkodkan secara automatik.",
      ],
      footer:
        "Setiap akaun ditanda dengan nombor Nota. Laporan penyata (Untung Rugi, Kunci Kira-kira, CoGM) menjumlahkan akaun mengikut Nota ini.",
    },
    en: {
      title: "Where do these numbers come from?",
      intro:
        "This list shows each account balance as at the end of the selected month. The latest opening balance is used, then all journal entries from that date are added. Accounts without an opening balance start from 1 January.",
      sourcesHeading: "Where the amounts come from",
      sources: [
        {
          label: "Sales invoices",
          detail:
            "Every invoice/cash bill created adds to Sales and to what customers owe.",
        },
        {
          label: "Customer payments",
          detail:
            "Payment receipts add money to bank/cash and reduce what customers owe.",
        },
        {
          label: "Material purchase invoices (Purchases)",
          detail:
            "Purchases of rice, flour, packing material etc. add to Purchases and to what we owe suppliers.",
        },
        {
          label: "General Purchases",
          detail:
            "Overseas / Shopee / local supplier purchases go to the expense account chosen when recording.",
        },
        {
          label: "Supplier payments",
          detail: "Reduce what we owe suppliers and the money in the bank.",
        },
        {
          label: "Monthly payroll vouchers",
          detail:
            "Salaries, EPF, SOCSO and SIP for each work location are recorded via the Voucher Generator page.",
        },
        {
          label: "Payroll bank payments",
          detail:
            "The Payroll Bank Payment page records money leaving the bank for salaries and contributions.",
        },
        {
          label: "Credit/debit/refund notes",
          detail: "Sales adjustments reduce sales and what customers owe.",
        },
        {
          label: "Manual entries (Journal Entries)",
          detail:
            "Everything else — bank charges, loans, director accounts etc. — is keyed in on the Journal Entries page.",
        },
      ],
      missingHeading: "Not included yet",
      missing: [
        "Accounts without an opening balance show movement from 1 January only.",
        "Opening stock at 1 January is included. Monthly closing stock and depreciation are not recorded automatically yet.",
      ],
      footer:
        "Every account is tagged with a Note number. The statement reports (Income Statement, Balance Sheet, CoGM) add up accounts by these Notes.",
    },
  },
  income_statement: {
    ms: {
      title: "Dari mana angka-angka ini datang?",
      intro:
        "Laporan ini mengira untung/rugi dari 1 Januari hingga akhir bulan yang dipilih.",
      sourcesHeading: "Sumber angka",
      sources: [
        {
          label: "Jualan (Nota 7)",
          detail:
            "Daripada catatan jurnal jualan dan pelarasan yang telah dipos ke akaun di bawah Nota 7.",
        },
        {
          label: "Belian bahan mentah",
          detail:
            "Daripada invois pembekal yang direkod di halaman Purchases (beras, tepung, sago dll.).",
        },
        {
          label: "Stok awal 1 Januari",
          detail:
            "Nilai stok awal produk siap, bahan mentah dan bahan bungkusan yang telah disahkan dimasukkan sekali daripada baki pembukaan 1 Januari.",
        },
        {
          label: "Gaji pekerja kilang",
          detail:
            "Daripada baucar gaji bulanan (Voucher Generator) — bahagian mesin, bungkusan dan boiler.",
        },
        {
          label: "Perbelanjaan pentadbiran",
          detail:
            "Gaji pejabat/salesman, belian am, elektrik & air, caj bank dan catatan manual yang lain.",
        },
      ],
      missingHeading: "Belum termasuk",
      missing: [
        "Nilai stok akhir bulanan — untung kasar sebenar masih perlu menolak stok akhir.",
        "Susut nilai (Nota 15) dan faedah sewa beli (Nota 23) — belum ada sistem automatik.",
        "Angka tahun lepas untuk perbandingan.",
      ],
      footer:
        "Jika sesuatu perbelanjaan tidak muncul di sini, kemungkinan ia belum direkod — semak halaman Purchases, General Purchases, atau Journal Entries.",
    },
    en: {
      title: "Where do these numbers come from?",
      intro:
        "This report calculates profit/loss from 1 January to the end of the selected month.",
      sourcesHeading: "Where the amounts come from",
      sources: [
        {
          label: "Sales (Note 7)",
          detail:
            "From posted sales and adjustment journal entries mapped to accounts under Note 7.",
        },
        {
          label: "Raw material purchases",
          detail:
            "From supplier invoices recorded on the Purchases page (rice, flour, sago etc.).",
        },
        {
          label: "Opening stock at 1 January",
          detail:
            "The confirmed opening values for finished goods, raw materials and packing materials are included once from the exact 1 January opening balances.",
        },
        {
          label: "Factory worker salaries",
          detail:
            "From the monthly payroll vouchers (Voucher Generator) — machine, packing and boiler sections.",
        },
        {
          label: "Administrative expenses",
          detail:
            "Office/salesman salaries, general purchases, electricity & water, bank charges and other manual entries.",
        },
      ],
      missingHeading: "Not included yet",
      missing: [
        "Monthly closing stock — true gross profit still needs the closing value deducted.",
        "Depreciation (Note 15) and hire purchase interest (Note 23) — no automatic system yet.",
        "Last year's figures for comparison.",
      ],
      footer:
        "If an expense doesn't appear here, it probably hasn't been recorded — check the Purchases, General Purchases, or Journal Entries pages.",
    },
  },
  balance_sheet: {
    ms: {
      title: "Dari mana angka-angka ini datang?",
      intro:
        "Laporan ini menunjukkan kedudukan syarikat (harta, hutang, modal) setakat akhir bulan yang dipilih. Setiap akaun menggunakan baki pembukaan terkini dan catatan jurnal selepas tarikh baki itu.",
      sourcesHeading: "Sumber angka",
      sources: [
        {
          label: "Wang di bank (Nota 19)",
          detail:
            "Baki pembukaan bank, ditambah wang masuk dan ditolak bayaran keluar yang telah dipos.",
        },
        {
          label: "Wang tunai di tangan (Nota 6)",
          detail:
            "Jualan tunai yang diterima tetapi belum dibankkan masuk.",
        },
        {
          label: "Hutang pelanggan (Nota 22)",
          detail:
            "Daripada baki pembukaan dan catatan jurnal setiap akaun pelanggan, termasuk invois, resit dan pelarasan.",
        },
        {
          label: "Hutang kepada pembekal (Nota 13)",
          detail:
            "Invois pembekal yang direkod tetapi belum dibayar penuh.",
        },
        {
          label: "Akruan gaji (Nota 1)",
          detail:
            "Gaji/KWSP/PERKESO yang sudah dikira tetapi belum dibayar, daripada baucar gaji.",
        },
        {
          label: "Untung tahun semasa",
          detail:
            "Untung atau rugi dari 1 Januari hingga akhir bulan menggabungkan stok awal 1 Januari yang disahkan dengan catatan jurnal Jualan, CoGM dan Perbelanjaan, kemudian dimasukkan ke Modal.",
        },
      ],
      missingHeading: "Masih perlu direkod atau disahkan",
      missing: [
        "Akaun tanpa baki pembukaan akan bermula dari 1 Januari sahaja.",
        "Perubahan nilai stok selepas baki pembukaan (Nota 14) belum direkod secara automatik.",
        "Susut nilai selepas baki pembukaan (Nota 4/15) masih perlu direkod melalui jurnal.",
      ],
      footer:
        "Angka laporan datang daripada baki pembukaan dan jurnal yang telah dipos, bukan terus daripada status invois semasa.",
    },
    en: {
      title: "Where do these numbers come from?",
      intro:
        "This report shows the company's position (assets, debts, capital) as at the end of the selected month. Each account uses its latest opening balance and the journal entries posted from that date onward.",
      sourcesHeading: "Where the amounts come from",
      sources: [
        {
          label: "Money at bank (Note 19)",
          detail:
            "The bank opening balance, plus posted money in and minus posted payments out.",
        },
        {
          label: "Cash in hand (Note 6)",
          detail: "Cash sales received but not yet banked in.",
        },
        {
          label: "Customers owing us (Note 22)",
          detail:
            "From each customer's opening balance and posted journal entries, including invoices, receipts and adjustments.",
        },
        {
          label: "Owing to suppliers (Note 13)",
          detail: "Supplier invoices recorded but not yet fully paid.",
        },
        {
          label: "Salary accruals (Note 1)",
          detail:
            "Salaries/EPF/SOCSO already calculated but not yet paid, from the payroll vouchers.",
        },
        {
          label: "Current Year Profit",
          detail:
            "Profit or loss from 1 January to the selected month end combines the confirmed 1 January opening stock with posted Sales, CoGM and Expense journals, then includes it in Equity.",
        },
      ],
      missingHeading: "Still to be recorded or confirmed",
      missing: [
        "Accounts without an opening balance start from 1 January only.",
        "Stock-value changes after the opening balance (Note 14) are not posted automatically yet.",
        "Depreciation after the opening balance (Notes 4/15) still needs a journal entry.",
      ],
      footer:
        "Report amounts come from opening balances and posted journals, not directly from current invoice statuses.",
    },
  },
  cogm: {
    ms: {
      title: "Dari mana angka-angka ini datang?",
      intro:
        "Laporan ini mengumpul kos untuk mengeluarkan produk (mee, bihun) dari 1 Januari hingga akhir bulan yang dipilih.",
      sourcesHeading: "Sumber angka",
      sources: [
        {
          label: "Belian bahan mentah",
          detail:
            "Invois pembekal di halaman Purchases — beras, tepung, sago, jagung dll.",
        },
        {
          label: "Belian bahan bungkusan",
          detail:
            "Invois pembekal untuk plastik/kotak (kategori packing material).",
        },
        {
          label: "Stok awal bahan pada 1 Januari",
          detail:
            "Nilai bahan mentah dan bahan bungkusan yang telah disahkan dimasukkan sekali daripada baki pembukaan 1 Januari.",
        },
        {
          label: "Gaji pekerja kilang",
          detail:
            "Baucar gaji bulanan — bahagian mesin mee/bihun, bungkusan dan jaga boiler.",
        },
      ],
      missingHeading: "Belum termasuk",
      missing: [
        "Stok akhir bulanan bahan mentah dan bahan bungkusan belum dimasukkan.",
        "Tambang pengangkutan bahan masuk (Nota 3-6) — perlu direkod manual buat masa ini.",
        "Belian bahan kimia (Nota 3-4) jika belum direkod di Purchases.",
      ],
      footer:
        "Angka di sini merangkumi stok awal dan pergerakan kos yang direkod. Stok akhir bulanan masih perlu ditolak untuk kos bahan terpakai yang lengkap.",
    },
    en: {
      title: "Where do these numbers come from?",
      intro:
        "This report collects the costs of producing goods (mee, bihun) from 1 January to the end of the selected month.",
      sourcesHeading: "Where the amounts come from",
      sources: [
        {
          label: "Raw material purchases",
          detail:
            "Supplier invoices on the Purchases page — rice, flour, sago, corn etc.",
        },
        {
          label: "Packing material purchases",
          detail:
            "Supplier invoices for plastic/boxes (packing material category).",
        },
        {
          label: "Material opening stock at 1 January",
          detail:
            "The confirmed raw-material and packing-material values are included once from the exact 1 January opening balances.",
        },
        {
          label: "Factory worker salaries",
          detail:
            "Monthly payroll vouchers — mee/bihun machine, packing and boiler sections.",
        },
      ],
      missingHeading: "Not included yet",
      missing: [
        "Monthly closing raw-material and packing-material stock is not included yet.",
        "Freight in on materials (Note 3-6) — has to be keyed manually for now.",
        "Chemical purchases (Note 3-4) if not recorded in Purchases.",
      ],
      footer:
        "These figures include opening stock and recorded cost movement. Monthly closing stock still needs to be deducted for the complete cost of materials used.",
    },
  },
};

interface ReportSourceGuideProps {
  report: ReportKind;
}

const ReportSourceGuide: React.FC<ReportSourceGuideProps> = ({ report }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("report_guide_lang") as Lang) || "ms"
  );

  const content = GUIDE_CONTENT[report][lang];

  const handleLangChange = (newLang: Lang): void => {
    setLang(newLang);
    localStorage.setItem("report_guide_lang", newLang);
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        additionalClasses="flex-shrink-0"
      >
        <span className="flex items-center justify-center whitespace-nowrap">
          <IconHelpCircle className="h-4 w-4 mr-2" />
          {lang === "ms" ? "Panduan" : "Guide"}
        </span>
      </Button>

      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsOpen(false)}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-xl bg-white dark:bg-gray-800 shadow-xl transition-all">
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                      {content.title}
                    </DialogTitle>
                    <div className="flex items-center gap-3">
                      {/* Language toggle */}
                      <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => handleLangChange("ms")}
                          className={`px-2.5 py-1 ${
                            lang === "ms"
                              ? "bg-sky-500 text-white"
                              : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                          }`}
                        >
                          BM
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLangChange("en")}
                          className={`px-2.5 py-1 ${
                            lang === "en"
                              ? "bg-sky-500 text-white"
                              : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                          }`}
                        >
                          EN
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <IconX className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-6 py-4 max-h-[70vh] overflow-y-auto space-y-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {content.intro}
                    </p>

                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                        {content.sourcesHeading}
                      </h4>
                      <ul className="space-y-2">
                        {content.sources.map((source) => (
                          <li
                            key={source.label}
                            className="flex gap-2 text-sm"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {source.label}
                              </span>
                              {" — "}
                              {source.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-3">
                      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                        {content.missingHeading}
                      </h4>
                      <ul className="space-y-1.5">
                        {content.missing.map((item) => (
                          <li key={item} className="flex gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                            <span className="text-amber-800 dark:text-amber-200">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {content.footer}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <Button onClick={() => setIsOpen(false)} variant="outline">
                      {lang === "ms" ? "Tutup" : "Close"}
                    </Button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

export default ReportSourceGuide;
