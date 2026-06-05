// src/components/ContributionListbox.tsx
// A self-contained Headless UI v2 listbox for the per-staff contribution overrides.
// It deliberately uses the v2 `transition` prop on <ListboxOptions> instead of
// wrapping the panel in the legacy standalone <Transition> component. The legacy
// wrapper (still used by FormComponents' FormListbox) double-manages the panel's
// visibility and can trigger a "Maximum update depth exceeded" option-registration
// loop when a selection causes a parent re-render inside Headless's flushSync.
import React from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import clsx from "clsx";

export interface ContributionOption {
  id: string;
  name: string;
}

interface ContributionListboxProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ContributionOption[];
}

const ContributionListbox: React.FC<ContributionListboxProps> = ({
  name,
  label,
  value,
  onChange,
  options,
}) => {
  const selectedOption = options.find((option) => option.id === value);

  return (
    <div className="space-y-2">
      <label
        htmlFor={`${name}-button`}
        className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate"
      >
        {label}
      </label>
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <ListboxButton
            id={`${name}-button`}
            className="relative w-full cursor-pointer rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 sm:text-sm"
          >
            <span className="block truncate">
              {selectedOption?.name ?? "Select..."}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                size={20}
                className="text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <ListboxOptions
            transition
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-700 focus:outline-none sm:text-sm origin-top transition duration-100 ease-in data-[closed]:opacity-0 data-[closed]:scale-95"
          >
            {options.map((option) => (
              <ListboxOption
                key={option.id}
                value={option.id}
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
                      {option.name}
                    </span>
                    {selected ? (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                        <IconCheck size={20} aria-hidden="true" />
                      </span>
                    ) : null}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );
};

export default ContributionListbox;
