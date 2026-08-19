// src/i18n/index.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import msCommon from "./locales/ms/common.json";
import msNav from "./locales/ms/nav.json";
import msHome from "./locales/ms/home.json";
import msInvoice from "./locales/ms/invoice.json";
import msAuth from "./locales/ms/auth.json";
import msPayments from "./locales/ms/payments.json";
import msAdjustments from "./locales/ms/adjustments.json";
import msSales from "./locales/ms/sales.json";
import msCatalogue from "./locales/ms/catalogue.json";
import msPayroll from "./locales/ms/payroll.json";
import msStock from "./locales/ms/stock.json";
import msAccounting from "./locales/ms/accounting.json";
import msGreenTarget from "./locales/ms/greentarget.json";
import zhHansCommon from "./locales/zh-Hans/common.json";
import zhHansNav from "./locales/zh-Hans/nav.json";
import zhHansHome from "./locales/zh-Hans/home.json";
import zhHansInvoice from "./locales/zh-Hans/invoice.json";
import zhHansAuth from "./locales/zh-Hans/auth.json";
import zhHansPayments from "./locales/zh-Hans/payments.json";
import zhHansAdjustments from "./locales/zh-Hans/adjustments.json";
import zhHansSales from "./locales/zh-Hans/sales.json";
import zhHansCatalogue from "./locales/zh-Hans/catalogue.json";
import zhHansPayroll from "./locales/zh-Hans/payroll.json";
import zhHansStock from "./locales/zh-Hans/stock.json";
import zhHansAccounting from "./locales/zh-Hans/accounting.json";
import zhHansGreenTarget from "./locales/zh-Hans/greentarget.json";

export const SUPPORTED_LANGUAGES = ["en", "ms", "zh-Hans"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  ms: "Bahasa Melayu",
  "zh-Hans": "简体中文",
};

// Compact labels for tight UI (e.g. the segmented control in the user menu).
export const LANGUAGE_SHORT_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  ms: "BM",
  "zh-Hans": "简体中文",
};

// Locked decisions (docs/I18N_HANDOVER.md §1):
// - every zh-* device locale (incl. Traditional) resolves to Simplified Chinese
// - an unmatched device locale falls back to Bahasa Melayu
// - a missing translation falls back to English (English text IS the key)
export function resolveLanguage(rawLocale: string | undefined | null): SupportedLanguage {
  const locale = (rawLocale || "").toLowerCase();
  if (locale.startsWith("zh")) return "zh-Hans";
  if (locale.startsWith("en")) return "en";
  if (locale.startsWith("ms")) return "ms";
  return "ms";
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      ms: {
        common: msCommon,
        nav: msNav,
        home: msHome,
        invoice: msInvoice,
        auth: msAuth,
        payments: msPayments,
        adjustments: msAdjustments,
        sales: msSales,
        catalogue: msCatalogue,
        payroll: msPayroll,
        stock: msStock,
        accounting: msAccounting,
        greentarget: msGreenTarget,
      },
      "zh-Hans": {
        common: zhHansCommon,
        nav: zhHansNav,
        home: zhHansHome,
        invoice: zhHansInvoice,
        auth: zhHansAuth,
        payments: zhHansPayments,
        adjustments: zhHansAdjustments,
        sales: zhHansSales,
        catalogue: zhHansCatalogue,
        payroll: zhHansPayroll,
        stock: zhHansStock,
        accounting: zhHansAccounting,
        greentarget: zhHansGreenTarget,
      },
    },
    defaultNS: "common",
    fallbackLng: "en",
    // English source text is the key; a missing translation renders the key itself.
    // Because keys are whole English sentences they contain "." and ":", which
    // i18next would otherwise read as nested-path / namespace separators.
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      // Manual choice (user menu) wins over the device locale.
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
      convertDetectedLanguage: (lng: string) => resolveLanguage(lng),
    },
    // DEV-only: surface missing translations in the console so batches can
    // spot them. Skipped while the active language is English — English text
    // is the key itself, so every en lookup is "missing" by design.
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => {
          if (i18n.resolvedLanguage === "en") return;
          // eslint-disable-next-line no-console
          console.warn(`[i18n] missing key (${lngs.join(",")}) ${ns}:${key}`);
        }
      : undefined,
  });

export default i18n;
