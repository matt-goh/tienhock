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
} from "@tabler/icons-react";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { FormListbox } from "../../components/FormComponents";
import { getMonthName } from "../../utils/payroll/payrollUtils";
import PinjamFormModal from "../../components/Payroll/PinjamFormModal";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";

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
      await Promise.all([
        fetchPinjamRecords(),
        fetchPinjamSummary(),
        fetchMidMonthPayrolls(),
        fetchEmployeePayrolls(),
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPinjamRecords = async () => {
    try {
      const response = await api.get(
        `/api/pinjam-records?year=${currentYear}&month=${currentMonth}&limit=1000`
      );
      setPinjamRecords(response.records || []);
    } catch (error) {
      console.error("Error fetching pinjam records:", error);
    }
  };

  const fetchPinjamSummary = async () => {
    try {
      const response = await api.get(
        `/api/pinjam-records/summary?year=${currentYear}&month=${currentMonth}`
      );
      setPinjamSummary(response || []);
    } catch (error) {
      console.error("Error fetching pinjam summary:", error);
    }
  };

  const fetchMidMonthPayrolls = async () => {
    try {
      const response = await api.get(
        `/api/mid-month-payrolls?year=${currentYear}&month=${currentMonth}&limit=1000`
      );
      setMidMonthPayrolls(response.payrolls || []);
    } catch (error) {
      console.error("Error fetching mid-month payrolls:", error);
    }
  };

  const fetchEmployeePayrolls = async () => {
    try {
      const response = await api.get(
        `/api/monthly-payrolls?year=${currentYear}&month=${currentMonth}&include_employee_payrolls=true`
      );
      const allEmployeePayrolls: EmployeePayrollSummary[] = [];
      if (response && response.length > 0) {
        response.forEach((monthlyPayroll: any) => {
          if (monthlyPayroll.employee_payrolls) {
            monthlyPayroll.employee_payrolls.forEach((ep: any) => {
              allEmployeePayrolls.push({
                employee_id: ep.employee_id,
                employee_name: ep.employee_name || ep.name,
                net_pay: parseFloat(ep.net_pay || 0),
              });
            });
          }
        });
      }
      setEmployeePayrolls(allEmployeePayrolls);
    } catch (error) {
      console.error("Error fetching employee payrolls:", error);
      setEmployeePayrolls([]);
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

      {/* Individual Employee Records - Two-column layout */}
      <div className="space-y-4">
        {employeeData.length === 0 ? (
          <div className="bg-white rounded-lg border border-default-200 shadow-sm">
            <div className="text-center py-12 text-default-500">
              <IconCash className="mx-auto h-12 w-12 text-default-300 mb-4" />
              <p className="text-lg font-medium">No employee records found</p>
              <p>No mid-month pay or pinjam records for this period</p>
            </div>
          </div>
        ) : (
          employeeData.map((employee) => (
            <div
              key={employee.employee_id}
              className="bg-white rounded-lg border border-default-200 shadow-sm"
            >
              {/* Employee header */}
              <div className="px-6 py-3 border-b border-default-200 bg-default-50">
                <h3 className="text-lg font-medium text-default-800">
                  {employee.employee_name} ({employee.employee_id})
                </h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2">
                {/* Left Column - Mid-month Pay */}
                <div className="p-4 border-r border-default-200">
                  {employee.midMonthPinjam > 0 ? (
                    <>
                      <div className="bg-blue-50 rounded p-3 mb-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-blue-700">
                            Mid-month pay:
                          </span>
                          <span className="text-lg font-semibold text-blue-600">
                            {formatCurrency(employee.midMonthPay)}
                          </span>
                        </div>
                      </div>

                      {employee.midMonthPinjamDetails.length > 0 && (
                        <div className="space-y-2 mb-3">
                          <div className="text-sm font-medium text-default-700">
                            Pinjam items:
                          </div>
                          {employee.midMonthPinjamDetails.map(
                            (detail, index) => (
                              <div
                                key={index}
                                className="text-sm text-default-600 pl-2"
                              >
                                {detail}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      <div className="border-t pt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-default-600">
                            Jumlah Pinjam:
                          </span>
                          <span className="font-medium text-red-600">
                            {formatCurrency(employee.midMonthPinjam)}
                          </span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span className="text-default-700">
                            Mid-month pay:
                          </span>
                          <span className="text-green-600">
                            {formatCurrency(
                              employee.midMonthPay - employee.midMonthPinjam
                            )}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-default-400 p-4">
                        <IconCash className="mx-auto h-8 w-8 text-default-300 mb-2" />
                        <p className="text-sm">No mid-month pinjam recorded.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column - Monthly Pay */}
                <div className="p-4">
                  {employee.monthlyPinjam > 0 ? (
                    <>
                      <div className="bg-green-50 rounded p-3 mb-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-green-700">
                            Gaji Genap:
                          </span>
                          <span className="text-lg font-semibold text-green-600">
                            {formatCurrency(employee.gajiGenap)}
                          </span>
                        </div>
                      </div>

                      {employee.monthlyPinjamDetails.length > 0 && (
                        <div className="space-y-2 mb-3">
                          <div className="text-sm font-medium text-default-700">
                            Pinjam items:
                          </div>
                          {employee.monthlyPinjamDetails.map(
                            (detail, index) => (
                              <div
                                key={index}
                                className="text-sm text-default-600 pl-2"
                              >
                                {detail}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      <div className="border-t pt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-default-600">
                            Jumlah Pinjam:
                          </span>
                          <span className="font-medium text-red-600">
                            {formatCurrency(employee.monthlyPinjam)}
                          </span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span className="text-default-700 flex items-center">
                            <IconBuildingBank className="w-4 h-4 mr-1" />
                            Jumlah Masuk Bank:
                          </span>
                          <span className="text-blue-600">
                            {formatCurrency(
                              employee.gajiGenap - employee.monthlyPinjam
                            )}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-default-400 p-4">
                        <IconCash className="mx-auto h-8 w-8 text-default-300 mb-2" />
                        <p className="text-sm">No monthly pinjam recorded.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-red-600">
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
