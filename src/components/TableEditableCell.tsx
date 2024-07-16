import React, { useState, useRef, useEffect, CSSProperties } from "react";
import { ColumnType } from "../types/types";

interface TableEditableCellProps {
  value: any;
  onChange: (value: any) => void;
  type: ColumnType;
  editable: boolean;
  focus: boolean;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const TableEditableCell: React.FC<TableEditableCellProps> = ({
  value,
  onChange,
  type,
  editable,
  focus,
  onKeyDown,
}) => {
  const [cellValue, setCellValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCellValue(value);
  }, [value]);

  useEffect(() => {
    if (editable && focus && inputRef.current) {
      inputRef.current.focus();
      if (type === "string") {
        const length = inputRef.current.value.length;
        inputRef.current.setSelectionRange(length, length);
      }
    }
  }, [editable, focus, type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue: string | number | boolean = e.target.value;

    if (type === "checkbox") {
      newValue = e.target.checked;
    } else if (type === "number" || type === "rate") {
      if (e.target.value === "") {
        newValue = 0;
      } else {
        const numValue =
          type === "number"
            ? Math.floor(Number(e.target.value))
            : Number(e.target.value);

        if (numValue > 99999) {
          newValue = 99999;
        } else {
          newValue = numValue;
        }
      }
    }

    setCellValue(newValue);
    onChange(newValue);
  };

  const getInputProps = (): React.InputHTMLAttributes<HTMLInputElement> => {
    const baseProps: React.InputHTMLAttributes<HTMLInputElement> = {
      value: type !== "checkbox" ? cellValue : undefined,
      onChange: handleChange,
      readOnly: !editable,
      onKeyDown,
      className: `w-full h-full px-6 py-3 m-0 outline-none bg-transparent focus:border-gray-400 focus:border ${
        type === "number" || type === "rate" ? "text-right" : ""
      } ${type === "checkbox" ? "w-auto cursor-pointer" : ""}`,
      style: { boxSizing: "border-box" } as CSSProperties,
    };

    switch (type) {
      case "number":
        return {
          ...baseProps,
          type: "number",
          min: "0",
          max: "99999",
          step: "1",
          onInput: (e: React.FormEvent<HTMLInputElement>) => {
            e.currentTarget.value = Math.min(
              Number(e.currentTarget.value),
              99999
            ).toString();
          },
        };
      case "rate":
        return {
          ...baseProps,
          type: "number",
          min: "0",
          max: "99999",
          step: "0.01",
          onInput: (e: React.FormEvent<HTMLInputElement>) => {
            const input = e.currentTarget;
            if (input.value !== "0" && input.value !== "0.") {
              input.value = input.value.replace(/^0+(?=\d)/, ""); // Remove leading zeros only if followed by other digits
            }
            if (input.value.includes(".")) {
              const [integer, decimal] = input.value.split(".");
              if (decimal.length > 3) {
                input.value = `${integer}.${decimal.slice(0, 3)}`; // Restrict to 3 decimal places
              }
            }
          },
        };
      case "checkbox":
        return { ...baseProps, type: "checkbox", checked: value };
      default:
        return { ...baseProps, type: "text" };
    }
  };

  return <input ref={inputRef} {...getInputProps()} />;
};

export default TableEditableCell;
