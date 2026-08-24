import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Checkbox from "../Checkbox";
import Button from "../Button";
import { IconFileText, IconPrinter, IconDownload } from "@tabler/icons-react";
import LoadingSpinner from "../LoadingSpinner";
import { useMonthSelection } from "../../hooks/useMonthSelection";
import {
  generateSalesSummaryPDF,
  SalesSummaryScope,
} from "../../utils/sales/SalesSummaryPDF";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

interface SalesSummarySelectionTooltipProps {
  activeTab: number;
  scope?: SalesSummaryScope;
}

interface SummaryOption {
  id: string;
  name: string;
  description: string;
}

const TIENHOCK_SUMMARY_OPTIONS: SummaryOption[] = [
  {
    id: "all_sales",
    name: "Summary of all sales",
    description: "All product categories",
  },
  {
    id: "all_salesmen",
    name: "Summary of all sales by salesmen",
    description: "Grouped by salesman",
  },
  {
    id: "mee_salesmen",
    name: "Summary of Mee sales by salesmen",
    description: "MEE products only",
  },
  {
    id: "bihun_salesmen",
    name: "Summary of Bihun sales by salesmen",
    description: "BH products only",
  },
  {
    id: "ramen_salesmen",
    name: "Summary of Ramen sales by salesmen",
    description: "RAMEN products only",
  },
  {
    id: "sisa_sales",
    name: "Summary of Sisa sales",
    description: "EMPTY_BAG, SBH, SMEE products",
  },
];

const JP_SUMMARY_OPTIONS: SummaryOption[] = [
  {
    id: "all_sales",
    name: "Summary of all sales",
    description: "All Jelly Polly products",
  },
  {
    id: "jp_salesmen",
    name: "Summary of sales by salesmen",
    description: "Grouped by salesman",
  },
];

const SalesSummarySelectionTooltip: React.FC<
  SalesSummarySelectionTooltipProps
> = ({ activeTab, scope = "tienhock" }) => {
  const { t } = useTranslation("sales");
  const SUMMARY_OPTIONS =
    scope === "jp" ? JP_SUMMARY_OPTIONS : TIENHOCK_SUMMARY_OPTIONS;
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedSummaries, setSelectedSummaries] = useState<
    Record<string, boolean>
  >(() => {
    const initialSelections: Record<string, boolean> = {};
    SUMMARY_OPTIONS.forEach((opt) => {
      initialSelections[opt.id] = true;
    });
    return initialSelections;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { selectedMonth, selectedYear } = useMonthSelection(activeTab);

  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = (): void => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const horizontalMargin = 16;
      const tooltipWidth = Math.min(384, window.innerWidth - horizontalMargin * 2);
      const tooltipHeight = tooltipRef.current?.offsetHeight || 0;
      const preferredLeft = rect.right - tooltipWidth;
      const maximumLeft = window.innerWidth - tooltipWidth - horizontalMargin;
      const belowTop = rect.bottom + 8;
      const aboveTop = rect.top - tooltipHeight - 8;

      setPosition({
        top:
          tooltipHeight > 0 && belowTop + tooltipHeight > window.innerHeight - 16
            ? Math.max(16, aboveTop)
            : belowTop,
        left: Math.min(
          Math.max(preferredLeft, horizontalMargin),
          Math.max(horizontalMargin, maximumLeft)
        ),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const handleDocumentPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        buttonRef.current?.contains(target) ||
        tooltipRef.current?.contains(target)
      ) {
        return;
      }
      setIsVisible(false);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsVisible(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isVisible]);

  const handleSummaryToggle = (summaryId: string) => {
    setSelectedSummaries((prev) => ({
      ...prev,
      [summaryId]: !prev[summaryId],
    }));
  };

  const handleSelectAll = () => {
    const allSelected = SUMMARY_OPTIONS.every(
      (opt) => selectedSummaries[opt.id]
    );
    const newSelections: Record<string, boolean> = {};
    SUMMARY_OPTIONS.forEach((opt) => {
      newSelections[opt.id] = !allSelected;
    });
    setSelectedSummaries(newSelections);
  };

  const selectedCount = Object.values(selectedSummaries).filter(Boolean).length;
  const allSelected = selectedCount === SUMMARY_OPTIONS.length;

  const handleGenerate = async (action: "download" | "print") => {
    if (selectedCount === 0) {
      toast.error(t("Please select at least one summary to generate"));
      return;
    }

    if (selectedYear === undefined || selectedMonth === undefined) {
      toast.error(t("Please select a valid month and year"));
      return;
    }

    setIsGenerating(true);
    setIsVisible(false);

    try {
      // Create start and end dates for the selected month
      const startDate = new Date(selectedYear, selectedMonth, 1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0);
      endDate.setHours(23, 59, 59, 999);

      // Fetch summary data
      const response = await api.post("/api/invoices/sales/summary", {
        startDate: startDate.getTime().toString(),
        endDate: endDate.getTime().toString(),
        summaries: Object.keys(selectedSummaries).filter(
          (key) => selectedSummaries[key]
        ),
        scope,
      });

      await generateSalesSummaryPDF(
        response,
        selectedMonth,
        selectedYear,
        action,
        scope
      );

      toast.success(
        t(
          action === "print"
            ? "Sales summary generated successfully"
            : "Sales summary downloaded successfully"
        )
      );
    } catch (error) {
      console.error("Error generating sales summary:", error);
      toast.error(t("Failed to generate sales summary"));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsVisible((current) => !current)}
        className="flex items-center px-4 py-2 text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 rounded-full transition-colors"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isVisible}
        aria-controls="sales-summary-selection"
      >
        <IconFileText size={18} className="mr-2" />
        {t("Generate PDF Summary")}
      </button>

      {isVisible &&
        createPortal(
          <div
            id="sales-summary-selection"
            ref={tooltipRef}
            role="dialog"
            className="fixed z-[9999] bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 shadow-lg rounded-lg p-0 w-[calc(100vw-2rem)] max-w-96 opacity-0 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              opacity: isVisible ? 1 : 0,
              maxHeight: "80vh",
            }}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 border-b border-default-200 dark:border-gray-700 px-4 py-3 bg-default-50 dark:bg-gray-800 rounded-t-lg cursor-pointer"
              onClick={handleSelectAll}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-base font-medium text-default-800 dark:text-gray-100">
                  {t("Sales Summary Selection")}
                </h3>
                <div className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 rounded-full text-xs font-medium">
                  {selectedCount}/{SUMMARY_OPTIONS.length}
                </div>
              </div>
              <div className="flex items-center mt-2 text-sm text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300">
                <Checkbox
                  checked={allSelected}
                  onChange={handleSelectAll}
                  size={16}
                  className="mr-1.5"
                  checkedColor="text-sky-700"
                />
                {t(allSelected ? "Deselect All" : "Select All")}
              </div>
            </div>

            {/* Options */}
            <div className="flex-grow overflow-y-auto py-2 max-h-80">
              <div className="px-2 space-y-1">
                {SUMMARY_OPTIONS.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center px-3 py-2.5 hover:bg-default-50 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                    onClick={() => handleSummaryToggle(option.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-default-700 dark:text-gray-200">
                        {t(option.name)}
                      </div>
                      <div className="text-xs text-default-500 dark:text-gray-400">
                        {t(option.description)}
                      </div>
                    </div>
                    <Checkbox
                      checked={!!selectedSummaries[option.id]}
                      onChange={() => handleSummaryToggle(option.id)}
                      size={18}
                      className="ml-2"
                      checkedColor="text-sky-600"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 border-t border-default-200 dark:border-gray-700 px-4 py-3 bg-default-50 dark:bg-gray-800 rounded-b-lg">
              <div className="text-sm text-default-600 dark:text-gray-300 mb-2">
                {selectedMonth !== undefined && selectedYear
                  ? t("Generating for: {{month}}", {
                      month: new Date(
                        selectedYear,
                        selectedMonth
                      ).toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      }),
                    })
                  : t("Select a month to generate summary")}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleGenerate("download")}
                  disabled={selectedCount === 0}
                  icon={IconDownload}
                  iconSize={16}
                  color="sky"
                  size="sm"
                  className="flex-1"
                >
                  {t("download", { ns: "common" })}
                </Button>
                <Button
                  onClick={() => handleGenerate("print")}
                  disabled={selectedCount === 0}
                  icon={IconPrinter}
                  iconSize={16}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {t("print", { ns: "common" })}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 transform scale-110">
            <div className="flex flex-col items-center gap-4">
              <LoadingSpinner size="lg" hideText />
              <div className="text-center">
                <p className="text-lg font-medium text-default-900 dark:text-gray-100">
                  {t("Generating Sales Summary")}
                </p>
                <p className="text-sm text-default-600 dark:text-gray-300 mt-1">
                  {t("This may take a few moments...")}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SalesSummarySelectionTooltip;
