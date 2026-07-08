// src/components/Accounting/SellerTypeHelpDialog.tsx
import React, { useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconHelpCircle } from "@tabler/icons-react";
import Button from "../Button";

type Language = "ms" | "en";

interface SellerTypeHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SellerTypeHelp {
  name: string;
  who: string;
  tin: string;
}

const CONTENT: Record<
  Language,
  { title: string; intro: string; whoLabel: string; tinLabel: string; types: SellerTypeHelp[]; close: string }
> = {
  en: {
    title: "Which seller type do I pick?",
    intro:
      "Pick the option that matches how the supplier identifies themselves. The TIN and identification number are then filled to match IRBM's self-billed rules.",
    whoLabel: "Use for",
    tinLabel: "TIN / ID",
    types: [
      {
        name: "Individual — MyKad/NRIC only",
        who: "A Malaysian individual who is not running a business and can only give their MyKad / MyTentera number — e.g. a roadside seller, a small-scale supplier, or an individual landlord.",
        tin: "TIN is set to the general individual TIN EI00000000010, and their MyKad number is recorded as the ID.",
      },
      {
        name: "Individual — own TIN",
        who: "A Malaysian individual (not a business) who gives you their own IRBM tax number (TIN) instead of a MyKad.",
        tin: "Their TIN is used, and the ID number is set to 000000000000 per the guideline concession.",
      },
      {
        name: "Business / agent-dealer-distributor",
        who: "Any registered Malaysian business — including agents, dealers or distributors you pay commission to, and any company or enterprise supplier.",
        tin: "Enter both their TIN and their business registration number (BRN).",
      },
    ],
    close: "Got it",
  },
  ms: {
    title: "Jenis penjual yang mana perlu dipilih?",
    intro:
      "Pilih pilihan yang sepadan dengan cara pembekal mengenal pasti diri mereka. Nombor TIN dan pengenalan kemudiannya diisi mengikut peraturan bil sendiri LHDN.",
    whoLabel: "Untuk",
    tinLabel: "TIN / ID",
    types: [
      {
        name: "Individu — MyKad/NRIC sahaja",
        who: "Individu warga Malaysia yang tidak menjalankan perniagaan dan hanya boleh memberi nombor MyKad / MyTentera — cth. penjual tepi jalan, pembekal kecil-kecilan, atau tuan tanah individu.",
        tin: "TIN ditetapkan kepada TIN am individu EI00000000010, dan nombor MyKad mereka direkodkan sebagai ID.",
      },
      {
        name: "Individu — TIN sendiri",
        who: "Individu warga Malaysia (bukan perniagaan) yang memberi nombor cukai (TIN) mereka sendiri dan bukannya MyKad.",
        tin: "TIN mereka digunakan, dan nombor ID ditetapkan kepada 000000000000 mengikut konsesi garis panduan.",
      },
      {
        name: "Perniagaan / ejen-wakil-pengedar",
        who: "Mana-mana perniagaan berdaftar Malaysia — termasuk ejen, wakil atau pengedar yang anda bayar komisen, serta mana-mana syarikat atau enterprise pembekal.",
        tin: "Masukkan kedua-dua TIN dan nombor pendaftaran perniagaan (BRN) mereka.",
      },
    ],
    close: "Faham",
  },
};

const SellerTypeHelpDialog: React.FC<SellerTypeHelpDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const [language, setLanguage] = useState<Language>("en");
  const content = CONTENT[language];

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
                    <IconHelpCircle
                      size={22}
                      className="mt-0.5 shrink-0 text-sky-500"
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

                <div className="mt-3 space-y-2.5">
                  {content.types.map((type: SellerTypeHelp, index: number) => (
                    <div
                      key={index}
                      className="rounded-lg border border-default-200 bg-default-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/30"
                    >
                      <p className="text-sm font-semibold text-default-800 dark:text-gray-100">
                        {type.name}
                      </p>
                      <p className="mt-1 text-xs text-default-600 dark:text-gray-300">
                        <span className="font-medium text-default-500 dark:text-gray-400">
                          {content.whoLabel}:
                        </span>{" "}
                        {type.who}
                      </p>
                      <p className="mt-1 text-xs text-default-600 dark:text-gray-300">
                        <span className="font-medium text-default-500 dark:text-gray-400">
                          {content.tinLabel}:
                        </span>{" "}
                        {type.tin}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    size="sm"
                    onClick={onClose}
                  >
                    {content.close}
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

export default SellerTypeHelpDialog;
