// src/components/GreenTarget/GTStatementModal.tsx
import React, { useState, useEffect } from "react";
import { Dialog, TransitionChild, DialogTitle } from "@headlessui/react";
import { IconX, IconChevronRight } from "@tabler/icons-react";
import Button from "../Button";
import { FormCombobox, FormListbox, SelectOption } from "../FormComponents";
import { greenTargetApi } from "../../routes/greentarget/api";
import { toast } from "react-hot-toast";

interface GTStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  month?: number;
  year?: number;
}

interface MonthYearOption {
  id: string;
  name: string;
  month: number;
  year: number;
}

const GTStatementModal: React.FC<GTStatementModalProps> = ({
  isOpen,
  onClose,
  month = new Date().getMonth(),
  year = new Date().getFullYear(),
}) => {
  const [startMonthYear, setStartMonthYear] = useState<string>(
    `${month}-${year}`
  );
  const [endMonthYear, setEndMonthYear] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [customerOptions, setCustomerOptions] = useState<SelectOption[]>([]);
  const [customerQuery, setCustomerQuery] = useState<string>("");
  const [isValidRange, setIsValidRange] = useState<boolean>(true);

  // Generate month-year options (current year and previous year)
  const monthYearOptions: MonthYearOption[] = [];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Add current year and previous year months
  for (let y = year; y >= year - 1; y--) {
    for (let m = 0; m < 12; m++) {
      monthYearOptions.push({
        id: `${m}-${y}`,
        name: `${monthNames[m]} ${y}`,
        month: m,
        year: y,
      });
    }
  }

  // Sort more recent months first
  monthYearOptions.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  // Fetch customers
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const customers = await greenTargetApi.getCustomers();
        const options = customers.map(
          (customer: { customer_id: any; name: any; phone_number: any }) => ({
            id: customer.customer_id.toString(),
            name: customer.name || `Customer ${customer.customer_id}`,
            phone_number: customer.phone_number,
          })
        );
        setCustomerOptions(options);
      } catch (error) {
        console.error("Error fetching customers:", error);
        toast.error("Failed to load customers");
      }
    };

    if (isOpen) {
      fetchCustomers();
    }
  }, [isOpen]);

  useEffect(() => {
    // If no end month is selected, range is always valid
    if (!endMonthYear) {
      setIsValidRange(true);
      return;
    }

    const [startMonth, startYear] = startMonthYear.split("-").map(Number);
    const [endMonth, endYear] = endMonthYear.split("-").map(Number);

    // Compare by converting to total months
    const startTotalMonths = startYear * 12 + startMonth;
    const endTotalMonths = endYear * 12 + endMonth;

    setIsValidRange(endTotalMonths >= startTotalMonths);
  }, [startMonthYear, endMonthYear]);

  const handleGenerate = async () => {
    if (selectedCustomers.length === 0) {
      toast.error("Please select at least one customer");
      return;
    }

    // Validate month range if endMonth is selected
    if (endMonthYear !== null) {
      const [startMonth, startYear] = startMonthYear.split("-").map(Number);
      const [endMonth, endYear] = endMonthYear.split("-").map(Number);

      // Compare by converting to total months
      const startTotalMonths = startYear * 12 + startMonth;
      const endTotalMonths = endYear * 12 + endMonth;

      if (endTotalMonths < startTotalMonths) {
        toast.error("End month cannot be before start month");
        return;
      }
    }

    setLoading(true);

    try {
      // Frontend-only implementation for now
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const startOption = monthYearOptions.find((o) => o.id === startMonthYear);
      const endOption = endMonthYear
        ? monthYearOptions.find((o) => o.id === endMonthYear)
        : null;

      const monthRangeText = endOption
        ? `${startOption?.name} to ${endOption?.name}`
        : startOption?.name;

      toast.success(
        `Statement generation requested for ${selectedCustomers.length} customer(s) for ${monthRangeText}`
      );
      onClose();
    } catch (error) {
      console.error("Error generating statement:", error);
      toast.error("Failed to generate statement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      as="div"
      className="fixed inset-0 overflow-y-auto z-50"
      open={isOpen}
      onClose={onClose}
    >
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div className="flex items-center justify-center min-h-screen w-full">
        <TransitionChild
          as="div"
          enter="ease-out duration-300"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
          className={"w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8"}
        >
          <div className="relative bg-white rounded-lg max-w-2xl w-full mx-4 p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <DialogTitle as="h3" className="text-lg font-medium">
                Generate Statement
              </DialogTitle>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-default-100"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Month range selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700">
                  Select Month Range
                </label>
                <div className="flex items-center space-x-3">
                  <div className="flex-1">
                    <FormListbox
                      name="startMonthYear"
                      label=""
                      value={startMonthYear}
                      onChange={(value: React.SetStateAction<string>) =>
                        setStartMonthYear(value)
                      }
                      options={monthYearOptions}
                      placeholder="Start month..."
                    />
                  </div>

                  <IconChevronRight
                    size={18}
                    className="text-default-400 flex-shrink-0"
                  />

                  <div className="flex-1">
                    <FormListbox
                      name="endMonthYear"
                      label=""
                      value={endMonthYear || ""}
                      onChange={(value: any) => setEndMonthYear(value || null)}
                      options={[
                        { id: "", name: "Same as start" },
                        ...monthYearOptions,
                      ]}
                      placeholder="End month (optional)..."
                    />
                  </div>
                </div>
                <p className="text-xs text-default-500 mt-1">
                  {endMonthYear
                    ? `Statement will include all transactions from ${
                        monthYearOptions.find((o) => o.id === startMonthYear)
                          ?.name
                      } to ${
                        monthYearOptions.find((o) => o.id === endMonthYear)
                          ?.name
                      }`
                    : `Statement will include all transactions in ${
                        monthYearOptions.find((o) => o.id === startMonthYear)
                          ?.name
                      }`}
                </p>
                {endMonthYear && !isValidRange && (
                  <p className="text-xs text-rose-600 mt-1">
                    End month cannot be before start month
                  </p>
                )}
              </div>

              {/* Customer selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-default-700">
                  Select Customer(s)
                </label>
                <FormCombobox
                  name="customers"
                  label=""
                  value={selectedCustomers}
                  onChange={(value) => {
                    if (Array.isArray(value)) {
                      setSelectedCustomers(value);
                    } else if (value) {
                      setSelectedCustomers([value]);
                    } else {
                      setSelectedCustomers([]);
                    }
                  }}
                  options={customerOptions}
                  query={customerQuery}
                  setQuery={setCustomerQuery}
                  mode="multiple"
                  placeholder="Select customers..."
                />

                {/* Selected customers summary */}
                {selectedCustomers.length > 0 && (
                  <div className="mt-2 p-2 bg-sky-50 border border-sky-100 rounded-lg">
                    <p className="text-sm text-default-700 font-medium mb-1">
                      Selected: {selectedCustomers.length} customer
                      {selectedCustomers.length > 1 ? "s" : ""}
                    </p>
                    <div className="max-h-36 overflow-y-auto">
                      <ul className="text-xs text-default-600 space-y-1">
                        {selectedCustomers.map((customerId) => {
                          const customer = customerOptions.find(
                            (c) => c.id === customerId
                          );
                          return (
                            <li key={customerId} className="flex items-center">
                              <span className="w-3 h-3 bg-sky-400 rounded-full mr-2 flex-shrink-0"></span>
                              <span className="truncate">
                                {customer?.name || `Customer #${customerId}`}
                                {customer?.phone_number &&
                                  ` (${customer.phone_number})`}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        className="text-xs text-sky-600 hover:text-sky-800 hover:underline"
                        onClick={() => setSelectedCustomers([])}
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-default-500 mt-1">
                  Statements will be generated for each selected customer
                </p>
              </div>
            </div>

            <div className="mt-8 flex space-x-3 justify-end">
              <Button onClick={onClose} variant="outline" disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                variant="filled"
                color="sky"
                disabled={
                  loading || selectedCustomers.length === 0 || !isValidRange
                }
              >
                Generate Statement{selectedCustomers.length > 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </TransitionChild>
      </div>
    </Dialog>
  );
};

export default GTStatementModal;
