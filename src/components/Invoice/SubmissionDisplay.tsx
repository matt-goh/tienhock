// src/components/einvoice/SubmissionDisplay.tsx
import React, { useState } from "react";
import {
  SubmissionDisplayProps,
  DocumentStatus,
  BatchStatistics,
} from "../../types/types";
import { IconCheck, IconChevronRight, IconX } from "@tabler/icons-react";
import Button from "../Button";

const BatchProgress: React.FC<{ statistics: BatchStatistics }> = ({
  statistics: { totalDocuments, completed, rejected, processing },
}) => (
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
          style={{ width: `${(completed / totalDocuments) * 100}%` }}
        />
        <div
          className="bg-rose-500 transition-all duration-500"
          style={{ width: `${(rejected / totalDocuments) * 100}%` }}
        />
        <div
          className="bg-sky-500 transition-all duration-500"
          style={{ width: `${(processing / totalDocuments) * 100}%` }}
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
      {processing > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 bg-sky-500 rounded" />
          <span className="text-default-600">Processing ({processing})</span>
        </div>
      )}
    </div>
  </div>
);

const DocumentList: React.FC<{ documents: Record<string, DocumentStatus> }> = ({
  documents,
}) => {
  const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>(
    {}
  );

  const toggleErrorDetails = (invoiceNo: string) => {
    setExpandedErrors((prev) => ({
      ...prev,
      [invoiceNo]: !prev[invoiceNo],
    }));
  };

  return (
    <div className="bg-white border border-default-200 rounded-lg mt-4">
      <div className="px-4 py-3 border-b border-default-200">
        <h3 className="font-medium text-default-800">
          Results ({Object.keys(documents).length})
        </h3>
      </div>
      <div className="divide-y divide-default-200 max-h-[300px] overflow-y-auto">
        {Object.values(documents).map((doc) => {
          const isSuccessful =
            doc.currentStatus === "COMPLETED" ||
            doc.summary?.status === "Valid" ||
            doc.summary?.status === "Submitted";
          const isProcessing = doc.currentStatus === "PROCESSING";

          return (
            <div key={doc.invoiceNo} className="px-4 py-3">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  {isProcessing ? (
                    <div className="h-4 w-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  ) : isSuccessful ? (
                    <IconCheck size={16} className="text-emerald-500" />
                  ) : (
                    <IconX size={16} className="text-rose-500" />
                  )}
                </div>
                <div className="ml-2 flex-1">
                  <p className="font-medium text-default-900">
                    #{doc.invoiceNo}
                  </p>
                  {isProcessing ? (
                    <p className="text-sm text-sky-500 mt-0.5">
                      Processing document...
                    </p>
                  ) : isSuccessful ? (
                    <>
                      <p className="text-sm text-emerald-500 mt-0.5">
                        Document successfully submitted
                      </p>
                      {doc.summary && (
                        <p className="text-sm text-default-500 mt-0.5">
                          {doc.summary.receiverName}
                        </p>
                      )}
                    </>
                  ) : (
                    doc.errors?.[0] && (
                      <>
                        <div
                          onClick={() => toggleErrorDetails(doc.invoiceNo)}
                          className="flex items-center gap-1.5 cursor-pointer mt-0.5"
                        >
                          <p className="text-sm text-rose-500 font-medium">
                            {doc.errors[0].message}
                          </p>
                          <IconChevronRight
                            size={16}
                            className={`text-rose-500 transition-transform ${
                              expandedErrors[doc.invoiceNo] ? "rotate-90" : ""
                            }`}
                          />
                        </div>
                        {expandedErrors[doc.invoiceNo] &&
                          doc.errors[0].details && (
                            <div className="ml-5 mt-1.5 space-y-1.5">
                              {doc.errors[0].details.map((detail, idx) => (
                                <p key={idx} className="text-sm text-rose-500">
                                  • {detail.message}
                                </p>
                              ))}
                            </div>
                          )}
                      </>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const SubmissionDisplay: React.FC<SubmissionDisplayProps> = ({
  state,
  onClose,
  showDetails = true,
}) => {
  if (!state.tracker) return null;

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
