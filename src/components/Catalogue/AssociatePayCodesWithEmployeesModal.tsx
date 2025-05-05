// src/components/Catalogue/AssociatePayCodesWithEmployeesModal.tsx
import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import Checkbox from "../Checkbox";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import LoadingSpinner from "../LoadingSpinner";
import { PayCode, Employee } from "../../types/types";

interface AssociatePayCodesWithEmployeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  payCode: PayCode | null;
  availableEmployees: Employee[];
  currentEmployeeIds: string[];
  onAssociationComplete: () => Promise<void>;
}

const AssociatePayCodesWithEmployeesModal: React.FC<
  AssociatePayCodesWithEmployeesModalProps
> = ({
  isOpen,
  onClose,
  payCode,
  availableEmployees,
  currentEmployeeIds,
  onAssociationComplete,
}) => {
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    new Set()
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize selections when modal opens
  useEffect(() => {
    if (isOpen && currentEmployeeIds) {
      setSelectedEmployeeIds(new Set(currentEmployeeIds));
    }
  }, [isOpen, currentEmployeeIds]);

  // Filter employees based on search query (including only active employees)
  const filteredEmployees = availableEmployees
    .filter((emp) => !emp.dateResigned) // Only show active employees
    .filter((emp) =>
      searchQuery
        ? emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.id.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    );

  const handleToggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(employeeId)) {
        newSelection.delete(employeeId);
      } else {
        newSelection.add(employeeId);
      }
      return newSelection;
    });
  };

  const handleSave = async () => {
    if (!payCode) return;

    setIsProcessing(true);

    try {
      // Find which employees to add and which to remove
      const employeesToAdd = Array.from(selectedEmployeeIds).filter(
        (id) => !currentEmployeeIds.includes(id)
      );
      const employeesToRemove = currentEmployeeIds.filter(
        (id) => !selectedEmployeeIds.has(id)
      );

      const promises = [];

      // Handle additions
      for (const employeeId of employeesToAdd) {
        promises.push(
          api.post("/api/employee-pay-codes", {
            employee_id: employeeId,
            pay_code_id: payCode.id,
            is_default: false,
          })
        );
      }

      // Handle removals
      for (const employeeId of employeesToRemove) {
        promises.push(
          api.delete(`/api/employee-pay-codes/${employeeId}/${payCode.id}`)
        );
      }

      // Wait for all operations to complete
      const results = await Promise.all(promises);

      await onAssociationComplete();
      toast.success(
        `Pay code "${payCode.description}" updated - Added: ${employeesToAdd.length}, Removed: ${employeesToRemove.length} employee(s)`
      );

      onClose();
    } catch (error) {
      console.error("Error updating employee associations:", error);
      toast.error("Failed to update employee associations");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => !isProcessing && onClose()}
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
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Associate Pay Code with Employees
                </DialogTitle>

                {payCode ? (
                  <>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Select employees to associate with pay code:{" "}
                        <span className="font-medium">
                          {payCode.description}
                        </span>{" "}
                        ({payCode.id})
                      </p>
                    </div>

                    <div className="mt-4">
                      <div className="mb-4">
                        <input
                          type="text"
                          placeholder="Search employees..."
                          className="w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>

                      <div className="max-h-60 overflow-y-auto border border-default-200 rounded-lg">
                        {isProcessing ? (
                          <div className="flex justify-center items-center py-10">
                            <LoadingSpinner size="sm" hideText />
                          </div>
                        ) : filteredEmployees.length === 0 ? (
                          <div className="py-4 px-3 text-center text-sm text-default-500">
                            No active employees found
                          </div>
                        ) : (
                          <ul className="divide-y divide-default-200">
                            {filteredEmployees.map((employee) => (
                              <li
                                key={employee.id}
                                className="px-3 py-2 hover:bg-default-50 cursor-pointer"
                                onClick={() =>
                                  handleToggleEmployee(employee.id)
                                }
                              >
                                <Checkbox
                                  checked={selectedEmployeeIds.has(employee.id)}
                                  onChange={() =>
                                    handleToggleEmployee(employee.id)
                                  }
                                  label={
                                    <div>
                                      <div className="font-medium text-default-800">
                                        {employee.name}
                                      </div>
                                      <div className="text-xs text-default-500">
                                        {employee.id} -{" "}
                                        {employee.job.join(", ")}
                                      </div>
                                    </div>
                                  }
                                  size={20}
                                  checkedColor="text-sky-600"
                                  uncheckedColor="text-default-400"
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isProcessing}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        color="sky"
                        variant="filled"
                        onClick={handleSave}
                        disabled={isProcessing}
                      >
                        {isProcessing ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-default-500">
                      No pay code selected
                    </p>
                  </div>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AssociatePayCodesWithEmployeesModal;
