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
    ms: "Kalendar Cuti kini ada kotak semak \"Cuti Umum\" — kelayakan tahunan Cuti Umum setiap pekerja dikira secara automatik daripada tarikh yang ditandakan.",
    en: "The Holiday Calendar now has a \"Cuti Umum\" checkbox — each staff member's yearly Cuti Umum allowance is calculated automatically from the dates you tick.",
  },
  {
    date: "2026-05-18",
    ms: "\"Commission\" ditukar nama menjadi \"Others (Advance)\".",
    en: "\"Commission\" has been renamed to \"Others (Advance)\".",
  },
  {
    date: "2026-05-18",
    ms: "Modal \"Tambah Cuti\" baharu — boleh menambah cuti untuk ramai pekerja sekaligus.",
    en: "New \"Add Leave\" dialog — you can add leave for multiple staff at once.",
  },
  {
    date: "2026-05-18",
    ms: "Butang \"Set Semua\" cuti telah ditambah ke semua halaman Log Harian.",
    en: "A \"Set All\" leave button has been added to every Daily Log page.",
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
    ms: "\"Self Billed Invoice\" telah dinaik taraf menjadi \"General Purchase\" — pembelian tempatan turut disokong sekarang.",
    en: "\"Self Billed Invoice\" has been upgraded to \"General Purchase\" — local purchases are now supported too.",
  },
  {
    date: "2026-05-18",
    ms: "Pembelian bahan kini berkait terus dengan stok.",
    en: "Material purchases are now linked directly to stock.",
  },
  {
    date: "2026-05-18",
    ms: "Mod Gelap (Dark Mode) kini tersedia — togolnya berada dalam menu pengguna di sebelah kanan atas.",
    en: "Dark Mode is now available — the toggle lives in the user menu at the top right.",
  },
];

const MONTH_NAMES: Record<Language, string[]> = {
  ms: [
    "Januari", "Februari", "Mac", "April", "Mei", "Jun",
    "Julai", "Ogos", "September", "Oktober", "November", "Disember",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
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
            <DialogPanel className="inline-block w-full max-w-2xl p-6 my-4 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl">
              <div className="flex justify-between items-center">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  {labels.title}
                </DialogTitle>
                {renderToggle()}
              </div>

              <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
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

              <div className="mt-6 flex justify-end">
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
