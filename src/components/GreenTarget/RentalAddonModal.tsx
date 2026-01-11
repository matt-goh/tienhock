// src/components/GreenTarget/RentalAddonModal.tsx
import { useState, useEffect, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from "@headlessui/react";
import {
  IconX,
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";
import Button from "../Button";
import { greenTargetApi } from "../../routes/greentarget/api";
import toast from "react-hot-toast";
import clsx from "clsx";

interface AddonPaycode {
  id: number;
  pay_code_id: string;
  display_name: string;
  default_amount: number;
  is_variable_amount: boolean;
  sort_order: number;
}

interface RentalAddon {
  id: number;
  rental_id: number;
  pay_code_id: string;
  quantity: number;
  amount: number;
  notes: string | null;
  pay_code_description: string;
  display_name: string | null;
}

interface RentalAddonModalProps {
  isOpen: boolean;
  onClose: () => void;
  rentalId: number;
  onAddonsChanged?: () => void;
}

const RentalAddonModal = ({
  isOpen,
  onClose,
  rentalId,
  onAddonsChanged,
}: RentalAddonModalProps) => {
  const [addons, setAddons] = useState<RentalAddon[]>([]);
  const [addonPaycodes, setAddonPaycodes] = useState<AddonPaycode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPaycode, setSelectedPaycode] = useState<AddonPaycode | null>(
    null
  );
  const [newAddonAmount, setNewAddonAmount] = useState<number | "">("");
  const [newAddonNotes, setNewAddonNotes] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (isOpen && rentalId) {
      fetchData();
    }
  }, [isOpen, rentalId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [addonsData, paycodesData] = await Promise.all([
        greenTargetApi.getRentalAddons(rentalId),
        greenTargetApi.getAddonPaycodes(),
      ]);
      setAddons(addonsData || []);
      setAddonPaycodes(paycodesData || []);
    } catch (error) {
      console.error("Error fetching addon data:", error);
      toast.error("Failed to load addon data");
    } finally {
      setLoading(false);
    }
  };

  const handlePaycodeSelect = (paycode: AddonPaycode) => {
    setSelectedPaycode(paycode);
    if (!paycode.is_variable_amount) {
      setNewAddonAmount(paycode.default_amount);
    } else {
      setNewAddonAmount("");
    }
  };

  const handleAddAddon = async () => {
    if (!selectedPaycode) {
      toast.error("Please select a paycode");
      return;
    }

    if (newAddonAmount === "" || newAddonAmount < 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsAdding(true);
    try {
      await greenTargetApi.createRentalAddon(rentalId, {
        pay_code_id: selectedPaycode.pay_code_id,
        amount: Number(newAddonAmount),
        notes: newAddonNotes || undefined,
      });

      toast.success("Addon added successfully");
      setSelectedPaycode(null);
      setNewAddonAmount("");
      setNewAddonNotes("");
      fetchData();
      onAddonsChanged?.();
    } catch (error) {
      console.error("Error adding addon:", error);
      toast.error("Failed to add addon");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteAddon = async (addonId: number) => {
    try {
      await greenTargetApi.deleteRentalAddon(addonId);
      toast.success("Addon removed");
      fetchData();
      onAddonsChanged?.();
    } catch (error) {
      console.error("Error deleting addon:", error);
      toast.error("Failed to remove addon");
    }
  };

  const formatAmount = (amount: number) => {
    return `RM ${amount.toFixed(2)}`;
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 dark:bg-black/50" />
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
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow-xl transition-all">
                <div className="flex items-center justify-between border-b border-default-200 dark:border-gray-700 px-6 py-4">
                  <DialogTitle className="text-lg font-semibold text-default-900 dark:text-gray-100">
                    Rental Add-ons
                  </DialogTitle>
                  <button
                    onClick={onClose}
                    className="text-default-400 hover:text-default-600 dark:hover:text-gray-300"
                  >
                    <IconX size={20} />
                  </button>
                </div>

                <div className="p-6">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                    </div>
                  ) : (
                    <>
                      {/* Existing Addons List */}
                      {addons.length > 0 && (
                        <div className="mb-6">
                          <h3 className="text-sm font-medium text-default-700 dark:text-gray-200 mb-3">
                            Current Add-ons
                          </h3>
                          <div className="space-y-2">
                            {addons.map((addon) => (
                              <div
                                key={addon.id}
                                className="flex items-center justify-between p-3 bg-default-50 dark:bg-gray-900/50 rounded-lg border border-default-100 dark:border-gray-700"
                              >
                                <div>
                                  <p className="font-medium text-default-900 dark:text-gray-100">
                                    {addon.display_name ||
                                      addon.pay_code_description}
                                  </p>
                                  <p className="text-sm text-default-500 dark:text-gray-400">
                                    {formatAmount(addon.amount)}
                                    {addon.notes && ` - ${addon.notes}`}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleDeleteAddon(addon.id)}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-colors"
                                  title="Remove addon"
                                >
                                  <IconTrash size={18} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add New Addon Form */}
                      <div className="border-t border-default-200 dark:border-gray-700 pt-4">
                        <h3 className="text-sm font-medium text-default-700 dark:text-gray-200 mb-3">
                          Add New
                        </h3>

                        <div className="space-y-3">
                          {/* Paycode Selector */}
                          <div>
                            <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                              Type
                            </label>
                            <Listbox
                              value={selectedPaycode}
                              onChange={handlePaycodeSelect}
                            >
                              <div className="relative">
                                <ListboxButton
                                  className={clsx(
                                    "relative w-full cursor-default rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left shadow-sm",
                                    "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                  )}
                                >
                                  <span className="block truncate">
                                    {selectedPaycode
                                      ? selectedPaycode.display_name
                                      : "Select type..."}
                                  </span>
                                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                    <IconChevronDown
                                      size={20}
                                      className="text-gray-400"
                                    />
                                  </span>
                                </ListboxButton>
                                <Transition
                                  as={Fragment}
                                  leave="transition ease-in duration-100"
                                  leaveFrom="opacity-100"
                                  leaveTo="opacity-0"
                                >
                                  <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                    {addonPaycodes.map((paycode) => (
                                      <ListboxOption
                                        key={paycode.id}
                                        value={paycode}
                                        className={({ active }) =>
                                          clsx(
                                            "relative cursor-default select-none py-2 pl-3 pr-10",
                                            active
                                              ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100"
                                              : "text-gray-900 dark:text-gray-100"
                                          )
                                        }
                                      >
                                        {({ selected }) => (
                                          <>
                                            <div className="flex flex-col">
                                              <span
                                                className={clsx(
                                                  "block truncate",
                                                  selected
                                                    ? "font-medium"
                                                    : "font-normal"
                                                )}
                                              >
                                                {paycode.display_name}
                                              </span>
                                              <span className="text-xs text-default-500 dark:text-gray-400">
                                                {paycode.is_variable_amount
                                                  ? "Variable amount"
                                                  : formatAmount(
                                                      paycode.default_amount
                                                    )}
                                              </span>
                                            </div>
                                            {selected && (
                                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                                                <IconCheck size={20} />
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </ListboxOption>
                                    ))}
                                  </ListboxOptions>
                                </Transition>
                              </div>
                            </Listbox>
                          </div>

                          {/* Amount Input */}
                          <div>
                            <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                              Amount (RM)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={newAddonAmount}
                              onChange={(e) =>
                                setNewAddonAmount(
                                  e.target.value === ""
                                    ? ""
                                    : parseFloat(e.target.value)
                                )
                              }
                              disabled={
                                selectedPaycode &&
                                !selectedPaycode.is_variable_amount
                              }
                              className={clsx(
                                "w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                                "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                                selectedPaycode &&
                                  !selectedPaycode.is_variable_amount
                                  ? "bg-gray-50 dark:bg-gray-800 text-default-500"
                                  : "bg-white dark:bg-gray-700"
                              )}
                              placeholder="0.00"
                            />
                          </div>

                          {/* Notes Input */}
                          <div>
                            <label className="block text-sm text-default-600 dark:text-gray-300 mb-1">
                              Notes (optional)
                            </label>
                            <input
                              type="text"
                              value={newAddonNotes}
                              onChange={(e) => setNewAddonNotes(e.target.value)}
                              className={clsx(
                                "w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
                                "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
                                "bg-white dark:bg-gray-700"
                              )}
                              placeholder="Add a note..."
                            />
                          </div>

                          {/* Add Button */}
                          <Button
                            onClick={handleAddAddon}
                            disabled={
                              isAdding ||
                              !selectedPaycode ||
                              newAddonAmount === ""
                            }
                            icon={IconPlus}
                            variant="filled"
                            color="sky"
                            className="w-full"
                          >
                            {isAdding ? "Adding..." : "Add"}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end px-6 py-4 border-t border-default-200 dark:border-gray-700">
                  <Button onClick={onClose} variant="outline">
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

export default RentalAddonModal;
