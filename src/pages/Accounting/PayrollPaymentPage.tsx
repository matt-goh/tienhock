// src/pages/Accounting/PayrollPaymentPage.tsx
// Payroll Bank Payment (settlement). Turns a month's payroll into the bank-payment
// journals the Voucher Generator's JVSL/JVDR don't post: DR accrual / CR bank. Amounts
// default from payroll (take-home − pinjam, statutory totals, half-month) but every field
// is editable so the posted figure matches the ACTUAL bank transfer. Posts to
// POST /api/payroll-payments/generate (one posted journal per included row).
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { IconRefresh, IconCheck } from "@tabler/icons-react";
import MonthNavigator from "../../components/MonthNavigator";
import Button from "../../components/Button";
import Checkbox from "../../components/Checkbox";
import ListboxSelect from "../../components/ListboxSelect";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import { useAccountCodesCache } from "../../utils/accounting/useAccountingCache";
import toast from "react-hot-toast";

interface PreviewRow {
  category: string;
  label: string;
  amount: number;
  contra_account: string;
  particulars: string;
  basis: string;
  already_generated: boolean;
}

interface EditableRow extends PreviewRow {
  include: boolean;
  amountStr: string;
  payment_date: string;
  bank_account: string;
  reference: string;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const PayrollPaymentPage: React.FC = () => {
  const { accountCodes, isLoading: accountsLoading } = useAccountCodesCache();

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<boolean>(false);

  const bankAccounts = useMemo(
    () =>
      accountCodes
        .filter((a) => a.is_active && (a.ledger_type === "BK" || a.code === "CASH"))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accountCodes]
  );

  const fetchPreview = useCallback(async (): Promise<void> => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    // Default payment date = today (payroll is usually paid the following month);
    // editable per row.
    const defaultDate = format(new Date(), "yyyy-MM-dd");
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/api/payroll-payments/preview/${year}/${month}`);
      const editable: EditableRow[] = (res.rows || []).map((r: PreviewRow) => ({
        ...r,
        include: r.amount > 0 && !r.already_generated,
        amountStr: r.amount.toFixed(2),
        payment_date: defaultDate,
        bank_account: res.bank_account || "BANK_PBB",
        reference: "",
      }));
      setRows(editable);
    } catch (err) {
      console.error("Error fetching payroll payment preview:", err);
      setError("Failed to load payroll payment preview.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const updateRow = (index: number, patch: Partial<EditableRow>): void => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  };

  const includedTotal = useMemo(
    () =>
      rows.reduce(
        (sum, r) => sum + (r.include ? parseFloat(r.amountStr) || 0 : 0),
        0
      ),
    [rows]
  );

  const handleGenerate = async (): Promise<void> => {
    const lines = rows
      .filter((r) => r.include && (parseFloat(r.amountStr) || 0) > 0)
      .map((r) => ({
        category: r.category,
        amount: parseFloat(r.amountStr) || 0,
        payment_date: r.payment_date,
        bank_account: r.bank_account,
        contra_account: r.contra_account,
        reference: r.reference || null,
        particulars: r.particulars,
      }));

    if (lines.length === 0) {
      toast.error("Select at least one line with an amount");
      return;
    }
    const missing = lines.find(
      (l) => !l.payment_date || !l.contra_account || !l.bank_account
    );
    if (missing) {
      toast.error("Each selected line needs a date, contra account and bank account");
      return;
    }

    setGenerating(true);
    try {
      const res = await api.post(`/api/payroll-payments/generate`, {
        year: selectedMonth.getFullYear(),
        month: selectedMonth.getMonth() + 1,
        lines,
      });
      toast.success(res.message || "Payroll payments posted");
      await fetchPreview();
    } catch (err: any) {
      console.error("Error generating payroll payments:", err);
      toast.error(err?.message || "Failed to post payroll payments");
    } finally {
      setGenerating(false);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Payroll Bank Payment
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Post the salary, director and statutory bank payments for a month (DR accrual /
          CR bank). Amounts default from payroll — edit to match the actual transfer.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <MonthNavigator selectedMonth={selectedMonth} onChange={setSelectedMonth} />
          <div className="flex items-center gap-3">
            <Button onClick={fetchPreview} variant="outline" disabled={loading}>
              <span className="flex items-center justify-center whitespace-nowrap">
                <IconRefresh className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </span>
            </Button>
            <Button
              onClick={handleGenerate}
              variant="filled"
              color="sky"
              disabled={generating || accountsLoading}
            >
              <span className="flex items-center justify-center whitespace-nowrap">
                <IconCheck className="h-4 w-4 mr-2" />
                {generating ? "Posting..." : "Generate & Post"}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-10"></th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Payment</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 w-36">Amount (RM)</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-40">Date</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-32">Contra (DR)</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-40">Bank (CR)</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-32">Cheque/Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No payroll data for this month
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.category} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={r.include}
                        onChange={(checked) => updateRow(i, { include: checked })}
                        size={20}
                        ariaLabel={`Include ${r.label}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800 dark:text-gray-100">
                        {r.label}
                        {r.already_generated && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                            already posted
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{r.basis}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">{r.particulars}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={r.amountStr}
                        onChange={(e) => updateRow(i, { amountStr: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-right font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="date"
                        value={r.payment_date}
                        onChange={(e) => updateRow(i, { payment_date: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={r.contra_account}
                        onChange={(e) => updateRow(i, { contra_account: e.target.value })}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <ListboxSelect
                        value={r.bank_account}
                        onChange={(v) => updateRow(i, { bank_account: v })}
                        options={
                          bankAccounts.length === 0
                            ? [{ value: "BANK_PBB", label: "BANK_PBB" }]
                            : bankAccounts.map((a) => ({
                                value: a.code,
                                label: a.code,
                              }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={r.reference}
                        onChange={(e) => updateRow(i, { reference: e.target.value })}
                        placeholder="—"
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-gray-100 dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-600">
              <tr>
                <td colSpan={2} className="px-3 py-3 text-right font-bold text-gray-900 dark:text-white">
                  TOTAL TO BANK (included):
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold text-gray-900 dark:text-white">
                  {formatCurrency(includedTotal)}
                </td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        Each included line posts a separate journal (entry type B / PBE) as DR contra · CR bank.
        Post the <span className="font-medium">JVSL/JVDR</span> expense vouchers first so the
        accruals these settle exist.
      </p>
    </div>
  );
};

export default PayrollPaymentPage;
