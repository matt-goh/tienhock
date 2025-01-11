import { IconAlertTriangle } from "@tabler/icons-react";
import {
  ErrorDisplayProps,
  FailedInvoice,
  ValidationError,
  NormalizedError,
} from "../../types/types";

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  failedInvoices = [],
  validationErrors = [],
}) => {
  // Helper function to get the actual error message
  const getValidationMessage = (err: ValidationError | FailedInvoice): string[] => {
    if ("validationErrors" in err && err.validationErrors) {
      return err.validationErrors;
    }
    if ("errors" in err && Array.isArray(err.errors)) {
      return err.errors;
    }
    if ("errors" in err && typeof err.errors === "string") {
      return [err.errors];
    }
    if ("error" in err && err.error) {
      return [err.error];
    }
    return ["Failed to transform invoice: Invoice validation failed"];
  };

  // Combine all errors for display
  const displayErrors: NormalizedError[] = [
    ...validationErrors.map((ve) => ({
      invoiceNo: ve.invoiceNo || ve.invoiceId || "Unknown",
      errors: getValidationMessage(ve),
      type: "validation" as const
    })),
    ...((typeof error !== "string" && error.validationErrors) || []).map(
      (ve) => ({
        invoiceNo: ve.invoiceNo || ve.invoiceId || "Unknown",
        errors: getValidationMessage(ve),
        type: "validation" as const,
      })
    ),
    ...(failedInvoices || []).map((fi) => ({
      invoiceNo: fi.invoiceNo || fi.invoiceId || "Unknown",
      errors: getValidationMessage(fi),
      type: (fi.type || "submission") as "validation" | "submission",
    })),
  ];

  // Remove duplicates
  const uniqueErrors = displayErrors.filter(
    (err, index, self) =>
      index === self.findIndex((e) => e.invoiceNo === err.invoiceNo)
  );

  const errorCount = uniqueErrors.length;

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg">
      {/* Error Header - Fixed */}
      <div className="p-3 border-b border-red-200">
        <div className="flex items-center gap-2">
          <IconAlertTriangle className="text-red-600 flex-shrink-0" size={18} />
          <h3 className="font-semibold text-red-700 text-sm">
            {errorCount} {errorCount === 1 ? 'invoice' : 'invoices'} failed validation
          </h3>
        </div>
      </div>

      {/* Scrollable Error Content */}
      <div className="max-h-[200px] overflow-y-auto">
        {uniqueErrors.map((error, index) => (
          <div
            key={`${error.invoiceNo}-${index}`}
            className={`p-3 ${
              index !== uniqueErrors.length - 1
                ? "border-b border-red-200"
                : ""
            }`}
          >
            <p className="font-medium text-red-700 text-sm mb-1.5">
              Invoice #{error.invoiceNo}
            </p>
            <div className="text-sm text-red-600 space-y-1">
              {error.errors.map((err, i) => (
                <p key={i} className="leading-relaxed ml-1">
                  {err}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ErrorDisplay;