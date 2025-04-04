// src/components/Catalogue/StaffListbox.tsx
import React, { Fragment } from "react";
import {
  Listbox,
  Transition,
  ListboxOption,
  ListboxOptions,
  ListboxButton as HeadlessListboxButton,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import clsx from "clsx";

interface SelectOption {
  id: string | number;
  name: string;
}

interface StaffListboxProps {
  name: string;
  label: string;
  value: string | string[] | number | undefined; // Can receive name or ID initially
  onChange: (value: string) => void; // Passes back the selected ID as string
  options: SelectOption[];
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  optionsPosition?: "top" | "bottom";
}

export const StaffListbox: React.FC<StaffListboxProps> = ({
  name,
  label,
  value, // This might be the name or ID from formData
  onChange,
  options,
  disabled = false,
  required = false,
  placeholder = "Select...",
  optionsPosition = "bottom",
}) => {
  // OLD LOGIC: Try to find the selected option based on name first, then ID
  // This assumes the 'value' prop might initially hold the display name when data is loaded
  const findSelectedOption = () => {
    if (!value) return null;
    const valueStr = value.toString();
    // Prioritize matching by name (case-insensitive) if the value looks like a name
    let selected = options.find(
      (opt) => opt.name.toLowerCase() === valueStr.toLowerCase()
    );
    if (selected) return selected;
    // Fallback to matching by ID (as string)
    return options.find((opt) => opt.id.toString() === valueStr);
  };

  const selectedOption = findSelectedOption();
  const displayValue = selectedOption
    ? selectedOption.name
    : value
    ? `Invalid (${value})`
    : placeholder;
  // Determine the actual value to pass to Headless UI's Listbox (should be the ID if found)
  const listboxValue = selectedOption ? selectedOption.id.toString() : "";

  return (
    <div className={`${label ? "space-y-2" : ""}`}>
      {" "}
      {/* Consistent spacing */}
      {label && (
        <label
          htmlFor={`${name}-button`}
          className="block text-sm font-medium text-default-700"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {/* Use listboxValue for the underlying Headless UI component */}
      <Listbox
        value={listboxValue}
        onChange={onChange}
        disabled={disabled}
        name={name}
      >
        <div className="relative">
          <HeadlessListboxButton
            id={`${name}-button`}
            className={clsx(
              "relative w-full cursor-default rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm", // New Styling
              "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 sm:text-sm",
              disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""
            )}
          >
            {/* Display the determined displayValue */}
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
              {options.map((option) => (
                <ListboxOption
                  key={option.id}
                  className={({ active }) =>
                    `relative cursor-default select-none py-2 pl-3 pr-10 ${
                      // Adjusted padding
                      active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                    }`
                  }
                  // Value passed back is always the ID as string
                  value={option.id.toString()}
                >
                  {(
                    { selected } // selected is based on comparison with listboxValue
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
