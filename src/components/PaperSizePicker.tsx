// src/components/PaperSizePicker.tsx
// Shared two-pill paper-size selector (A4 / 9.5x11in computer form) used by the
// navbar user menu and the print overlays' post-print dialog.
import React from "react";
import { useTranslation } from "react-i18next";
import type { PdfPaperSize } from "../utils/pdf/paperSize";

interface PaperSizePickerProps {
  value: PdfPaperSize;
  onChange: (size: PdfPaperSize) => void;
  compact?: boolean;
}

const PAPER_SIZE_OPTIONS: PdfPaperSize[] = ["a4", "computerForm"];

const PaperSizePicker: React.FC<PaperSizePickerProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  const { t } = useTranslation("common");

  return (
    <div className="flex rounded-md border border-default-200 dark:border-gray-600 overflow-hidden">
      {PAPER_SIZE_OPTIONS.map((option: PdfPaperSize) => {
        const isActive = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(option);
            }}
            className={`flex-1 ${
              compact ? "px-2 py-1.5" : "px-1 py-2"
            } text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
              isActive
                ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                : "text-default-600 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700"
            }`}
          >
            {option === "a4" ? "A4" : t("9.5×11 Form")}
          </button>
        );
      })}
    </div>
  );
};

export default PaperSizePicker;
