// src/components/Invoice/SubmissionResultsModal.tsx
import React from "react";
import {
  IconX,
  IconCheck,
  IconAlertTriangle,
  IconClockHour4,
  IconInfoCircle, // For general info/error messages
  IconRefreshAlert, // For pending failures
  IconRefresh, // For pending successes
} from "@tabler/icons-react";
import Button from "../Button"; // Assuming Button component exists and works

// --- Updated Submission Response Interface ---
interface SubmissionResponse {
  success: boolean;
  message: string;
  shouldStopAtValidation?: boolean;
  acceptedDocuments?: Array<{
    internalId: string;
    uuid: string;
    longId?: string;
    status?: string; // e.g., "Submitted", "Valid"
    dateTimeReceived?: string;
    dateTimeValidated?: string;
    // Add other fields from example if needed for display
  }>;
  rejectedDocuments?: Array<{
    internalId: string;
    error: {
      code: string;
      message: string;
      target?: string;
      details?: Array<{
        code?: string;
        message: string;
        target?: string;
      }>;
    };
  }>;
  // --- Added fields for pending update response ---
  pendingUpdated?: Array<{
    id: string;
    status: "valid" | "invalid" | string; // Can be other statuses too
    longId?: string;
  }>;
  pendingFailed?: Array<{
    id: string;
    error: string;
  }>;
  // --- End added fields ---
  overallStatus: string; // e.g., "Valid", "Invalid", "Pending", "Partial"
  submissionUid?: string;
  documentCount?: number;
  dateTimeReceived?: string;
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

  // --- Safely calculate statistics ---
  const acceptedDocs = results?.acceptedDocuments ?? [];
  const rejectedDocs = results?.rejectedDocuments ?? [];
  const pendingUpdated = results?.pendingUpdated ?? [];
  const pendingFailed = results?.pendingFailed ?? [];

  // Check if this is primarily a pending update response
  const isPendingUpdateResponse =
    (pendingUpdated.length > 0 || pendingFailed.length > 0) &&
    acceptedDocs.length === 0 &&
    rejectedDocs.length === 0;

  // Calculate stats for standard/mixed responses
  const stats =
    results && !isPendingUpdateResponse
      ? {
          totalDocuments: acceptedDocs.length + rejectedDocs.length,
          // Count as 'valid' only if longId is present
          valid: acceptedDocs.filter((doc) => !!doc.longId).length,
          // Count as 'pending' if no longId (even if status is 'Submitted' or overall is 'Valid')
          pending: acceptedDocs.filter((doc) => !doc.longId).length,
          rejected: rejectedDocs.length,
        }
      : null;

  // Determine overall theme based on success/status
  // Treat pending update successes as 'emerald'
  const isOverallSuccess = results?.success ?? false;
  const overallStatusLower = results?.overallStatus?.toLowerCase();
  let themeColor = "default";
  let ThemeIcon = IconInfoCircle;

  if (results) {
    if (isPendingUpdateResponse) {
      themeColor =
        results.overallStatus === "Valid"
          ? "emerald"
          : results.overallStatus === "Partial"
          ? "amber"
          : "rose";
      ThemeIcon =
        results.overallStatus === "Valid"
          ? IconCheck
          : results.overallStatus === "Partial"
          ? IconRefreshAlert
          : IconAlertTriangle;
    } else {
      // Use combined logic: Check overallStatus first, then results.success for fallback
      if (overallStatusLower === "valid" && stats?.pending === 0) {
        themeColor = "emerald";
        ThemeIcon = IconCheck;
      } else if (overallStatusLower === "valid" && (stats?.pending ?? 0) > 0) {
        themeColor = "sky";
        ThemeIcon = IconClockHour4; // Treat as pending if some are pending
      } else if (overallStatusLower === "pending") {
        themeColor = "sky";
        ThemeIcon = IconClockHour4;
      } else if (overallStatusLower === "partial") {
        themeColor = "amber";
        ThemeIcon = IconAlertTriangle;
      } else if (overallStatusLower === "invalid") {
        themeColor = "rose";
        ThemeIcon = IconAlertTriangle;
      } else {
        // Fallback based on success boolean if status is unexpected
        themeColor = isOverallSuccess ? "emerald" : "rose";
        ThemeIcon = isOverallSuccess ? IconCheck : IconAlertTriangle;
      }
    }
  }

  // Determine individual document status icon & text
  const getDocInfo = (
    doc: NonNullable<SubmissionResponse["acceptedDocuments"]>[number]
  ) => {
    if (doc.longId) {
      return {
        statusText: "Valid",
        statusColorClass: "text-emerald-600",
        Icon: IconCheck,
      };
    } else {
      // If no longId, it's pending regardless of doc.status ('Submitted' etc)
      return {
        statusText: "Pending Validation",
        statusColorClass: "text-sky-600",
        Icon: IconClockHour4,
      };
    }
  };

  const getPendingUpdateStatusInfo = (
    item: NonNullable<SubmissionResponse["pendingUpdated"]>[0]
  ) => {
    switch (item.status?.toLowerCase()) {
      case "valid":
        return {
          text: "Valid",
          color: "text-emerald-600",
          Icon: IconRefresh,
        };
      case "invalid":
        return {
          text: "Invalid",
          color: "text-red-600",
          Icon: IconAlertTriangle,
        };
      default:
        return {
          text: item.status || "Unknown",
          color: "text-gray-500",
          Icon: IconInfoCircle,
        };
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 transition-opacity duration-300 ease-out">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-fade-in-scale">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-default-200">
          <h2 className="text-lg font-semibold text-default-900">
            e-Invoice Submission Results
          </h2>
          {!isLoading && (
            <button
              onClick={onClose}
              className="text-default-500 hover:text-default-800 hover:bg-default-100 rounded-full p-1 transition-all"
              aria-label="Close modal"
            >
              <IconX size={22} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow bg-default-50/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-10 w-10 border-4 border-t-sky-500 border-sky-100 rounded-full animate-spin mb-5"></div>
              <p className="text-default-700 text-lg font-medium">
                Processing Submission
              </p>
              <p className="text-default-500 text-sm">
                Please wait a moment...
              </p>
            </div>
          ) : results ? ( // Only need results to exist now
            <div className="space-y-6">
              {/* ----- Overall Status Message ----- */}
              <div
                className={`flex items-start p-4 rounded-lg border border-${themeColor}-200 bg-${themeColor}-50`}
              >
                <ThemeIcon
                  size={20}
                  className={`flex-shrink-0 mr-3 mt-0.5 text-${themeColor}-600`}
                />
                <div>
                  <h3
                    className={`text-base font-semibold text-${themeColor}-800`}
                  >
                    {/* Use overallStatus if available, otherwise derive from success */}
                    {results.overallStatus ||
                      (isOverallSuccess ? "Success" : "Failed")}
                  </h3>
                  {results.message && (
                    <p className={`text-sm text-${themeColor}-700 mt-1`}>
                      {results.message}
                    </p>
                  )}
                  {results.submissionUid && (
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      Submission UID: {results.submissionUid}
                    </p>
                  )}
                </div>
              </div>

              {/* ----- Conditional Rendering for Pending Update Response ----- */}
              {
                isPendingUpdateResponse ? (
                  <div className="bg-white border border-default-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-default-200 bg-default-50">
                      <h3 className="text-base font-semibold text-default-700">
                        Pending Invoice Status Updates
                      </h3>
                    </div>
                    <div className="divide-y divide-default-200 max-h-[calc(90vh-300px)] overflow-y-auto">
                      {/* Updated Pending Invoices */}
                      {pendingUpdated.map((item) => {
                        const statusInfo = getPendingUpdateStatusInfo(item);
                        const StatusIcon = statusInfo.Icon;
                        return (
                          <div
                            key={item.id}
                            className="px-4 py-3 hover:bg-default-50/70 transition-colors duration-150"
                          >
                            <div className="flex items-center">
                              <div className="flex-shrink-0 mr-3">
                                <StatusIcon
                                  size={20}
                                  className={statusInfo.color}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline">
                                  <p className="font-medium text-default-800 truncate pr-2">
                                    #{item.id}
                                  </p>
                                  <p
                                    className={`text-sm font-medium ${statusInfo.color} flex-shrink-0`}
                                  >
                                    Updated to {statusInfo.text}
                                  </p>
                                </div>
                                {item.longId && (
                                  <p className="text-xs text-default-500 mt-0.5 font-mono truncate">
                                    Long ID: {item.longId}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* Failed Pending Updates */}
                      {pendingFailed.map((item) => (
                        <div
                          key={item.id}
                          className="px-4 py-3 bg-rose-50/50 hover:bg-rose-50/80 transition-colors duration-150"
                        >
                          <div className="flex items-center">
                            <div className="flex-shrink-0 mr-3">
                              <IconRefreshAlert
                                size={20}
                                className="text-rose-600"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-baseline">
                                <p className="font-medium text-default-800 truncate pr-2">
                                  #{item.id}
                                </p>
                                <p className="text-sm font-medium text-rose-600 flex-shrink-0">
                                  Update Check Failed
                                </p>
                              </div>
                              <p className="text-xs text-rose-700 mt-0.5 truncate">
                                Error: {item.error}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : stats ? (
                  /* ----- Standard Rendering (Summary + Document List) ----- */
                  <>
                    {/* ----- Summary Section (Adjusted logic for pending) ----- */}
                    {stats.totalDocuments > 0 && (
                      <div>
                        <h3 className="text-base font-medium text-default-600 mb-3">
                          Document Summary
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="bg-default-100 p-3 rounded-lg border border-default-200 text-center">
                            <div className="text-xl font-bold text-default-800">
                              {stats.totalDocuments}
                            </div>
                            <div className="text-xs font-medium text-default-500 uppercase tracking-wide mt-1">
                              Total
                            </div>
                          </div>
                          <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-center">
                            <div className="text-xl font-bold text-emerald-700">
                              {stats.valid}
                            </div>
                            <div className="text-xs font-medium text-emerald-600 uppercase tracking-wide mt-1">
                              Valid
                            </div>
                          </div>
                          <div className="bg-sky-50 p-3 rounded-lg border border-sky-200 text-center">
                            <div className="text-xl font-bold text-sky-700">
                              {stats.pending}
                            </div>
                            <div className="text-xs font-medium text-sky-600 uppercase tracking-wide mt-1">
                              Pending
                            </div>
                          </div>
                          <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-center">
                            <div className="text-xl font-bold text-rose-700">
                              {stats.rejected}
                            </div>
                            <div className="text-xs font-medium text-rose-600 uppercase tracking-wide mt-1">
                              Rejected
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ----- Document list (Adjusted status display) ----- */}
                    {stats.totalDocuments > 0 ? (
                      <div className="bg-white border border-default-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-default-200 bg-default-50">
                          <h3 className="text-base font-semibold text-default-700">
                            Document Details
                          </h3>
                        </div>
                        <div className="divide-y divide-default-200 max-h-[calc(90vh-450px)] overflow-y-auto">
                          {/* Accepted Documents (Handles Pending) */}
                          {acceptedDocs.map((doc) => {
                            const { statusText, statusColorClass, Icon } =
                              getDocInfo(doc);
                            return (
                              <div
                                key={doc.internalId}
                                className="px-4 py-3 hover:bg-default-50/70 transition-colors duration-150"
                              >
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 mr-3">
                                    <Icon
                                      size={20}
                                      className={statusColorClass}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline">
                                      <p className="font-medium text-default-800 truncate pr-2">
                                        #{doc.internalId}
                                      </p>
                                      <p
                                        className={`text-sm font-medium ${statusColorClass} flex-shrink-0`}
                                      >
                                        {statusText}
                                      </p>
                                    </div>
                                    {doc.uuid && (
                                      <p className="text-xs text-default-500 mt-0.5 font-mono truncate">
                                        UUID: {doc.uuid}
                                      </p>
                                    )}
                                    {doc.longId && (
                                      <p className="text-xs text-default-500 mt-0.5 font-mono truncate">
                                        Long ID: {doc.longId}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {/* Rejected Documents */}
                          {rejectedDocs.map((doc) => (
                            <div
                              key={doc.internalId}
                              className="px-4 py-3 bg-rose-50/50 hover:bg-rose-50/80 transition-colors duration-150"
                            >
                              <div className="flex items-start">
                                <div className="flex-shrink-0 mr-3 mt-0.5">
                                  <IconAlertTriangle
                                    size={20}
                                    className="text-rose-600"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-baseline">
                                    <p className="font-medium text-default-800 truncate pr-2">
                                      #{doc.internalId}
                                    </p>
                                    <p className="text-sm font-medium text-rose-600 flex-shrink-0">
                                      Rejected
                                    </p>
                                  </div>
                                  <p className="text-sm text-rose-700 mt-1 font-medium">
                                    {doc.error?.message ||
                                      "Rejection reason not specified"}
                                  </p>
                                  {doc.error?.details &&
                                    doc.error.details.length > 0 && (
                                      <div className="mt-1.5 space-y-1 border-l-2 border-rose-200 pl-2">
                                        {doc.error.details
                                          .slice(0, 5)
                                          .map((detail, idx) => (
                                            <p
                                              key={idx}
                                              className="text-xs text-rose-600"
                                            >
                                              • {detail.message}{" "}
                                              {detail.target &&
                                                `(${detail.target})`}
                                            </p>
                                          ))}
                                        {doc.error.details.length > 5 && (
                                          <p className="text-xs text-default-500 italic mt-1">
                                            ({doc.error.details.length - 5} more
                                            issue
                                            {doc.error.details.length - 5 > 1
                                              ? "s"
                                              : ""}
                                            )
                                          </p>
                                        )}
                                      </div>
                                    )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-default-500">
                        No documents were found in the submission results.
                      </div>
                    )}
                  </>
                ) : null /* End Standard Rendering Block */
              }
            </div> /* End Main Content Space */
          ) : (
            // Fallback for null results and not loading
            <div className="flex flex-col items-center justify-center py-16 text-center text-default-500">
              <IconAlertTriangle size={32} className="mb-3 text-amber-500" />
              <p className="text-lg font-medium">No Results Available</p>
              <p className="text-sm">
                Could not retrieve or process submission results.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && (
          <div className="p-4 border-t border-default-200 bg-white">
            <Button onClick={onClose} className="w-full justify-center py-2.5">
              Done
            </Button>
          </div>
        )}
      </div>
      {/* End Modal Body */}
    </div> /* End Modal Backdrop */
  );
};

export default SubmissionResultsModal;
