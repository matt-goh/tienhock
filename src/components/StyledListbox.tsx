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
}

const StyledListbox: React.FC<StyledListboxProps> = ({
  value,
  onChange,
  options,
  className = "",
  placeholder = "Select...",
}) => {
  const selectedOption = options.find((option) => option.id === value);
  const displayValue = selectedOption?.name ?? placeholder;

  return (
    <div className={`w-full ${className}`}>
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <ListboxButton className="w-full rounded-full border border-default-300 bg-white py-[9px] pl-3 pr-10 text-left focus:outline-none focus:border-default-500">
            <span className="block truncate pl-2">{displayValue}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
              <IconChevronDown
                className="h-5 w-5 text-default-400"
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
            <ListboxOptions className="absolute z-50 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
              {options.map((option) => (
                <ListboxOption
                  key={option.id}
                  className={({ active }) =>
                    `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                      active
                        ? "bg-default-100 text-default-900"
                        : "text-default-900"
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
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
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