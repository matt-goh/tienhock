// src/components/ListboxSelect.tsx
// Compact, label-less Headless UI v2 listbox for inline use (toolbars, table cells,
// modals). Follows the same v2 `transition`-prop approach as ContributionListbox
// (NOT the legacy <Transition> wrapper, which can trigger a "Maximum update depth
// exceeded" option-registration loop on selection-driven re-renders).
import React from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import clsx from "clsx";

export interface ListboxSelectOption {
  value: string;
  label: string;
}

interface ListboxSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ListboxSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string; // wrapper width/spacing, e.g. "w-64"
  buttonClassName?: string; // extra classes on the button (e.g. text size)
}

const ListboxSelect: React.FC<ListboxSelectProps> = ({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Select...",
  className = "",
  buttonClassName = "",
}) => {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={clsx("relative", className)}>
        <ListboxButton
          className={clsx(
            "relative w-full cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50",
            buttonClassName
          )}
        >
          <span className="block truncate">
            {selectedOption?.label ?? placeholder}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <IconChevronDown
              size={18}
              className="text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
          </span>
        </ListboxButton>
        <ListboxOptions
          transition
          className="absolute z-20 mt-1 max-h-60 w-full min-w-max overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-700 focus:outline-none origin-top transition duration-100 ease-in data-[closed]:opacity-0 data-[closed]:scale-95"
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="relative cursor-pointer select-none py-2 pl-3 pr-10 text-gray-900 dark:text-gray-100 data-[focus]:bg-sky-100 dark:data-[focus]:bg-sky-900/40 data-[focus]:text-sky-900 dark:data-[focus]:text-sky-200"
            >
              {({ selected }) => (
                <>
                  <span
                    className={clsx(
                      "block truncate",
                      selected ? "font-medium" : "font-normal"
                    )}
                  >
                    {option.label}
                  </span>
                  {selected ? (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                      <IconCheck size={18} aria-hidden="true" />
                    </span>
                  ) : null}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
};

export default ListboxSelect;
