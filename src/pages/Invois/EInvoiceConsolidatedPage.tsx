// src/pages/Invois/EInvoiceConsolidatedPage.tsx
import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../routes/utils/api";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  IconChevronDown,
  IconCheck,
  IconFileSad,
  IconFileInvoice,
} from "@tabler/icons-react";
import LoadingSpinner from "../../components/LoadingSpinner";
import TableEditing from "../../components/Table/TableEditing";
import { ColumnConfig } from "../../types/types";
import {
  parseDatabaseTimestamp,
  formatDisplayDate,
} from "../../utils/invoice/dateUtils";
import Button from "../../components/Button";

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

  // Calculate initial month and year
  const initialMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const initialYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  // States
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    monthOptions[initialMonth]
  );
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [eligibleInvoices, setEligibleInvoices] = useState<EligibleInvoice[]>(
    []
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Selection states
  const [selectedCount, setSelectedCount] = useState(0);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<EligibleInvoice[]>(
    []
  );
  const [totals, setTotals] = useState({
    subtotal: 0,
    tax: 0,
    total: 0,
  });

  useEffect(() => {
    const calculateTotals = () => {
      let subtotal = 0;
      let total = 0;

      selectedInvoices.forEach((invoice) => {
        subtotal += Number(invoice.amount) || 0;
        total += Number(invoice.totalamountpayable) || 0;
      });

      // Tax is the difference between total and subtotal
      const tax = total - subtotal;

      setTotals({
        subtotal,
        tax,
        total,
      });
    };

    calculateTotals();
  }, [selectedInvoices]);

  // Define columns for the table
  const invoiceColumns: ColumnConfig[] = [
    {
      id: "id",
      header: "Invoice",
      type: "readonly",
      width: 150,
      cell: (info: {
        getValue: () => any;
        row: { original: EligibleInvoice };
      }) => (
        <div className="px-6 py-3">
          {info.row.original.paymenttype === "CASH" ? "C" : "I"}
          {info.getValue()}
        </div>
      ),
    },
    {
      id: "createddate",
      header: "Date",
      type: "readonly",
      width: 150,
      cell: (info: { getValue: () => any }) => {
        const timestamp = info.getValue();
        const { date } = parseDatabaseTimestamp(timestamp);
        return <div className="px-6 py-3">{formatDisplayDate(date)}</div>;
      },
    },
    {
      id: "salespersonid",
      header: "Salesman",
      type: "readonly",
      width: 150,
    },
    {
      id: "customerid",
      header: "Customer",
      type: "readonly",
      width: 500,
    },
    {
      id: "totalamountpayable",
      header: "Amount",
      type: "amount",
      width: 150,
      cell: (info: { getValue: () => any }) => (
        <div className="px-6 py-3 text-right">
          {Number(info.getValue() || 0).toFixed(2)}
        </div>
      ),
    },
  ];

  // Handler for selection changes
  const handleSelectionChange = useCallback(
    (count: number, allSelected: boolean, selectedRows: EligibleInvoice[]) => {
      setSelectedCount(count);
      setIsAllSelected(allSelected);
      setSelectedInvoices(selectedRows);
    },
    []
  );

  // Handle month change and adjust year accordingly
  const handleMonthChange = (month: MonthOption) => {
    setSelectedMonth(month);
    // If selected month is ahead of current month, show previous year
    const newYear = month.id > currentMonth ? currentYear - 1 : currentYear;
    setSelectedYear(newYear);
  };

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

      <div className="flex flex-col mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-60">
              <Listbox value={selectedMonth} onChange={handleMonthChange}>
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
                                <IconCheck
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
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
            <div className="text-lg font-medium text-default-700 ml-2">
              {selectedYear}
            </div>
          </div>
        </div>

        {selectedInvoices.length > 0 && (
          <div className="mt-4 p-4 bg-white rounded-lg border border-default-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm text-default-500 font-medium">
                {selectedInvoices.length} invoice
                {selectedInvoices.length !== 1 ? "s" : ""} selected
              </div>

              <div className="flex items-center space-x-6">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-default-500">Subtotal</span>
                  <span className="text-base font-semibold text-default-700">
                    {totals.subtotal.toLocaleString("en-MY", {
                      style: "currency",
                      currency: "MYR",
                    })}
                  </span>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-xs text-default-500">Tax</span>
                  <span className="text-base font-semibold text-default-700">
                    {totals.tax.toLocaleString("en-MY", {
                      style: "currency",
                      currency: "MYR",
                    })}
                  </span>
                </div>

                <div className="flex flex-col items-end pl-6 border-l border-default-200">
                  <span className="text-xs text-left text-default-500">
                    Total
                  </span>
                  <span className="text-lg font-semibold text-sky-600">
                    {totals.total.toLocaleString("en-MY", {
                      style: "currency",
                      currency: "MYR",
                    })}
                  </span>
                </div>

                <Button
                  onClick={() => console.log("Submit consolidated invoices")}
                  icon={IconFileInvoice}
                  color="sky"
                  variant="primary"
                >
                  Submit Consolidated
                </Button>
              </div>
            </div>
          </div>
        )}
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
        <>
          {eligibleInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 bg-default-50 rounded-lg border border-default-200">
              <IconFileSad className="w-12 h-12 text-default-400 mb-4" />
              <h3 className="text-lg font-medium text-default-700 mb-2">
                No Eligible Invoices Found
              </h3>
              <p className="text-default-500 text-center">
                There are no invoices available for consolidation in{" "}
                {selectedMonth.name} {selectedYear}.
              </p>
            </div>
          ) : (
            <div className="ml-[-44.1px]">
              <TableEditing<EligibleInvoice>
                initialData={eligibleInvoices}
                columns={invoiceColumns}
                onSelectionChange={handleSelectionChange}
                tableKey="consolidate"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EInvoiceConsolidatedPage;
