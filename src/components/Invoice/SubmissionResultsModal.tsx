// src/components/Invoice/SubmissionResultsModal.tsx
import React from "react";
import {
  IconX,
  IconCheck,
  IconAlertTriangle,
  IconClockHour4,
} from "@tabler/icons-react";
import Button from "../Button";

// Simplified submission response structure
interface SubmissionResponse {
  success: boolean;
  message: string;
  acceptedDocuments: Array<{
    internalId: string;
    uuid: string;
    longId?: string;
    status?: string;
  }>;
  rejectedDocuments: Array<{
    internalId: string;
    error: {
      code: string;
      message: string;
      details?: Array<{ message: string }>;
    };
  }>;
  overallStatus: string;
}

interface SubmissionResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: SubmissionResponse | null;
  isLoading?: boolean;
}

const SubmissionResultsModal: React.FC<SubmissionResultsModalProps> = ({
  isOpen,
  onClose,
  results,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  // Calculate statistics if results exist
  const stats = results
    ? {
        totalDocuments:
          (results.acceptedDocuments?.length || 0) +
          (results.rejectedDocuments?.length || 0),
        completed:
          results.acceptedDocuments?.filter((doc) => doc.longId).length || 0,
        pending:
          results.acceptedDocuments?.filter((doc) => !doc.longId).length || 0,
        rejected: results.rejectedDocuments?.length || 0,
      }
    : null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "valid":
      case "Valid":
        return <IconCheck size={16} className="text-emerald-500" />;
      case "pending":
      case "Pending":
        return <IconClockHour4 size={16} className="text-sky-500" />;
      case "invalid":
      case "Invalid":
      case "rejected":
      case "Rejected":
        return <IconAlertTriangle size={16} className="text-rose-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-default-200">
          <h2 className="text-lg font-semibold text-default-900">
            e-Invoice Submission Results
          </h2>
          <button
            onClick={onClose}
            className="text-default-500 hover:text-default-700 transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-grow">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-8 w-8 border-4 border-t-sky-500 border-sky-200 rounded-full animate-spin mb-4"></div>
              <p className="text-default-600">Processing submission...</p>
            </div>
          ) : results ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-default-50 p-4 rounded-lg border border-default-200">
                <h3 className="font-medium text-default-800 mb-2">Summary</h3>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="bg-white p-3 rounded border border-default-200">
                    <div className="text-lg font-semibold">
                      {stats?.totalDocuments || 0}
                    </div>
                    <div className="text-xs text-default-500">Total</div>
                  </div>
                  <div className="bg-white p-3 rounded border border-emerald-200">
                    <div className="text-lg font-semibold text-emerald-600">
                      {stats?.completed || 0}
                    </div>
                    <div className="text-xs text-emerald-500">Valid</div>
                  </div>
                  <div className="bg-white p-3 rounded border border-sky-200">
                    <div className="text-lg font-semibold text-sky-600">
                      {stats?.pending || 0}
                    </div>
                    <div className="text-xs text-sky-500">Pending</div>
                  </div>
                  <div className="bg-white p-3 rounded border border-rose-200">
                    <div className="text-lg font-semibold text-rose-600">
                      {stats?.rejected || 0}
                    </div>
                    <div className="text-xs text-rose-500">Rejected</div>
                  </div>
                </div>
              </div>

              {/* Document list */}
              <div className="bg-white border border-default-200 rounded-lg">
                <div className="px-4 py-3 border-b border-default-200">
                  <h3 className="font-medium text-default-800">
                    Document Results
                  </h3>
                </div>
                <div className="divide-y divide-default-200 max-h-[300px] overflow-y-auto">
                  {/* Accepted Documents */}
                  {results.acceptedDocuments.map((doc) => {
                    const status = doc.longId ? "Valid" : "Pending";
                    return (
                      <div key={doc.internalId} className="px-4 py-3">
                        <div className="flex items-start">
                          <div className="flex-shrink-0 mt-1">
                            {getStatusIcon(status)}
                          </div>
                          <div className="ml-2 flex-1">
                            <p className="font-medium text-default-900">
                              #{doc.internalId}
                            </p>
                            <p
                              className={`text-sm mt-0.5 ${
                                doc.longId ? "text-emerald-500" : "text-sky-500"
                              }`}
                            >
                              {doc.longId ? "Valid" : "Pending validation"}
                            </p>
                            {doc.uuid && (
                              <p className="text-xs text-default-500 mt-0.5 font-mono truncate">
                                UUID: {doc.uuid}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Rejected Documents */}
                  {results.rejectedDocuments.map((doc) => (
                    <div key={doc.internalId} className="px-4 py-3">
                      <div className="flex items-start">
                        <div className="flex-shrink-0 mt-1">
                          <IconX size={16} className="text-rose-500" />
                        </div>
                        <div className="ml-2 flex-1">
                          <p className="font-medium text-default-900">
                            #{doc.internalId}
                          </p>
                          <p className="text-sm text-rose-500 mt-0.5 font-medium">
                            {doc.error?.message || "Rejected"}
                          </p>
                          {doc.error?.details &&
                            doc.error.details.length > 0 && (
                              <div className="ml-3 mt-1.5 space-y-1">
                                {doc.error.details
                                  .slice(0, 3)
                                  .map((detail, idx) => (
                                    <p
                                      key={idx}
                                      className="text-xs text-rose-500"
                                    >
                                      • {detail.message}
                                    </p>
                                  ))}
                                {doc.error.details.length > 3 && (
                                  <p className="text-xs text-default-500">
                                    And {doc.error.details.length - 3} more
                                    issues...
                                  </p>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Empty state */}
                  {results.acceptedDocuments.length === 0 &&
                    results.rejectedDocuments.length === 0 && (
                      <div className="px-4 py-8 text-center text-default-500">
                        No documents processed
                      </div>
                    )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-default-500">
              No results to display
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-default-200">
          <Button onClick={onClose} className="w-full justify-center">
            {results?.success ? "Done" : "Close"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SubmissionResultsModal;
