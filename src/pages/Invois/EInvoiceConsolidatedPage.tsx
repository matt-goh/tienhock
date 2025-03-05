// src/pages/Invois/EInvoiceConsolidatedPage.tsx
import React, { useState, useEffect } from "react";
import { api } from "../../routes/utils/api";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import LoadingSpinner from "../../components/LoadingSpinner";

interface MonthOption {
  id: number;
  name: string;
}

interface EligibleInvoice {
  id: string;
  salespersonid: string;
  customerid: string;
  createddate: string;
  paymenttype: string;
  amount: number;
  rounding: number;
  totalamountpayable: number;
}

const EInvoiceConsolidatedPage: React.FC = () => {
  // Get current month and year
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Define months
  const monthOptions: MonthOption[] = [
    { id: 0, name: "January" },
    { id: 1, name: "February" },
    { id: 2, name: "March" },
    { id: 3, name: "April" },
    { id: 4, name: "May" },
    { id: 5, name: "June" },
    { id: 6, name: "July" },
    { id: 7, name: "August" },
    { id: 8, name: "September" },
    { id: 9, name: "October" },
    { id: 10, name: "November" },
    { id: 11, name: "December" },
  ];

  // Calculate previous month
  const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  // States
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    monthOptions[previousMonth]
  );
  const [selectedYear] = useState<number>(previousYear);
  const [eligibleInvoices, setEligibleInvoices] = useState<EligibleInvoice[]>(
    []
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch eligible invoices when month/year changes
  useEffect(() => {
    const fetchEligibleInvoices = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await api.get(
          `/api/einvoice/eligible-for-consolidation?month=${selectedMonth.id}&year=${selectedYear}`
        );

        if (response.success) {
          setEligibleInvoices(response.data);
          console.log("Eligible invoices:", response.data);
        } else {
          setError(response.message || "Failed to fetch eligible invoices");
        }
      } catch (err) {
        console.error("Error fetching eligible invoices:", err);
        setError("An error occurred while fetching eligible invoices");
      } finally {
        setIsLoading(false);
      }
    };

    fetchEligibleInvoices();
  }, [selectedMonth, selectedYear]);

  return (
    <div className="flex flex-col mt-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-semibold text-default-900">
          Consolidate e-Invoices
        </h1>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-60">
          <Listbox value={selectedMonth} onChange={setSelectedMonth}>
            <div className="relative">
              <ListboxButton className="w-full rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
                <span className="block truncate pl-2">
                  {selectedMonth.name}
                </span>
                <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <IconChevronDown
                    className="h-5 w-5 text-default-400"
                    aria-hidden="true"
                  />
                </span>
              </ListboxButton>
              <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
                {monthOptions.map((month) => (
                  <ListboxOption
                    key={month.id}
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 text-default-900"
                          : "text-default-900"
                      }`
                    }
                    value={month}
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          {month.name}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </div>
          </Listbox>
        </div>

        <div className="text-lg font-medium text-default-700">
          {selectedYear}
        </div>
      </div>

      {/* Display loading state */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      )}

      {/* Display error message */}
      {error && (
        <div className="bg-rose-50 text-rose-600 p-4 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Display results */}
      {!isLoading && !error && (
        <div className="bg-white rounded-lg border border-default-200 p-4">
          <h2 className="text-lg font-medium mb-2">
            Eligible Invoices: {eligibleInvoices.length}
          </h2>

          {eligibleInvoices.length === 0 ? (
            <p className="text-default-500">
              No eligible invoices found for {selectedMonth.name} {selectedYear}
              .
            </p>
          ) : (
            <div className="text-default-700">
              Found {eligibleInvoices.length} invoices that can be consolidated.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EInvoiceConsolidatedPage;
