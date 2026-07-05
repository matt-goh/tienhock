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
