import React, { Fragment } from 'react';
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

interface SelectOption {
  id: string;
  name: string;
}

interface InputProps {
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}

export const FormInput: React.FC<InputProps> = ({ name, label, value, onChange, type = "text" }) => (
  <div className="space-y-2">
    <label htmlFor={name} className="text-sm font-medium text-gray-700">
      {label}
    </label>
    <input
      type={type}
      id={name}
      name={name}
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
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

export const FormListbox: React.FC<ListboxProps> = ({ name, label, value, onChange, options }) => (
  <div className="space-y-2">
    <label htmlFor={name} className="text-sm font-medium text-gray-700">
      {label}
    </label>
    <Listbox
      value={value}
      onChange={onChange}
    >
      <div className="relative mt-1">
        <ListboxButton
          className={clsx(
            "relative w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-left",
            "focus:outline-none focus:border-gray-400"
          )}
        >
          <span className="block truncate">{value || "Select"}</span>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <IconChevronDown size={20} className="text-gray-500" />
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
                    active ? "bg-gray-100" : "text-gray-900"
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
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-600">
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

export const FormCombobox: React.FC<ComboboxProps> = ({ name, label, value, onChange, options, query, setQuery }) => (
  <div className="space-y-2">
    <label htmlFor={name} className="text-sm font-medium text-gray-700">
      {label}
    </label>
    <Combobox
      multiple
      value={value}
      onChange={onChange}
    >
      {({ open }) => (
        <div className="relative mt-1">
          <ComboboxInput
            className={clsx(
              "w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-gray-900",
              "focus:outline-none focus:border-gray-400"
            )}
            displayValue={(selected: string[]) =>
              selected
                .map((id) => options.find((option) => option.id === id)?.name)
                .join(", ")
            }
            onChange={(event) => setQuery(event.target.value)}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500">
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
                <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
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
                          active ? "bg-gray-100" : "text-gray-900"
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
                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-600">
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