// src/components/Payroll/PayrollSectionPrintMenu.tsx
import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { IconPrinter } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Checkbox from "../Checkbox";
import LoadingOverlay from "./LoadingOverlay";
import { EmployeePayroll, Employee, Job } from "../../types/types";
import {
  printBatchPayslips,
  createStaffDetailsMap,
} from "../../utils/payroll/PayslipManager";
import type {
  PayslipCompany,
  StaffDetails,
} from "../../utils/payroll/PayslipManager";
import { MidMonthPayroll } from "../../utils/payroll/midMonthPayrollUtils";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useJobsCache } from "../../utils/catalogue/useJobsCache";
import { useJPStaffsCache } from "../../utils/JellyPolly/useJPStaffsCache";
import { useJPJobsCache } from "../../utils/JellyPolly/useJPJobsCache";
import { JOB_CONFIGS } from "../../configs/payrollJobConfigs";

interface PayrollSectionPrintMenuProps {
  payrolls: EmployeePayroll[];
  midMonthPayrollsMap?: Record<string, MidMonthPayroll | null>;
  companyName?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  buttonLabel?: string;
  company?: PayslipCompany;
}

interface PayrollSectionPrintMenuContentProps
  extends Omit<PayrollSectionPrintMenuProps, "company"> {
  company: PayslipCompany;
  staffs: Employee[];
  jobs: Job[];
}

interface PayrollPrintGroup {
  key: string;
  label: string;
  rows: EmployeePayroll[];
  count: number;
}

const JOB_GROUPED_PAYSLIP_IDS: ReadonlySet<string> = new Set<string>([
  JOB_CONFIGS.MEE.id,
  ...JOB_CONFIGS.MEE.jobIds,
  JOB_CONFIGS.BIHUN.id,
  ...JOB_CONFIGS.BIHUN.jobIds,
]);

const splitJobTypes = (jobType: string): string[] => {
  return jobType
    .split(",")
    .map((value: string): string => value.trim())
    .filter((value: string): boolean => value.length > 0);
};

const uniqueJobTypes = (jobTypes: string[]): string[] => {
  return Array.from(new Set<string>(jobTypes));
};

const getPayrollJobTypes = (payroll: EmployeePayroll): string[] => {
  const mappedJobTypes: string[] = payroll.employee_job_mapping
    ? Object.values(payroll.employee_job_mapping).flatMap(
        (jobType: string): string[] => splitJobTypes(jobType)
      )
    : [];

  return uniqueJobTypes(
    mappedJobTypes.length > 0
      ? mappedJobTypes
      : splitJobTypes(payroll.job_type)
  );
};

const createScopedPayroll = (
  payroll: EmployeePayroll,
  printJobTypes?: string[]
): EmployeePayroll => {
  const scopedJobTypes: string[] = uniqueJobTypes(printJobTypes || []);

  if (scopedJobTypes.length === 0) {
    return payroll;
  }

  return {
    ...payroll,
    print_job_types: scopedJobTypes,
  };
};

const PayrollSectionPrintMenuContent: React.FC<
  PayrollSectionPrintMenuContentProps
> = ({
  payrolls,
  midMonthPayrollsMap,
  companyName = "TIEN HOCK FOOD INDUSTRIES S/B",
  size = "sm",
  disabled = false,
  buttonLabel = "Print Payslips",
  company,
  staffs,
  jobs,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [selectedGroups, setSelectedGroups] = useState<
    Record<string, boolean>
  >({});
  const [isPrinting, setIsPrinting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [printingCount, setPrintingCount] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const jobNameById = useMemo<Map<string, string>>(() => {
    return new Map<string, string>(
      jobs.map((job): [string, string] => [job.id, job.name || job.id])
    );
  }, [jobs]);

  const printGroups = useMemo<PayrollPrintGroup[]>(() => {
    const map = new Map<string, PayrollPrintGroup>();

    const addGroupRow = (
      key: string,
      label: string,
      payroll: EmployeePayroll,
      printJobTypes?: string[]
    ): void => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          rows: [],
          count: 0,
        });
      }

      const group: PayrollPrintGroup = map.get(key)!;
      group.rows.push(createScopedPayroll(payroll, printJobTypes));
      group.count = group.rows.length;
    };

    for (const payroll of payrolls) {
      const section: string = payroll.section || "Unknown";
      const payrollJobTypes: string[] = getPayrollJobTypes(payroll);
      const jobGroupedTypes: string[] = payrollJobTypes.filter(
        (jobType: string): boolean => JOB_GROUPED_PAYSLIP_IDS.has(jobType)
      );

      if (jobGroupedTypes.length === 0) {
        addGroupRow(`section:${section}`, section, payroll);
        continue;
      }

      jobGroupedTypes.forEach((jobType: string): void => {
        addGroupRow(
          `job:${jobType}`,
          jobNameById.get(jobType) || jobType,
          payroll,
          [jobType]
        );
      });

      const remainingJobTypes: string[] = payrollJobTypes.filter(
        (jobType: string): boolean => !JOB_GROUPED_PAYSLIP_IDS.has(jobType)
      );
      if (remainingJobTypes.length > 0) {
        addGroupRow(`section:${section}`, section, payroll, remainingJobTypes);
      }
    }

    return [...map.values()].sort((a: PayrollPrintGroup, b: PayrollPrintGroup) =>
      a.label.localeCompare(b.label)
    );
  }, [jobNameById, payrolls]);

  // Default all groups to checked; resync when the set of groups changes
  const groupKey = useMemo(
    (): string => printGroups.map((g: PayrollPrintGroup) => g.key).join("|"),
    [printGroups]
  );
  useEffect(() => {
    const next: Record<string, boolean> = {};
    printGroups.forEach((g: PayrollPrintGroup): void => {
      next[g.key] = true;
    });
    setSelectedGroups(next);
    // printGroups is derived from groupKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  useEffect(() => {
    if (isVisible && buttonRef.current) {
      const rect: DOMRect = buttonRef.current.getBoundingClientRect();
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

  const handleMouseEnter = (): void => {
    if (disabled) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(true), 0);
  };

  const handleMouseLeave = (): void => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(false), 100);
  };

  const handleToggleGroup = (groupKey: string): void => {
    setSelectedGroups((prev: Record<string, boolean>) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const allSelected: boolean =
    printGroups.length > 0 &&
    printGroups.every((g: PayrollPrintGroup): boolean => selectedGroups[g.key]);

  const handleSelectAll = (): void => {
    const next: Record<string, boolean> = {};
    printGroups.forEach((g: PayrollPrintGroup): void => {
      next[g.key] = !allSelected;
    });
    setSelectedGroups(next);
  };

  const selectedGroupCount: number = printGroups.filter(
    (g: PayrollPrintGroup): boolean => selectedGroups[g.key]
  ).length;

  const selectedPayrolls = useMemo<EmployeePayroll[]>(
    (): EmployeePayroll[] =>
      printGroups
        .filter((g: PayrollPrintGroup): boolean => selectedGroups[g.key])
        .flatMap((g: PayrollPrintGroup): EmployeePayroll[] => g.rows),
    [printGroups, selectedGroups]
  );

  const print = async (filtered: EmployeePayroll[]): Promise<void> => {
    if (filtered.length === 0) {
      toast.error("No payslips to print");
      return;
    }
    setIsVisible(false);
    setPrintingCount(filtered.length);
    setIsPrinting(true);
    setShowOverlay(true);

    const details: Record<string, StaffDetails> = createStaffDetailsMap(
      filtered,
      staffs,
      jobs
    );

    // The mid-month advance is resolved inside printBatchPayslips from the
    // /batch payroll fetch, so the (selection-scoped) parent map is only a
    // fallback here - whole-section employees still get their advance line.
    await printBatchPayslips(filtered, details, {
      companyName,
      company,
      midMonthPayrollsMap,
      onBeforePrint: (): void => {
        setShowOverlay(true);
      },
      onAfterPrint: (): void => {
        setIsPrinting(false);
        setShowOverlay(false);
      },
      onError: (): void => {
        setIsPrinting(false);
        setShowOverlay(false);
      },
    });
  };

  const buttonClasses: string =
    size === "sm"
      ? "flex items-center px-3 h-8 text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50 border border-default-300 dark:border-gray-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      : "flex items-center px-4 h-[42px] text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50 border border-default-300 dark:border-gray-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const iconSize: number = size === "sm" ? 16 : 18;

  const totalPayslipCount: number = printGroups.reduce(
    (sum: number, g: PayrollPrintGroup): number => sum + g.count,
    0
  );
  const selectedPayslipCount: number = selectedPayrolls.length;
  const triggerDisabled: boolean =
    disabled || isPrinting || payrolls.length === 0;

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(): void => {
          if (!triggerDisabled) setIsVisible(true);
        }}
        className={buttonClasses}
        type="button"
        disabled={triggerDisabled}
        title="Print pay slips by section or job"
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
                  Print Pay Slips
                </h3>
                <div className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300 rounded-full text-xs font-medium">
                  {selectedGroupCount}/{printGroups.length}
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

            {/* Print Options */}
            <div className="flex-grow overflow-y-auto py-1 max-h-80">
              {printGroups.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-default-500 dark:text-gray-400">
                  No pay slips available.
                </div>
              ) : (
                <div className="px-1 space-y-1">
                  {printGroups.map(({ key, label, rows, count }) => (
                    <div
                      key={key}
                      className="flex items-center px-3 py-2.5 hover:bg-default-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                      onClick={(): void => handleToggleGroup(key)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-default-700 dark:text-gray-200">
                          {label}
                        </div>
                        <div className="text-xs text-default-500 dark:text-gray-400">
                          {count} {count === 1 ? "employee" : "employees"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(
                          e: React.MouseEvent<HTMLButtonElement>
                        ): void => {
                          e.stopPropagation();
                          void print(rows);
                        }}
                        className="ml-2 mr-1 p-1.5 rounded-md text-sky-600 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                        title={`Print ${label} only`}
                      >
                        <IconPrinter size={16} />
                      </button>
                      <Checkbox
                        checked={!!selectedGroups[key]}
                        onChange={(): void => handleToggleGroup(key)}
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
                {selectedPayslipCount} of {totalPayslipCount} payslip
                {totalPayslipCount === 1 ? "" : "s"}
              </div>
              <button
                onClick={(): void => {
                  void print(selectedPayrolls);
                }}
                disabled={selectedPayslipCount === 0}
                type="button"
                className="w-full flex items-center justify-center px-3 h-9 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <IconPrinter size={16} className="mr-2" />
                Print
                {selectedPayslipCount > 0 ? ` ${selectedPayslipCount} ` : " "}
                Payslip{selectedPayslipCount === 1 ? "" : "s"}
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

const TienHockPayrollSectionPrintMenu: React.FC<
  PayrollSectionPrintMenuProps
> = (props) => {
  const { staffs } = useStaffsCache();
  const { jobs } = useJobsCache();

  return (
    <PayrollSectionPrintMenuContent
      payrolls={props.payrolls}
      midMonthPayrollsMap={props.midMonthPayrollsMap}
      companyName={props.companyName}
      size={props.size}
      disabled={props.disabled}
      buttonLabel={props.buttonLabel}
      company="tienhock"
      staffs={staffs}
      jobs={jobs}
    />
  );
};

const JellyPollyPayrollSectionPrintMenu: React.FC<
  PayrollSectionPrintMenuProps
> = (props) => {
  const { staffs } = useJPStaffsCache();
  const { jobs } = useJPJobsCache();

  return (
    <PayrollSectionPrintMenuContent
      payrolls={props.payrolls}
      midMonthPayrollsMap={props.midMonthPayrollsMap}
      companyName={props.companyName}
      size={props.size}
      disabled={props.disabled}
      buttonLabel={props.buttonLabel}
      company="jellypolly"
      staffs={staffs}
      jobs={jobs}
    />
  );
};

const PayrollSectionPrintMenu: React.FC<PayrollSectionPrintMenuProps> = (
  props
) => {
  if (props.company === "jellypolly") {
    return <JellyPollyPayrollSectionPrintMenu {...props} />;
  }

  return <TienHockPayrollSectionPrintMenu {...props} />;
};

export default PayrollSectionPrintMenu;
