// src/components/Stock/ProductionHelpDialog.tsx
import React, { Fragment, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconX,
  IconPackage,
  IconScale,
  IconPackages,
  IconInfoCircle,
} from "@tabler/icons-react";
import clsx from "clsx";

interface ProductionHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type Language = "en" | "bm";

const ProductionHelpDialog: React.FC<ProductionHelpDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const [language, setLanguage] = useState<Language>("bm");

  const content = {
    en: {
      title: "Production Entry Guide",
      subtitle: "How to use the production entry system",
      sections: [
        {
          icon: IconPackage,
          title: "Regular Product Entry",
          color: "text-sky-600 dark:text-sky-400",
          bgColor: "bg-sky-50 dark:bg-sky-900/20",
          items: [
            "Select a date and product from the dropdown",
            "Enter the number of bags packed by each worker",
            "Use arrow keys to navigate between worker inputs",
            "Click Save to record the production data",
            "Star your frequently used products for quick access",
          ],
        },
        {
          icon: IconScale,
          title: "Bihun Hancur (Crushed)",
          color: "text-purple-600 dark:text-purple-400",
          bgColor: "bg-purple-50 dark:bg-purple-900/20",
          items: [
            "Unit: Kilograms (kg) - decimal values allowed",
            "Example: Enter 7.91 kg for a worker's output",
            "Workers: BH_PACKING job holders",
            "Pay Code: BH_HANCUR",
          ],
        },
        {
          icon: IconPackage,
          title: "Karung Hancur (Sack Weighing)",
          color: "text-amber-600 dark:text-amber-400",
          bgColor: "bg-amber-50 dark:bg-amber-900/20",
          items: [
            "Unit: Sacks (whole numbers only)",
            "Default worker: RAMBU (can be changed)",
            "This records the number of hancur sacks weighed",
            "Pay Code: TIMBANG_HANCUR",
          ],
        },
        {
          icon: IconPackages,
          title: "Bundle Production",
          color: "text-emerald-600 dark:text-emerald-400",
          bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
          items: [
            "Best Partner (BP): Large bundles for Best Partner customer (default: 30 pcs) → PB_KG",
            "Bihun Bundle (BH): General bihun bundles (default: 3 bags) → BH_PB",
            "Mee Bundle (MEE): General mee bundles (default: 3 bags) → MEE_PB",
            "BP and BH use BH_PACKING workers, MEE uses MEE_PACKING workers",
          ],
        },
      ],
      payCodeTitle: "Pay Code Mappings",
      payCodeDescription:
        "Each product type maps to a specific pay code for payroll calculation:",
      payCodeTable: [
        {
          product: "Regular Products",
          payCode: "Configure in Manage Mappings",
        },
        { product: "Bihun Hancur", payCode: "BH_HANCUR" },
        { product: "Karung Hancur", payCode: "TIMBANG_HANCUR" },
        { product: "Bundle BP", payCode: "PB_KG" },
        { product: "Bundle BH", payCode: "BH_PB" },
        { product: "Bundle MEE", payCode: "MEE_PB" },
      ],
      close: "Close",
    },
    bm: {
      title: "Panduan Entry Pengeluaran",
      subtitle: "Cara menggunakan sistem entry pengeluaran",
      sections: [
        {
          icon: IconPackage,
          title: "Entry Produk Biasa",
          color: "text-sky-600 dark:text-sky-400",
          bgColor: "bg-sky-50 dark:bg-sky-900/20",
          items: [
            "Pilih tarikh dan produk dari dropdown",
            "Masukkan bilangan bungkus yang dibungkus oleh setiap pekerja",
            "Gunakan kekunci anak panah untuk navigasi antara input pekerja",
            "Klik Simpan untuk merekod data pengeluaran",
            "Star produk yang sering digunakan untuk akses pantas",
          ],
        },
        {
          icon: IconScale,
          title: "Bihun Hancur",
          color: "text-purple-600 dark:text-purple-400",
          bgColor: "bg-purple-50 dark:bg-purple-900/20",
          items: [
            "Unit: Kilogram (kg) - nilai perpuluhan dibenarkan",
            "Contoh: Masukkan 7.91 kg untuk output pekerja",
            "Pekerja: Pemegang kerja BH_PACKING",
            "Kod Gaji: BH_HANCUR",
          ],
        },
        {
          icon: IconPackage,
          title: "Karung Hancur (Timbang)",
          color: "text-amber-600 dark:text-amber-400",
          bgColor: "bg-amber-50 dark:bg-amber-900/20",
          items: [
            "Unit: Karung (nombor bulat sahaja)",
            "Pekerja lalai: RAMBU (boleh ditukar)",
            "Ini merekodkan bilangan karung hancur yang ditimbang",
            "Kod Gaji: TIMBANG_HANCUR",
          ],
        },
        {
          icon: IconPackages,
          title: "Pengeluaran Bundle",
          color: "text-emerald-600 dark:text-emerald-400",
          bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
          items: [
            "Best Partner (BP): Bundle besar untuk pelanggan Best Partner (lalai: 30 pcs) → PB_KG",
            "Bihun Bundle (BH): Bundle bihun am (lalai: 3 beg) → BH_PB",
            "Mee Bundle (MEE): Bundle mee am (lalai: 3 beg) → MEE_PB",
            "BP dan BH guna pekerja BH_PACKING, MEE guna pekerja MEE_PACKING",
          ],
        },
      ],
      payCodeTitle: "Pemetaan Kod Gaji",
      payCodeDescription:
        "Setiap jenis produk dipetakan ke kod gaji tertentu untuk pengiraan gaji:",
      payCodeTable: [
        { product: "Produk Biasa", payCode: "Tetapkan di Manage Mappings" },
        { product: "Bihun Hancur", payCode: "BH_HANCUR" },
        { product: "Karung Hancur", payCode: "TIMBANG_HANCUR" },
        { product: "Bundle BP", payCode: "PB_KG" },
        { product: "Bundle BH", payCode: "BH_PB" },
        { product: "Bundle MEE", payCode: "MEE_PB" },
      ],
      close: "Tutup",
    },
  };

  const c = content[language];

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 dark:bg-black/50" />
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
              <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
                      <IconInfoCircle
                        className="text-sky-600 dark:text-sky-400"
                        size={24}
                      />
                    </div>
                    <div>
                      <DialogTitle
                        as="h3"
                        className="text-lg font-semibold text-default-900 dark:text-gray-100"
                      >
                        {c.title}
                      </DialogTitle>
                      <p className="text-sm text-default-500 dark:text-gray-400">
                        {c.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Language Toggle */}
                    <div className="flex rounded-lg border border-default-200 dark:border-gray-600 overflow-hidden">
                      <button
                        onClick={() => setLanguage("bm")}
                        className={clsx(
                          "px-3 py-1 text-sm font-medium transition-colors",
                          language === "bm"
                            ? "bg-sky-500 text-white"
                            : "bg-white dark:bg-gray-700 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-600"
                        )}
                      >
                        BM
                      </button>
                      <button
                        onClick={() => setLanguage("en")}
                        className={clsx(
                          "px-3 py-1 text-sm font-medium transition-colors",
                          language === "en"
                            ? "bg-sky-500 text-white"
                            : "bg-white dark:bg-gray-700 text-default-600 dark:text-gray-300 hover:bg-default-50 dark:hover:bg-gray-600"
                        )}
                      >
                        EN
                      </button>
                    </div>
                    <button
                      onClick={onClose}
                      className="rounded-lg p-1.5 text-default-400 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700 hover:text-default-600 dark:hover:text-gray-200 transition-colors"
                    >
                      <IconX size={20} />
                    </button>
                  </div>
                </div>

                {/* Sections */}
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                  {/* Pay Code Table */}
                  <div className="rounded-lg border border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-700/50 p-4">
                    <h4 className="font-semibold text-default-900 dark:text-gray-100 mb-2">
                      {c.payCodeTitle}
                    </h4>
                    <p className="text-sm text-default-500 dark:text-gray-400 mb-3">
                      {c.payCodeDescription}
                    </p>
                    <div className="overflow-hidden rounded-lg border border-default-200 dark:border-gray-600">
                      <table className="w-full text-sm">
                        <thead className="bg-default-100 dark:bg-gray-700">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-default-700 dark:text-gray-300">
                              {language === "en" ? "Product" : "Produk"}
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-default-700 dark:text-gray-300">
                              {language === "en" ? "Pay Code" : "Kod Gaji"}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-default-200 dark:divide-gray-600 bg-white dark:bg-gray-800">
                          {c.payCodeTable.map((row, index) => (
                            <tr key={index}>
                              <td className="px-3 py-2 text-default-900 dark:text-gray-100">
                                {row.product}
                              </td>
                              <td className="px-3 py-2">
                                <code className="rounded bg-default-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs font-mono text-default-700 dark:text-gray-300">
                                  {row.payCode}
                                </code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {c.sections.map((section, index) => (
                    <div
                      key={index}
                      className={clsx("rounded-lg p-4", section.bgColor)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <section.icon className={section.color} size={20} />
                        <h4 className={clsx("font-semibold", section.color)}>
                          {section.title}
                        </h4>
                      </div>
                      <ul className="space-y-1">
                        {section.items.map((item, itemIndex) => (
                          <li
                            key={itemIndex}
                            className="text-sm text-default-700 dark:text-gray-300 flex items-start gap-2"
                          >
                            <span className="text-default-400 dark:text-gray-500 mt-1">
                              •
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={onClose}
                    className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 transition-colors"
                  >
                    {c.close}
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ProductionHelpDialog;
