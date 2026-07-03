// src/components/Payroll/CrossCompanyTakeHomeCard.tsx
// Combined take-home card for staff paid by both Tien Hock and Jelly Polly in
// the same month. Renders ONLY when the *other* company also has pay for the
// staff's name-sibling group that month, so single-company staff never see it.
import React, { useEffect, useState } from "react";
import { IconBuildingFactory2 } from "@tabler/icons-react";
import { api } from "../../routes/utils/api";

interface CompanySummary {
  net_pay: number;
  mid_month: number;
  setelah_digenapkan: number;
  monthly_pinjam: number;
  final_take_home: number;
}

interface CrossCompanyResponse {
  employee_id: string;
  year: number;
  month: number;
  tienhock: CompanySummary | null;
  jellypolly: CompanySummary | null;
  combined_take_home: number;
}

interface CrossCompanyTakeHomeCardProps {
  employeeId: string;
  year: number;
  month: number;
  currentCompany: "tienhock" | "jellypolly";
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(amount || 0);

const CompanyRow: React.FC<{
  label: string;
  summary: CompanySummary;
  isCurrent: boolean;
}> = ({ label, summary, isCurrent }) => (
  <div className="flex items-center justify-between py-1.5">
    <div className="min-w-0">
      <span className="text-sm font-medium text-default-700 dark:text-gray-200">
        {label}
      </span>
      {isCurrent && (
        <span className="ml-2 text-xs text-default-400 dark:text-gray-500">
          (this page)
        </span>
      )}
      <p className="text-xs text-default-400 dark:text-gray-500">
        Jumlah Digenapkan {formatCurrency(summary.setelah_digenapkan)}
        {summary.mid_month > 0 &&
          ` · Mid-month ${formatCurrency(summary.mid_month)}`}
        {summary.monthly_pinjam > 0 &&
          ` · Pinjam -${formatCurrency(summary.monthly_pinjam)}`}
      </p>
    </div>
    <span className="text-base font-semibold text-default-800 dark:text-gray-100">
      {formatCurrency(summary.final_take_home + summary.mid_month)}
    </span>
  </div>
);

const CrossCompanyTakeHomeCard: React.FC<CrossCompanyTakeHomeCardProps> = ({
  employeeId,
  year,
  month,
  currentCompany,
}) => {
  const [data, setData] = useState<CrossCompanyResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchSummary = async (): Promise<void> => {
      try {
        const response: CrossCompanyResponse = await api.get(
          `/jellypolly/api/employee-payrolls/cross-company/${encodeURIComponent(
            employeeId
          )}/${year}/${month}`
        );
        if (!cancelled) setData(response);
      } catch (error) {
        // Card is informational only — stay hidden on failure
        console.error("Error fetching cross-company summary:", error);
      }
    };
    if (employeeId && year && month) fetchSummary();
    return () => {
      cancelled = true;
    };
  }, [employeeId, year, month]);

  // Only show when the OTHER company also has pay this month
  const otherCompany =
    currentCompany === "tienhock" ? data?.jellypolly : data?.tienhock;
  if (!data || !otherCompany || (!data.tienhock && !data.jellypolly)) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-violet-400 dark:border-violet-500">
      <div className="flex items-center gap-2 mb-2">
        <IconBuildingFactory2
          size={18}
          className="text-violet-500 dark:text-violet-400"
        />
        <h3 className="text-sm font-semibold text-default-700 dark:text-gray-200">
          Combined Take-Home (Tien Hock + Jelly Polly)
        </h3>
      </div>
      <div className="divide-y divide-default-100 dark:divide-gray-700">
        {data.tienhock && (
          <CompanyRow
            label="Tien Hock"
            summary={data.tienhock}
            isCurrent={currentCompany === "tienhock"}
          />
        )}
        {data.jellypolly && (
          <CompanyRow
            label="Jelly Polly"
            summary={data.jellypolly}
            isCurrent={currentCompany === "jellypolly"}
          />
        )}
      </div>
      <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-default-200 dark:border-gray-600">
        <span className="text-sm font-semibold text-default-700 dark:text-gray-200">
          Total Take-Home This Month
        </span>
        <span className="text-lg font-bold text-violet-600 dark:text-violet-400">
          {formatCurrency(data.combined_take_home)}
        </span>
      </div>
    </div>
  );
};

export default CrossCompanyTakeHomeCard;
