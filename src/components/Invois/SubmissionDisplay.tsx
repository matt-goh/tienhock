// src/components/einvoice/SubmissionDisplay.tsx
import React from "react";
import {
  SubmissionDisplayProps,
  DocumentStatus,
  BatchStatistics,
} from "../../types/types";
import { IconCheck, IconX, IconAlertTriangle } from "@tabler/icons-react";
import Button from "../Button";

const StatusIcon: React.FC<{ status: DocumentStatus["currentStatus"] }> = ({
  status,
}) => {
  switch (status) {
    case "COMPLETED":
      return <IconCheck className="text-emerald-500" size={18} />;
    case "REJECTED":
    case "FAILED":
      return <IconX className="text-rose-500" size={18} />;
    case "PROCESSING":
      return (
        <div className="h-4 w-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      );
    default:
      return <IconAlertTriangle className="text-amber-500" size={18} />;
  }
};

const BatchProgress: React.FC<{ statistics: BatchStatistics }> = ({
  statistics,
}) => {
  const { totalDocuments, completed, rejected, processing } = statistics;
  const completedWidth = (completed / totalDocuments) * 100;
  const rejectedWidth = (rejected / totalDocuments) * 100;
  const processingWidth = (processing / totalDocuments) * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-default-700">Overall Progress</span>
        <span className="text-default-500">
          {completed + rejected}/{totalDocuments} Processed
        </span>
      </div>
      <div className="h-2 w-full bg-default-100 rounded-full overflow-hidden">
        <div className="h-full flex">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${completedWidth}%` }}
          />
          <div
            className="bg-rose-500 transition-all duration-500"
            style={{ width: `${rejectedWidth}%` }}
          />
          <div
            className="bg-sky-500 transition-all duration-500"
            style={{ width: `${processingWidth}%` }}
          />
        </div>
      </div>
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 bg-emerald-500 rounded" />
          <span className="text-default-600">Completed ({completed})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 bg-rose-500 rounded" />
          <span className="text-default-600">Failed ({rejected})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 bg-sky-500 rounded" />
          <span className="text-default-600">Processing ({processing})</span>
        </div>
      </div>
    </div>
  );
};

const DocumentList: React.FC<{ documents: Record<string, DocumentStatus> }> = ({
  documents,
}) => {
  return (
    <div className="space-y-2 mt-4">
      <h3 className="font-medium text-default-700">Documents</h3>
      <div className="max-h-[300px] overflow-y-auto space-y-2">
        {Object.values(documents).map((doc) => (
          <div
            key={doc.invoiceNo}
            className="p-3 bg-white border border-default-200 rounded-lg"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <StatusIcon status={doc.currentStatus} />
                  <span className="font-medium text-default-700">
                    #{doc.invoiceNo}
                  </span>
                </div>
                {doc.errors?.map((error, idx) => (
                  <p
                    key={idx}
                    className="text-rose-700 flex items-center gap-2"
                  >
                    <span>{error.message}</span>
                  </p>
                ))}
                {doc.summary && (
                  <div className="text-sm text-default-500">
                    <p>Status: {doc.summary.status}</p>
                    <p>
                      Amount: RM {doc.summary.totalPayableAmount.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
              {doc.currentStatus === "COMPLETED" && (
                <span className="text-xs font-medium text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full">
                  Valid
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SubmissionDisplay: React.FC<SubmissionDisplayProps> = ({
  state,
  onClose,
  showDetails = true,
}) => {
  if (!state.tracker) {
    return null;
  }

  const {
    statistics = {
      totalDocuments: 0,
      processed: 0,
      accepted: 0,
      rejected: 0,
      processing: 0,
      completed: 0,
    },
    documents = {},
  } = state.tracker;

  return (
    <div className="space-y-4">
      <BatchProgress statistics={statistics} />
      {showDetails && <DocumentList documents={documents} />}
      {state.phase === "COMPLETED" && (
        <div className="pt-4 border-t border-default-200">
          <Button
            onClick={onClose}
            className="w-full justify-center"
            variant="outline"
          >
            {state.tracker?.overallStatus === "Invalid" ? "Close" : "Done"}
          </Button>
        </div>
      )}
    </div>
  );
};
