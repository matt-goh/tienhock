// src/components/Payroll/EditIncentiveModal.tsx
import React, { useState, useEffect, Fragment, useMemo } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "../Button";
import Checkbox from "../Checkbox";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { FormInput, FormListbox } from "../FormComponents";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import { useLocationMappingsCache } from "../../utils/catalogue/useLocationMappingsCache";

// Commission locations are 16-24
const COMMISSION_LOCATION_IDS = ["16", "17", "18", "19", "20", "21", "22", "23", "24"];

interface Incentive {
  id: number;
  employee_id: string;
  employee_name: string;
  commission_date: string;
  amount: number;
  description: string;
  created_by: string;
  created_at: string;
  location_code?: string | null;
  location_name?: string | null;
  is_advance?: boolean;
}

interface EditIncentiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  incentive: Incentive | null;
  displayLabel?: string;
}

const EditIncentiveModal: React.FC<EditIncentiveModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  incentive,
  displayLabel = "Incentive",
}) => {
  const { locations } = useLocationMappingsCache();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [incentiveDate, setIncentiveDate] = useState("");
  const [locationCode, setLocationCode] = useState<string | null>(null);
  const [isAdvance, setIsAdvance] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const displayLabelLower: string = displayLabel.toLowerCase();

  // Filter locations to only show 16-24 for commission entries
  const commissionLocationOptions = useMemo(() => {
    return locations
      .filter((loc) => COMMISSION_LOCATION_IDS.includes(loc.id))
      .map((loc) => ({
        id: loc.id,
        name: `${loc.id} - ${loc.name}`,
      }));
  }, [locations]);

  // Check if this is a commission entry (has location_code or description contains "Commission")
  const isCommissionEntry = useMemo((): boolean => {
    if (!incentive) return false;
    return Boolean(
      incentive.location_code ||
        incentive.description?.toUpperCase().includes("COMMISSION")
    );
  }, [incentive]);

  useEffect(() => {
    if (incentive) {
      setAmount(incentive.amount.toString());
      setDescription(incentive.description);
      setIncentiveDate(incentive.commission_date.split("T")[0]);
      setLocationCode(incentive.location_code || null);
      setIsAdvance(incentive.is_advance !== false);
    }
  }, [incentive]);

  const handleSave = async (): Promise<void> => {
    if (!incentive) return;

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    if (!description.trim()) {
      toast.error("Please enter a description.");
      return;
    }

    // For commission entries, validate location
    if (isCommissionEntry && !locationCode) {
      toast.error(`Please select a location for ${displayLabelLower} entries.`);
      return;
    }

    setIsSaving(true);

    try {
      await api.put(`/api/incentives/${incentive.id}`, {
        amount: parseFloat(amount),
        description: description.trim(),
        commission_date: incentiveDate,
        location_code: isCommissionEntry ? locationCode : null,
        is_advance: isCommissionEntry ? true : isAdvance,
      });

      toast.success(`${displayLabel} updated successfully!`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Failed to update incentive:", error);
      toast.error(
        error.response?.data?.message || `Failed to update ${displayLabelLower}.`
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

  if (!incentive) return null;

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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl border border-default-200 bg-white p-0 text-left align-middle shadow-xl ring-1 ring-black/5 transition-all dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40 dark:ring-white/10">
                <div className="px-6 py-4 border-b border-default-200 bg-default-50 dark:border-gray-700 dark:bg-gray-900/60">
                  <DialogTitle
                    as="h3"
                    className="text-xl font-semibold text-default-800 dark:text-default-100"
                  >
                    Edit {displayLabel}
                  </DialogTitle>
                  <p className="text-sm text-default-600 dark:text-default-400 mt-1">
                    Employee: {incentive.employee_name} ({incentive.employee_id}
                    )
                  </p>
                </div>

                <div className="px-6 py-4 text-default-800 dark:text-gray-100">
                  <div className="space-y-4">
                    <FormInput
                      name="incentiveDate"
                      label={`${displayLabel} Date`}
                      type="date"
                      value={incentiveDate}
                      onChange={(e) => setIncentiveDate(e.target.value)}
                      required
                    />

                    {isCommissionEntry && (
                      <FormListbox
                        name="location"
                        label="Location"
                        value={locationCode || ""}
                        onChange={(value) => setLocationCode(value)}
                        options={commissionLocationOptions}
                        placeholder="Select Location..."
                      />
                    )}

                    <FormInput
                      name="amount"
                      label="Amount (RM)"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      step="1"
                      required
                    />

                    <FormInput
                      name="description"
                      label="Description"
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={`e.g., ${displayLabel}, Bonus`}
                      required
                    />

                    {!isCommissionEntry && (
                      <Checkbox
                        checked={isAdvance}
                        onChange={setIsAdvance}
                        label="Deduct as Advance"
                        size={18}
                      />
                    )}
                  </div>

                  <div className="flex justify-end space-x-3 mt-6 border-t border-default-200 pt-6 dark:border-gray-700">
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
                      {isSaving ? "Updating..." : `Update ${displayLabel}`}
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

export default EditIncentiveModal;
