// src/components/Payroll/PayrollSectionPrintMenu.tsx
import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { IconPrinter } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Checkbox from "../Checkbox";
import LoadingOverlay from "./LoadingOverlay";
import { EmployeePayroll } from "../../types/types";
import {
  printBatchPayslips,
  createStaffDetailsMap,
} from "../../utils/payroll/PayslipManager";
import { MidMonthPayroll } from "../../utils/payroll/midMonthPayrollUtils";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";

interface PayrollSectionPrintMenuProps {
  payrolls: EmployeePayroll[];
  midMonthPayrollsMap?: Record<string, MidMonthPayroll | null>;
  companyName?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  buttonLabel?: string;
}

const PayrollSectionPrintMenu: React.FC<PayrollSectionPrintMenuProps> = ({
  payrolls,
  midMonthPayrollsMap,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  size = "sm",
  disabled = false,
  buttonLabel = "Print Payslips",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedSections, setSelectedSections] = useState<
    Record<string, boolean>
  >({});
  const [isPrinting, setIsPrinting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [printingCount, setPrintingCount] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

  const sectionGroups = useMemo(() => {
    const map = new Map<string, EmployeePayroll[]>();
    for (const p of payrolls) {
      const key = p.section || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()]
      .map(([section, rows]) => ({ section, rows, count: rows.length }))
      .sort((a, b) => a.section.localeCompare(b.section));
  }, [payrolls]);

  // Default all sections to checked; resync when the set of sections changes
  const sectionKey = useMemo(
    () => sectionGroups.map((g) => g.section).join("|"),
    [sectionGroups]
  );
  useEffect(() => {
    const next: Record<string, boolean> = {};
    sectionGroups.forEach((g) => {
      next[g.section] = true;
    });
    setSelectedSections(next);
    // sectionGroups is derived from sectionKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);

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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (disabled) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(true), 0);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(false), 100);
  };

  const handleToggleSection = (section: string) => {
    setSelectedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const allSelected =
    sectionGroups.length > 0 &&
    sectionGroups.every((g) => selectedSections[g.section]);

  const handleSelectAll = () => {
    const next: Record<string, boolean> = {};
    sectionGroups.forEach((g) => {
      next[g.section] = !allSelected;
    });
    setSelectedSections(next);
  };

  const selectedSectionCount = sectionGroups.filter(
    (g) => selectedSections[g.section]
  ).length;

  const selectedPayrolls = useMemo(
    () =>
      sectionGroups
        .filter((g) => selectedSections[g.section])
        .flatMap((g) => g.rows),
    [sectionGroups, selectedSections]
  );

  const print = async (filtered: EmployeePayroll[]) => {
    if (filtered.length === 0) {
      toast.error("No payslips to print");
      return;
    }
    setIsVisible(false);
    setPrintingCount(filtered.length);
    setIsPrinting(true);
    setShowOverlay(true);

    const details = createStaffDetailsMap(filtered, staffs, jobs);

    await printBatchPayslips(filtered, details, {
      companyName,
      midMonthPayrollsMap,
      onBeforePrint: () => {
        setShowOverlay(true);
      },
      onAfterPrint: () => {
        setIsPrinting(false);
        setShowOverlay(false);
      },
      onError: () => {
        setIsPrinting(false);
        setShowOverlay(false);
      },
    });
  };

  const buttonClasses =
    size === "sm"
      ? "flex items-center px-3 h-8 text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50 border border-default-300 dark:border-gray-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      : "flex items-center px-4 h-[42px] text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50 border border-default-300 dark:border-gray-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const iconSize = size === "sm" ? 16 : 18;

  const totalEmployees = sectionGroups.reduce((sum, g) => sum + g.count, 0);
  const selectedEmployeeCount = selectedPayrolls.length;
  const triggerDisabled = disabled || isPrinting || payrolls.length === 0;

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => {
          if (!triggerDisabled) setIsVisible(true);
        }}
        className={buttonClasses}
        type="button"
        disabled={triggerDisabled}
        title="Print pay slips by section"
      >
        <IconPrinter size={iconSize} className="mr-2" />
        {isPrinting ? "Printing..." : buttonLabel}
      </button>

      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[9999] bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 shadow-lg rounded-lg p-0 w-96 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              transform: "translateX(-100%)",
              maxHeight: "80vh",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 border-b border-default-200 dark:border-gray-700 px-4 py-3 bg-default-50 dark:bg-gray-800/50 rounded-t-lg cursor-pointer"
              onClick={handleSelectAll}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-base font-medium text-default-800 dark:text-gray-100">
                  Print Pay Slips by Section
                </h3>
                <div className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300 rounded-full text-xs font-medium">
                  {selectedSectionCount}/{sectionGroups.length}
                </div>
              </div>
              <div className="flex items-center mt-2 text-sm text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-200">
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

            {/* Section Options */}
            <div className="flex-grow overflow-y-auto py-1 max-h-80">
              {sectionGroups.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-default-500 dark:text-gray-400">
                  No pay slips available.
                </div>
              ) : (
                <div className="px-1 space-y-1">
                  {sectionGroups.map(({ section, rows, count }) => (
                    <div
                      key={section}
                      className="flex items-center px-3 py-2.5 hover:bg-default-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                      onClick={() => handleToggleSection(section)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-default-700 dark:text-gray-200">
                          {section}
                        </div>
                        <div className="text-xs text-default-500 dark:text-gray-400">
                          {count} {count === 1 ? "employee" : "employees"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          print(rows);
                        }}
                        className="ml-2 mr-1 p-1.5 rounded-md text-sky-600 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                        title={`Print ${section} only`}
                      >
                        <IconPrinter size={16} />
                      </button>
                      <Checkbox
                        checked={!!selectedSections[section]}
                        onChange={() => handleToggleSection(section)}
                        size={18}
                        className="ml-1"
                        checkedColor="text-sky-600"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 border-t border-default-200 dark:border-gray-700 px-4 py-3 bg-default-50 dark:bg-gray-800/50 rounded-b-lg">
              <div className="text-sm text-default-600 dark:text-gray-400 mb-2">
                <span className="font-medium">Selected:</span>{" "}
                {selectedEmployeeCount} of {totalEmployees} employee
                {totalEmployees === 1 ? "" : "s"}
              </div>
              <button
                onClick={() => print(selectedPayrolls)}
                disabled={selectedEmployeeCount === 0}
                type="button"
                className="w-full flex items-center justify-center px-3 h-9 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <IconPrinter size={16} className="mr-2" />
                Print
                {selectedEmployeeCount > 0 ? ` ${selectedEmployeeCount} ` : " "}
                Payslip{selectedEmployeeCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>,
          document.body
        )}

      {showOverlay && (
        <LoadingOverlay
          message={`Preparing ${printingCount} payslip${
            printingCount !== 1 ? "s" : ""
          } for printing...`}
          processingMessage="Opening print dialog..."
          onClose={() => setShowOverlay(false)}
        />
      )}
    </>
  );
};

export default PayrollSectionPrintMenu;
