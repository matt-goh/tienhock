// src/pages/Payroll/PinjamListPage.tsx
import React, { useState, useEffect, useMemo } from "react";
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
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { FormListbox } from "../../components/FormComponents";
import { getMonthName } from "../../utils/payroll/payrollUtils";
import PinjamFormModal from "../../components/Payroll/PinjamFormModal";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import { generatePinjamPDF, PinjamPDFData, PinjamEmployee } from "../../utils/payroll/PinjamPDF";

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
}

interface MidMonthPayroll {
  employee_id: string;
  employee_name: string;
  amount: number;
}

interface EmployeePayrollSummary {
  employee_id: string;
  employee_name: string;
  net_pay: number;
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

const PinjamListPage: React.FC = () => {
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
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Filters
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Generate year and month options
  const yearOptions = useMemo(() => {
    const years = [];
    const thisYear = new Date().getFullYear();
    for (let year = thisYear - 2; year <= thisYear + 1; year++) {
      years.push({ id: year, name: year.toString() });
    }
    return years;
  }, []);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: getMonthName(i + 1),
      })),
    []
  );

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

  const employeeData = useMemo(() => {
    const employeeMap = new Map<
      string,
      {
        employee_id: string;
        employee_name: string;
        midMonthPay: number;
        netPay: number;
        midMonthPinjam: number;
        midMonthPinjamDetails: string[];
        monthlyPinjam: number;
        monthlyPinjamDetails: string[];
      }
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
        employee_id: employeeId,
        employee_name: pinjamRecord.employee_name,
        midMonthPay: midMonthRecord?.amount || 0,
        netPay: payrollRecord?.net_pay || 0,
        midMonthPinjam: pinjamRecord.mid_month.total_amount || 0,
        midMonthPinjamDetails: pinjamRecord.mid_month.details || [],
        monthlyPinjam: pinjamRecord.monthly.total_amount || 0,
        monthlyPinjamDetails: pinjamRecord.monthly.details || [],
      });
    });

    // 2. Convert map to array, calculate gajiGenap, and sort
    return Array.from(employeeMap.values())
      .map((emp) => ({
        ...emp,
        gajiGenap: emp.netPay - emp.midMonthPay,
      }))
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  }, [midMonthPayrolls, pinjamSummary, employeePayrolls]);

  // Calculate totals
  const totalMidMonthPinjam = employeeData.reduce(
    (sum, emp) => sum + emp.midMonthPinjam,
    0
  );
  const totalMonthlyPinjam = employeeData.reduce(
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
    if (isSelected) {
      const allEmployeeIds = new Set(employeeData.map(emp => emp.employee_id));
      setSelectedEmployees(allEmployeeIds);
    } else {
      setSelectedEmployees(new Set());
    }
  };

  const isAllSelected = employeeData.length > 0 && selectedEmployees.size === employeeData.length;
  const isPartiallySelected = selectedEmployees.size > 0 && selectedEmployees.size < employeeData.length;

  // PDF generation function
  const generatePDFForSelected = async (action: "download" | "print") => {
    if (selectedEmployees.size === 0) {
      toast.error("Please select at least one employee to generate PDF");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const selectedEmployeeData = employeeData.filter(emp => 
        selectedEmployees.has(emp.employee_id)
      );

      const pinjamEmployees: PinjamEmployee[] = selectedEmployeeData.map(emp => ({
        employee_id: emp.employee_id,
        employee_name: emp.employee_name,
        midMonthPay: emp.midMonthPay,
        netPay: emp.netPay,
        midMonthPinjam: emp.midMonthPinjam,
        midMonthPinjamDetails: emp.midMonthPinjamDetails,
        monthlyPinjam: emp.monthlyPinjam,
        monthlyPinjamDetails: emp.monthlyPinjamDetails,
        gajiGenap: emp.gajiGenap,
      }));

      const selectedTotalMidMonth = selectedEmployeeData.reduce(
        (sum, emp) => sum + emp.midMonthPinjam, 0
      );
      const selectedTotalMonthly = selectedEmployeeData.reduce(
        (sum, emp) => sum + emp.monthlyPinjam, 0
      );

      const pdfData: PinjamPDFData = {
        employees: pinjamEmployees,
        year: currentYear,
        month: currentMonth,
        totalMidMonthPinjam: selectedTotalMidMonth,
        totalMonthlyPinjam: selectedTotalMonthly,
      };

      await generatePinjamPDF(pdfData, action);
      
      const actionText = action === "download" ? "downloaded" : "sent to printer";
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
    <div className="relative w-full space-y-4 mx-4 mb-4 md:mx-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-xl font-semibold text-default-800">
          Pinjam System
        </h1>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <Button
            onClick={fetchAllData}
            icon={IconRefresh}
            variant="outline"
            disabled={isLoading}
          >
            Refresh
          </Button>
          <div className="flex space-x-2">
            <Button
              onClick={() => generatePDFForSelected("print")}
              icon={IconPrinter}
              color="green"
              variant="outline"
              disabled={selectedEmployees.size === 0 || isGeneratingPDF}
            >
              Print ({selectedEmployees.size})
            </Button>
            <Button
              onClick={() => generatePDFForSelected("download")}
              icon={IconDownload}
              color="blue"
              variant="outline"
              disabled={selectedEmployees.size === 0 || isGeneratingPDF}
            >
              Download ({selectedEmployees.size})
            </Button>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            icon={IconPlus}
            color="sky"
            variant="filled"
          >
            Record Pinjam
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-default-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end justify-between">
          <FormListbox
            name="year"
            label="Year"
            value={currentYear.toString()}
            onChange={(value) => setCurrentYear(Number(value))}
            options={yearOptions}
          />
          <FormListbox
            name="month"
            label="Month"
            value={currentMonth.toString()}
            onChange={(value) => setCurrentMonth(Number(value))}
            options={monthOptions}
          />
          <div>
            <label className="block text-sm font-medium text-default-700">
              Total Pinjam
            </label>
            <div className="mt-1 flex items-center px-3 h-[42px] w-full rounded-md border border-default-200 bg-default-50">
              <span className="font-semibold text-lg text-default-800">
                {formatCurrency(totalMidMonthPinjam + totalMonthlyPinjam)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Selection Controls */}
      {employeeData.length > 0 && (
        <div className="bg-white rounded-lg border border-default-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center space-x-4 cursor-pointer flex-1"
              onClick={() => handleSelectAll(!isAllSelected)}
            >
              <div className="flex items-center space-x-2">
                {isAllSelected ? (
                  <IconSquareCheckFilled
                    className="text-blue-600"
                    size={20}
                  />
                ) : isPartiallySelected ? (
                  <IconSquareMinusFilled
                    className="text-blue-600"
                    size={20}
                  />
                ) : (
                  <IconSquare
                    className="text-default-400 group-hover:text-blue-500 transition-colors"
                    size={20}
                  />
                )}
                <span className="text-sm font-medium text-default-700">
                  Select All ({employeeData.length})
                </span>
              </div>
              {selectedEmployees.size > 0 && (
                <span className="text-sm text-sky-600 font-medium">
                  {selectedEmployees.size} employee{selectedEmployees.size > 1 ? 's' : ''} selected
                </span>
              )}
            </div>
            {selectedEmployees.size > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEmployees(new Set());
                }}
                className="text-sm text-default-500 hover:text-default-700"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>
      )}

      {/* Individual Employee Records - Card Grid Layout */}
      <div>
        {employeeData.length === 0 ? (
          <div className="bg-white rounded-lg border border-default-200 shadow-sm">
            <div className="text-center py-12 text-default-500">
              <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
              <p className="text-lg font-medium">No employee records found</p>
              <p>No mid-month pay or pinjam records for this period</p>
            </div>
          </div>
        ) : (
          <div
            className={`grid gap-4 ${
              employeeData.length === 1
                ? "grid-cols-1 max-w-2xl mx-auto"
                : "grid-cols-1 lg:grid-cols-2"
            }`}
          >
            {employeeData.map((employee) => {
              const isSelected = selectedEmployees.has(employee.employee_id);
              
              const handleCardClick = (e: React.MouseEvent) => {
                // Prevent navigation if clicking specifically on the checkbox icon/wrapper
                // OR the header section itself (which now handles selection)
                if (
                  (e.target as HTMLElement).closest(".employee-card-select-action") ||
                  (e.target as HTMLElement).closest(".employee-card-header")
                ) {
                  return;
                }
                // Add any additional card click behavior here if needed
              };

              const handleHeaderClick = (e: React.MouseEvent) => {
                // If the click was directly on the checkbox icon area within the header,
                // let its specific handler manage it (avoids double toggling).
                if ((e.target as HTMLElement).closest(".employee-card-select-action")) {
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
                  className={`relative border rounded-lg overflow-hidden bg-white transition-shadow duration-200 group ${
                    isSelected
                      ? "shadow-md ring-2 ring-blue-500 ring-offset-1"
                      : "shadow-sm hover:shadow-md"
                  } border-default-200 p-4 space-y-3`}
                  onClick={handleCardClick}
                >
                {/* Employee header - Now clickable for selection */}
                <div 
                  className="employee-card-header flex justify-between items-center gap-3 border-b border-default-200 bg-default-50 -mx-4 -mt-4 px-4 py-3 rounded-t-lg cursor-pointer"
                  onClick={handleHeaderClick}
                >
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-default-800 truncate">
                      {employee.employee_name}
                    </h3>
                    <p className="text-sm text-default-500">
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

                {/* Body - Horizontal layout for content sections */}
                <div className="space-y-4">
                  <div className="flex gap-6 divide-x divide-default-200">
                      {/* Mid-month Pay Section */}
                      {employee.midMonthPinjam > 0 && (
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="mb-3">
                            <p className="text-sm text-default-500 mb-1">
                              Mid-Month Pay (Before Pinjam)
                            </p>
                            <p className="text-xl font-bold text-default-800">
                              {formatCurrency(employee.midMonthPay)}
                            </p>
                          </div>

                          {employee.midMonthPinjamDetails.length > 0 && (
                            <div className="mb-3">
                              <p className="text-sm font-medium text-default-700 mb-2">
                                Pinjam Items:
                              </p>
                              <div className="space-y-1 text-sm text-default-600">
                                {employee.midMonthPinjamDetails.map(
                                  (detail, index) => (
                                    <div key={index} className="flex items-start">
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
                              <span className="text-default-600">
                                Jumlah Pinjam:
                              </span>
                              <span className="font-semibold text-red-600">
                                - {formatCurrency(employee.midMonthPinjam)}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold">
                              <span className="text-default-800">
                                Final Mid-month pay:
                              </span>
                              <span className="text-lg font-bold text-sky-600">
                                {formatCurrency(
                                  employee.midMonthPay - employee.midMonthPinjam
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Monthly Pay Section */}
                      {employee.monthlyPinjam > 0 && (
                        <div className="flex-1 min-w-0 pl-6">
                          <div className="mb-3">
                            <p className="text-sm text-default-500 mb-1">
                              Gaji Genap (Before Pinjam)
                            </p>
                            <p className="text-xl font-bold text-default-800">
                              {formatCurrency(employee.gajiGenap)}
                            </p>
                          </div>

                          {employee.monthlyPinjamDetails.length > 0 && (
                            <div className="mb-3">
                              <p className="text-sm font-medium text-default-700 mb-2">
                                Pinjam Items:
                              </p>
                              <div className="space-y-1 text-sm text-default-600">
                                {employee.monthlyPinjamDetails.map(
                                  (detail, index) => (
                                    <div key={index} className="flex items-start">
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
                              <span className="text-default-600">
                                Jumlah Pinjam:
                              </span>
                              <span className="font-semibold text-red-600">
                                - {formatCurrency(employee.monthlyPinjam)}
                              </span>
                            </div>
                            <div className="flex justify-between font-semibold">
                              <span className="text-default-800 flex items-center">
                                <IconBuildingBank className="w-4 h-4 mr-1.5" />
                                Jumlah Masuk Bank:
                              </span>
                              <span className="text-lg font-bold text-sky-600">
                                {formatCurrency(
                                  employee.gajiGenap - employee.monthlyPinjam
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* No pinjam state */}
                      {employee.midMonthPinjam === 0 &&
                        employee.monthlyPinjam === 0 && (
                          <div className="flex-1 flex items-center justify-center text-default-400 py-6">
                            <div className="text-center">
                              <IconCash className="mx-auto h-8 w-8 text-default-300 mb-2" />
                              <p className="text-sm">No pinjam recorded</p>
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
      <div className="bg-white rounded-lg border border-default-200 shadow-sm">
        <div className="px-6 py-4 border-b border-default-200">
          <h3 className="text-lg font-medium text-default-800">
            All Pinjam Records
          </h3>
        </div>

        {pinjamRecords.length === 0 ? (
          <div className="text-center py-12 text-default-500">
            <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
            <p className="text-lg font-medium">No pinjam records found</p>
            <p>Click "Record Pinjam" to add pinjam records</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200">
              <thead className="bg-default-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-default-200">
                {pinjamRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-default-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-default-900">
                      <div>
                        <div>{record.employee_name}</div>
                        <div className="text-xs text-default-500">
                          {record.employee_id}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          record.pinjam_type === "mid_month"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {record.pinjam_type === "mid_month"
                          ? "Mid-month"
                          : "Monthly"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-default-800">
                      {formatCurrency(record.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-900">
                      {record.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-default-500">
                      {format(new Date(record.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleEdit(record)}
                          className="text-sky-600 hover:text-sky-800"
                          title="Edit"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(record.id);
                            setShowDeleteDialog(true);
                          }}
                          className="text-rose-600 hover:text-rose-800"
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
