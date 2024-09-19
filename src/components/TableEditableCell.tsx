import React, { useState, useRef, useEffect, CSSProperties } from "react";
import { ColumnType } from "../types/types";
import { IconCheck, IconChevronDown, IconSquare, IconSquareCheckFilled } from "@tabler/icons-react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";

interface TableEditableCellProps {
  value: any;
  onChange: (value: any) => void;
  type: ColumnType;
  editable: boolean;
  focus: boolean;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  isSorting: boolean;
  previousCellValue: any;
  options?: string[];
}

const TableEditableCell: React.FC<TableEditableCellProps> = ({
  value,
  onChange,
  type,
  editable,
  focus,
  onKeyDown,
  isSorting,
  previousCellValue,
  options = [],
}) => {
  const [cellValue, setCellValue] = useState(value?.toString() ?? "");
  const [editValue, setEditValue] = useState(value?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCellValue(formatDisplayValue(value, type));
    setEditValue(value?.toString() ?? "");
  }, [value, type]);

  useEffect(() => {
    if (editable && focus && inputRef.current && type !== "checkbox") {
      inputRef.current.focus();
      if (type === "number" || type === "rate" || type === "float") {
        const length = inputRef.current.value.length;
        inputRef.current.setSelectionRange(length, length);
      }
    }
  }, [editable, focus, type]);

  const formatDisplayValue = (value: any, type: ColumnType): string => {
    if (type === "float" || type === "amount") {
      const floatValue = parseFloat(value);
      return isNaN(floatValue) ? "" : floatValue.toFixed(2);
    }
    return value?.toString() ?? "";
  };

  const formatEditValue = (value: string): string => {
    if (type === "number" || type === "rate" || type === "float") {
      // Remove non-numeric characters (except decimal point for rate)
      let formatted =
        type === "rate" || type === "float"
          ? value.replace(/[^\d.]/g, "")
          : value.replace(/\D/g, "");

      // Handle decimal point for rate
      if (type === "rate" || type === "float") {
        const parts = formatted.split(".");
        if (parts.length > 2) {
          formatted = parts[0] + "." + parts.slice(1).join("");
        }
        // Limit to 3 decimal places
        if (parts[1]) {
          formatted = parts[0] + "." + parts[1].slice(0, 3);
        }
      }

      // Remove leading zeros, but allow single 0 and "0."
      if (formatted !== "0" && !formatted.startsWith("0.")) {
        formatted = formatted.replace(/^0+/, "");
      }

      // Ensure the value is not empty
      if (formatted === "" || formatted === ".") {
        formatted = "0";
      }

      // Limit to 9999999999999999
      const numValue = parseFloat(formatted);
      if (numValue > 9999999999999999) {
        formatted = "9999999999999999";
      }

      return formatted;
    }
    return value;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue: string | boolean = e.target.value;

    if (type === "checkbox") {
      newValue = e.target.checked;
      setCellValue(newValue.toString());
      onChange(newValue);
    } else if (type === "number" || type === "rate" || type === "float") {
      newValue = formatEditValue(newValue);
      setEditValue(newValue);
    } else {
      setEditValue(newValue);
    }
  };

  const handleBlur = () => {
    let finalValue: string = editValue;

    if (type === "number" || type === "rate") {
      // Remove trailing decimal point
      finalValue = finalValue.replace(/\.$/, "");

      // Ensure the value is not empty
      if (finalValue === "") {
        finalValue = "0";
      }

      // Convert to number for onChange, but keep as string for display
      let outputValue =
        type === "rate" ? parseFloat(finalValue) : parseInt(finalValue, 10);

      setCellValue(finalValue);
      setEditValue(finalValue);
      onChange(outputValue);
    } else {
      setCellValue(finalValue);
      setEditValue(finalValue);
      onChange(finalValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setCellValue(previousCellValue?.toString() ?? "");
      setEditValue(previousCellValue?.toString() ?? "");
      onChange(previousCellValue);
    } else if (e.key === "Enter") {
      handleBlur();
    }
    onKeyDown(e);
  };

  const getInputProps = (): React.InputHTMLAttributes<HTMLInputElement> => {
    const baseProps: React.InputHTMLAttributes<HTMLInputElement> = {
      onChange: handleChange,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      className: `w-full h-full px-6 py-3 m-0 outline-none bg-transparent ${
        type === "number" ||
        type === "rate" ||
        type === "amount" ||
        type === "float"
          ? "text-right"
          : ""
      } ${type === "checkbox" ? "w-auto" : ""} ${
        type === "amount" || isSorting ? "cursor-default" : ""
      }`,
      style: { boxSizing: "border-box" } as CSSProperties,
      disabled: isSorting,
      tabIndex: editable && !isSorting ? 0 : -1, // Make non-editable cells non-focusable
    };

    if (type === "checkbox") {
      return {
        ...baseProps,
        type: "checkbox",
        checked: cellValue === "true",
        readOnly: !editable || isSorting,
        className: "hidden", // Hide the actual checkbox input
      };
    } else {
      return {
        ...baseProps,
        type: "text",
        value: editable ? editValue : cellValue,
        readOnly: !editable || isSorting,
        inputMode: type === "number" || type === "rate" ? "decimal" : undefined,
        step: type === "float" ? "0.01" : undefined,
      };
    }
  };

  if (type === "checkbox") {
    return (
      <div className="flex items-center justify-center h-full">
        <button
          onClick={() => {
            if (!isSorting) {
              const newValue = cellValue !== "true";
              setCellValue(newValue.toString());
              onChange(newValue);
            }
          }}
          className="p-2 rounded-full hover:bg-gray-200 active:bg-gray-300 transition-colors duration-200"
          disabled={isSorting}
        >
          {cellValue === "true" ? (
            <IconSquareCheckFilled
              width={18}
              height={18}
              className="text-blue-600"
            />
          ) : (
            <IconSquare
              width={18}
              height={18}
              stroke={2}
              className="text-gray-400"
            />
          )}
        </button>
        <input {...getInputProps()} />
      </div>
    );
  }

  if (type === "listbox") {
    return (
      <Listbox
        value={value}
        onChange={onChange}
        disabled={!editable || isSorting}
      >
        <div className="relative w-full">
          <ListboxButton className="w-full px-6 py-3 text-left focus:outline-none focus:border-gray-400">
            <span className="block truncate">{value}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <IconChevronDown
                className="h-5 w-5 text-gray-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
            {options.map((option) => (
              <ListboxOption
                key={option}
                className={({ active }) =>
                  `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                    active ? "bg-gray-100 text-gray-900" : "text-gray-900"
                  }`
                }
                value={option}
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? "font-medium" : "font-normal"
                      }`}
                    >
                      {option}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-600">
                        <IconCheck className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    );
  }

  return <input ref={inputRef} {...getInputProps()} />;
};

export default TableEditableCell;
