// src/components/Payroll/ContextValidationMessages.tsx
import React from "react";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { ContextField } from "../../configs/payrollJobConfigs";

interface ContextValidationMessagesProps {
  contextFields: ContextField[];
  contextData: Record<string, any>;
  linkedPayCodes: Record<string, ContextField>;
}

const ContextValidationMessages: React.FC<ContextValidationMessagesProps> = ({
  contextFields,
  contextData,
  linkedPayCodes,
}) => {
  const validationMessages = contextFields
    .filter((field) => field.linkedPayCode)
    .map((field) => {
      const value = contextData[field.id];
      const isInvalid =
        field.required &&
        (value === undefined || value === null || value === "");

      return {
        field,
        value,
        isInvalid,
        message: isInvalid
          ? `${field.label} is required for calculating pay codes`
          : null,
      };
    })
    .filter((item) => item.message);

  if (validationMessages.length === 0) return null;

  return (
    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start">
        <IconAlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
        <div className="ml-3">
          <h3 className="text-sm font-medium text-amber-800">
            Context Field Validation
          </h3>
          <div className="mt-2 text-sm text-amber-700">
            <ul className="list-disc list-inside space-y-1">
              {validationMessages.map((item, index) => (
                <li key={index}>{item.message}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextValidationMessages;
