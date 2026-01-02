// src/components/FormComponents.tsx
import React, { Fragment, useState, useEffect } from "react"; // Added useState, useEffect
import {
  Listbox,
  Transition,
  Combobox,
  ComboboxInput,
  ComboboxButton as HeadlessComboboxButton,
  ComboboxOptions,
  ComboboxOption,
  ListboxOption,
  ListboxOptions,
  ListboxButton as HeadlessListboxButton,
} from "@headlessui/react";
import { IconChevronDown, IconCheck, IconPhone } from "@tabler/icons-react";
import clsx from "clsx";
import { StatusIndicator } from "./StatusIndicator"; // Assuming this exists

// Exporting for reuse, includes optional phone_number
export interface SelectOption {
  id: string | number;
  name: string;
  phone_number?: string | null;
}

// --- FormInput ---
interface InputProps {
  name: string;
  label: string | React.ReactNode;
  value: string | number | undefined;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  step?: string | number;
  min?: number;
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
    {label && (
      <label
        htmlFor={name}
        className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate"
        title={typeof label === "string" ? label : undefined}
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
        "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
        "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
        "placeholder-gray-400 dark:placeholder-gray-500",
        "focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 sm:text-sm",
        "disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed"
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
    <div className="flex items-center justify-between">
      {label && (
        <label
          htmlFor={name}
          className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate"
          title={typeof label === "string" ? label : undefined}
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
        "block w-full px-3 py-2 border border-default-300 dark:border-gray-600 rounded-lg shadow-sm",
        "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
        "placeholder-gray-400 dark:placeholder-gray-500",
        "focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 sm:text-sm",
        "disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:cursor-not-allowed"
      )}
    />
  </div>
);

// --- FormListbox ---
interface ListboxProps {
  name: string;
  label?: string | React.ReactNode;
  value: string | number | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  optionsPosition?: "top" | "bottom";
  className?: string;
  renderOption?: (
    option: SelectOption,
    selected: boolean,
    active: boolean
  ) => React.ReactElement;
}

export const FormListbox: React.FC<ListboxProps> = ({
  name,
  label,
  value,
  onChange,
  options,
  disabled = false,
  required = false,
  placeholder = "Select...",
  optionsPosition = "bottom",
  className = "",
  renderOption,
}) => {
  const valueAsString = value?.toString() ?? "";
  const selectedOption = options.find(
    (option) => option.id.toString() === valueAsString
  );
  const displayValue = selectedOption?.name ?? placeholder;

  return (
    <div className={`${label ? "space-y-2" : ""} ${className}`}>
      {label && (
        <label
          htmlFor={`${name}-button`}
          className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate"
          title={typeof label === "string" ? label : undefined}
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
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
              "relative w-full cursor-pointer rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left shadow-sm",
              "text-gray-900 dark:text-gray-100",
              "focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 sm:text-sm",
              disabled ? "bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed" : ""
            )}
          >
            {/* Allow custom rendering for the button display value too if needed, using selectedOption */}
            <span className="block truncate">{displayValue}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                size={20}
                className="text-gray-400 dark:text-gray-500"
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
                "absolute z-10 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-700 focus:outline-none sm:text-sm",
                optionsPosition === "top" ? "bottom-full mb-1" : "mt-1"
              )}
            >
              {options.map((option) => (
                <ListboxOption
                  key={option.id}
                  className={({ active }) =>
                    clsx(
                      "relative cursor-pointer select-none py-2 pl-3 pr-10",
                      active ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200" : "text-gray-900 dark:text-gray-100"
                    )
                  }
                  value={option.id.toString()}
                >
                  {({ selected, active }) =>
                    renderOption ? (
                      renderOption(option, selected, active)
                    ) : (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          {option.name}
                        </span>
                        {selected ? (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                            <IconCheck size={20} aria-hidden="true" />
                          </span>
                        ) : null}
                      </>
                    )
                  }
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
};

// --- FormCombobox (Supports single/multiple modes) ---
interface ComboboxProps {
  name: string;
  label: string;
  value: string | string[] | undefined; // Accept single string, array, or undefined
  onChange: (value: string | string[] | null) => void; // Return type matches mode
  options: SelectOption[];
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  mode?: "single" | "multiple"; // Added mode prop
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  optionsPosition?: "top" | "bottom";
}

export const FormCombobox: React.FC<ComboboxProps> = ({
  name,
  label,
  value,
  onChange,
  options,
  query,
  setQuery,
  mode = "multiple", // Default to multiple for backward compatibility
  disabled = false,
  required = false,
  placeholder = "Search...",
  optionsPosition = "bottom",
}) => {
  const isMultiple = mode === "multiple";

  // Normalize value for internal Headless UI state
  // For single mode, Headless UI expects the selected object or null/undefined
  // For multiple mode, it expects an array of selected objects
  // We'll manage the value internally as the selected *option object(s)* for Headless UI
  // and convert back to ID(s) in onChange.

  // Find selected option(s) based on incoming ID(s)
  const selectedOptions = React.useMemo(() => {
    if (isMultiple) {
      const valuesArray = Array.isArray(value)
        ? value.map((v) => v?.toString())
        : [];
      return options.filter((opt) => valuesArray.includes(opt.id.toString()));
    } else {
      const stringValue = value?.toString();
      return options.find((opt) => opt.id.toString() === stringValue) ?? null;
    }
  }, [value, options, isMultiple]);

  const filteredOptions =
    query === ""
      ? options
      : options.filter((option) =>
          option.name
            .toLowerCase()
            .replace(/\s+/g, "")
            .includes(query.toLowerCase().replace(/\s+/g, ""))
        );

  // Handle change from Headless UI, converting option object(s) back to ID(s)
  const handleChange = (selected: SelectOption | SelectOption[] | null) => {
    if (isMultiple) {
      // `selected` will be SelectOption[]
      const selectedIds = Array.isArray(selected)
        ? selected.map((opt) => opt.id.toString())
        : [];
      onChange(selectedIds.length > 0 ? selectedIds : null);
    } else {
      // `selected` will be SelectOption or null
      const selectedId =
        selected && "id" in selected ? selected.id.toString() : null;
      onChange(selectedId);
    }
  };

  // Display function for the input field
  const getDisplayValue = (
    selected: SelectOption | SelectOption[] | null
  ): string => {
    if (isMultiple) {
      // For multiple, show comma-separated names
      const items = Array.isArray(selected) ? selected : [];
      return items.map((opt) => opt.name).join(", ");
    } else {
      // For single, show name and potentially phone number
      const item = selected as SelectOption | null; // Cast for single mode
      if (!item) return "";
      let display = item.name;
      // Append phone number if available and different from name
      if (item.phone_number && item.phone_number !== item.name) {
        display += ` (${item.phone_number})`;
      }
      return display;
    }
  };

  return (
    <div className={`${label ? "space-y-2" : ""}`}>
      {label && (
        <label
          htmlFor={`${name}-input`}
          className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate"
          title={typeof label === "string" ? label : undefined}
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {/* Conditionally set 'multiple' prop */}
      <Combobox
        value={selectedOptions} // Pass selected option object(s)
        onChange={handleChange} // Use internal handler
        disabled={disabled}
        name={name}
        multiple={isMultiple} // Set based on mode
      >
        <div className="relative">
          {/* Input area */}
          <div
            className={clsx(
              "relative w-full cursor-default overflow-hidden rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-left shadow-sm",
              "focus-within:ring-1 focus-within:ring-sky-500 dark:focus-within:ring-sky-400 focus-within:border-sky-500 dark:focus-within:border-sky-400",
              disabled ? "bg-gray-50 dark:bg-gray-700" : ""
            )}
          >
            <ComboboxInput
              // Render as input for typing/searching
              className={clsx(
                "w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 dark:text-gray-100 bg-transparent focus:ring-0",
                "placeholder-gray-400 dark:placeholder-gray-500",
                disabled ? "bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed" : ""
              )}
              // displayValue tells Headless UI how to render the selected item(s) in the input
              displayValue={getDisplayValue}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              id={`${name}-input`}
            />
            <HeadlessComboboxButton
              className="absolute inset-y-0 right-0 flex items-center pr-2"
              onClick={() => setQuery("")}
            >
              <IconChevronDown
                size={20}
                className="text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              />
            </HeadlessComboboxButton>
          </div>
          {/* Options dropdown */}
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => setQuery("")}
          >
            <ComboboxOptions
              className={clsx(
                "absolute z-10 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-700 focus:outline-none sm:text-sm",
                optionsPosition === "top" ? "bottom-full mb-1" : "mt-1"
              )}
            >
              {filteredOptions.length === 0 && query !== "" ? (
                <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-300">
                  Nothing found.
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <ComboboxOption
                    key={option.id}
                    className={({ active }) =>
                      clsx(
                        "relative cursor-default select-none py-2 pl-3 pr-10",
                        active ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-200" : "text-gray-900 dark:text-gray-100"
                      )
                    }
                    value={option} // Pass the whole option object as value
                  >
                    {/* Use render prop `active` which indicates focus/hover */}
                    {(
                      { active, selected } // `selected` indicates if the option matches the Combobox's value
                    ) => (
                      <>
                        <div className="flex justify-between items-center w-full mr-5">
                          {/* Name */}
                          <span
                            className={clsx(
                              "block truncate",
                              selected ? "font-medium" : "font-normal"
                            )}
                          >
                            {option.name}
                          </span>
                          {/* Phone number (conditional) */}
                          {option.phone_number && (
                            <span
                              className={clsx(
                                "text-xs ml-2 flex-shrink-0 flex items-center",
                                active ? "text-sky-700 dark:text-sky-300" : "text-gray-500 dark:text-gray-400"
                              )}
                            >
                              <IconPhone
                                size={14}
                                className="inline mr-1 relative -top-[1px]"
                              />
                              {option.phone_number}
                            </span>
                          )}
                        </div>
                        {/* Checkmark */}
                        {selected ? (
                          <span
                            className={clsx(
                              "absolute inset-y-0 right-0 flex items-center pr-3",
                              "text-sky-600 dark:text-sky-400"
                            )}
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
