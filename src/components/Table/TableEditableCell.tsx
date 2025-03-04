import React, { useState, useRef, useEffect, CSSProperties } from "react";
import { ColumnType } from "../../types/types";
import {
  IconCheck,
  IconChevronDown,
  IconSquare,
  IconSquareCheckFilled,
} from "@tabler/icons-react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";

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
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCellValue(formatDisplayValue(value, type));
    setEditValue(value?.toString() ?? "");
  }, [value, type]);

  useEffect(() => {
    if (editable && focus && inputRef.current && type !== "checkbox") {
      inputRef.current.focus();
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
      if (numValue > 99999999999999) {
        formatted = "99999999999999";
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
      // Call onChange immediately with the formatted value
      // FIX: Use parseFloat for both rate and float types
      const outputValue =
        type === "rate" || type === "float"
          ? parseFloat(newValue)
          : parseInt(newValue, 10);
      onChange(isNaN(outputValue) ? 0 : outputValue);
    } else {
      setEditValue(newValue);
      // Call onChange immediately with the new value
      onChange(newValue);
    }
  };

  const handleBlur = () => {
    let finalValue: string = editValue;

    if (type === "number" || type === "rate") {
      finalValue = finalValue.replace(/\.$/, "");
      if (finalValue === "") {
        finalValue = "0";
      }
      setCellValue(finalValue);
      setEditValue(finalValue);
    } else {
      setCellValue(finalValue);
      setEditValue(finalValue);
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
          className="p-2 rounded-full hover:bg-default-200 active:bg-default-300 transition-colors duration-200"
          disabled={isSorting}
          type="button"
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
              className="text-default-400"
            />
          )}
        </button>
        <input {...getInputProps()} />
      </div>
    );
  }

  if (type === "combobox") {
    const filteredOptions =
      query === ""
        ? options
        : options.filter((option) =>
            option.toLowerCase().includes(query.toLowerCase())
          );

    return (
      <div className="h-full">
        {/* Add full height to ensure shadow is visible */}
        <Combobox value={value} onChange={onChange} disabled={isSorting}>
          <div className="relative h-full w-full overflow-visible">
            <div className="flex h-full items-center overflow-visible">
              <ComboboxInput
                className="w-full h-full px-6 py-3 text-left focus:outline-none focus:border-default-400 overflow-visible bg-transparent"
                displayValue={(item: string) => item}
                onChange={(event) => setQuery(event.target.value)}
              />
              <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2 overflow-visible">
                <IconChevronDown
                  className="text-default-400 w-5 h-5"
                  size={18}
                  aria-hidden="true"
                />
              </ComboboxButton>
            </div>
            <ComboboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
              {filteredOptions.length === 0 && query !== "" ? (
                <div className="relative cursor-default select-none py-2 px-4 text-default-700">
                  Nothing found.
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <ComboboxOption
                    key={option}
                    value={option}
                    className={({ active }) =>
                      `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                        active
                          ? "bg-default-100 text-default-900"
                          : "text-default-900"
                      }`
                    }
                  >
                    {({ selected, active }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          {option}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                            <IconCheck className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ComboboxOption>
                ))
              )}
            </ComboboxOptions>
          </div>
        </Combobox>
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
          <ListboxButton className="w-full px-6 py-3 text-left focus:outline-none focus:border-default-400">
            <span className="block truncate">{value}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <IconChevronDown
                className="text-default-400 w-5 h-5"
                size={18}
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
                    active
                      ? "bg-default-100 text-default-900"
                      : "text-default-900"
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
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
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
