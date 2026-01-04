// src/components/GreenTarget/PayrollEmployeeManagementModal.tsx
import React, { useState, useEffect, Fragment, useMemo } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../LoadingSpinner";
import { Employee } from "../../types/types";
import {
  IconPlus,
  IconTrash,
  IconUser,
  IconTruck,
  IconSearch,
  IconUsers,
  IconX,
  IconCheck,
} from "@tabler/icons-react";

interface GTPayrollEmployee {
  id: number;
  employee_id: string;
  job_type: "OFFICE" | "DRIVER";
  date_added: string;
  is_active: boolean;
  notes: string | null;
  employee_name: string;
}

interface PayrollEmployeeManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableEmployees: Employee[];
  onUpdate?: () => void;
}

const PayrollEmployeeManagementModal: React.FC<
  PayrollEmployeeManagementModalProps
> = ({ isOpen, onClose, availableEmployees, onUpdate }) => {
  const [gtEmployees, setGtEmployees] = useState<GTPayrollEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedJobType, setSelectedJobType] = useState<"OFFICE" | "DRIVER">(
    "OFFICE"
  );

  // Fetch GT payroll employees when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchGTEmployees();
    }
  }, [isOpen]);

  const fetchGTEmployees = async () => {
    setLoading(true);
    try {
      const response = await api.get("/greentarget/api/payroll-employees");
      setGtEmployees(response);
    } catch (error) {
      console.error("Error fetching GT payroll employees:", error);
      toast.error("Failed to fetch GT payroll employees");
    } finally {
      setLoading(false);
    }
  };

  // Get employee IDs already in GT payroll
  const gtEmployeeIds = new Set(gtEmployees.map((e) => e.employee_id));

  // Filter and group current members
  const filteredMembers = useMemo(() => {
    let members = gtEmployees;

    if (memberSearch) {
      const search = memberSearch.toLowerCase();
      members = members.filter(
        (emp) =>
          emp.employee_name.toLowerCase().includes(search) ||
          emp.employee_id.toLowerCase().includes(search)
      );
    }

    return members;
  }, [gtEmployees, memberSearch]);

  const officeMembers = filteredMembers.filter((e) => e.job_type === "OFFICE");
  const driverMembers = filteredMembers.filter((e) => e.job_type === "DRIVER");

  // Filter available employees who are not already in GT payroll
  const eligibleEmployees = useMemo(() => {
    let employees = availableEmployees
      .filter((emp) => !emp.dateResigned) // Only active employees
      .filter((emp) => !gtEmployeeIds.has(emp.id)); // Not already in GT payroll

    if (employeeSearch) {
      const search = employeeSearch.toLowerCase();
      employees = employees.filter(
        (emp) =>
          emp.name.toLowerCase().includes(search) ||
          emp.id.toLowerCase().includes(search)
      );
    }

    return employees.sort((a, b) => a.name.localeCompare(b.name));
  }, [availableEmployees, gtEmployeeIds, employeeSearch]);

  const handleAddEmployee = async (employeeId: string) => {
    setIsProcessing(true);
    try {
      await api.post("/greentarget/api/payroll-employees", {
        employee_id: employeeId,
        job_type: selectedJobType,
      });
      toast.success("Employee added to GT Payroll");
      await fetchGTEmployees();
      onUpdate?.();
    } catch (error) {
      console.error("Error adding employee:", error);
      toast.error("Failed to add employee");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveEmployee = async (id: number, name: string) => {
    if (!confirm(`Remove ${name} from GT Payroll?`)) return;

    setIsProcessing(true);
    try {
      await api.delete(`/greentarget/api/payroll-employees/${id}`);
      toast.success("Employee removed from GT Payroll");
      await fetchGTEmployees();
      onUpdate?.();
    } catch (error) {
      console.error("Error removing employee:", error);
      toast.error("Failed to remove employee");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setMemberSearch("");
    setEmployeeSearch("");
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => !isProcessing && handleClose()}
      >
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-black/50 dark:bg-black/70"
            aria-hidden="true"
          />
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
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-4">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                  >
                    Manage GT Payroll Employees
                  </DialogTitle>
                  <button
                    onClick={handleClose}
                    className="text-default-400 hover:text-default-600 dark:text-gray-400 dark:hover:text-gray-200"
                    disabled={isProcessing}
                  >
                    <IconX size={20} />
                  </button>
                </div>

                <p className="text-sm text-default-500 dark:text-gray-400 mb-4">
                  Add or remove employees from the Green Target payroll system.
                </p>

                {loading ? (
                  <div className="flex justify-center items-center py-20">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left Panel - Current Members */}
                    <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                      <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                        <div className="flex items-center gap-2 text-sm font-medium text-default-700 dark:text-gray-200">
                          <IconUsers size={16} />
                          Current Members ({gtEmployees.length})
                        </div>
                        <div className="relative mt-2">
                          <IconSearch
                            size={16}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                          />
                          <input
                            type="text"
                            placeholder="Search members..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="max-h-[400px] overflow-y-auto">
                        {filteredMembers.length === 0 ? (
                          <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                            <IconUsers
                              size={32}
                              className="mx-auto mb-2 text-default-300 dark:text-gray-500"
                            />
                            {memberSearch
                              ? "No members found"
                              : "No employees in GT Payroll yet"}
                          </div>
                        ) : (
                          <ul className="divide-y divide-default-100 dark:divide-gray-600">
                            {/* OFFICE Section */}
                            {officeMembers.length > 0 && (
                              <>
                                <li className="px-3 py-1.5 bg-sky-50 dark:bg-sky-900/30 text-xs text-sky-700 dark:text-sky-300 font-medium flex items-center gap-1.5">
                                  <IconUser size={14} />
                                  OFFICE ({officeMembers.length})
                                </li>
                                {officeMembers.map((emp) => (
                                  <li
                                    key={emp.id}
                                    className="px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between"
                                  >
                                    <div>
                                      <div className="font-medium text-sm text-default-800 dark:text-gray-100">
                                        {emp.employee_name}
                                      </div>
                                      <div className="text-xs text-default-500 dark:text-gray-400">
                                        {emp.employee_id}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleRemoveEmployee(
                                          emp.id,
                                          emp.employee_name
                                        )
                                      }
                                      disabled={isProcessing}
                                      className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                                    >
                                      <IconTrash size={16} />
                                    </button>
                                  </li>
                                ))}
                              </>
                            )}

                            {/* DRIVER Section */}
                            {driverMembers.length > 0 && (
                              <>
                                <li className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-xs text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
                                  <IconTruck size={14} />
                                  DRIVER ({driverMembers.length})
                                </li>
                                {driverMembers.map((emp) => (
                                  <li
                                    key={emp.id}
                                    className="px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between"
                                  >
                                    <div>
                                      <div className="font-medium text-sm text-default-800 dark:text-gray-100">
                                        {emp.employee_name}
                                      </div>
                                      <div className="text-xs text-default-500 dark:text-gray-400">
                                        {emp.employee_id}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleRemoveEmployee(
                                          emp.id,
                                          emp.employee_name
                                        )
                                      }
                                      disabled={isProcessing}
                                      className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                                    >
                                      <IconTrash size={16} />
                                    </button>
                                  </li>
                                ))}
                              </>
                            )}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Right Panel - Add Employees */}
                    <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                      <div className="bg-default-50 dark:bg-gray-700 px-3 py-2 border-b border-default-200 dark:border-gray-600">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-default-700 dark:text-gray-200">
                            Add Employee
                          </div>
                          <span className="text-xs text-default-500 dark:text-gray-400">
                            {eligibleEmployees.length} available
                          </span>
                        </div>

                        {/* Job Type Selector */}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => setSelectedJobType("OFFICE")}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                              selectedJobType === "OFFICE"
                                ? "bg-sky-100 dark:bg-sky-900/30 border-sky-500 text-sky-700 dark:text-sky-300"
                                : "border-default-300 dark:border-gray-500 text-default-600 dark:text-gray-400 hover:bg-default-50 dark:hover:bg-gray-600"
                            }`}
                          >
                            <IconUser size={14} />
                            OFFICE
                          </button>
                          <button
                            onClick={() => setSelectedJobType("DRIVER")}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                              selectedJobType === "DRIVER"
                                ? "bg-amber-100 dark:bg-amber-900/30 border-amber-500 text-amber-700 dark:text-amber-300"
                                : "border-default-300 dark:border-gray-500 text-default-600 dark:text-gray-400 hover:bg-default-50 dark:hover:bg-gray-600"
                            }`}
                          >
                            <IconTruck size={14} />
                            DRIVER
                          </button>
                        </div>

                        {/* Search */}
                        <div className="relative mt-2">
                          <IconSearch
                            size={16}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                          />
                          <input
                            type="text"
                            placeholder="Search employees..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                            value={employeeSearch}
                            onChange={(e) => setEmployeeSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="max-h-[400px] overflow-y-auto">
                        {eligibleEmployees.length === 0 ? (
                          <div className="py-10 text-center text-sm text-default-500 dark:text-gray-400">
                            <IconCheck
                              size={32}
                              className="mx-auto mb-2 text-emerald-400"
                            />
                            {employeeSearch
                              ? "No employees found"
                              : "All employees already added"}
                          </div>
                        ) : (
                          <ul className="divide-y divide-default-100 dark:divide-gray-600">
                            {eligibleEmployees.map((employee) => (
                              <li
                                key={employee.id}
                                className="px-3 py-2 hover:bg-default-50 dark:hover:bg-gray-700 flex items-center justify-between"
                              >
                                <div>
                                  <div className="font-medium text-sm text-default-800 dark:text-gray-100">
                                    {employee.name}
                                  </div>
                                  <div className="text-xs text-default-500 dark:text-gray-400">
                                    {employee.id} -{" "}
                                    {employee.job?.join(", ") || "No job"}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleAddEmployee(employee.id)}
                                  disabled={isProcessing}
                                  className={`p-1.5 rounded transition-colors disabled:opacity-50 ${
                                    selectedJobType === "OFFICE"
                                      ? "text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                                      : "text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                  }`}
                                >
                                  <IconPlus size={18} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-6 flex justify-between items-center">
                  <div className="text-sm text-default-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5 mr-4">
                      <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                      OFFICE: {gtEmployees.filter((e) => e.job_type === "OFFICE").length}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      DRIVER: {gtEmployees.filter((e) => e.job_type === "DRIVER").length}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isProcessing}
                  >
                    Close
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default PayrollEmployeeManagementModal;
