// src/components/Accounting/ChequeReuseWarning.tsx
import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { IconAlertTriangle } from "@tabler/icons-react";
import { ChequeDuplicate } from "../../types/types";

interface ChequeReuseWarningProps {
  chequeNo: string;
  duplicates: ChequeDuplicate[];
  className?: string;
}

// Replicates the legacy programme's payment-voucher message
// ("CHEQUE PBE2607170362129269 ALREADY ISSUED ON PBE059/07"): a warning only,
// never a block, since a cheque may legitimately be split across vouchers.
const ChequeReuseWarning: React.FC<ChequeReuseWarningProps> = ({
  chequeNo,
  duplicates,
  className = "",
}) => {
  if (duplicates.length === 0) return null;

  return (
    <div
      className={`rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 ${className}`}
    >
      <div className="flex items-start gap-2">
        <IconAlertTriangle
          size={16}
          stroke={1.8}
          className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
        />
        <div className="min-w-0 text-xs text-amber-800 dark:text-amber-200">
          <p>
            Cheque{" "}
            <span className="font-semibold break-all">{chequeNo}</span> already
            issued on{" "}
            {duplicates.length === 1
              ? "another entry:"
              : `${duplicates.length} other entries:`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {duplicates.map((duplicate) => (
              <li key={duplicate.id} className="flex flex-wrap items-center gap-x-1.5">
                <Link
                  to={`/accounting/journal-entries/${duplicate.id}`}
                  className="font-semibold underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
                >
                  {duplicate.reference_no}
                </Link>
                <span className="text-amber-700/80 dark:text-amber-300/80">
                  {duplicate.entry_type} |{" "}
                  {format(new Date(duplicate.entry_date), "dd/MM/yyyy")}
                  {duplicate.description ? ` | ${duplicate.description}` : ""}
                </span>
                {duplicate.status === "cancelled" && (
                  <span className="inline-flex rounded bg-rose-100 dark:bg-rose-900/40 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
                    Cancelled
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ChequeReuseWarning;
