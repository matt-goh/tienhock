// src/components/Catalogue/AssociatePayCodesWithEmployeeModal.tsx
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

interface AssociatePayCodesWithEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  availablePayCodes: PayCode[];
  currentPayCodeIds: string[];
  onAssociationComplete: () => Promise<void>;
}

const AssociatePayCodesWithEmployeeModal: React.FC<
  AssociatePayCodesWithEmployeeModalProps
> = ({
  isOpen,
  onClose,
  employee,
  availablePayCodes,
  currentPayCodeIds,
  onAssociationComplete,
}) => {
  const [selectedPayCodeIds, setSelectedPayCodeIds] = useState<Set<string>>(
    new Set()
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize selections when modal opens
  useEffect(() => {
    if (isOpen && currentPayCodeIds) {
      setSelectedPayCodeIds(new Set(currentPayCodeIds));
    }
  }, [isOpen, currentPayCodeIds]);

  // Filter pay codes based on search query
  const filteredPayCodes = searchQuery
    ? availablePayCodes.filter(
        (payCode) =>
          payCode.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          payCode.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availablePayCodes;

  const handleTogglePayCode = (payCodeId: string) => {
    setSelectedPayCodeIds((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(payCodeId)) {
        newSelection.delete(payCodeId);
      } else {
        newSelection.add(payCodeId);
      }
      return newSelection;
    });
  };

  const handleSave = async () => {
    setIsProcessing(true);

    try {
      // Find which pay codes to add and which to remove
      const payCodeIdsToAdd = Array.from(selectedPayCodeIds).filter(
        (id) => !currentPayCodeIds.includes(id)
      );
      const payCodeIdsToRemove = currentPayCodeIds.filter(
        (id) => !selectedPayCodeIds.has(id)
      );

      const promises = [];

      // Handle additions
      for (const payCodeId of payCodeIdsToAdd) {
        promises.push(
          api.post("/api/employee-pay-codes", {
            employee_id: employee.id,
            pay_code_id: payCodeId,
            is_default: false,
          })
        );
      }

      // Handle removals
      for (const payCodeId of payCodeIdsToRemove) {
        promises.push(
          api.delete(`/api/employee-pay-codes/${employee.id}/${payCodeId}`)
        );
      }

      // Wait for all operations to complete
      await Promise.all(promises);

      await onAssociationComplete();
      toast.success("Pay code associations updated successfully");
      onClose();
    } catch (error) {
      console.error("Error updating pay code associations:", error);
      toast.error("Failed to update pay code associations");
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
                  Manage Pay Codes for {employee.name}
                </DialogTitle>

                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Select pay codes to associate with this employee.
                  </p>
                </div>

                <div className="mt-4">
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Search pay codes..."
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
                    ) : filteredPayCodes.length === 0 ? (
                      <div className="py-4 px-3 text-center text-sm text-default-500">
                        No pay codes found
                      </div>
                    ) : (
                      <ul className="divide-y divide-default-200">
                        {filteredPayCodes.map((payCode) => (
                          <li
                            key={payCode.id}
                            className="px-3 py-2 hover:bg-default-50 cursor-pointer"
                            onClick={() => handleTogglePayCode(payCode.id)}
                          >
                            <Checkbox
                              checked={selectedPayCodeIds.has(payCode.id)}
                              onChange={() => handleTogglePayCode(payCode.id)}
                              label={
                                <div>
                                  <div className="font-medium text-default-800">
                                    {payCode.description}
                                  </div>
                                  <div className="text-xs text-default-500">
                                    {payCode.id} - {payCode.pay_type} -{" "}
                                    {payCode.rate_unit}
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
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AssociatePayCodesWithEmployeeModal;
