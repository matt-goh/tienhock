// src/components/Invoice/SubmissionResultsModal.tsx
import React from "react";
import {
  IconX,
  IconCheck,
  IconAlertTriangle,
  IconClockHour4,
  IconNotes,
  IconInfoCircle, // For general info/error messages
} from "@tabler/icons-react";
import Button from "../Button"; // Assuming Button component exists and works

// Updated submission response structure to match example
interface SubmissionResponse {
  success: boolean;
  message: string;
  shouldStopAtValidation?: boolean; // Optional field from example
  acceptedDocuments?: Array<{
    // Make acceptedDocuments optional
    internalId: string;
    uuid: string;
    longId?: string;
    status?: string;
  }>;
  rejectedDocuments?: Array<{
    // Make rejectedDocuments optional
    internalId: string;
    error: {
      code: string;
      message: string;
      target?: string; // Optional field from example
      details?: Array<{
        code?: string; // Optional field from example
        message: string;
        target?: string; // Optional field from example
      }>;
    };
  }>;
  overallStatus: string; // e.g., "Valid", "Invalid", "Pending"
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
  // Use optional chaining (?.) and nullish coalescing (?? 0)
  const acceptedDocs = results?.acceptedDocuments ?? [];
  const rejectedDocs = results?.rejectedDocuments ?? [];

  const stats = results
    ? {
        totalDocuments: acceptedDocs.length + rejectedDocs.length,
        valid: acceptedDocs.filter(
          (doc) =>
            doc.status === "Valid" || (doc.status !== "Pending" && doc.longId)
        ).length,
        pending: acceptedDocs.filter(
          (doc) => doc.status === "Pending" || (!doc.status && !doc.longId)
        ).length,
        rejected: rejectedDocs.length,
      }
    : null; // Keep stats null if no results

  // Determine overall theme based on success/status
  const isOverallSuccess = results?.success ?? false;
  const overallStatusLower = results?.overallStatus?.toLowerCase();
  const themeColor = isOverallSuccess
    ? "emerald"
    : overallStatusLower === "pending"
    ? "sky"
    : "rose";
  const ThemeIcon = isOverallSuccess
    ? IconCheck
    : overallStatusLower === "pending"
    ? IconClockHour4
    : IconAlertTriangle;

  const getStatusIcon = (status: string | undefined, size = 16) => {
    switch (status?.toLowerCase()) {
      case "valid":
        return <IconCheck size={size} className="text-emerald-600" />;
      case "pending":
        return <IconClockHour4 size={size} className="text-sky-600" />;
      case "invalid":
      case "rejected":
        return <IconAlertTriangle size={size} className="text-rose-600" />;
      default:
        // Handle derived status for accepted documents without explicit status
        if (status === "DerivedValid")
          return <IconCheck size={size} className="text-emerald-600" />;
        if (status === "DerivedPending")
          return <IconClockHour4 size={size} className="text-sky-600" />;
        // Default icon if status is unknown/unexpected (should ideally not happen)
        return <IconInfoCircle size={size} className="text-default-500" />;
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
          {/* Hide Close button when loading */}
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
          ) : results && stats ? ( // Ensure we have results AND stats
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
                    {results.overallStatus ||
                      (isOverallSuccess ? "Success" : "Failed")}
                  </h3>
                  {results.message && (
                    <p className={`text-sm text-${themeColor}-700 mt-1`}>
                      {results.message}
                    </p>
                  )}
                </div>
              </div>

              {/* ----- Updated Summary Section (No Icons) ----- */}
              {stats.totalDocuments > 0 && ( // Only show summary if there are docs
                <div>
                  <h3 className="text-base font-medium text-default-600 mb-3">
                    Document Summary
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Total */}
                    <div className="bg-default-100 p-3 rounded-lg border border-default-200 text-center">
                      <div className="text-xl font-bold text-default-800">
                        {stats.totalDocuments}
                      </div>
                      <div className="text-xs font-medium text-default-500 uppercase tracking-wide mt-1">
                        Total
                      </div>
                    </div>
                    {/* Valid */}
                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-center">
                      <div className="text-xl font-bold text-emerald-700">
                        {stats.valid}
                      </div>
                      <div className="text-xs font-medium text-emerald-600 uppercase tracking-wide mt-1">
                        Valid
                      </div>
                    </div>
                    {/* Pending */}
                    <div className="bg-sky-50 p-3 rounded-lg border border-sky-200 text-center">
                      <div className="text-xl font-bold text-sky-700">
                        {stats.pending}
                      </div>
                      <div className="text-xs font-medium text-sky-600 uppercase tracking-wide mt-1">
                        Pending
                      </div>
                    </div>
                    {/* Rejected */}
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

              {/* ----- Document list (Handles potentially missing arrays) ----- */}
              {stats.totalDocuments > 0 ? (
                <div className="bg-white border border-default-200 rounded-lg shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-default-200 bg-default-50">
                    <h3 className="text-base font-semibold text-default-700">
                      Document Details
                    </h3>
                  </div>
                  <div className="divide-y divide-default-200 max-h-[calc(90vh-450px)] overflow-y-auto">
                    {" "}
                    {/* Adjusted max-height */}
                    {/* Accepted Documents (Safe Mapping) */}
                    {acceptedDocs.map((doc) => {
                      const status = doc.status
                        ? doc.status
                        : doc.longId
                        ? "DerivedValid"
                        : "DerivedPending";
                      const statusText = doc.status
                        ? doc.status
                        : doc.longId
                        ? "Valid"
                        : "Pending Validation";
                      const statusColorClass = status
                        .toLowerCase()
                        .includes("valid")
                        ? "text-emerald-600"
                        : "text-sky-600";

                      return (
                        <div
                          key={doc.internalId}
                          className="px-4 py-3 hover:bg-default-50/70 transition-colors duration-150"
                        >
                          {/* ... (rest of accepted doc rendering remains same) ... */}
                          <div className="flex items-center">
                            <div className="flex-shrink-0 mr-3">
                              {getStatusIcon(status, 20)}
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
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Rejected Documents (Safe Mapping) */}
                    {rejectedDocs.map((doc) => (
                      <div
                        key={doc.internalId}
                        className="px-4 py-3 bg-rose-50/50 hover:bg-rose-50/80 transition-colors duration-150"
                      >
                        <div className="flex items-start">
                          <div className="flex-shrink-0 mr-3 mt-0.5">
                            {getStatusIcon("Rejected", 20)}
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
                                <div className="mt-1.5 space-y-1 border-rose-200 pl-2">
                                  {doc.error.details
                                    .slice(0, 5) // Show a few more details if available
                                    .map((detail, idx) => (
                                      <p
                                        key={idx}
                                        className="text-xs text-rose-600"
                                      >
                                        • {detail.message}{" "}
                                        {detail.target && `(${detail.target})`}
                                      </p>
                                    ))}
                                  {doc.error.details.length > 5 && (
                                    <p className="text-xs text-default-500 italic mt-1">
                                      ({doc.error.details.length - 5} more issue
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
                // Message if results exist but contain NO documents at all
                <div className="text-center py-6 text-default-500">
                  No documents were found in the submission results.
                </div>
              )}
            </div>
          ) : (
            // Fallback for no results (and not loading)
            <div className="flex flex-col items-center justify-center py-16 text-center text-default-500">
              <IconAlertTriangle size={32} className="mb-3 text-amber-500" />
              <p className="text-lg font-medium">No Results Available</p>
              <p className="text-sm">
                Could not retrieve or process submission results.
              </p>
            </div>
          )}
        </div>

        {/* Footer - Hide when loading, show only Done button otherwise */}
        {!isLoading && (
          <div className="p-4 border-t border-default-200 bg-white">
            <Button onClick={onClose} className="w-full justify-center py-2.5">
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubmissionResultsModal;
