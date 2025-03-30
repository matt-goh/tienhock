// src/components/FormComponents.tsx
import React, { Fragment } from "react";
import {
  Listbox,
  Transition,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
  ListboxOption,
  ListboxOptions,
  ListboxButton,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import clsx from "clsx";
import { StatusIndicator } from "./StatusIndicator";

interface SelectOption {
  id: string;
  name: string;
}

interface InputProps {
  name: string;
  label: string;
  value: string | undefined;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

interface ExtendedInputProps extends InputProps {
  showStatus?: boolean;
  isVerified?: boolean;
}

export const FormInput: React.FC<InputProps> = ({
  name = "",
  label = "",
  value = "",
  onChange,
  disabled = false,
  type = "text",
  placeholder = "",
}) => (
  <div className={`${label === "" ? "" : "space-y-2"}`}>
    <label
      htmlFor={name}
      className="text-sm font-medium text-default-700 mt-0.5"
    >
      {label}
    </label>
    <input
      type={type}
      id={name}
      name={name}
      value={value?.toString() ?? ""}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
    />
  </div>
);

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
}) => (
  <div className={`${label === "" ? "" : "space-y-2"}`}>
    <div className="flex items-center gap-2">
      <label
        htmlFor={name}
        className="text-sm font-medium text-default-700 mt-1"
      >
        {label}
      </label>
      {showStatus && isVerified && (
        <StatusIndicator success={true} type="verification" />
      )}
    </div>
    <input
      type={type}
      id={name}
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
    />
  </div>
);

interface ListboxProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}

export const FormListbox: React.FC<ListboxProps> = ({
  name,
  label,
  value,
  onChange,
  options,
}) => (
  <div className={`${label === "" ? "" : "space-y-2"}`}>
    <label htmlFor={name} className="text-sm font-medium text-default-700">
      {label}
    </label>
    <Listbox value={value} onChange={onChange}>
      <div className="relative">
        <ListboxButton
          className={clsx(
            "relative w-full rounded-lg border border-default-300 bg-white py-[8.85px] pl-3 pr-10 text-left",
            "focus:outline-none focus:border-default-500"
          )}
        >
          <span className="block truncate">{value || "Select"}</span>
          <span className="absolute inset-y-0 right-1.5 flex items-center pr-2 pointer-events-none">
            <IconChevronDown size={20} className="text-default-500" />
          </span>
        </ListboxButton>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
            {options.map((option) => (
              <ListboxOption
                key={option.id}
                className={({ active }) =>
                  `relative cursor-pointer select-none rounded py-2 px-4 ${
                    active ? "bg-default-100" : "text-default-900"
                  }`
                }
                value={option.name}
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
                    {selected ? (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                        <IconCheck stroke={2} size={22} />
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

interface ComboboxProps {
  name: string;
  label: string;
  value: string[];
  onChange: (value: string[] | null) => void;
  options: SelectOption[];
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
}

export const FormCombobox: React.FC<ComboboxProps> = ({
  name,
  label,
  value,
  onChange,
  options,
  query,
  setQuery,
}) => (
  <div className={`${label === "" ? "" : "space-y-2"}`}>
    <label htmlFor={name} className="text-sm font-medium text-default-700">
      {label}
    </label>
    <Combobox multiple value={value} onChange={onChange}>
      {({ open }) => (
        <div className="relative">
          <ComboboxInput
            className={clsx(
              "w-full rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-default-900",
              "focus:outline-none focus:border-default-500"
            )}
            displayValue={(selected: string[]) =>
              selected
                .map((id) => options.find((option) => option.id === id)?.name)
                .join(", ")
            }
            onChange={(event) => setQuery(event.target.value)}
          />
          <ComboboxButton className="absolute inset-y-0 right-1.5 flex items-center pr-2 text-default-500">
            <IconChevronDown stroke={2} size={20} />
          </ComboboxButton>
          <Transition
            show={open}
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ComboboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none">
              {options.length === 0 ||
              (options.length > 0 &&
                query !== "" &&
                options.filter((option) =>
                  option.name.toLowerCase().includes(query.toLowerCase())
                ).length === 0) ? (
                <div className="relative cursor-default select-none py-2 px-4 text-default-700">
                  No {name}s found.
                </div>
              ) : (
                options
                  .filter((option) =>
                    option.name.toLowerCase().includes(query.toLowerCase())
                  )
                  .map((option) => (
                    <ComboboxOption
                      key={option.id}
                      className={({ active }) =>
                        `relative cursor-pointer select-none rounded py-2 px-4 ${
                          active ? "bg-default-100" : "text-default-900"
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
                          {selected ? (
                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                              <IconCheck stroke={2} size={22} />
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
      )}
    </Combobox>
  </div>
);
