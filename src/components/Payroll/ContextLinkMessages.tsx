// src/components/Payroll/ContextLinkMessages.tsx
import React from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { ContextField } from "../../configs/payrollJobConfigs";

interface ContextLinkMessagesProps {
  contextFields: ContextField[];
  linkedPayCodes: Record<string, ContextField>;
}

const ContextLinkMessages: React.FC<ContextLinkMessagesProps> = ({
  contextFields,
  linkedPayCodes,
}) => {
  const linkedFields = contextFields.filter((field) => field.linkedPayCode);

  if (linkedFields.length === 0) return null;

  return (
    <div className="mt-4 p-3 bg-sky-50 border border-sky-200 rounded-lg">
      <div className="flex items-start">
        <IconInfoCircle className="h-5 w-5 text-sky-500 mt-0.5" />
        <div className="ml-3">
          <h3 className="text-sm font-medium text-sky-800">Linked Pay Codes</h3>
          <div className="mt-2 text-sm text-sky-700">
            <ul className="space-y-1">
              {linkedFields.map((field, index) => (
                <li key={index}>
                  <span className="font-medium">{field.label}</span> will
                  automatically calculate pay code:{" "}
                  <span className="font-medium">{field.linkedPayCode}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextLinkMessages;
