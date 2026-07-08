// src/components/Accounting/SelfBilledEligibilityDialog.tsx
import React, { useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconAlertTriangle } from "@tabler/icons-react";
import Button from "../Button";

type Language = "ms" | "en";

interface SelfBilledEligibilityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
}

const CONTENT: Record<
  Language,
  { title: string; intro: string; items: string[]; note: string; confirm: string; cancel: string }
> = {
  en: {
    title: "Confirm self-billed e-Invoice eligibility",
    intro:
      "A self-billed e-Invoice may only be issued when the supplier falls under one of the circumstances below (IRBM e-Invoice Specific Guideline, s.8.3). Please confirm the supplier qualifies before submitting to MyInvois.",
    items: [
      "Payments to agents, dealers or distributors",
      "Goods sold or services rendered by foreign suppliers",
      "Profit distribution (e.g. dividend distribution)",
      "E-commerce transactions",
      "Pay-outs to all betting and gaming winners",
      "Transactions with individuals who are not conducting a business",
      "Interest payments (subject to the guideline's exceptions)",
      "Claim, compensation or benefit payments from an insurer",
      "Capital reduction, share buyback, return of capital or liquidation proceeds",
    ],
    note: "By submitting, you confirm this purchase falls under one of the above and the supplier's TIN / identification details entered are correct.",
    confirm: "Confirm & Submit",
    cancel: "Cancel",
  },
  ms: {
    title: "Sahkan kelayakan e-Invois bil sendiri",
    intro:
      "e-Invois bil sendiri hanya boleh dikeluarkan apabila pembekal termasuk dalam salah satu keadaan di bawah (Garis Panduan Khusus e-Invois LHDN, s.8.3). Sila sahkan pembekal layak sebelum menghantar ke MyInvois.",
    items: [
      "Bayaran kepada ejen, wakil atau pengedar",
      "Barang dijual atau perkhidmatan diberikan oleh pembekal luar negara",
      "Pengagihan keuntungan (cth. pengagihan dividen)",
      "Transaksi e-dagang (e-commerce)",
      "Bayaran kepada semua pemenang pertaruhan dan perjudian",
      "Transaksi dengan individu yang tidak menjalankan perniagaan",
      "Bayaran faedah (tertakluk kepada pengecualian dalam garis panduan)",
      "Tuntutan, pampasan atau bayaran manfaat daripada syarikat insurans",
      "Pengurangan modal, belian balik saham, pemulangan modal atau hasil pembubaran",
    ],
    note: "Dengan menghantar, anda mengesahkan pembelian ini termasuk dalam salah satu di atas dan butiran TIN / pengenalan pembekal yang dimasukkan adalah betul.",
    confirm: "Sahkan & Hantar",
    cancel: "Batal",
  },
};

const SelfBilledEligibilityDialog: React.FC<SelfBilledEligibilityDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
}) => {
  const [language, setLanguage] = useState<Language>("en");
  const content = CONTENT[language];

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={submitting ? () => {} : onClose}>
        <TransitionChild
          as={React.Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-lg transform overflow-hidden rounded-lg bg-white p-5 text-left align-middle shadow-xl transition-all dark:bg-gray-800">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <IconAlertTriangle
                      size={22}
                      className="mt-0.5 shrink-0 text-amber-500"
                    />
                    <DialogTitle
                      as="h3"
                      className="text-base font-semibold text-default-900 dark:text-gray-100"
                    >
                      {content.title}
                    </DialogTitle>
                  </div>
                  <div className="flex shrink-0 overflow-hidden rounded-lg border border-default-300 text-xs font-medium dark:border-gray-600">
                    {(["en", "ms"] as Language[]).map((lang: Language) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguage(lang)}
                        className={`px-2.5 py-1 transition-colors ${
                          language === lang
                            ? "bg-sky-600 text-white"
                            : "bg-white text-default-600 hover:bg-default-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        }`}
                      >
                        {lang === "en" ? "EN" : "BM"}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-sm text-default-600 dark:text-gray-300">
                  {content.intro}
                </p>

                <ul className="mt-3 space-y-1.5 rounded-lg border border-default-200 bg-default-50/60 p-3 text-sm text-default-700 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-200">
                  {content.items.map((item: string, index: number) => (
                    <li key={index} className="flex gap-2">
                      <span className="shrink-0 font-medium text-sky-600 dark:text-sky-300">
                        {index + 1}.
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-3 text-xs text-default-500 dark:text-gray-400">
                  {content.note}
                </p>

                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                    disabled={submitting}
                  >
                    {content.cancel}
                  </Button>
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    size="sm"
                    onClick={onConfirm}
                    disabled={submitting}
                  >
                    {submitting ? "..." : content.confirm}
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default SelfBilledEligibilityDialog;
