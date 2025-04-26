// src/components/Payroll/DynamicContextForm.tsx
import React from "react";
import { FormInput, FormListbox } from "../FormComponents";
import { ContextField } from "../../configs/payrollJobConfigs";

interface DynamicContextFormProps {
  contextFields: ContextField[];
  contextData: Record<string, any>;
  onChange: (id: string, value: any) => void;
  disabled?: boolean;
}

const DynamicContextForm: React.FC<DynamicContextFormProps> = ({
  contextFields,
  contextData,
  onChange,
  disabled = false,
}) => {
  const renderField = (field: ContextField) => {
    const value = contextData[field.id] ?? field.defaultValue;

    switch (field.type) {
      case "number":
        return (
          <FormInput
            key={field.id}
            name={field.id}
            label={field.label}
            type="number"
            value={value?.toString() || ""}
            onChange={(e) => onChange(field.id, Number(e.target.value))}
            required={field.required}
            disabled={disabled}
            min={field.min}
            max={field.max}
          />
        );

      case "text":
        return (
          <FormInput
            key={field.id}
            name={field.id}
            label={field.label}
            type="text"
            value={value || ""}
            onChange={(e) => onChange(field.id, e.target.value)}
            required={field.required}
            disabled={disabled}
          />
        );

      case "select":
        return (
          <FormListbox
            key={field.id}
            name={field.id}
            label={field.label}
            value={value?.toString() || ""}
            onChange={(newValue) => onChange(field.id, newValue)}
            options={(field.options || []).map((opt) => ({
              id: opt.id,
              name: opt.label,
            }))}
            required={field.required}
            disabled={disabled}
          />
        );

      case "date":
        return (
          <FormInput
            key={field.id}
            name={field.id}
            label={field.label}
            type="date"
            value={value || ""}
            onChange={(e) => onChange(field.id, e.target.value)}
            required={field.required}
            disabled={disabled}
          />
        );

      default:
        return null;
    }
  };

  if (contextFields.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {contextFields.map((field) => renderField(field))}
    </div>
  );
};

export default DynamicContextForm;
