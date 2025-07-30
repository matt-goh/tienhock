// src/components/Payroll/AddCommissionModal.tsx
import React, { useState, useMemo, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import Button from "../Button";
import { IconDeviceFloppy, IconPlus, IconX } from "@tabler/icons-react";
import { FormCombobox, FormInput } from "../FormComponents";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { useAuth } from "../../contexts/AuthContext";

interface CommissionEntry {
  id: number; // For unique key in list
  employeeId: string | null;
  amount: string;
  description: string;
}

interface AddCommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentYear: number;
  currentMonth: number;
}

const AddCommissionModal: React.FC<AddCommissionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentYear,
  currentMonth,
}) => {
  const { staffs } = useStaffsCache();
  const { user } = useAuth();
  const [commissionDate, setCommissionDate] = useState(
    `${currentYear}-${currentMonth.toString().padStart(2, "0")}-01`
  );
  const [entries, setEntries] = useState<CommissionEntry[]>([
    { id: Date.now(), employeeId: null, amount: "", description: "Commission" },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [staffQueries, setStaffQueries] = useState<Record<number, string>>({});

  const allStaffOptions = useMemo(
    () =>
      staffs.map((staff) => ({
        id: staff.id,
        name: `${staff.name} (${staff.id})`,
      })),
    [staffs]
  );

  const handleEntryChange = (
    index: number,
    field: keyof CommissionEntry,
    value: any
  ) => {
    const newEntries = [...entries];
    // @ts-ignore
    newEntries[index][field] = value;
    setEntries(newEntries);
  };

  const getStaffQuery = (entryId: number): string => {
    return staffQueries[entryId] || "";
  };

  const setStaffQuery = (entryId: number, query: React.SetStateAction<string>) => {
    setStaffQueries(prev => ({
      ...prev,
      [entryId]: typeof query === 'function' ? query(prev[entryId] || '') : query
    }));
  };

  const addEntryRow = () => {
    setEntries([
      ...entries,
      {
        id: Date.now(),
        employeeId: null,
        amount: "",
        description: "Commission",
      },
    ]);
  };

  const removeEntryRow = (id: number) => {
    if (entries.length > 1) {
      setEntries(entries.filter((entry) => entry.id !== id));
      // Clean up the staff query for this entry
      setStaffQueries(prev => {
        const newQueries = { ...prev };
        delete newQueries[id];
        return newQueries;
      });
    }
  };

  const handleSave = async () => {
    const validEntries = entries.filter(
      (e) => e.employeeId && parseFloat(e.amount) > 0 && e.description
    );
    if (validEntries.length === 0) {
      toast.error(
        "Please add at least one valid commission entry with staff, amount, and description."
      );
      return;
    }

    setIsSaving(true);

    const promises = validEntries.map((entry) => {
      const payload = {
        employee_id: entry.employeeId,
        commission_date: commissionDate,
        amount: parseFloat(entry.amount),
        description: entry.description,
        created_by: user?.id,
      };
      return api.post("/api/commissions", payload);
    });

    try {
      await Promise.all(promises);
      toast.success(
        `${validEntries.length} commission record(s) saved successfully!`
      );
      setEntries([
        {
          id: Date.now(),
          employeeId: null,
          amount: "",
          description: "Commission",
        },
      ]);
      setStaffQueries({});
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Failed to save commissions:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to save one or more commissions."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      setEntries([
        {
          id: Date.now(),
          employeeId: null,
          amount: "",
          description: "Commission",
        },
      ]);
      setStaffQueries({});
      setCommissionDate(
        `${currentYear}-${currentMonth.toString().padStart(2, "0")}-01`
      );
      onClose();
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </TransitionChild>

        <div className="fixed inset-0">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-4xl transform rounded-2xl bg-white p-0 text-left align-middle shadow-xl transition-all">
                <div className="px-6 py-4 border-b border-default-200">
                  <DialogTitle
                    as="h3"
                    className="text-xl font-semibold text-default-800"
                  >
                    Record Staff Commission
                  </DialogTitle>
                </div>

                <div className="px-6 py-4 max-h-[70vh]">
                  <div className="max-w-xs mb-4">
                    <FormInput
                      name="commissionDate"
                      label="Commission Date"
                      type="date"
                      value={commissionDate}
                      onChange={(e) => setCommissionDate(e.target.value)}
                      required
                    />
                  </div>

                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="py-2 text-left font-medium text-default-600 w-2/5">
                          Staff
                        </th>
                        <th className="py-2 px-3 text-left font-medium text-default-600 w-1/5">
                          Amount (RM)
                        </th>
                        <th className="py-2 px-3 text-left font-medium text-default-600 w-2/5">
                          Description
                        </th>
                        <th className="py-2 text-left font-medium text-default-600"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, index) => (
                        <tr key={entry.id} className="group">
                          <td className="py-2 align-top">
                            <FormCombobox
                              name={`employee-${index}`}
                              label=""
                              value={entry.employeeId ?? undefined}
                              onChange={(value) =>
                                handleEntryChange(index, "employeeId", value)
                              }
                              options={allStaffOptions}
                              query={getStaffQuery(entry.id)}
                              setQuery={(query: React.SetStateAction<string>) => setStaffQuery(entry.id, query)}
                              placeholder="Select Staff..."
                              mode="single"
                            />
                          </td>
                          <td className="py-2 px-3 align-top">
                            <FormInput
                              name={`amount-${index}`}
                              label=""
                              type="number"
                              value={entry.amount}
                              onChange={(e) =>
                                handleEntryChange(
                                  index,
                                  "amount",
                                  e.target.value
                                )
                              }
                              placeholder="0.00"
                              step="1"
                            />
                          </td>
                          <td className="py-2 px-3 align-top">
                            <FormInput
                              name={`description-${index}`}
                              label=""
                              type="text"
                              value={entry.description}
                              onChange={(e) =>
                                handleEntryChange(
                                  index,
                                  "description",
                                  e.target.value
                                )
                              }
                              placeholder="e.g., Commission, bonus work"
                            />
                          </td>
                          <td className="py-2 align-top">
                            {entries.length > 1 && (
                              <button
                                onClick={() => removeEntryRow(entry.id)}
                                className="p-2 text-default-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove row"
                              >
                                <IconX size={18} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex justify-between items-center mt-6 border-t border-default-200 pt-6">
                    <Button
                      variant="outline"
                      onClick={addEntryRow}
                      icon={IconPlus}
                    >
                      Add Row
                    </Button>
                    <div className="flex space-x-3">
                      <Button
                        variant="outline"
                        onClick={handleClose}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        color="sky"
                        onClick={handleSave}
                        disabled={isSaving}
                        icon={IconDeviceFloppy}
                      >
                        {isSaving ? "Saving..." : "Save Commissions"}
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AddCommissionModal;
