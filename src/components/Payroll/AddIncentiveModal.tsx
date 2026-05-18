// src/components/Payroll/AddIncentiveModal.tsx
import React, { useState, useMemo, Fragment, useEffect } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { useLocationMappingsCache } from "../../utils/catalogue/useLocationMappingsCache";
import Button from "../Button";
import { IconDeviceFloppy, IconPlus, IconX } from "@tabler/icons-react";
import { FormCombobox, FormInput, FormListbox } from "../FormComponents";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { useAuth } from "../../contexts/AuthContext";

type IncentiveType = "Commission" | "Bonus";

// Commission locations are 16-24
const COMMISSION_LOCATION_IDS = ["16", "17", "18", "19", "20", "21", "22", "23", "24"];

interface IncentiveEntry {
  id: number; // For unique key in list
  employeeId: string | null;
  amount: string;
  description: string;
  locationCode: string | null; // For Commission entries only
}

interface AddIncentiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentYear: number;
  currentMonth: number;
  incentiveType: IncentiveType;
  displayLabel?: string;
  displayLabelPlural?: string;
}

const AddIncentiveModal: React.FC<AddIncentiveModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentYear,
  currentMonth,
  incentiveType,
  displayLabel = incentiveType,
  displayLabelPlural,
}) => {
  const { staffs } = useStaffsCache();
  const { locations } = useLocationMappingsCache();
  const { user } = useAuth();
  const [incentiveDate, setIncentiveDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [entries, setEntries] = useState<IncentiveEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [staffQueries, setStaffQueries] = useState<Record<number, string>>({});
  const displayLabelLower: string = displayLabel.toLowerCase();
  const saveButtonLabel: string = displayLabelPlural || `${displayLabel}s`;

  // Filter locations to only show 16-24 for commission entries
  const commissionLocationOptions = useMemo(() => {
    return locations
      .filter((loc) => COMMISSION_LOCATION_IDS.includes(loc.id))
      .map((loc) => ({
        id: loc.id,
        name: `${loc.id} - ${loc.name}`,
      }));
  }, [locations]);

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      const initialEntry: IncentiveEntry = {
        id: Date.now(),
        employeeId: null,
        amount: "",
        description: displayLabel,
        locationCode: incentiveType === "Commission" ? "18" : null, // Default to COMM-KILANG for Commission
      };
      setEntries([initialEntry]);
      setStaffQueries({});
      setIncentiveDate(new Date().toISOString().split("T")[0]);
    }
  }, [isOpen, incentiveType, currentYear, currentMonth, displayLabel]);

  const allStaffOptions = useMemo(
    () =>
      staffs.map((staff) => ({
        id: staff.id,
        name: `${staff.name} (${staff.id})`,
      })),
    [staffs]
  );

  const handleEntryChange = <K extends keyof IncentiveEntry>(
    index: number,
    field: K,
    value: IncentiveEntry[K]
  ): void => {
    setEntries((prevEntries) =>
      prevEntries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    );
  };

  const getStaffQuery = (entryId: number): string => {
    return staffQueries[entryId] || "";
  };

  const setStaffQuery = (
    entryId: number,
    query: React.SetStateAction<string>
  ): void => {
    setStaffQueries((prev) => ({
      ...prev,
      [entryId]:
        typeof query === "function" ? query(prev[entryId] || "") : query,
    }));
  };

  const addEntryRow = (): void => {
    setEntries([
      ...entries,
      {
        id: Date.now(),
        employeeId: null,
        amount: "",
        description: displayLabel,
        locationCode: incentiveType === "Commission" ? "18" : null, // Default to COMM-KILANG for Commission
      },
    ]);
  };

  const removeEntryRow = (id: number): void => {
    if (entries.length > 1) {
      setEntries(entries.filter((entry) => entry.id !== id));
      setStaffQueries((prev) => {
        const newQueries = { ...prev };
        delete newQueries[id];
        return newQueries;
      });
    }
  };

  const handleSave = async (): Promise<void> => {
    // For Commission entries, also validate location_code
    const validEntries = entries.filter((e) => {
      const hasBasicInfo = e.employeeId && parseFloat(e.amount) > 0 && e.description;
      if (incentiveType === "Commission") {
        return hasBasicInfo && e.locationCode;
      }
      return hasBasicInfo;
    });

    if (validEntries.length === 0) {
      const locationMsg = incentiveType === "Commission" ? ", and location" : "";
      toast.error(
        `Please add at least one valid ${displayLabelLower} entry with staff, amount${locationMsg}, and description.`
      );
      return;
    }

    setIsSaving(true);

    const promises = validEntries.map((entry) => {
      const payload = {
        employee_id: entry.employeeId,
        commission_date: incentiveDate,
        amount: parseFloat(entry.amount),
        description: entry.description,
        created_by: user?.id,
        location_code: incentiveType === "Commission" ? entry.locationCode : null,
      };
      return api.post("/api/incentives", payload);
    });

    try {
      await Promise.all(promises);
      toast.success(
        `${
          validEntries.length
        } ${displayLabelLower} record(s) saved successfully!`
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(`Failed to save ${incentiveType}s:`, error);
      toast.error(
        error.response?.data?.message ||
          `Failed to save one or more ${displayLabelLower} records.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = (): void => {
    if (!isSaving) {
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
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 py-6 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="my-auto w-full max-w-4xl transform rounded-2xl border border-default-200 bg-white p-0 text-left align-middle shadow-xl ring-1 ring-black/5 transition-all dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40 dark:ring-white/10">
                <div className="px-6 py-4 border-b border-default-200 bg-default-50 dark:border-gray-700 dark:bg-gray-900/60">
                  <DialogTitle
                    as="h3"
                    className="text-xl font-semibold text-default-800 dark:text-default-100"
                  >
                    Record Staff {displayLabel}
                  </DialogTitle>
                </div>

                <div className="px-6 py-4 text-default-800 dark:text-gray-100">
                  <div className="max-w-xs mb-4">
                    <FormInput
                      name="incentiveDate"
                      label={`${displayLabel} Date`}
                      type="date"
                      value={incentiveDate}
                      onChange={(e) => setIncentiveDate(e.target.value)}
                      required
                    />
                  </div>

                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className={`py-2 text-left font-medium text-default-600 dark:text-default-400 ${incentiveType === "Commission" ? "w-1/4" : "w-2/5"}`}>
                          Staff
                        </th>
                        {incentiveType === "Commission" && (
                          <th className="py-2 px-3 text-left font-medium text-default-600 dark:text-default-400 w-1/4">
                            Location
                          </th>
                        )}
                        <th className="py-2 px-3 text-left font-medium text-default-600 dark:text-default-400 w-1/6">
                          Amount (RM)
                        </th>
                        <th className={`py-2 px-3 text-left font-medium text-default-600 dark:text-default-400 ${incentiveType === "Commission" ? "w-1/4" : "w-2/5"}`}>
                          Description
                        </th>
                        <th className="py-2 text-left font-medium text-default-600 dark:text-default-400"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-default-100 dark:divide-gray-700/70">
                      {entries.map((entry, index) => (
                        <tr
                          key={entry.id}
                          className="group transition-colors duration-150 hover:bg-sky-50/60 dark:hover:bg-sky-900/20"
                        >
                          <td className="py-2 align-top">
                            <FormCombobox
                              name={`employee-${index}`}
                              label=""
                              value={entry.employeeId ?? undefined}
                              onChange={(value) => {
                                const employeeId: string | null = Array.isArray(value)
                                  ? null
                                  : value;
                                handleEntryChange(index, "employeeId", employeeId);
                              }}
                              options={allStaffOptions}
                              query={getStaffQuery(entry.id)}
                              setQuery={(query: React.SetStateAction<string>) =>
                                setStaffQuery(entry.id, query)
                              }
                              placeholder="Select Staff..."
                              mode="single"
                            />
                          </td>
                          {incentiveType === "Commission" && (
                            <td className="py-2 px-3 align-top">
                              <FormListbox
                                name={`location-${index}`}
                                label=""
                                value={entry.locationCode || ""}
                                onChange={(value) =>
                                  handleEntryChange(index, "locationCode", value)
                                }
                                options={commissionLocationOptions}
                                placeholder="Select Location..."
                              />
                            </td>
                          )}
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
                              placeholder={`e.g., ${displayLabel}, bonus work`}
                            />
                          </td>
                          <td className="py-2 align-top">
                            {entries.length > 1 && (
                              <button
                                onClick={() => removeEntryRow(entry.id)}
                                className="p-2 rounded-full text-default-400 opacity-0 transition-all duration-150 hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-rose-900/40 dark:hover:text-rose-300"
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

                  <div className="flex justify-between items-center mt-6 border-t border-default-200 bg-white pt-6 dark:border-gray-700 dark:bg-gray-800">
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
                        {isSaving ? "Saving..." : `Save ${saveButtonLabel}`}
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

export default AddIncentiveModal;
