import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FormInput, FormListbox } from "../../../components/FormComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { api } from "../../../routes/utils/api";

type InvoiceSource = "purchase_invoices" | "self_billed_invoices";

interface SupplierPaymentRow {
  payment_id: number;
  invoice_source: InvoiceSource;
  invoice_id: number;
  invoice_doc_no: string | null;
  supplier_name: string | null;
  payment_date: string;
  amount_paid: number;
  payment_method: string;
  bank_account: string | null;
  internal_reference: string | null;
  payment_reference: string | null;
  journal_reference_no: string | null;
  status: "active" | "pending" | "cancelled";
}

const sourceOptions = [
  { id: "", name: "All sources" },
  { id: "purchase_invoices", name: "Material Purchases" },
  { id: "self_billed_invoices", name: "General Purchases" },
];

const statusOptions = [
  { id: "active", name: "Active only" },
  { id: "all", name: "Include cancelled" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const SupplierPaymentListPage: React.FC = () => {
  const navigate = useNavigate();
  const today = new Date();
  const defaultStart = format(
    new Date(today.getFullYear(), today.getMonth() - 2, 1),
    "yyyy-MM-dd"
  );
  const defaultEnd = format(today, "yyyy-MM-dd");

  const [rows, setRows] = useState<SupplierPaymentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filters, setFilters] = useState({
    source: "" as "" | InvoiceSource,
    start_date: defaultStart,
    end_date: defaultEnd,
    status: "active" as "active" | "all",
    search: "",
  });

  const fetchPayments = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.source) params.append("invoice_source", filters.source);
      if (filters.start_date) params.append("start_date", filters.start_date);
      if (filters.end_date) params.append("end_date", filters.end_date);
      if (filters.status === "all") params.append("include_cancelled", "true");
      params.append("limit", "300");

      const response = await api.get<SupplierPaymentRow[]>(
        `/api/supplier-payments?${params.toString()}`
      );
      setRows(Array.isArray(response) ? response : []);
    } catch (error: unknown) {
      console.error("Error fetching supplier payments:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to fetch payments"
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters.end_date, filters.source, filters.start_date, filters.status]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const filteredRows = useMemo(() => {
    if (!filters.search.trim()) return rows;
    const needle = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      return (
        row.supplier_name?.toLowerCase().includes(needle) ||
        row.invoice_doc_no?.toLowerCase().includes(needle) ||
        row.internal_reference?.toLowerCase().includes(needle) ||
        row.payment_reference?.toLowerCase().includes(needle) ||
        row.journal_reference_no?.toLowerCase().includes(needle)
      );
    });
  }, [rows, filters.search]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        if (row.status === "active") acc.active += Number(row.amount_paid || 0);
        return acc;
      },
      { active: 0 }
    );
  }, [filteredRows]);

  const updateFilter = <K extends keyof typeof filters>(
    key: K,
    value: (typeof filters)[K]
  ): void => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-default-800 dark:text-gray-100">
          Supplier Payments
        </h1>
        <div className="text-sm text-default-500 dark:text-gray-400">
          Supplier payments recorded from material and general purchase forms.
        </div>
      </div>

      <section className="rounded-lg border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="grid gap-3 md:grid-cols-5">
          <FormListbox
            name="source"
            label="Source"
            value={filters.source}
            onChange={(value: string) =>
              updateFilter("source", value as "" | InvoiceSource)
            }
            options={sourceOptions}
          />
          <FormInput
            name="start_date"
            label="Start Date"
            type="date"
            value={filters.start_date}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateFilter("start_date", event.target.value)
            }
          />
          <FormInput
            name="end_date"
            label="End Date"
            type="date"
            value={filters.end_date}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateFilter("end_date", event.target.value)
            }
          />
          <FormListbox
            name="status"
            label="Status"
            value={filters.status}
            onChange={(value: string) =>
              updateFilter("status", value as "active" | "all")
            }
            options={statusOptions}
          />
          <FormInput
            name="search"
            label="Search"
            value={filters.search}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              updateFilter("search", event.target.value)
            }
            placeholder="Supplier / PV / Ref"
          />
        </div>
      </section>

      <section className="rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-6 text-center text-sm text-default-500 dark:text-gray-400">
            No supplier payments found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-default-200 text-sm dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                    PV / Internal
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                    Supplier
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                    Invoice
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                    Method
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                    Journal
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100 dark:divide-gray-800">
                {filteredRows.map((row) => (
                  <tr
                    key={row.payment_id}
                    onClick={() =>
                      navigate(`/accounting/supplier-payments/${row.payment_id}`)
                    }
                    className={`cursor-pointer hover:bg-default-50 dark:hover:bg-gray-700/40 ${
                      row.status === "cancelled"
                        ? "text-default-400 dark:text-gray-500"
                        : "text-default-900 dark:text-gray-100"
                    }`}
                  >
                    <td className="px-3 py-2">{formatDate(row.payment_date)}</td>
                    <td className="px-3 py-2 font-mono">
                      {row.internal_reference || `#${row.payment_id}`}
                    </td>
                    <td className="px-3 py-2">{row.supplier_name || "-"}</td>
                    <td className="px-3 py-2 font-mono">
                      {row.invoice_doc_no || `#${row.invoice_id}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatCurrency(Number(row.amount_paid))}
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {row.payment_method.replace("_", " ")}
                      {row.bank_account && row.bank_account !== "CASH" && (
                        <span className="ml-1 text-xs text-default-500 dark:text-gray-400">
                          ({row.bank_account.replace("BANK_", "")})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {row.journal_reference_no || "-"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          row.status === "cancelled"
                            ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            : row.status === "pending"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-default-50 dark:bg-gray-900/50">
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-default-500 dark:text-gray-400"
                  >
                    Active Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-default-900 dark:text-gray-100">
                    {formatCurrency(totals.active)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default SupplierPaymentListPage;
