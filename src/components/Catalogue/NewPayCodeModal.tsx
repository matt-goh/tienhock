// src/components/Catalogue/NewPayCodeModal.tsx
import React, { useState, useEffect, useMemo, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  Field,
} from "@headlessui/react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

import Button from "../Button";
import { PayCode, Job } from "../../types/types";

interface NewPayCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null; // Job to add the pay code to
  availablePayCodesToAdd: PayCode[]; // Filtered list from parent
  onPayCodeAdded: (payCodeId: string) => Promise<void>; // Callback after successful add
}

const NewPayCodeModal: React.FC<NewPayCodeModalProps> = ({
  isOpen,
  onClose,
  job,
  availablePayCodesToAdd,
  onPayCodeAdded,
}) => {
  const [query, setQuery] = useState("");
  const [selectedPayCodeToAdd, setSelectedPayCodeToAdd] =
    useState<PayCode | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [loadedItemCount, setLoadedItemCount] = useState(20);

  // Reset selection when modal opens or available codes change
  useEffect(() => {
    if (isOpen) {
      setSelectedPayCodeToAdd(null);
      setQuery("");
    }
  }, [isOpen]);

  const filteredPayCodes = useMemo(() => {
    const filtered =
      query === ""
        ? availablePayCodesToAdd
        : availablePayCodesToAdd.filter((pc) =>
            `${pc.id.toLowerCase()} ${pc.description.toLowerCase()}`.includes(
              query.toLowerCase()
            )
          );

    // Only return the first loadedItemCount items
    return filtered.slice(0, loadedItemCount);
  }, [availablePayCodesToAdd, query, loadedItemCount]);

  const hasMoreItems = useMemo(() => {
    const totalFiltered =
      query === ""
        ? availablePayCodesToAdd.length
        : availablePayCodesToAdd.filter((pc) =>
            `${pc.id.toLowerCase()} ${pc.description.toLowerCase()}`.includes(
              query.toLowerCase()
            )
          ).length;

    return totalFiltered > loadedItemCount;
  }, [availablePayCodesToAdd, query, loadedItemCount]);

  const handleLoadMore = (e: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    e.preventDefault(); // Prevent closing the dropdown
    e.stopPropagation();
    setLoadedItemCount((prev) => prev + 20);
  };

  useEffect(() => {
    setLoadedItemCount(20);
  }, [query]);

  const handleAdd = async () => {
    if (!selectedPayCodeToAdd || isAdding) return;
    setIsAdding(true);
    try {
      await onPayCodeAdded(selectedPayCodeToAdd.id);
      onClose(); // Close modal on success
    } catch (error) {
      // Error is likely handled by parent via toast
      console.error("Failed in onPayCodeAdded:", error);
    } finally {
      setIsAdding(false);
    }
  };

  // Close modal and reset state
  const handleClose = () => {
    if (!isAdding) {
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
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
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
              <DialogPanel className="w-full max-w-md transform rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Add Pay Code to Job "{job?.name}"
                </DialogTitle>
                <div className="mt-4">
                  <Field>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Pay Code
                    </label>
                    {/* Wrap Combobox in a relative container to anchor the options */}
                    <div className="relative">
                      <Combobox
                        value={selectedPayCodeToAdd}
                        onChange={setSelectedPayCodeToAdd}
                        disabled={isAdding}
                      >
                        <div className="relative">
                          <ComboboxInput
                            className="w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            displayValue={(pc: PayCode | null) =>
                              pc ? `${pc.id} - ${pc.description}` : ""
                            }
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search code or description..."
                            autoComplete="off"
                          />
                          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                            <IconChevronDown
                              size={20}
                              className="text-gray-400"
                              aria-hidden="true"
                            />
                          </ComboboxButton>
                        </div>
                        <Transition
                          as={Fragment}
                          leave="transition ease-in duration-100"
                          leaveFrom="opacity-100"
                          leaveTo="opacity-0"
                          afterLeave={() => setQuery("")}
                        >
                          {/* Apply w-full to make options match input width */}
                          <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                            {filteredPayCodes.length === 0 && query !== "" ? (
                              <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                                Nothing found.
                              </div>
                            ) : filteredPayCodes.length === 0 &&
                              availablePayCodesToAdd.length === 0 ? (
                              <div className="relative cursor-default select-none py-2 px-4 text-gray-500">
                                No available pay codes to add.
                              </div>
                            ) : (
                              filteredPayCodes.map((pc) => (
                                <ComboboxOption
                                  key={pc.id}
                                  className={({ active }) =>
                                    `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                      active
                                        ? "bg-sky-100 text-sky-900"
                                        : "text-gray-900"
                                    }`
                                  }
                                  value={pc}
                                >
                                  {({ selected }) => (
                                    <>
                                      {/* Ensure truncate class is present */}
                                      <span
                                        className={`block truncate ${
                                          selected
                                            ? "font-medium"
                                            : "font-normal"
                                        }`}
                                      >
                                        {pc.id} - {pc.description}
                                      </span>
                                      {selected ? (
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600">
                                          <IconCheck
                                            size={20}
                                            aria-hidden="true"
                                          />
                                        </span>
                                      ) : null}
                                    </>
                                  )}
                                </ComboboxOption>
                              ))
                            )}
                            {/* Load More Button */}
                            {hasMoreItems && (
                              <div className="border-t border-gray-200 p-2">
                              <button
                                type="button"
                                onClick={handleLoadMore}
                                className="w-full text-center py-1.5 px-4 text-sm font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100 transition-colors duration-200 disabled:opacity-50 flex items-center justify-center"
                                disabled={isAdding}
                              >
                                <IconChevronDown size={16} className="mr-1.5" />
                                <span>Load More Pay Codes ({availablePayCodesToAdd.length - loadedItemCount} remaining)</span>
                              </button>
                              </div>
                            )}
                          </ComboboxOptions>
                        </Transition>
                      </Combobox>
                    </div>
                  </Field>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isAdding}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    color="sky"
                    variant="filled"
                    disabled={!selectedPayCodeToAdd || isAdding}
                    onClick={handleAdd}
                  >
                    {isAdding ? "Adding..." : "Add"}
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

export default NewPayCodeModal;
