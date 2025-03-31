// src/components/FormComponents.tsx
import React, { Fragment } from "react";
import {
  Listbox,
  Transition,
  Combobox,
  ComboboxInput,
  ComboboxButton as HeadlessComboboxButton, // Rename for clarity
  ComboboxOptions,
  ComboboxOption,
  ListboxOption,
  ListboxOptions,
  ListboxButton as HeadlessListboxButton,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import clsx from "clsx";
import { StatusIndicator } from "./StatusIndicator"; // Assuming this exists

export interface SelectOption {
  id: string | number; // Allow number IDs too
  name: string;
}

// --- FormInput ---
interface InputProps {
  name: string;
  label: string;
  value: string | number | undefined;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  step?: string;
  min?: string;
  max?: number;
  required?: boolean;
}

export const FormInput: React.FC<InputProps> = ({
  name = "",
  label = "",
  value = "",
  onChange,
  disabled = false,
  type = "text",
  placeholder = "",
  onBlur,
  step,
  min,
  max,
  required = false,
}) => (
  <div className={`${label ? "space-y-2" : ""}`}>
    {" "}
    {/* Use space-y-2 */}
    {label && (
      <label
        htmlFor={name}
        className="block text-sm font-medium text-default-700"
      >
        {label} {required && <span className="text-red-500">*</span>}
      </label>
    )}
    <input
      type={type}
      id={name}
      name={name}
      value={value?.toString() ?? ""}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      onBlur={onBlur}
      step={step}
      min={min}
      max={max?.toString()}
      required={required}
      className={clsx(
        "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm", // Standard input style
        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
        "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
      )}
    />
  </div>
);

// --- FormInputWithStatus ---
interface ExtendedInputProps extends InputProps {
  showStatus?: boolean;
  isVerified?: boolean;
}

export const FormInputWithStatus: React.FC<ExtendedInputProps> = ({
  name,
  label,
  value,
  onChange,
  disabled = false,
  type = "text",
  placeholder = "",
  showStatus = false,
  isVerified = false,
  required = false,
}) => (
  <div className={`${label ? "space-y-2" : ""}`}>
    {" "}
    {/* Use space-y-2 */}
    <div className="flex items-center justify-between">
      {label && (
        <label
          htmlFor={name}
          className="block text-sm font-medium text-default-700"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {showStatus && isVerified && (
        <StatusIndicator success={true} type="verification" />
      )}
    </div>
    <input
      type={type}
      id={name}
      name={name}
      value={value?.toString() ?? ""}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      required={required}
      className={clsx(
        "block w-full px-3 py-2 border border-default-300 rounded-lg shadow-sm", // Standard input style
        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
        "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
      )}
    />
  </div>
);

// --- FormListbox (Updated Comparison logic) ---
interface ListboxProps {
  name: string;
  label: string;
  value: string | number | undefined; // The actual ID/value being stored in state
  onChange: (value: string) => void; // Should receive the ID/value back (as string)
  options: SelectOption[]; // Array of { id: string | number, name: string }
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  optionsPosition?: "top" | "bottom";
  className?: string; // Optional className for additional styling
}

export const FormListbox: React.FC<ListboxProps> = ({
  name,
  label,
  value, // This is the ID (e.g., 'male', 1, '1')
  onChange,
  options,
  disabled = false,
  required = false,
  placeholder = "Select...",
  optionsPosition = "bottom",
  className = "",
}) => {
  // Find the option object that matches the current value (ID), comparing as strings
  const valueAsString = value?.toString() ?? ""; // Ensure value is a string for comparison
  const selectedOption = options.find(
    (option) => option.id.toString() === valueAsString
  );
  // Display name if found, otherwise show placeholder or the raw value if options might still be loading
  const displayValue = selectedOption
    ? selectedOption.name
    : valueAsString && options.length > 0
    ? `Invalid (${valueAsString})`
    : placeholder; // Only show invalid if options ARE loaded

  return (
    <div className={`${label ? "space-y-2" : ""} ${className}`}>
      {label && (
        <label
          htmlFor={`${name}-button`}
          className="block text-sm font-medium text-default-700"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {/* Pass valueAsString to Listbox value prop */}
      <Listbox
        value={valueAsString}
        onChange={onChange}
        disabled={disabled}
        name={name}
      >
        <div className="relative">
          <HeadlessListboxButton
            id={`${name}-button`}
            className={clsx(
              "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm",
              "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
              disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""
            )}
          >
            <span className="block truncate">{displayValue}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                size={20}
                className="text-gray-400"
                aria-hidden="true"
              />
            </span>
          </HeadlessListboxButton>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ListboxOptions
              className={clsx(
                "absolute z-10 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
                optionsPosition === "top" ? "bottom-full mb-1" : "mt-1"
              )}
            >
              {/* Optional Placeholder - might be useful if !required */}
              {/* {!required && placeholder && (
                 <ListboxOption value="" className="text-gray-500 italic py-2 pl-3 pr-10" disabled>
                   {placeholder}
                 </ListboxOption>
               )} */}
              {options.map((option) => (
                <ListboxOption
                  key={option.id}
                  className={({ active }) =>
                    `relative cursor-default select-none py-2 pl-3 pr-10 ${
                      active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                    }`
                  }
                  // Pass back the ID as a string
                  value={option.id.toString()}
                >
                  {(
                    { selected } // selected is determined by Listbox comparing its value with option value
                  ) => (
                    <>
                      <span
                        className={`block truncate ${
                          selected ? "font-medium" : "font-normal"
                        }`}
                      >
                        {option.name}
                      </span>
                      {selected ? (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                          <IconCheck size={20} aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
};

// --- FormCombobox (Updated string conversion) ---
interface ComboboxProps {
  name: string;
  label: string;
  value: string[]; // Keep as string array for multi-select IDs
  onChange: (value: string[] | null) => void;
  options: SelectOption[];
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

export const FormCombobox: React.FC<ComboboxProps> = ({
  name,
  label,
  value, // Array of string IDs
  onChange,
  options,
  query,
  setQuery,
  disabled = false,
  required = false,
  placeholder = "Search...",
}) => {
  const filteredOptions =
    query === ""
      ? options
      : options.filter((option) =>
          option.name
            .toLowerCase()
            .replace(/\s+/g, "")
            .includes(query.toLowerCase().replace(/\s+/g, ""))
        );

  // Display function remains the same, relies on string ID matching
  const getDisplayValue = (selectedIds: string[]) => {
    if (!selectedIds || selectedIds.length === 0) return "";
    return selectedIds
      .map((id) => options.find((opt) => opt.id.toString() === id)?.name) // Compare as string
      .filter(Boolean)
      .join(", ");
  };

  return (
    <div className={`${label ? "space-y-2" : ""}`}>
      {label && (
        <label
          htmlFor={`${name}-input`}
          className="block text-sm font-medium text-default-700"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {/* Ensure Combobox value is array of strings */}
      <Combobox
        multiple
        value={value.map((v) => v?.toString() ?? "")}
        onChange={onChange}
        disabled={disabled}
        name={name}
      >
        <div className="relative">
          <div
            className={clsx(
              "relative w-full cursor-default overflow-hidden rounded-lg border border-default-300 bg-white text-left shadow-sm",
              "focus-within:ring-1 focus-within:ring-sky-500 focus-within:border-sky-500", // Focus ring on wrapper
              disabled ? "bg-gray-50" : ""
            )}
          >
            <ComboboxInput
              as="input" // Explicitly render as input
              id={`${name}-input`}
              className={clsx(
                "w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0", // Remove input border/ring
                disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""
              )}
              displayValue={getDisplayValue}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              disabled={disabled}
            />
            <HeadlessComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                size={20}
                className="text-gray-400"
                aria-hidden="true"
              />
            </HeadlessComboboxButton>
          </div>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => setQuery("")}
          >
            <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
              {filteredOptions.length === 0 && query !== "" ? (
                <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                  Nothing found.
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <ComboboxOption
                    key={option.id}
                    className={({ active }) =>
                      `relative cursor-default select-none py-2 pl-3 pr-10 ${
                        active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                      }`
                    }
                    // Value passed back should be string ID
                    value={option.id.toString()}
                  >
                    {({ selected, active }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          {option.name}
                        </span>
                        {selected ? (
                          <span
                            className={`absolute inset-y-0 right-0 flex items-center pr-3 ${
                              active ? "text-sky-600" : "text-sky-600"
                            }`}
                          >
                            <IconCheck size={20} aria-hidden="true" />
                          </span>
                        ) : null}
                      </>
                    )}
                  </ComboboxOption>
                ))
              )}
            </ComboboxOptions>
          </Transition>
        </div>
      </Combobox>
    </div>
  );
};
