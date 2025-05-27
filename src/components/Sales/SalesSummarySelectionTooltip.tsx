import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Checkbox from "../Checkbox";
import Button from "../Button";
import { IconFileText, IconPrinter, IconDownload } from "@tabler/icons-react";
import LoadingSpinner from "../LoadingSpinner";
import { useMonthSelection } from "../../hooks/useMonthSelection";
import { generateSalesSummaryPDF } from "../../utils/sales/SalesSummaryPDF";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";

interface SalesSummarySelectionTooltipProps {
  activeTab: number;
}

interface SummaryOption {
  id: string;
  name: string;
  description: string;
}

const SUMMARY_OPTIONS: SummaryOption[] = [
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
    id: "jp_salesmen",
    name: "Summary of Jellypolly sales by salesmen",
    description: "JP products only",
  },
  {
    id: "sisa_sales",
    name: "Summary of Sisa sales",
    description: "EMPTY_BAG, SBH, SMEE products",
  },
];

const SalesSummarySelectionTooltip: React.FC<
  SalesSummarySelectionTooltipProps
> = ({ activeTab }) => {
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { selectedMonth, selectedYear } = useMonthSelection(activeTab);

  useEffect(() => {
    if (isVisible && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.right,
      });
    }
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 0);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

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
      toast.error("Please select at least one summary to generate");
      return;
    }

    if (selectedYear === undefined || selectedMonth === undefined) {
      toast.error("Please select a valid month and year");
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
      });

      // Generate PDF
      await generateSalesSummaryPDF(
        response,
        selectedMonth,
        selectedYear,
        action
      );

      toast.success(
        `Sales summary ${
          action === "print" ? "generated" : "downloaded"
        } successfully`
      );
    } catch (error) {
      console.error("Error generating sales summary:", error);
      toast.error("Failed to generate sales summary");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => setIsVisible(true)}
        className="flex items-center px-4 py-2 text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-full transition-colors"
        type="button"
      >
        <IconFileText size={18} className="mr-2" />
        Generate PDF Summary
      </button>

      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-0 w-96 opacity-0 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              opacity: isVisible ? 1 : 0,
              transform: `translateX(-100%)`,
              maxHeight: "80vh",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 border-b border-default-200 px-4 py-3 bg-default-50 rounded-t-lg cursor-pointer"
              onClick={handleSelectAll}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-base font-medium text-default-800">
                  Sales Summary Selection
                </h3>
                <div className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full text-xs font-medium">
                  {selectedCount}/{SUMMARY_OPTIONS.length}
                </div>
              </div>
              <div className="flex items-center mt-2 text-sm text-sky-600 hover:text-sky-800">
                <Checkbox
                  checked={allSelected}
                  onChange={handleSelectAll}
                  size={16}
                  className="mr-1.5"
                  checkedColor="text-sky-700"
                />
                {allSelected ? "Deselect All" : "Select All"}
              </div>
            </div>

            {/* Options */}
            <div className="flex-grow overflow-y-auto py-2 max-h-80">
              <div className="px-2 space-y-1">
                {SUMMARY_OPTIONS.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center px-3 py-2.5 hover:bg-default-50 rounded-lg cursor-pointer transition-colors"
                    onClick={() => handleSummaryToggle(option.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-default-700">
                        {option.name}
                      </div>
                      <div className="text-xs text-default-500">
                        {option.description}
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
            <div className="flex-shrink-0 border-t border-default-200 px-4 py-3 bg-default-50 rounded-b-lg">
              <div className="text-sm text-default-600 mb-2">
                {selectedMonth !== undefined && selectedYear
                  ? `Generating for: ${new Date(
                      selectedYear,
                      selectedMonth
                    ).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}`
                  : "Select a month to generate summary"}
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
                  Download
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
                  Print
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 transform scale-110">
            <div className="flex flex-col items-center gap-4">
              <LoadingSpinner size="lg" hideText />
              <div className="text-center">
                <p className="text-lg font-medium text-default-900">
                  Generating Sales Summary
                </p>
                <p className="text-sm text-default-600 mt-1">
                  This may take a few moments...
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
