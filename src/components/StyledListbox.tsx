// src/components/StyledListbox.tsx
import React, { Fragment } from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";

interface SelectOption {
  id: string | number;
  name: string;
}

interface StyledListboxProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  rounded?: "full" | "lg";
  /** Size variant for the component */
  size?: "sm" | "md";
  /** Anchor position for dropdown - "bottom" (default) or "top" */
  anchor?: "bottom" | "top";
}

const StyledListbox: React.FC<StyledListboxProps> = ({
  value,
  onChange,
  options,
  className = "",
  placeholder = "Select...",
  rounded = "full",
  size = "md",
  anchor = "bottom",
}) => {
  const selectedOption = options.find((option) => option.id === value);
  const displayValue = selectedOption?.name ?? placeholder;
  const roundedClass = rounded === "full" ? "rounded-full" : "rounded-lg";
  const sizeClasses = size === "sm" ? "h-[34px] py-1.5 text-sm" : "py-2";

  return (
    <div className={className}>
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <ListboxButton className={`w-full ${roundedClass} ${sizeClasses} border border-default-300 dark:border-gray-600 bg-white dark:bg-transparent text-default-900 dark:text-gray-100 pl-3 pr-10 text-left focus:outline-none focus:border-default-500 dark:focus:border-gray-500 h-[40px]`}>
            <span className="block truncate">{displayValue}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
              <IconChevronDown
                className="h-5 w-5 text-default-400 dark:text-gray-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ListboxOptions className={`absolute z-[100] w-full p-1 border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg ${anchor === "top" ? "bottom-full mb-1" : "mt-1"}`}>
              {options.map((option) => (
                <ListboxOption
                  key={option.id}
                  className={({ active }) =>
                    `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                      active
                        ? "bg-default-100 dark:bg-gray-700 text-default-900 dark:text-gray-100"
                        : "text-default-900 dark:text-gray-100"
                    }`
                  }
                  value={option.id}
                >
                  {({ selected }) => (
                    <>
                      <span
                        className={`block truncate ${
                          selected ? "font-medium" : "font-normal"
                        }`}
                      >
                        {option.name}
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600 dark:text-gray-300">
                          <IconCheck className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
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

export default StyledListbox;