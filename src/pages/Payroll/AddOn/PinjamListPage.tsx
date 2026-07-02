// src/pages/Payroll/PinjamListPage.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCash,
  IconRefresh,
  IconBuildingBank,
  IconPrinter,
  IconDownload,
  IconSquare,
  IconSquareCheckFilled,
  IconSquareMinusFilled,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import PinjamFormModal from "../../../components/Payroll/PinjamFormModal";
import { api } from "../../../routes/utils/api";
import TimeNavigator from "../../../components/TimeNavigator";
import toast from "react-hot-toast";
import {
  generatePinjamPDF,
  PinjamPDFData,
  PinjamEmployee,
} from "../../../utils/payroll/PinjamPDF";

interface PinjamRecord {
  id: number;
  employee_id: string;
  employee_name: string;
  year: number;
  month: number;
  amount: number;
  description: string;
  pinjam_type: "mid_month" | "monthly";
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

interface MidMonthPayroll {
  employee_id: string;
  employee_name: string;
  amount: number;
}

interface EmployeePayrollSummary {
  employee_payroll_id?: number;
  employee_id: string;
  employee_name: string;
  net_pay: number;
  setelah_digenapkan?: number;
}

interface PinjamSummary {
  employee_id: string;
  employee_name: string;
  mid_month: {
    total_amount: number;
    details: string[];
    record_count: number;
  };
  monthly: {
    total_amount: number;
    details: string[];
    record_count: number;
  };
}

interface EmployeePinjamData {
  employee_payroll_id?: number;
  employee_id: string;
  employee_name: string;
  latestPinjamTime: number;
  midMonthPay: number;
  netPay: number;
  setelahDigenapkan?: number;
  midMonthPinjam: number;
  midMonthPinjamDetails: string[];
  monthlyPinjam: number;
  monthlyPinjamDetails: string[];
  gajiGenap: number;
}

// Default to the previous month during the first week (1st-7th), else current month
const getDefaultPinjamMonth = (
  today: Date = new Date()
): { year: number; month: number } => {
  const monthOffset = today.getDate() <= 7 ? -1 : 0;
  const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

const getInitialPinjamPeriod = (): { year: number; month: number } => {
  const fallbackPeriod = getDefaultPinjamMonth();
  const params = new URLSearchParams(window.location.search);
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));

  if (
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= 2100 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  ) {
    return { year, month };
  }

  return fallbackPeriod;
};

const getInitialSearchQuery = (): string => {
  const params = new URLSearchParams(window.location.search);
  return params.get("search")?.trim() || "";
};

const getPinjamActivityTime = (
  record: Pick<PinjamRecord, "created_at" | "updated_at">
): number => {
  const activityDate = record.updated_at || record.created_at;
  const parsedTime = Date.parse(activityDate);
  return Number.isNaN(parsedTime) ? 0 : parsedTime;
};

const PinjamListPage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [pinjamRecords, setPinjamRecords] = useState<PinjamRecord[]>([]);
  const [pinjamSummary, setPinjamSummary] = useState<PinjamSummary[]>([]);
  const [midMonthPayrolls, setMidMonthPayrolls] = useState<MidMonthPayroll[]>(
    []
  );
  const [employeePayrolls, setEmployeePayrolls] = useState<
    EmployeePayrollSummary[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PinjamRecord | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Selection state
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(
    new Set()
  );
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Filters
  const [currentYear, setCurrentYear] = useState<number>(
    () => getInitialPinjamPeriod().year
  );
  const [currentMonth, setCurrentMonth] = useState<number>(
    () => getInitialPinjamPeriod().month
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    getInitialSearchQuery
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Month range for the TimeNavigator (the page always targets one month).
  const monthRange = useMemo(
    () => ({
      start: new Date(currentYear, currentMonth - 1, 1),
      end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999),
    }),
    [currentYear, currentMonth]
  );

  const handleTimeNavigatorChange = (range: { start: Date; end: Date }) => {
    setCurrentYear(range.start.getFullYear());
    setCurrentMonth(range.start.getMonth() + 1);
  };

  // Start typing anywhere to focus the search box and begin filtering
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;

      const tagName = target.tagName.toLowerCase();
      return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      );
    };

    const handleSearchTypingShortcut = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1 ||
        !searchInputRef.current ||
        showAddModal ||
        showDeleteDialog ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
      setSearchQuery((prev) => `${prev}${event.key}`);
    };

    document.addEventListener("keydown", handleSearchTypingShortcut);
    return () => {
      document.removeEventListener("keydown", handleSearchTypingShortcut);
    };
  }, [showAddModal, showDeleteDialog]);

  // Load data on mount and filter changes
  useEffect(() => {
    fetchAllData();
  }, [currentYear, currentMonth]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(
        `/api/pinjam-records/dashboard?year=${currentYear}&month=${currentMonth}`
      );

      // Set all state from single response
      setPinjamRecords(response.pinjamRecords || []);
      setPinjamSummary(response.pinjamSummary || []);
      setMidMonthPayrolls(response.midMonthPayrolls || []);
      setEmployeePayrolls(response.employeePayrolls || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (record: PinjamRecord) => {
    setEditingRecord(record);
    setShowAddModal(true);
  };

  const handleDeleteRecord = async () => {
    if (!deletingId) return;

    try {
      await api.delete(`/api/pinjam-records/${deletingId}`);
      toast.success("Pinjam record deleted successfully");
      setShowDeleteDialog(false);
      setDeletingId(null);
      await fetchAllData();
    } catch (error) {
      console.error("Error deleting pinjam record:", error);
      toast.error("Failed to delete pinjam record");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const handleModalClose = () => {
    setShowAddModal(false);
    setEditingRecord(null);
  };

  const handleModalSuccess = () => {
    fetchAllData();
    handleModalClose();
  };

  const sortedPinjamRecords = useMemo<PinjamRecord[]>(() => {
    return [...pinjamRecords].sort((a: PinjamRecord, b: PinjamRecord) => {
      const activityTimeDiff =
        getPinjamActivityTime(b) - getPinjamActivityTime(a);
      if (activityTimeDiff !== 0) return activityTimeDiff;
      return b.id - a.id;
    });
  }, [pinjamRecords]);

  const employeeData = useMemo<EmployeePinjamData[]>(() => {
    const latestPinjamTimesByEmployee = new Map<string, number>();
    const latestPinjamTimesByName = new Map<string, number>();

    pinjamRecords.forEach((record: PinjamRecord) => {
      const latestTime = getPinjamActivityTime(record);
      const currentLatestTime =
        latestPinjamTimesByEmployee.get(record.employee_id) ?? 0;
      const currentLatestNameTime =
        latestPinjamTimesByName.get(record.employee_name) ?? 0;

      if (latestTime > currentLatestTime) {
        latestPinjamTimesByEmployee.set(record.employee_id, latestTime);
      }

      if (latestTime > currentLatestNameTime) {
        latestPinjamTimesByName.set(record.employee_name, latestTime);
      }
    });

    const employeeMap = new Map<
      string,
      Omit<EmployeePinjamData, "gajiGenap">
    >();

    // 1. Iterate through pinjamSummary as the source of truth for employees with pinjam
    pinjamSummary.forEach((pinjamRecord) => {
      const employeeId = pinjamRecord.employee_id;

      // Find corresponding pay data
      const midMonthRecord = midMonthPayrolls.find(
        (p) => p.employee_id === employeeId
      );
      const payrollRecord = employeePayrolls.find(
        (p) => p.employee_id === employeeId
      );

      employeeMap.set(employeeId, {
        employee_payroll_id: payrollRecord?.employee_payroll_id,
        employee_id: employeeId,
        employee_name: pinjamRecord.employee_name,
        latestPinjamTime: Math.max(
          latestPinjamTimesByEmployee.get(employeeId) ?? 0,
          latestPinjamTimesByName.get(pinjamRecord.employee_name) ?? 0
        ),
        midMonthPay: midMonthRecord?.amount || 0,
        netPay: payrollRecord?.net_pay || 0,
        setelahDigenapkan: payrollRecord?.setelah_digenapkan,
        midMonthPinjam: pinjamRecord.mid_month.total_amount || 0,
        midMonthPinjamDetails: pinjamRecord.mid_month.details || [],
        monthlyPinjam: pinjamRecord.monthly.total_amount || 0,
        monthlyPinjamDetails: pinjamRecord.monthly.details || [],
      });
    });

    // 2. Convert map to array, calculate gajiGenap, and sort by latest activity
    return Array.from(employeeMap.values())
      .map(
        (emp: Omit<EmployeePinjamData, "gajiGenap">): EmployeePinjamData => ({
          ...emp,
          gajiGenap:
            emp.setelahDigenapkan ?? Math.ceil(emp.netPay - emp.midMonthPay),
        })
      )
      .sort((a: EmployeePinjamData, b: EmployeePinjamData) => {
        const activityTimeDiff = b.latestPinjamTime - a.latestPinjamTime;
        if (activityTimeDiff !== 0) return activityTimeDiff;
        return a.employee_name.localeCompare(b.employee_name);
      });
  }, [midMonthPayrolls, pinjamSummary, employeePayrolls, pinjamRecords]);

  // Filter employees by name / staff ID (case-insensitive)
  const filteredEmployeeData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return employeeData;
    return employeeData.filter(
      (emp) =>
        emp.employee_name.toLowerCase().includes(q) ||
        emp.employee_id.toLowerCase().includes(q)
    );
  }, [employeeData, searchQuery]);

  const filteredPinjamRecords = useMemo<PinjamRecord[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedPinjamRecords;

    return sortedPinjamRecords.filter(
      (record: PinjamRecord) =>
        record.employee_name.toLowerCase().includes(q) ||
        record.employee_id.toLowerCase().includes(q)
    );
  }, [searchQuery, sortedPinjamRecords]);

  // Calculate totals (reflect the filtered/visible set)
  const totalMidMonthPinjam = filteredEmployeeData.reduce(
    (sum, emp) => sum + emp.midMonthPinjam,
    0
  );
  const totalMonthlyPinjam = filteredEmployeeData.reduce(
    (sum, emp) => sum + emp.monthlyPinjam,
    0
  );

  // Selection handlers
  const handleEmployeeSelect = (employeeId: string, isSelected: boolean) => {
    const newSelected = new Set(selectedEmployees);
    if (isSelected) {
      newSelected.add(employeeId);
    } else {
      newSelected.delete(employeeId);
    }
    setSelectedEmployees(newSelected);
  };

  const handleSelectAll = (isSelected: boolean) => {
    // Only affect the currently filtered/visible employees; preserve any
    // selections that fall outside the active search.
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      filteredEmployeeData.forEach((emp) => {
        if (isSelected) {
          next.add(emp.employee_id);
        } else {
          next.delete(emp.employee_id);
        }
      });
      return next;
    });
  };

  const isAllSelected =
    filteredEmployeeData.length > 0 &&
    filteredEmployeeData.every((emp) => selectedEmployees.has(emp.employee_id));
  const isPartiallySelected =
    filteredEmployeeData.some((emp) =>
      selectedEmployees.has(emp.employee_id)
    ) && !isAllSelected;

  // PDF generation function
  const generatePDFForSelected = async (action: "download" | "print") => {
    if (selectedEmployees.size === 0) {
      toast.error("Please select at least one employee to generate PDF");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const selectedEmployeeData = employeeData.filter((emp) =>
        selectedEmployees.has(emp.employee_id)
      );

      const pinjamEmployees: PinjamEmployee[] = selectedEmployeeData.map(
        (emp) => ({
          employee_id: emp.employee_id,
          employee_name: emp.employee_name,
          midMonthPay: emp.midMonthPay,
          netPay: emp.netPay,
          midMonthPinjam: emp.midMonthPinjam,
          midMonthPinjamDetails: emp.midMonthPinjamDetails,
          monthlyPinjam: emp.monthlyPinjam,
          monthlyPinjamDetails: emp.monthlyPinjamDetails,
          gajiGenap: emp.gajiGenap,
        })
      );

      const selectedTotalMidMonth = selectedEmployeeData.reduce(
        (sum, emp) => sum + emp.midMonthPinjam,
        0
      );
      const selectedTotalMonthly = selectedEmployeeData.reduce(
        (sum, emp) => sum + emp.monthlyPinjam,
        0
      );

      const pdfData: PinjamPDFData = {
        employees: pinjamEmployees,
        year: currentYear,
        month: currentMonth,
        totalMidMonthPinjam: selectedTotalMidMonth,
        totalMonthlyPinjam: selectedTotalMonthly,
      };

      await generatePinjamPDF(pdfData, action);

      const actionText = action === "download" ? "downloaded" : "generated";
      toast.success(`Pinjam summary ${actionText} successfully`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
          <div className="flex gap-4 items-end">
            <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100 self-center">
              Pinjam System
            </h1>
            <div className="self-center h-8 border-l border-default-300 dark:border-gray-600" />
            <TimeNavigator
              range={monthRange}
              onChange={handleTimeNavigatorChange}
              modes={["month"]}
              presets={false}
            />
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-sm font-medium text-default-700 dark:text-gray-200">
              Total Pinjam:
            </span>
            <span className="font-semibold text-lg text-default-800 dark:text-gray-100">
              {formatCurrency(totalMidMonthPinjam + totalMonthlyPinjam)}
            </span>
          </div>
        </div>
      </div>

      {/* Selection Controls + Actions (sticky) */}
      <div
        className="bg-white dark:bg-gray-800 rounded-lg cursor-pointer border border-default-200 dark:border-gray-700 shadow-sm p-3 sticky top-1 z-20"
        onClick={() => handleSelectAll(!isAllSelected)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-4 min-w-0">
            <div className="flex items-center space-x-2">
              {isAllSelected ? (
                <IconSquareCheckFilled className="text-blue-600" size={20} />
              ) : isPartiallySelected ? (
                <IconSquareMinusFilled className="text-blue-600" size={20} />
              ) : (
                <IconSquare
                  className="text-default-400 group-hover:text-blue-500 transition-colors"
                  size={20}
                />
              )}
              <span className="text-sm font-medium text-default-700 dark:text-gray-200">
                Select All ({filteredEmployeeData.length})
              </span>
            </div>
            {selectedEmployees.size > 0 && (
              <span className="text-sm text-sky-600 dark:text-sky-400 font-medium whitespace-nowrap">
                {selectedEmployees.size} employee
                {selectedEmployees.size > 1 ? "s" : ""} selected
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-2 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-52">
              <IconSearch
                size={15}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff"
                className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1.5 pl-8 pr-8 text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-400 hover:bg-default-100 dark:text-gray-500 dark:hover:bg-gray-700"
                  title="Clear search"
                >
                  <IconX size={13} />
                </button>
              )}
            </div>
            <Button
              onClick={fetchAllData}
              icon={IconRefresh}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              Refresh
            </Button>
            <Button
              onClick={() => generatePDFForSelected("print")}
              icon={IconPrinter}
              color="green"
              variant="outline"
              size="sm"
              disabled={selectedEmployees.size === 0 || isGeneratingPDF}
            >
              Print ({selectedEmployees.size})
            </Button>
            <Button
              onClick={() => generatePDFForSelected("download")}
              icon={IconDownload}
              color="blue"
              variant="outline"
              size="sm"
              disabled={selectedEmployees.size === 0 || isGeneratingPDF}
            >
              Download ({selectedEmployees.size})
            </Button>
            <Button
              onClick={() => setShowAddModal(true)}
              icon={IconPlus}
              color="sky"
              variant="filled"
              size="sm"
            >
              Record Pinjam
            </Button>
          </div>
        </div>
      </div>

      {/* Individual Employee Records - Card Grid Layout */}
      <div>
        {filteredEmployeeData.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
            <div className="text-center py-12 text-default-500 dark:text-gray-400">
              <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
              <p className="text-lg font-medium">
                {searchQuery
                  ? "No employees match your search"
                  : "No employee records found"}
              </p>
              <p>
                {searchQuery
                  ? "Try a different name or staff ID"
                  : "No mid-month pay or pinjam records for this period"}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredEmployeeData.map((employee) => {
              const isSelected = selectedEmployees.has(employee.employee_id);
              const hasMid = employee.midMonthPinjam > 0;
              const hasMonthly = employee.monthlyPinjam > 0;
              const isWide = hasMid && hasMonthly;

              const canNavigate = employee.employee_payroll_id != null;

              const handleCardClick = (e: React.MouseEvent) => {
                // Prevent navigation if clicking specifically on the checkbox icon/wrapper
                // OR the header section itself (which now handles selection)
                if (
                  (e.target as HTMLElement).closest(
                    ".employee-card-select-action"
                  ) ||
                  (e.target as HTMLElement).closest(".employee-card-header")
                ) {
                  return;
                }
                // Clicking the card body opens this worker's Payroll Details,
                // scrolled down to the Pinjam summary at the bottom.
                if (canNavigate) {
                  navigate(
                    `/payroll/employee-payroll/${employee.employee_payroll_id}?scrollTo=pinjam`
                  );
                }
              };

              const handleHeaderClick = (e: React.MouseEvent) => {
                // If the click was directly on the checkbox icon area within the header,
                // let its specific handler manage it (avoids double toggling).
                if (
                  (e.target as HTMLElement).closest(
                    ".employee-card-select-action"
                  )
                ) {
                  return;
                }
                e.stopPropagation(); // Prevent card navigation click
                handleEmployeeSelect(employee.employee_id, !isSelected); // Trigger selection
              };

              const handleSelectIconClick = (e: React.MouseEvent) => {
                e.stopPropagation(); // Prevent card click handler AND header click handler
                handleEmployeeSelect(employee.employee_id, !isSelected);
              };

              return (
                <div
                  key={employee.employee_id}
                  className={`relative border rounded-lg overflow-hidden bg-white dark:bg-gray-800 transition-shadow duration-200 group ${
                    isSelected
                      ? "shadow-md ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-1"
                      : "shadow-sm hover:shadow-md"
                  } ${isWide ? "sm:col-span-2 lg:col-span-2" : ""} ${
                    canNavigate ? "cursor-pointer" : ""
                  } border-default-200 dark:border-gray-700 px-4 pb-4 space-y-3`}
                  onClick={handleCardClick}
                  title={
                    canNavigate
                      ? `View ${employee.employee_name}'s Payroll Details (Pinjam summary)`
                      : undefined
                  }
                >
                  {/* Employee header - Now clickable for selection */}
                  <div
                    className="employee-card-header flex justify-between items-center gap-3 border-b border-default-200 dark:border-gray-700 bg-default-50 dark:bg-gray-900/50 -mx-4 px-4 py-3 rounded-t-lg cursor-pointer"
                    onClick={handleHeaderClick}
                  >
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-default-800 dark:text-gray-100 truncate">
                        {employee.employee_name}
                      </h3>
                      <p className="text-sm text-default-500 dark:text-gray-400">
                        {employee.employee_id}
                      </p>
                    </div>

                    {/* Selection Checkbox Area - Still clickable individually */}
                    <div
                      className="employee-card-select-action flex-shrink-0 z-0"
                      onClick={handleSelectIconClick}
                    >
                      {isSelected ? (
                        <IconSquareCheckFilled
                          className="text-blue-600 cursor-pointer"
                          size={22}
                        />
                      ) : (
                        <IconSquare
                          className="text-default-400 group-hover:text-blue-500 transition-colors cursor-pointer"
                          size={22}
                        />
                      )}
                    </div>
                  </div>

                  {/* Body - only renders the sections that have pinjam.
                      Clicking it opens this worker's Payroll Details (Pinjam summary). */}
                  <div
                    className={`employee-card-body space-y-4 ${
                      canNavigate ? "cursor-pointer" : ""
                    }`}
                    title={
                      canNavigate
                        ? `View ${employee.employee_name}'s Payroll Details (Pinjam summary)`
                        : undefined
                    }
                  >
                    <div
                      className={`flex h-full ${
                        isWide
                          ? "gap-6 divide-x divide-default-200 dark:divide-gray-700"
                          : ""
                      } ${canNavigate ? "cursor-pointer" : ""}`}
                    >
                      {/* Mid-month Pay Section */}
                      {hasMid && (
                        <div
                          className={`min-w-0 flex flex-col ${
                            isWide ? "flex-1 pr-6" : "w-full"
                          }`}
                        >
                          <div className="mb-3">
                            <p
                              className="text-sm text-default-500 dark:text-gray-400 mb-1 truncate"
                              title="Mid-month Pay (Before Pinjam)"
                            >
                              Mid-Month Pay (Before Pinjam)
                            </p>
                            <p className="text-xl font-bold text-default-800 dark:text-gray-100">
                              {formatCurrency(employee.midMonthPay)}
                            </p>
                          </div>

                          {employee.midMonthPinjamDetails.length > 0 && (
                            <div className="mb-3">
                              <p className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                                Pinjam Items:
                              </p>
                              <div className="space-y-1 text-sm text-default-600 dark:text-gray-300">
                                {employee.midMonthPinjamDetails.map(
                                  (detail, index) => (
                                    <div
                                      key={index}
                                      className="flex items-start"
                                    >
                                      <span className="text-default-400 mr-2 mt-0.5">
                                        •
                                      </span>
                                      <span>{detail}</span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                          <div className="text-sm">
                            <div className="flex justify-between mb-2">
                              <span className="text-default-600 dark:text-gray-300">
                                Jumlah Pinjam:
                              </span>
                              <span className="font-semibold text-red-600">
                                - {formatCurrency(employee.midMonthPinjam)}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold">
                              <span
                                className="text-default-800 dark:text-gray-100 truncate mr-2"
                                title="Final Mid-month Pay"
                              >
                                Final Mid-month pay:
                              </span>
                              <span
                                className="text-lg font-bold truncate text-sky-600 dark:text-sky-400"
                                title={formatCurrency(
                                  employee.midMonthPay - employee.midMonthPinjam
                                )}
                              >
                                {formatCurrency(
                                  employee.midMonthPay - employee.midMonthPinjam
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Monthly Pay Section */}
                      {hasMonthly && (
                        <div
                          className={`min-w-0 flex flex-col ${
                            isWide ? "flex-1 pl-6" : "w-full"
                          }`}
                        >
                          <div className="mb-3">
                            <p
                              className="text-sm text-default-500 dark:text-gray-400 mb-1 truncate"
                              title="Gaji Genap (Before Pinjam)"
                            >
                              Gaji Genap (Before Pinjam)
                            </p>
                            <p className="text-xl font-bold text-default-800 dark:text-gray-100">
                              {formatCurrency(employee.gajiGenap)}
                            </p>
                          </div>

                          {employee.monthlyPinjamDetails.length > 0 && (
                            <div className="mb-3">
                              <p className="text-sm font-medium text-default-700 dark:text-gray-200 mb-2">
                                Pinjam Items:
                              </p>
                              <div className="space-y-1 text-sm text-default-600 dark:text-gray-300">
                                {employee.monthlyPinjamDetails.map(
                                  (detail, index) => (
                                    <div
                                      key={index}
                                      className="flex items-start"
                                    >
                                      <span className="text-default-400 mr-2 mt-0.5">
                                        •
                                      </span>
                                      <span>{detail}</span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                          <div className="text-sm">
                            <div className="flex justify-between mb-2">
                              <span className="text-default-600 dark:text-gray-300">
                                Jumlah Pinjam:
                              </span>
                              <span className="font-semibold text-red-600">
                                - {formatCurrency(employee.monthlyPinjam)}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold">
                              <span
                                className="text-default-800 dark:text-gray-100 flex items-center truncate mr-2"
                                title="Jumlah Masuk Bank"
                              >
                                <IconBuildingBank className="w-4 h-4 mr-1.5 flex-shrink-0" />
                                <span className="truncate">
                                  Jumlah Masuk Bank:
                                </span>
                              </span>
                              <span className="text-lg font-bold text-sky-600 dark:text-sky-400">
                                {formatCurrency(
                                  employee.gajiGenap - employee.monthlyPinjam
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All Pinjam Records Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 shadow-sm">
        <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-default-800 dark:text-gray-100">
            All Pinjam Records
          </h3>
        </div>

        {filteredPinjamRecords.length === 0 ? (
          <div className="text-center py-12 text-default-500 dark:text-gray-400">
            <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">
              {searchQuery.trim()
                ? "No pinjam records match your search"
                : "No pinjam records found"}
            </p>
            <p>
              {searchQuery.trim()
                ? "Try a different name or staff ID"
                : 'Click "Record Pinjam" to add pinjam records'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Last Changed
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                {filteredPinjamRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-default-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900 dark:text-gray-100">
                      <div>
                        <div>{record.employee_name}</div>
                        <div className="text-xs text-default-500 dark:text-gray-400">
                          {record.employee_id}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          record.pinjam_type === "mid_month"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        }`}
                      >
                        {record.pinjam_type === "mid_month"
                          ? "Mid-month"
                          : "Monthly"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-800 dark:text-gray-100">
                      {formatCurrency(record.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900 dark:text-gray-100">
                      {record.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500 dark:text-gray-400">
                      {format(
                        new Date(record.updated_at || record.created_at),
                        "dd MMM yyyy"
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(record)}
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(record.id);
                            setShowDeleteDialog(true);
                          }}
                          className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"
                          title="Delete"
                        >
                          <IconTrash size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <PinjamFormModal
        isOpen={showAddModal}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        currentYear={currentYear}
        currentMonth={currentMonth}
        editingRecord={editingRecord}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
        onConfirm={handleDeleteRecord}
        title="Delete Pinjam Record"
        message="Are you sure you want to delete this pinjam record? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default PinjamListPage;
