// src/components/Invoice/ConsolidationStatusPanel.tsx
import React, { useState, useEffect } from "react";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../LoadingSpinner";
import {
  IconClock,
  IconCircleCheck,
  IconAlertTriangle,
  IconRefresh,
  IconPlayerSkipForward,
  IconRotateClockwise,
} from "@tabler/icons-react";

interface ConsolidationStatusProps {
  company: "tienhock" | "greentarget" | "jellypolly";
  year: number;
  month: number;
}

// Define the possible status values
type ConsolidationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired"
  | "skipped";

interface StatusResponse {
  exists: boolean;
  status: ConsolidationStatus;
  attempt_count: number;
  last_attempt: string | null;
  next_attempt: string | null;
  consolidated_invoice_id: string | null;
  error: string | null;
}

const statusColors: Record<ConsolidationStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-rose-100 text-rose-800",
  expired: "bg-gray-200 text-gray-700",
  skipped: "bg-indigo-100 text-indigo-800",
};

const statusIcons: Record<ConsolidationStatus, React.ReactNode> = {
  pending: <IconClock size={16} className="mr-1.5" />,
  processing: <IconRefresh size={16} className="mr-1.5" />,
  completed: <IconCircleCheck size={16} className="mr-1.5" />,
  failed: <IconAlertTriangle size={16} className="mr-1.5" />,
  expired: <IconPlayerSkipForward size={16} className="mr-1.5" />,
  skipped: <IconRotateClockwise size={16} className="mr-1.5" />,
};

const ConsolidationStatusPanel: React.FC<ConsolidationStatusProps> = ({
  company,
  year,
  month,
}) => {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const endpoint =
        company === "greentarget"
          ? `/greentarget/api/einvoice/auto-consolidation/status?year=${year}&month=${month}`
          : company === "jellypolly"
          ? `/jellypolly/api/einvoice/auto-consolidation/status?year=${year}&month=${month}`
          : `/api/einvoice/auto-consolidation/status?year=${year}&month=${month}`;

      const response = await api.get(endpoint);
      setStatus(response);
    } catch (error: any) {
      console.error("Error fetching consolidation status:", error);
      setError(error.message || "Failed to fetch status");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [company, year, month]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 p-4 rounded-lg border border-rose-200">
        <p className="text-rose-700 text-sm">{error}</p>
      </div>
    );
  }

  if (!status || !status.exists) {
    return (
      <div className="bg-default-50 p-4 rounded-lg border border-default-200">
        <p className="text-default-600 text-sm">
          No consolidation scheduled for{" "}
          {new Date(year, month).toLocaleString("default", { month: "long" })}{" "}
          {year}.
        </p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  // Type guard to ensure status.status is a valid key
  const statusKey =
    (status.status as ConsolidationStatus) in statusColors
      ? (status.status as ConsolidationStatus)
      : "pending";

  return (
    <div className="bg-white p-4 rounded-lg border border-default-200">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-base font-medium text-default-800">
          Auto Consolidation Status
        </h3>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium flex items-center ${statusColors[statusKey]}`}
        >
          {statusIcons[statusKey]}
          {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
        </span>
      </div>

      <div className="space-y-3">
        {status.last_attempt && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-default-600">Last attempt:</span>
            <span className="text-sm font-medium text-default-700">
              {formatDate(status.last_attempt)}
            </span>
          </div>
        )}

        {status.next_attempt && status.status === "pending" && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-default-600">Next attempt:</span>
            <span className="text-sm font-medium text-default-700">
              {formatDate(status.next_attempt)}
            </span>
          </div>
        )}

        {status.consolidated_invoice_id && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-default-600">Invoice ID:</span>
            <span className="text-sm font-medium text-default-700">
              {status.consolidated_invoice_id}
            </span>
          </div>
        )}

        {status.error && (
          <div className="mt-3 p-2 bg-rose-50 rounded border border-rose-200">
            <p className="text-xs text-rose-700 whitespace-pre-wrap">
              {status.error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsolidationStatusPanel;
