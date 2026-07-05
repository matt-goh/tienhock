// src/components/Accounting/OpeningBalanceModal.tsx
// Set/edit the opening-balance anchor for a single GL account (used by the Bank Statement
// report). Amount is signed: DR-positive for assets. Posts to PUT /api/opening-balances/:code.
import React, { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconX } from "@tabler/icons-react";
import { format } from "date-fns";
import { api } from "../../routes/utils/api";
import Button from "../Button";
import ListboxSelect from "../ListboxSelect";
import TimeNavigator from "../TimeNavigator";
import toast from "react-hot-toast";

// 'yyyy-MM-dd' -> local Date (never via new Date(string), which parses as UTC)
const parseLocalDate = (s: string): Date | null => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
};

interface OpeningBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountCode: string;
  accountDescription?: string;
  // Currently applicable anchor (or null). amount is signed (DR-positive).
  current: { as_of_date: string; amount: number; notes?: string | null } | null;
  onSaved: () => void;
}

const OpeningBalanceModal: React.FC<OpeningBalanceModalProps> = ({
  isOpen,
  onClose,
  accountCode,
  accountDescription,
  current,
  onSaved,
}) => {
  const [asOfDate, setAsOfDate] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [drcr, setDrcr] = useState<"DR" | "CR">("DR");
  const [notes, setNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    if (current) {
      setAsOfDate(current.as_of_date);
      setAmount(String(Math.abs(current.amount)));
      setDrcr(current.amount < 0 ? "CR" : "DR");
      setNotes(current.notes || "");
    } else {
      setAsOfDate("");
      setAmount("");
      setDrcr("DR");
      setNotes("");
    }
  }, [isOpen, current, accountCode]);

  const handleSave = async () => {
    setError("");
    if (!asOfDate) {
      setError("As-of date is required");
      return;
    }
    const magnitude = parseFloat(amount);
    if (isNaN(magnitude)) {
      setError("Amount must be a number");
      return;
    }
    const signed = drcr === "CR" ? -Math.abs(magnitude) : Math.abs(magnitude);
    setIsSaving(true);
    try {
      await api.put(`/api/opening-balances/${accountCode}`, {
        as_of_date: asOfDate,
        amount: signed,
        notes: notes || null,
      });
      toast.success("Opening balance saved");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save opening balance");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => !isSaving && onClose()}
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
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
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
              {/* No overflow-hidden: the TimeNavigator popover must escape the panel */}
              <DialogPanel className="w-full max-w-md transform rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-1">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                  >
                    Opening Balance
                  </DialogTitle>
                  <button
                    onClick={onClose}
                    disabled={isSaving}
                    className="text-default-400 hover:text-default-600 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <IconX size={20} />
                  </button>
                </div>
                <p className="text-sm text-default-500 dark:text-gray-400 mb-4">
                  {accountCode}
                  {accountDescription ? ` · ${accountDescription}` : ""}
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                      As of date
                    </label>
                    <TimeNavigator
                      range={{
                        start: asOfDate ? parseLocalDate(asOfDate) : null,
                        end: asOfDate ? parseLocalDate(asOfDate) : null,
                      }}
                      onChange={({ start }) =>
                        setAsOfDate(format(start, "yyyy-MM-dd"))
                      }
                      modes={["day"]}
                      presets={false}
                      showArrows={false}
                      allowFuture
                      placeholder="Pick a date"
                    />
                    <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                      The report seeds opening from this anchor and ignores every line before it.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                      Amount
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={isSaving}
                        className="flex-1 h-[40px] px-3 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 text-right font-mono hover:border-default-400 dark:hover:border-gray-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                      />
                      <ListboxSelect
                        value={drcr}
                        onChange={(v) => setDrcr(v as "DR" | "CR")}
                        disabled={isSaving}
                        className="w-24"
                        buttonClassName="h-[40px] flex items-center hover:border-default-400 dark:hover:border-gray-500 transition-colors"
                        options={[
                          { value: "DR", label: "DR" },
                          { value: "CR", label: "CR" },
                        ]}
                      />
                    </div>
                    <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                      DR for asset balances (money in the bank); CR for an overdrawn
                      account.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Migration opening from legacy statement"
                      disabled={isSaving}
                      className="w-full h-[40px] px-3 rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 hover:border-default-400 dark:hover:border-gray-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                      <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save"}
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

export default OpeningBalanceModal;
