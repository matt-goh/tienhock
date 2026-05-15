import React, { useEffect, useMemo, useState } from "react";
import {
  IconFileInvoice,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import DateRangePicker from "../../../components/DateRangePicker";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { FormListbox } from "../../../components/FormComponents";
import { api } from "../../../routes/utils/api";
import {
  SelfBilledEInvoiceStatus,
  SelfBilledInvoiceStatus,
  SelfBilledInvoiceListItem,
} from "../../../types/types";

interface DateRange {
  start: Date;
  end: Date;
}

const invoiceStatusOptions = [
  { id: "", name: "All Docs" },
  { id: "active", name: "Active" },
  { id: "cancelled", name: "Cancelled" },
];

const eInvoiceStatusOptions = [
  { id: "", name: "All E-Invoice" },
  { id: "draft", name: "Not Submitted" },
  { id: "pending", name: "Pending" },
  { id: "valid", name: "Valid" },
  { id: "invalid", name: "Invalid" },
  { id: "cancelled", name: "Cancelled" },
];

const getStatusLabel = (status: SelfBilledEInvoiceStatus): string => {
  if (!status) return "Not Submitted";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const getStatusClasses = (status: SelfBilledEInvoiceStatus): string => {
  switch (status) {
    case "valid":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "pending":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
    case "invalid":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
    case "cancelled":
      return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
};

const getInvoiceStatusLabel = (status: SelfBilledInvoiceStatus): string => {
  return status === "cancelled" ? "Cancelled" : "Active";
};

const getInvoiceStatusClasses = (status: SelfBilledInvoiceStatus): string => {
  if (status === "cancelled") {
    return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
};

const formatDate = (value: string): string => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatAmount = (amount: number | string, currency: string): string => {
  const numericAmount = Number(amount || 0);
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(numericAmount);
};

const getMonthStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const getTodayEnd = (): Date => {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
};

const formatDateForApi = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const SelfBilledInvoiceListPage: React.FC = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<SelfBilledInvoiceListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [total, setTotal] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedInvoiceStatus, setSelectedInvoiceStatus] = useState<string>("");
  const [selectedEInvoiceStatus, setSelectedEInvoiceStatus] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange>({
    start: getMonthStart(),
    end: getTodayEnd(),
  });

  const fetchInvoices = async (): Promise<void> => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", "100");
      if (searchTerm) params.append("search", searchTerm);
      if (selectedInvoiceStatus) {
        params.append("invoice_status", selectedInvoiceStatus);
      }
      if (selectedEInvoiceStatus) {
        params.append("einvoice_status", selectedEInvoiceStatus);
      }
      params.append("start_date", formatDateForApi(dateRange.start));
      params.append("end_date", formatDateForApi(dateRange.end));

      const response = await api.get(
        `/api/self-billed-invoices?${params.toString()}`
      );
      setInvoices(response.invoices || []);
      setTotal(response.total || 0);
    } catch (error) {
      console.error("Error fetching self-billed invoices:", error);
      toast.error("Failed to load self-billed invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoiceStatus, selectedEInvoiceStatus, dateRange]);

  useEffect(() => {
    const timer: number = window.setTimeout(() => {
      fetchInvoices();
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const totals = useMemo(() => {
    return invoices.reduce(
      (accumulator, invoice) => ({
        foreign: accumulator.foreign + Number(invoice.total_foreign_amount || 0),
        myr: accumulator.myr + Number(invoice.payable_amount_myr || 0),
      }),
      { foreign: 0, myr: 0 }
    );
  }, [invoices]);

  const clearSearch = (): void => {
    setSearchTerm("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 rounded-lg border border-default-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-default-900 dark:text-gray-100">
            {total > 0 && !loading ? `${total} ` : ""}Self-Billed E-Invoices
          </h1>
          <span className="hidden text-default-300 dark:text-gray-600 sm:inline">
            |
          </span>
          <DateRangePicker
            dateRange={dateRange}
            onDateChange={setDateRange}
            size="sm"
          />
          <span className="hidden text-default-300 dark:text-gray-600 sm:inline">
            |
          </span>
          <div className="flex h-8 items-center rounded-lg border border-default-200 bg-default-50 px-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
            <span className="mr-2 text-default-500 dark:text-gray-400">MYR</span>
            <span className="font-mono font-semibold text-default-900 dark:text-gray-100">
              {totals.myr.toLocaleString("en-MY", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="relative h-8 w-full sm:w-48"
            title="Search by self-billed number, supplier, order, or platform"
          >
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Search"
              className="h-8 w-full rounded-lg border border-default-300 bg-white pl-9 pr-8 text-sm text-default-900 outline-none placeholder:text-default-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            {searchTerm && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-default-400 hover:text-default-700 dark:text-gray-400 dark:hover:text-gray-200"
                onClick={clearSearch}
                title="Clear search"
              >
                <IconX size={15} />
              </button>
            )}
          </div>

          <div className="h-8 w-full sm:w-32">
            <FormListbox
              name="invoice_status"
              value={selectedInvoiceStatus}
              onChange={setSelectedInvoiceStatus}
              options={invoiceStatusOptions}
              className="[&_button]:h-8 [&_button]:py-1"
            />
          </div>

          <div className="h-8 w-full sm:w-40">
            <FormListbox
              name="einvoice_status"
              value={selectedEInvoiceStatus}
              onChange={setSelectedEInvoiceStatus}
              options={eInvoiceStatusOptions}
              className="[&_button]:h-8 [&_button]:py-1"
            />
          </div>

          <Button
            type="button"
            icon={IconRefresh}
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-lg !px-0"
            onClick={fetchInvoices}
          />
          <Button
            type="button"
            icon={IconPlus}
            color="sky"
            variant="filled"
            size="sm"
            className="h-8 rounded-lg !px-3"
            onClick={() => navigate("/accounting/self-billed-invoices/new")}
          >
            New
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-default-500 dark:text-gray-400">
            <IconFileInvoice size={32} className="mb-2" />
            <p className="text-sm">No self-billed invoices found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Document
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Supplier
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Reference
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Foreign
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    MYR
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    E-Invoice
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                {invoices.map((invoice: SelfBilledInvoiceListItem) => (
                  <tr
                    key={invoice.id}
                    onClick={() =>
                      navigate(`/accounting/self-billed-invoices/${invoice.id}`)
                    }
                    className="cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-sm text-default-700 dark:text-gray-300">
                      {formatDate(invoice.purchase_date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-default-900 dark:text-gray-100">
                      {invoice.self_billed_no}
                    </td>
                    <td className="px-3 py-2 text-sm text-default-700 dark:text-gray-300">
                      <span className="block truncate">{invoice.supplier_name}</span>
                    </td>
                    <td className="px-3 py-2 text-sm text-default-600 dark:text-gray-400">
                      <div className="max-w-xs truncate">
                        {[invoice.platform, invoice.order_no]
                          .filter(Boolean)
                          .join(" / ") || "-"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-mono text-default-700 dark:text-gray-300">
                      {formatAmount(
                        invoice.total_foreign_amount,
                        invoice.currency_code
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-mono text-default-900 dark:text-gray-100">
                      {formatAmount(invoice.payable_amount_myr, "MYR")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getInvoiceStatusClasses(
                          invoice.invoice_status
                        )}`}
                      >
                        {getInvoiceStatusLabel(invoice.invoice_status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                          invoice.einvoice_status
                        )}`}
                      >
                        {getStatusLabel(invoice.einvoice_status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                          event.stopPropagation();
                          navigate(
                            `/accounting/self-billed-invoices/${invoice.id}`
                          );
                        }}
                        className="rounded p-1 text-default-500 hover:bg-default-100 hover:text-default-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                        title="Open self-billed invoice"
                      >
                        <IconPencil size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SelfBilledInvoiceListPage;
