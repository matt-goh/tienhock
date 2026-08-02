import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  IconArrowLeft,
  IconHierarchy,
  IconPrinter,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../../../components/Button";
import Checkbox from "../../../components/Checkbox";
import Pagination from "../../../components/Invoice/Pagination";
import LoadingSpinner from "../../../components/LoadingSpinner";
import MonthNavigator from "../../../components/MonthNavigator";
import {
  getAllGreenTargetDebtorSubScheduleRows,
  getGreenTargetDebtorSubSchedule,
} from "../../../routes/greentarget/debtorSubScheduleApi";
import type {
  GreenTargetDebtorSubScheduleResponse,
  GreenTargetDebtorSubScheduleRow,
} from "../../../types/greenTargetDebtorSubSchedule";
import { printGreenTargetDebtorSubSchedulePDF } from "../../../utils/accounting/GreenTargetDebtorSubSchedulePDF";

const PAGE_SIZE = 100;
const ZERO_TOLERANCE = 0.005;
const MIN_REPORT_MONTH = new Date(2026, 5, 1);

const getInitialMonth = (): Date => {
  const today: Date = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
};

const formatCurrency = (amount: number): string => {
  return Number(amount || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getMonthLabel = (year: number, month: number): string => {
  return new Date(year, month - 1, 1).toLocaleDateString("en-MY", {
    month: "short",
    year: "numeric",
  });
};

const isAllZeroRow = (row: GreenTargetDebtorSubScheduleRow): boolean => {
  return (
    Math.abs(Number(row.closing_balance || 0)) <= ZERO_TOLERANCE &&
    Math.abs(Number(row.current_month || 0)) <= ZERO_TOLERANCE &&
    Math.abs(Number(row.previous_month || 0)) <= ZERO_TOLERANCE
  );
};

const GTDebtorSubSchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const requestSequenceRef = useRef<number>(0);
  const [selectedMonth, setSelectedMonth] = useState<Date>(getInitialMonth);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [hideZero, setHideZero] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [data, setData] =
    useState<GreenTargetDebtorSubScheduleResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [printing, setPrinting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId: number = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  const fetchSchedule = useCallback(async (): Promise<void> => {
    const requestSequence: number = ++requestSequenceRef.current;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response: GreenTargetDebtorSubScheduleResponse =
        await getGreenTargetDebtorSubSchedule({
          year: selectedMonth.getFullYear(),
          month: selectedMonth.getMonth() + 1,
          search: debouncedSearch,
          page: currentPage,
          limit: PAGE_SIZE,
          hideZero,
        });

      if (requestSequence !== requestSequenceRef.current) return;
      setData(response);
      if (response.page !== currentPage) setCurrentPage(response.page);
    } catch (fetchError: unknown) {
      if (requestSequence !== requestSequenceRef.current) return;
      console.error("Error fetching Green Target CD/SD schedule:", fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load the CD/SD debtor schedule."
      );
    } finally {
      if (requestSequence === requestSequenceRef.current) setLoading(false);
    }
  }, [selectedMonth, debouncedSearch, currentPage, hideZero]);

  useEffect(() => {
    void fetchSchedule();
    return () => {
      requestSequenceRef.current += 1;
    };
  }, [fetchSchedule]);

  const reportMonth: Date = useMemo(() => {
    if (!data) return selectedMonth;
    return new Date(data.statement_year, data.statement_month - 1, 1);
  }, [data, selectedMonth]);

  const currentMovementLabel: string = getMonthLabel(
    reportMonth.getFullYear(),
    reportMonth.getMonth() + 1
  );
  const previousMovementMonth: Date = new Date(
    reportMonth.getFullYear(),
    reportMonth.getMonth() - 1,
    1
  );
  const previousMovementLabel: string = getMonthLabel(
    previousMovementMonth.getFullYear(),
    previousMovementMonth.getMonth() + 1
  );

  const handleMonthChange = (month: Date): void => {
    setSelectedMonth(new Date(month.getFullYear(), month.getMonth(), 1));
    setCurrentPage(1);
  };

  const handleHideZeroChange = (checked: boolean): void => {
    setHideZero(checked);
    setCurrentPage(1);
  };

  const handlePrint = async (): Promise<void> => {
    if (printing) return;

    setPrinting(true);
    const toastId: string = toast.loading("Preparing the full CD/SD schedule...");
    try {
      const fullData: GreenTargetDebtorSubScheduleResponse =
        await getAllGreenTargetDebtorSubScheduleRows({
          year: selectedMonth.getFullYear(),
          month: selectedMonth.getMonth() + 1,
          search: searchTerm.trim(),
          hideZero,
        });

      if (fullData.rows.length === 0) {
        toast.error("There are no matching accounts to print.", { id: toastId });
        return;
      }

      await printGreenTargetDebtorSubSchedulePDF(fullData);
      toast.success("Print dialog opened.", { id: toastId });
    } catch (printError: unknown) {
      console.error("Error printing Green Target CD/SD schedule:", printError);
      toast.error(
        printError instanceof Error
          ? printError.message
          : "Failed to generate the CD/SD schedule PDF.",
        { id: toastId }
      );
    } finally {
      setPrinting(false);
    }
  };

  const rows: GreenTargetDebtorSubScheduleRow[] = data?.rows ?? [];
  const totalPages: number = Math.max(1, data?.total_pages ?? 1);
  const hasReconciliationResidual: boolean = Boolean(
    data &&
      (Math.abs(data.reconciliation_residual.closing_balance) > ZERO_TOLERANCE ||
        Math.abs(data.reconciliation_residual.current_month) > ZERO_TOLERANCE ||
        Math.abs(data.reconciliation_residual.previous_month) > ZERO_TOLERANCE)
  );

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={IconArrowLeft}
            onClick={() => navigate("/greentarget/debtors")}
            title="Back to Green Target Debtors"
          >
            Debtors
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <IconHierarchy
                size={22}
                className="text-emerald-600 dark:text-emerald-400"
              />
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                CD/SD Debtor Sub-Schedule
              </h1>
            </div>
            <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
              Named sundry-debtor identities assigned to the CD_SD control,
              with month-end balance and two months of movement.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            showGoToCurrentButton={false}
            size="sm"
            pickerPlacement="bottom-right"
            minDate={MIN_REPORT_MONTH}
          />

          <div className="relative">
            <IconSearch
              size={16}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-500"
            />
            <input
              type="search"
              value={searchTerm}
              aria-label="Search CD/SD account number or particulars"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Search account or particulars..."
              className="h-[34px] w-64 rounded-lg border border-default-300 bg-white pl-8 pr-3 text-sm text-default-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div className="flex h-[34px] items-center rounded-lg border border-default-300 bg-white px-2.5 dark:border-gray-600 dark:bg-gray-800">
            <Checkbox
              checked={hideZero}
              onChange={handleHideZeroChange}
              size={18}
              label="Hide all-zero accounts"
              ariaLabel="Hide accounts whose balance and both movements are zero"
            />
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={IconRefresh}
            onClick={() => void fetchSchedule()}
            disabled={loading}
            title="Refresh schedule"
          >
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            icon={IconPrinter}
            onClick={() => void handlePrint()}
            disabled={loading || printing}
            title="Print the full filtered schedule"
          >
            {printing ? "Preparing..." : "Print PDF"}
          </Button>
        </div>
      </div>

      {data && !loading && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-default-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-medium uppercase text-default-500 dark:text-gray-400">
              Balance as at {data.statement_date}
            </p>
            <p className="mt-1 text-lg font-semibold text-default-900 dark:text-gray-100">
              RM {formatCurrency(data.totals.closing_balance)}
            </p>
          </div>
          <div className="rounded-lg border border-default-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-medium uppercase text-default-500 dark:text-gray-400">
              {currentMovementLabel} movement
            </p>
            <p className="mt-1 text-lg font-semibold text-default-900 dark:text-gray-100">
              RM {formatCurrency(data.totals.current_month)}
            </p>
          </div>
          <div className="rounded-lg border border-default-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-medium uppercase text-default-500 dark:text-gray-400">
              {previousMovementLabel} movement
            </p>
            <p className="mt-1 text-lg font-semibold text-default-900 dark:text-gray-100">
              RM {formatCurrency(data.totals.previous_month)}
            </p>
          </div>
        </div>
      )}

      {data && !loading && hasReconciliationResidual && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-medium">Unallocated control reconciliation</p>
          <p className="mt-1 text-xs">
            The legacy source did not name a customer for RM{" "}
            {formatCurrency(data.reconciliation_residual.closing_balance)} of
            the closing control, RM{" "}
            {formatCurrency(data.reconciliation_residual.current_month)} of the
            current movement and RM{" "}
            {formatCurrency(data.reconciliation_residual.previous_month)} of the
            previous movement. These amounts remain in the control totals but
            are not presented as a customer account.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-default-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="px-4 py-12 text-center">
            <p className="font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={IconRefresh}
              className="mt-4"
              onClick={() => void fetchSchedule()}
            >
              Try Again
            </Button>
          </div>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-default-200 px-4 py-2.5 dark:border-gray-700">
              <p className="text-sm text-default-500 dark:text-gray-400">
                {data.total_accounts} matching account
                {data.total_accounts === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-default-400 dark:text-gray-500">
                Summary and footer are the full CD_SD control total; PDF follows
                the search and zero-account filters.
              </p>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <IconHierarchy
                  size={44}
                  className="mx-auto mb-3 text-default-300 dark:text-gray-600"
                />
                <h2 className="font-medium text-default-800 dark:text-gray-100">
                  No matching debtors
                </h2>
                <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                  {hideZero
                    ? "Try clearing the search or showing all-zero accounts."
                    : "Try clearing the search or selecting another month."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-default-100 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                        Account No.
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                        Particulars
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                        Balance as at {data.statement_date}
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                        {currentMovementLabel} movement
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium uppercase text-default-500 dark:text-gray-400">
                        {previousMovementLabel} movement
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default-200 dark:divide-gray-700">
                    {rows.map((row: GreenTargetDebtorSubScheduleRow) => {
                      const allZero: boolean = isAllZeroRow(row);
                      return (
                        <tr
                          key={row.account_no}
                          className={`hover:bg-default-50 dark:hover:bg-gray-700/60 ${
                            allZero
                              ? "text-default-400 dark:text-gray-500"
                              : "text-default-800 dark:text-gray-100"
                          }`}
                        >
                          <td className="whitespace-nowrap px-3 py-2 font-mono font-medium">
                            <button
                              type="button"
                              className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                              onClick={(): void =>
                                navigate(
                                  `/greentarget/accounting/reports/account-ledger?account=${encodeURIComponent(
                                    row.account_no
                                  )}`
                                )
                              }
                              title={`Open ${row.account_no} account ledger`}
                            >
                              {row.account_no}
                            </button>
                          </td>
                          <td className="px-3 py-2">{row.particular}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            RM {formatCurrency(row.closing_balance)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            RM {formatCurrency(row.current_month)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            RM {formatCurrency(row.previous_month)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-default-300 bg-default-50 font-semibold text-default-900 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100">
                    <tr>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3">Full CD_SD control total</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        RM {formatCurrency(data.totals.closing_balance)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        RM {formatCurrency(data.totals.current_month)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        RM {formatCurrency(data.totals.previous_month)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {data.total_accounts > 0 && (
              <div className="px-4 pb-3">
                <Pagination
                  currentPage={data.page}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  itemsCount={rows.length}
                  totalItems={data.total_accounts}
                  pageSize={PAGE_SIZE}
                />
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default GTDebtorSubSchedulePage;
