// src/components/Payroll/PinjamFormModal.tsx
import React, { useState, useMemo, Fragment, useEffect } from "react";
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
import { getMonthName } from "../../utils/payroll/payrollUtils";

interface PinjamEntry {
  id: number;
  employeeId: string | null;
  description: string;
  midMonthAmount: string;
  monthlyAmount: string;
}

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

interface PinjamFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentYear: number;
  currentMonth: number;
  editingRecord?: PinjamRecord | null;
}

const DEFAULT_CATEGORIES = [
  "MELTI",
  "HANDPHONE",
  "BUS SCHOOL",
  "PINJAM",
  "BAKI/ROSE",
  "P/GAJI",
  "ROSE",
  "OTHERS",
];

const PinjamFormModal: React.FC<PinjamFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentYear,
  currentMonth,
  editingRecord,
}) => {
  const { staffs } = useStaffsCache();
  const { user } = useAuth();

  const [entries, setEntries] = useState<PinjamEntry[]>([]);
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

  // Initialize entries with default categories
  useEffect(() => {
    if (isOpen && !editingRecord) {
      const defaultEntries = DEFAULT_CATEGORIES.map((category, index) => ({
        id: Date.now() + index,
        employeeId: null,
        description: category,
        midMonthAmount: "",
        monthlyAmount: "",
      }));
      setEntries(defaultEntries);
      setStaffQueries({});
    }
  }, [isOpen, editingRecord]);

  // Handle editing record
  useEffect(() => {
    if (isOpen && editingRecord) {
      // For editing, create a single entry with the record data
      const editEntry: PinjamEntry = {
        id: Date.now(),
        employeeId: editingRecord.employee_id,
        description: editingRecord.description,
        midMonthAmount:
          editingRecord.pinjam_type === "mid_month"
            ? editingRecord.amount.toString()
            : "",
        monthlyAmount:
          editingRecord.pinjam_type === "monthly"
            ? editingRecord.amount.toString()
            : "",
      };
      setEntries([editEntry]);
      setStaffQueries({});
    }
  }, [isOpen, editingRecord]);

  const handleEntryChange = (
    index: number,
    field: keyof PinjamEntry,
    value: any
  ) => {
    const newEntries = [...entries];
    (newEntries[index] as any)[field] = value;
    setEntries(newEntries);
  };

  const getStaffQuery = (entryId: number): string => {
    return staffQueries[entryId] || "";
  };

  const setStaffQuery = (
    entryId: number,
    query: React.SetStateAction<string>
  ) => {
    setStaffQueries((prev) => ({
      ...prev,
      [entryId]:
        typeof query === "function" ? query(prev[entryId] || "") : query,
    }));
  };

  const addEntryRow = () => {
    setEntries([
      ...entries,
      {
        id: Date.now(),
        employeeId: null,
        description: "",
        midMonthAmount: "",
        monthlyAmount: "",
      },
    ]);
  };

  const removeEntryRow = (id: number) => {
    if (entries.length > 1) {
      setEntries(entries.filter((entry) => entry.id !== id));
      setStaffQueries((prev) => {
        const newQueries = { ...prev };
        delete newQueries[id];
        return newQueries;
      });
    }
  };

  const handleSave = async () => {
    // Collect all valid entries (with employee, description, and at least one amount)
    const validRecords: Array<{
      employee_id: string;
      description: string;
      amount: number;
      pinjam_type: "mid_month" | "monthly";
    }> = [];

    entries.forEach((entry) => {
      if (!entry.employeeId || !entry.description) return;

      // Add mid-month record if amount is provided
      if (entry.midMonthAmount && parseFloat(entry.midMonthAmount) > 0) {
        validRecords.push({
          employee_id: entry.employeeId,
          description: entry.description,
          amount: parseFloat(entry.midMonthAmount),
          pinjam_type: "mid_month",
        });
      }

      // Add monthly record if amount is provided
      if (entry.monthlyAmount && parseFloat(entry.monthlyAmount) > 0) {
        validRecords.push({
          employee_id: entry.employeeId,
          description: entry.description,
          amount: parseFloat(entry.monthlyAmount),
          pinjam_type: "monthly",
        });
      }
    });

    if (validRecords.length === 0) {
      toast.error(
        "Please add at least one valid pinjam entry with employee, description, and amount."
      );
      return;
    }

    setIsSaving(true);

    try {
      if (editingRecord) {
        // For editing, we need to update the existing record
        const updateData = validRecords[0]; // Should only be one record when editing
        await api.put(`/api/pinjam-records/${editingRecord.id}`, updateData);
        toast.success("Pinjam record updated successfully!");
      } else {
        // For creating, use batch endpoint
        const recordsWithMeta = validRecords.map((record) => ({
          ...record,
          year: currentYear,
          month: currentMonth,
          created_by: user?.id,
        }));

        const response = await api.post("/api/pinjam-records/batch", {
          records: recordsWithMeta,
        });

        if (response.errors && response.errors.length > 0) {
          // Show detailed message with what succeeded and what failed
          let message = '';
          if (response.created > 0 && response.updated > 0) {
            message = `✅ Created ${response.created}, updated ${response.updated} record(s). ❌ ${response.errors.length} failed.`;
          } else if (response.created > 0) {
            message = `✅ Created ${response.created} record(s). ❌ ${response.errors.length} failed.`;
          } else if (response.updated > 0) {
            message = `✅ Updated ${response.updated} record(s). ❌ ${response.errors.length} failed.`;
          } else {
            message = `❌ ${response.errors.length} record(s) failed to save.`;
          }
          
          toast.error(message, { duration: 6000 });
          console.error("Batch errors:", response.errors);
        } else {
          // All successful - show success message based on what actually happened
          if (response.created > 0 && response.updated > 0) {
            toast.success(`Successfully created ${response.created} and updated ${response.updated} pinjam record(s)!`);
          } else if (response.created > 0) {
            toast.success(`Successfully created ${response.created} pinjam record(s)!`);
          } else if (response.updated > 0) {
            toast.success(`Successfully updated ${response.updated} pinjam record(s) by adding amounts!`);
          } else {
            toast.success(response.message || "Pinjam records processed successfully!");
          }
        }
      }

      // Reset form
      const defaultEntries = DEFAULT_CATEGORIES.map((category, index) => ({
        id: Date.now() + index,
        employeeId: null,
        description: category,
        midMonthAmount: "",
        monthlyAmount: "",
      }));
      setEntries(defaultEntries);
      setStaffQueries({});
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Failed to save pinjam records:", error);
      toast.error(
        error.response?.data?.message || "Failed to save pinjam record(s)."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      const defaultEntries = DEFAULT_CATEGORIES.map((category, index) => ({
        id: Date.now() + index,
        employeeId: null,
        description: category,
        midMonthAmount: "",
        monthlyAmount: "",
      }));
      setEntries(defaultEntries);
      setStaffQueries({});
      onClose();
    }
  };

  const monthName = useMemo(() => getMonthName(currentMonth), [currentMonth]);

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
              <DialogPanel className="w-full max-w-6xl transform rounded-2xl bg-white p-0 text-left align-middle shadow-xl transition-all">
                <div className="px-6 py-4 border-b border-default-200">
                  <DialogTitle
                    as="h3"
                    className="text-xl font-semibold text-default-800"
                  >
                    {editingRecord ? "Edit Pinjam Record" : "Record Pinjam"}
                  </DialogTitle>
                  <p className="text-sm text-default-600 mt-1">
                    {monthName} {currentYear} - Enter amounts in the respective
                    columns (Mid-month or Monthly)
                  </p>
                </div>

                <div className="max-h-[60vh]">
                  <div className="px-6 pt-1">
                    <div>
                      <table className="min-w-full table-fixed">
                        <thead>
                          <tr>
                            <th className="py-2 text-left font-medium text-default-600 w-[35%]">
                              Staff
                            </th>
                            <th className="py-2 px-3 text-left font-medium text-default-600 w-[30%]">
                              Description
                            </th>
                            <th className="py-2 px-3 text-center font-medium text-default-600 w-[15%]">
                              <div className="bg-blue-50 rounded px-2 py-1">
                                Mid-Month (RM)
                              </div>
                            </th>
                            <th className="py-2 px-3 text-center font-medium text-default-600 w-[15%]">
                              <div className="bg-green-50 rounded px-2 py-1">
                                Monthly (RM)
                              </div>
                            </th>
                            <th className="py-2 text-center font-medium text-default-600 w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map((entry, index) => (
                            <tr key={entry.id} className="group">
                              <td className="py-1 align-top relative">
                                <FormCombobox
                                  name={`employee-${index}`}
                                  label=""
                                  value={entry.employeeId ?? undefined}
                                  onChange={(value) =>
                                    handleEntryChange(index, "employeeId", value)
                                  }
                                  options={allStaffOptions}
                                  query={getStaffQuery(entry.id)}
                                  setQuery={(
                                    query: React.SetStateAction<string>
                                  ) => setStaffQuery(entry.id, query)}
                                  placeholder="Select Staff..."
                                  mode="single"
                                />
                              </td>
                              <td className="py-1 px-3 align-top">
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
                                  placeholder="e.g., MELTI, HANDPHONE"
                                />
                              </td>
                              <td className="py-1 px-3 align-top">
                                <div className="bg-blue-50 rounded px-1">
                                  <FormInput
                                    name={`midMonthAmount-${index}`}
                                    label=""
                                    type="number"
                                    value={entry.midMonthAmount}
                                    onChange={(e) =>
                                      handleEntryChange(
                                        index,
                                        "midMonthAmount",
                                        e.target.value
                                      )
                                    }
                                    placeholder="0.00"
                                    step="1"
                                  />
                                </div>
                              </td>
                              <td className="py-1 px-3 align-top">
                                <div className="bg-green-50 rounded px-1">
                                  <FormInput
                                    name={`monthlyAmount-${index}`}
                                    label=""
                                    type="number"
                                    value={entry.monthlyAmount}
                                    onChange={(e) =>
                                      handleEntryChange(
                                        index,
                                        "monthlyAmount",
                                        e.target.value
                                      )
                                    }
                                    placeholder="0.00"
                                    step="1"
                                  />
                                </div>
                              </td>
                              <td className="py-1 align-top text-center">
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
                    </div>
                  </div>
                </div>

                <div className="px-6 flex justify-between items-center my-4 border-t border-default-200 pt-4">
                    <Button
                      variant="outline"
                      onClick={addEntryRow}
                      icon={IconPlus}
                      disabled={editingRecord !== null}
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
                        {isSaving
                          ? "Saving..."
                          : editingRecord
                          ? "Update Record"
                          : "Save Records"}
                      </Button>
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

export default PinjamFormModal;
