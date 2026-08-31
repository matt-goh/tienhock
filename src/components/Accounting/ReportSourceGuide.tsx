import React, { Fragment, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconHelpCircle, IconX } from "@tabler/icons-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { LANGUAGE_SHORT_LABELS, type SupportedLanguage } from "../../i18n";
import Button from "../Button";
import {
  REPORT_SOURCE_GUIDE_CONTENT,
  type ReportSourceGuideCompany,
  type ReportSourceGuideKind,
  type ReportSourceGuideText,
} from "./reportSourceGuideContent";

type GuideLanguage = SupportedLanguage;

interface ReportSourceGuideProps {
  report: ReportSourceGuideKind;
  company?: ReportSourceGuideCompany;
}

const ReportSourceGuide: React.FC<ReportSourceGuideProps> = ({
  report,
  company = "tienhock",
}) => {
  const { i18n } = useTranslation("accounting");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [language, setLanguage] = useState<GuideLanguage>(
    (): GuideLanguage => {
      const savedLanguage: string | null = localStorage.getItem(
        "report_guide_lang"
      );
      if (
        savedLanguage === "ms" ||
        savedLanguage === "en" ||
        savedLanguage === "zh-Hans"
      ) {
        return savedLanguage;
      }
      if (i18n.resolvedLanguage === "ms") return "ms";
      if (i18n.resolvedLanguage === "zh-Hans") return "zh-Hans";
      return "en";
    }
  );

  const content: ReportSourceGuideText | undefined =
    REPORT_SOURCE_GUIDE_CONTENT[company][report];
  const t: TFunction = i18n.getFixedT(language, "accounting");

  const handleLanguageChange = (newLanguage: GuideLanguage): void => {
    setLanguage(newLanguage);
    localStorage.setItem("report_guide_lang", newLanguage);
  };

  if (!content) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        icon={IconHelpCircle}
        iconSize={16}
        onClick={() => setIsOpen(true)}
      >
        {t("Guide")}
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
            <div
              className="fixed inset-0 bg-black/50 dark:bg-black/70"
              aria-hidden="true"
            />
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
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t(content.title)}
                    </DialogTitle>
                    <div className="flex items-center gap-3">
                      <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => handleLanguageChange("ms")}
                          className={`px-2.5 py-1 ${
                            language === "ms"
                              ? "bg-sky-500 text-white"
                              : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                          }`}
                        >
                          {LANGUAGE_SHORT_LABELS.ms}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLanguageChange("en")}
                          className={`px-2.5 py-1 ${
                            language === "en"
                              ? "bg-sky-500 text-white"
                              : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                          }`}
                        >
                          {LANGUAGE_SHORT_LABELS.en}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLanguageChange("zh-Hans")}
                          className={`px-2.5 py-1 ${
                            language === "zh-Hans"
                              ? "bg-sky-500 text-white"
                              : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                          }`}
                        >
                          {LANGUAGE_SHORT_LABELS["zh-Hans"]}
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label={t("Close")}
                        onClick={() => setIsOpen(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <IconX className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="px-6 py-4 max-h-[70vh] overflow-y-auto space-y-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {t(content.intro)}
                    </p>

                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                        {t(content.sourcesHeading)}
                      </h4>
                      <ul className="space-y-2">
                        {content.sources.map((source) => (
                          <li key={source.label} className="flex gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {t(source.label)}
                              </span>
                              {" — "}
                              {t(source.detail)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-3">
                      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                        {t(content.notesHeading)}
                      </h4>
                      <ul className="space-y-1.5">
                        {content.notes.map((item) => (
                          <li key={item} className="flex gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                            <span className="text-amber-800 dark:text-amber-200">
                              {t(item)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t(content.footer)}
                    </p>
                  </div>

                  <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <Button onClick={() => setIsOpen(false)} variant="outline">
                      {t("Close")}
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
