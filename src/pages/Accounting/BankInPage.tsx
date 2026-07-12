// src/pages/Accounting/BankInPage.tsx
// RV cash bank-in: bank undeposited cash from CH_REV1 daily cash-sales pools
// (partial amounts allowed) and CH_REV2 credit-invoice cash receipts, under a
// shared editable RV###/MM number. Posts DR bank / CR holding via /api/bank-ins.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { IconBuildingBank, IconPlus } from "@tabler/icons-react";
import Button from "../../components/Button";
import Checkbox from "../../components/Checkbox";
import { FormInput, FormListbox } from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { api } from "../../routes/utils/api";

interface CashSalesPool {
  source_date: string;
  collected: number;
  banked: number;
  remaining: number;
}

interface OpeningPool {
  anchor: number;
  banked: number;
  remaining: number;
  note: string;
}

interface UnbankedReceipt {
  id: number;
  display_reference: string | null;
  received_date: string;
  total_amount: number;
  banked: number;
  remaining: number;
  description: string | null;
  customers: string | null;
  origin: string;
}

interface BankInGroupDraft {
  holding_account: "CH_REV1" | "CH_REV2";
  description: string;
  allocations: { source_date?: string; receipt_id?: number; amount: number }[];
}

interface BankInRow {
  id: number;
  rv_number: string;
  posting_date: string;
  bank_account: string;
  total_amount: string;
  status: string;
  groups:
    | { group_number: number; holding_account: string; amount: string; description: string }[]
    | null;
}

const bankAccountOptions = [
  { id: "BANK_PBB", name: "Public Bank" },
  { id: "BANK_ABB", name: "Alliance Bank" },
];

const round2 = (v: number): number => Math.round(v * 100) / 100;
const fmtDMY = (iso: string): string =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const fmtAmt = (v: number | string): string =>
  Number(v || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BankInPage: React.FC = () => {
  const [bankIns, setBankIns] = useState<BankInRow[]>([]);
  const [pools, setPools] = useState<CashSalesPool[]>([]);
  const [openingPool, setOpeningPool] = useState<OpeningPool | null>(null);
  const [receipts, setReceipts] = useState<UnbankedReceipt[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [step, setStep] = useState<"select" | "preview">("select");
  const [cancelTarget, setCancelTarget] = useState<BankInRow | null>(null);

  const [postingDate, setPostingDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [bankAccount, setBankAccount] = useState<string>("BANK_PBB");
  const [rvNumber, setRvNumber] = useState<string>("");
  const [poolAmounts, setPoolAmounts] = useState<Record<string, string>>({});
  const [receiptChecked, setReceiptChecked] = useState<Record<number, boolean>>({});
  const [receiptAmounts, setReceiptAmounts] = useState<Record<number, string>>({});
  const [draftGroups, setDraftGroups] = useState<BankInGroupDraft[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, poolData] = await Promise.all([
        api.get("/api/bank-ins?limit=100"),
        api.get("/api/bank-ins/pools"),
      ]);
      setBankIns(Array.isArray(list) ? list : []);
      setPools(poolData?.cash_sales?.pools || []);
      setOpeningPool(poolData?.cash_sales?.opening || null);
      setReceipts(poolData?.cash_receipts || []);
    } catch (error) {
      console.error("Error loading bank-ins:", error);
      toast.error("Failed to load bank-in data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fetchNextRv = useCallback(async (dateStr: string) => {
    try {
      const next = await api.get(`/api/bank-ins/next-rv?date=${dateStr}`);
      if (next?.rv_number) setRvNumber(next.rv_number);
    } catch {
      /* prefill is best-effort; the backend validates on post */
    }
  }, []);

  useEffect(() => {
    if (showForm) fetchNextRv(postingDate);
  }, [showForm, postingDate, fetchNextRv]);

  const selectedPoolTotal = useMemo(
    () =>
      round2(
        Object.values(poolAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      ),
    [poolAmounts]
  );
  const selectedReceiptTotal = useMemo(
    () =>
      round2(
        receipts.reduce(
          (s, r) =>
            receiptChecked[r.id]
              ? s + (parseFloat(receiptAmounts[r.id] ?? String(r.remaining)) || 0)
              : s,
          0
        )
      ),
    [receipts, receiptChecked, receiptAmounts]
  );
  const grandTotal = round2(selectedPoolTotal + selectedReceiptTotal);

  const buildGroups = (): BankInGroupDraft[] => {
    const groups: BankInGroupDraft[] = [];
    // One CH_REV1 group per source date (mirrors the legacy one-RV-row-per-date print).
    for (const pool of pools) {
      const amt = parseFloat(poolAmounts[pool.source_date] || "");
      if (!(amt > 0)) continue;
      groups.push({
        holding_account: "CH_REV1",
        description: `SALES CASH FROM ${fmtDMY(pool.source_date)} BANK IN`,
        allocations: [{ source_date: pool.source_date, amount: round2(amt) }],
      });
    }
    // One CH_REV2 group per customer set (mirrors RV052/06 & RV074/06).
    const byCustomer: Record<string, BankInGroupDraft> = {};
    for (const r of receipts) {
      if (!receiptChecked[r.id]) continue;
      const amt = parseFloat(receiptAmounts[r.id] ?? String(r.remaining));
      if (!(amt > 0)) continue;
      const key = r.customers || `receipt-${r.id}`;
      if (!byCustomer[key]) {
        byCustomer[key] = { holding_account: "CH_REV2", description: "", allocations: [] };
        groups.push(byCustomer[key]);
      }
      byCustomer[key].allocations.push({ receipt_id: r.id, amount: round2(amt) });
      byCustomer[key].description = [
        ...new Set([
          ...(byCustomer[key].description ? [byCustomer[key].description] : []),
          r.description || r.display_reference || `Receipt #${r.id}`,
        ]),
      ].join(" & ");
    }
    return groups;
  };

  const handlePreview = () => {
    const groups = buildGroups();
    if (groups.length === 0) {
      toast.error("Select at least one cash-sales pool amount or receipt");
      return;
    }
    // Client-side over-banking hints (the backend re-validates under locks).
    for (const pool of pools) {
      const amt = parseFloat(poolAmounts[pool.source_date] || "");
      if (amt > 0 && amt > pool.remaining + 0.005) {
        toast.error(
          `Pool ${fmtDMY(pool.source_date)}: amount exceeds the unbanked remainder ${fmtAmt(pool.remaining)}`
        );
        return;
      }
    }
    for (const r of receipts) {
      if (!receiptChecked[r.id]) continue;
      const amt = parseFloat(receiptAmounts[r.id] ?? String(r.remaining));
      if (amt > r.remaining + 0.005) {
        toast.error(
          `Receipt ${r.display_reference || r.id}: amount exceeds the unbanked remainder ${fmtAmt(r.remaining)}`
        );
        return;
      }
    }
    setDraftGroups(groups);
    setStep("preview");
  };

  const handlePost = async () => {
    setIsSubmitting(true);
    const toastId = toast.loading("Posting bank-in...");
    try {
      const result = await api.post("/api/bank-ins", {
        posting_date: postingDate,
        bank_account: bankAccount,
        rv_number: rvNumber.trim() || undefined,
        groups: draftGroups,
      });
      toast.success(result?.message || "Bank-in posted", { id: toastId });
      resetForm();
      await fetchAll();
    } catch (error: any) {
      const message =
        error.response?.data?.message || error.data?.message || error.message || "Failed to post bank-in";
      toast.error(message, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const toastId = toast.loading(`Cancelling ${cancelTarget.rv_number}...`);
    try {
      await api.put(`/api/bank-ins/${cancelTarget.id}/cancel`, {
        reason: `Cancelled from Bank-In page`,
      });
      toast.success(
        `${cancelTarget.rv_number} cancelled — amounts returned to their pools (the RV number stays reserved)`,
        { id: toastId }
      );
      setCancelTarget(null);
      await fetchAll();
    } catch (error: any) {
      const message =
        error.response?.data?.message || error.data?.message || error.message || "Failed to cancel";
      toast.error(message, { id: toastId });
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setStep("select");
    setPoolAmounts({});
    setReceiptChecked({});
    setReceiptAmounts({});
    setDraftGroups([]);
  };

  const inputCls =
    "w-28 px-2 py-1 text-right border border-default-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-default-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500";

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <IconBuildingBank size={28} className="text-gray-700 dark:text-gray-200" />
            Cash Bank-In (RV)
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Bank undeposited cash from daily cash-sales pools (CH_REV1) and
            credit-invoice cash receipts (CH_REV2)
          </p>
        </div>
        {!showForm && (
          <Button color="sky" icon={IconPlus} onClick={() => setShowForm(true)}>
            New Bank-In
          </Button>
        )}
      </div>

      {showForm && (
        <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <FormInput
              name="posting_date"
              label="Bank-In Date"
              type="date"
              value={postingDate}
              onChange={(e) => setPostingDate(e.target.value)}
              disabled={isSubmitting || step === "preview"}
              required
            />
            <FormListbox
              name="bank_account"
              label="Bank Account"
              value={bankAccount}
              onChange={(value) => setBankAccount(value as string)}
              options={bankAccountOptions}
              disabled={isSubmitting || step === "preview"}
            />
            <FormInput
              name="rv_number"
              label="RV Number"
              value={rvNumber}
              onChange={(e) => setRvNumber(e.target.value.toUpperCase())}
              disabled={isSubmitting || step === "preview"}
              placeholder="RV001/06"
              required
            />
            <div className="flex items-end pb-1">
              <div className="text-sm text-default-600 dark:text-gray-300">
                Total: <span className="font-semibold">RM {fmtAmt(grandTotal)}</span>
              </div>
            </div>
          </div>

          {step === "select" && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-default-700 dark:text-gray-300 mb-2 pl-1">
                    Cash-sales pools (CH_REV1)
                  </h2>
                  <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-default-50 dark:bg-gray-800 sticky top-0">
                        <tr className="text-left text-default-600 dark:text-gray-400">
                          <th className="px-3 py-2">Sales Date</th>
                          <th className="px-3 py-2 text-right">Collected</th>
                          <th className="px-3 py-2 text-right">Banked</th>
                          <th className="px-3 py-2 text-right">Remaining</th>
                          <th className="px-3 py-2 text-right">Bank In</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openingPool && openingPool.remaining > 0.005 && (
                          <tr className="border-t border-default-100 dark:border-gray-800 bg-amber-50/50 dark:bg-amber-900/10">
                            <td className="px-3 py-1.5" title={openingPool.note}>
                              Pre-June opening cash
                            </td>
                            <td className="px-3 py-1.5 text-right">{fmtAmt(openingPool.anchor)}</td>
                            <td className="px-3 py-1.5 text-right">{fmtAmt(openingPool.banked)}</td>
                            <td className="px-3 py-1.5 text-right font-medium">
                              {fmtAmt(openingPool.remaining)}
                            </td>
                            <td className="px-3 py-1.5 text-right text-default-400">via date below</td>
                          </tr>
                        )}
                        {pools
                          .filter((p) => p.remaining > 0.005 || poolAmounts[p.source_date])
                          .map((pool) => (
                            <tr
                              key={pool.source_date}
                              className="border-t border-default-100 dark:border-gray-800"
                            >
                              <td className="px-3 py-1.5">{fmtDMY(pool.source_date)}</td>
                              <td className="px-3 py-1.5 text-right">{fmtAmt(pool.collected)}</td>
                              <td className="px-3 py-1.5 text-right">{fmtAmt(pool.banked)}</td>
                              <td className="px-3 py-1.5 text-right font-medium">
                                {fmtAmt(pool.remaining)}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className={inputCls}
                                  value={poolAmounts[pool.source_date] || ""}
                                  placeholder="0.00"
                                  onChange={(e) =>
                                    setPoolAmounts({
                                      ...poolAmounts,
                                      [pool.source_date]: e.target.value,
                                    })
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        {pools.filter((p) => p.remaining > 0.005).length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-default-400">
                              No unbanked cash-sales pools
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-default-700 dark:text-gray-300 mb-2 pl-1">
                    Unbanked cash receipts (CH_REV2)
                  </h2>
                  <div className="border border-default-200 dark:border-gray-700 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-default-50 dark:bg-gray-800 sticky top-0">
                        <tr className="text-left text-default-600 dark:text-gray-400">
                          <th className="px-3 py-2"></th>
                          <th className="px-3 py-2">Reference</th>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2 text-right">Remaining</th>
                          <th className="px-3 py-2 text-right">Bank In</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipts.map((r) => (
                          <tr key={r.id} className="border-t border-default-100 dark:border-gray-800">
                            <td className="px-3 py-1.5">
                              <Checkbox
                                checked={Boolean(receiptChecked[r.id])}
                                onChange={(checked) =>
                                  setReceiptChecked({ ...receiptChecked, [r.id]: checked })
                                }
                                size={18}
                                ariaLabel={`Select receipt ${r.display_reference || r.id}`}
                              />
                            </td>
                            <td className="px-3 py-1.5" title={r.description || undefined}>
                              {r.display_reference || `#${r.id}`}
                              {r.origin === "import_opening" && (
                                <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                                  (opening)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">{r.customers || "-"}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{fmtAmt(r.remaining)}</td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className={inputCls}
                                disabled={!receiptChecked[r.id]}
                                value={receiptAmounts[r.id] ?? String(r.remaining)}
                                onChange={(e) =>
                                  setReceiptAmounts({ ...receiptAmounts, [r.id]: e.target.value })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                        {receipts.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-default-400">
                              No unbanked cash receipts
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm} disabled={isSubmitting}>
                  Close
                </Button>
                <Button color="sky" onClick={handlePreview} disabled={isSubmitting || grandTotal <= 0}>
                  Preview
                </Button>
              </div>
            </>
          )}

          {step === "preview" && (
            <>
              <div className="border border-default-200 dark:border-gray-700 rounded-md divide-y divide-default-100 dark:divide-gray-800">
                {draftGroups.map((g, i) => (
                  <div key={i} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-default-100 dark:bg-gray-800 text-default-600 dark:text-gray-300">
                      {g.holding_account}
                    </span>
                    <input
                      className="flex-1 px-2 py-1 border border-default-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-default-900 dark:text-gray-100 text-sm"
                      value={g.description}
                      onChange={(e) => {
                        const next = [...draftGroups];
                        next[i] = { ...next[i], description: e.target.value };
                        setDraftGroups(next);
                      }}
                    />
                    <span className="text-sm font-medium text-right w-28">
                      RM {fmtAmt(g.allocations.reduce((s, a) => s + a.amount, 0))}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-default-500 dark:text-gray-400 pl-1">
                Posts {rvNumber || "RV—"}: one bank debit per group above, with the CH_REV1/CH_REV2
                credit aggregated per holding account. Descriptions are editable.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep("select")} disabled={isSubmitting}>
                  Back
                </Button>
                <Button color="sky" onClick={handlePost} disabled={isSubmitting}>
                  {isSubmitting ? "Posting..." : `Post ${rvNumber || "Bank-In"}`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr className="text-left text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">RV No.</th>
              <th className="px-4 py-3">Bank</th>
              <th className="px-4 py-3">Groups</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {bankIns.map((b) => (
              <tr
                key={b.id}
                className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                <td className="px-4 py-2.5 whitespace-nowrap">{fmtDMY(String(b.posting_date).slice(0, 10))}</td>
                <td className="px-4 py-2.5 font-mono">{b.rv_number}</td>
                <td className="px-4 py-2.5">{b.bank_account}</td>
                <td className="px-4 py-2.5 text-default-600 dark:text-gray-400">
                  {(b.groups || []).map((g) => g.description).join(" & ") || "-"}
                </td>
                <td className="px-4 py-2.5 text-right font-medium">{fmtAmt(b.total_amount)}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      b.status === "posted"
                        ? "inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                        : "inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-400 line-through"
                    }
                  >
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {b.status === "posted" && (
                    <Button size="sm" variant="outline" color="rose" onClick={() => setCancelTarget(b)}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {bankIns.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-default-400">
                  No bank-ins yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmationDialog
        isOpen={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title={`Cancel ${cancelTarget?.rv_number || ""}?`}
        message={`This reverses the bank-in journal and returns the cash to its pools/receipts. The RV number ${cancelTarget?.rv_number || ""} stays reserved and cannot be reused.`}
        confirmButtonText="Cancel Bank-In"
        variant="danger"
      />
    </div>
  );
};

export default BankInPage;
