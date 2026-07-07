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
        "Senarai ini menunjukkan jumlah pergerakan setiap akaun dari 1 Januari hingga akhir bulan yang dipilih. Setiap kali sesuatu direkod dalam sistem, ia masuk ke akaun berkenaan secara automatik.",
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
        "Baki tahun lepas (baki pembukaan) — laporan bermula dari 1 Januari sahaja.",
        "Nilai stok (stok awal / stok akhir) dan susut nilai — belum direkodkan secara automatik.",
      ],
      footer:
        "Setiap akaun ditanda dengan nombor Nota. Laporan penyata (Untung Rugi, Kunci Kira-kira, CoGM) menjumlahkan akaun mengikut Nota ini.",
    },
    en: {
      title: "Where do these numbers come from?",
      intro:
        "This list shows the total movement of every account from 1 January to the end of the selected month. Whenever something is recorded in the system, it lands in the matching account automatically.",
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
        "Last year's balances (opening balances) — the report starts from 1 January only.",
        "Stock values (opening/closing stock) and depreciation — not recorded automatically yet.",
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
            "Diambil terus daripada semua invois jualan (bil tunai + invois kredit), sebelum cukai dan pembundaran.",
        },
        {
          label: "Belian bahan mentah",
          detail:
            "Daripada invois pembekal yang direkod di halaman Purchases (beras, tepung, sago dll.).",
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
        "Nilai stok awal dan stok akhir — untung kasar sebenar perlu campur/tolak nilai stok.",
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
            "Taken directly from all sales invoices (cash bills + credit invoices), before tax and rounding.",
        },
        {
          label: "Raw material purchases",
          detail:
            "From supplier invoices recorded on the Purchases page (rice, flour, sago etc.).",
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
        "Opening and closing stock values — true gross profit needs the stock movement added/subtracted.",
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
        "Laporan ini menunjukkan kedudukan syarikat (harta, hutang, modal) setakat akhir bulan yang dipilih, berdasarkan semua rekod dari 1 Januari tahun ini.",
      sourcesHeading: "Sumber angka",
      sources: [
        {
          label: "Wang di bank (Nota 19)",
          detail:
            "Semua bayaran pelanggan masuk bank, tolak bayaran keluar (pembekal, gaji, catatan manual).",
        },
        {
          label: "Wang tunai di tangan (Nota 6)",
          detail:
            "Jualan tunai yang diterima tetapi belum dibankkan masuk.",
        },
        {
          label: "Hutang pelanggan (Nota 22)",
          detail:
            "Diambil terus daripada baki invois yang belum dibayar.",
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
      ],
      missingHeading: "Belum termasuk — sebab itu laporan ini belum seimbang",
      missing: [
        "Baki tahun lepas (baki pembukaan) untuk semua akaun — bank, harta tetap, pinjaman, modal saham dan untung tertahan. Tanpa ini, Harta ≠ Hutang + Modal.",
        "Nilai stok akhir (Nota 14).",
        "Harta tetap dan susut nilai terkumpul (Nota 4).",
        "Untung tahun semasa belum dipindahkan ke bahagian modal.",
      ],
      footer:
        "Buat masa ini gunakan laporan ini untuk melihat pergerakan tahun semasa sahaja. Ia akan seimbang selepas baki pembukaan dimasukkan.",
    },
    en: {
      title: "Where do these numbers come from?",
      intro:
        "This report shows the company's position (assets, debts, capital) as at the end of the selected month, based on everything recorded since 1 January this year.",
      sourcesHeading: "Where the amounts come from",
      sources: [
        {
          label: "Money at bank (Note 19)",
          detail:
            "All customer payments into the bank, minus payments out (suppliers, salaries, manual entries).",
        },
        {
          label: "Cash in hand (Note 6)",
          detail: "Cash sales received but not yet banked in.",
        },
        {
          label: "Customers owing us (Note 22)",
          detail: "Taken directly from unpaid invoice balances.",
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
      ],
      missingHeading: "Not included yet — why this report doesn't balance",
      missing: [
        "Last year's balances (opening balances) for every account — bank, fixed assets, loans, share capital and retained profit. Without these, Assets ≠ Liabilities + Equity.",
        "Closing stock values (Note 14).",
        "Fixed assets and accumulated depreciation (Note 4).",
        "This year's profit is not yet carried into the equity section.",
      ],
      footer:
        "For now, use this report to see the current year's movement only. It will balance once opening balances are entered.",
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
          label: "Gaji pekerja kilang",
          detail:
            "Baucar gaji bulanan — bahagian mesin mee/bihun, bungkusan dan jaga boiler.",
        },
      ],
      missingHeading: "Belum termasuk",
      missing: [
        "Stok awal dan stok akhir bahan — kos sebenar bahan terpakai perlu ambil kira stok.",
        "Tambang pengangkutan bahan masuk (Nota 3-6) — perlu direkod manual buat masa ini.",
        "Belian bahan kimia (Nota 3-4) jika belum direkod di Purchases.",
      ],
      footer:
        "Angka di sini ialah jumlah belian, bukan jumlah bahan terpakai. Ia akan lebih tepat selepas sistem nilai stok disambungkan.",
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
          label: "Factory worker salaries",
          detail:
            "Monthly payroll vouchers — mee/bihun machine, packing and boiler sections.",
        },
      ],
      missingHeading: "Not included yet",
      missing: [
        "Opening and closing material stock — the true cost of materials used must account for stock.",
        "Freight in on materials (Note 3-6) — has to be keyed manually for now.",
        "Chemical purchases (Note 3-4) if not recorded in Purchases.",
      ],
      footer:
        "The figures here are purchase totals, not materials actually used. They will become more accurate once stock values are connected.",
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
