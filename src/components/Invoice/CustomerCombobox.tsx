// src/components/Invoice/CustomerCombobox.tsx
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
  Transition,
} from "@headlessui/react";
import { IconChevronDown, IconCheck, IconArrowDown } from "@tabler/icons-react";
import { useState, useEffect, Fragment } from "react";
import clsx from "clsx";

interface SelectOption {
  id: string;
  name: string;
}

// --- UPDATED INTERFACE ---
interface ComboboxProps {
  name: string;
  label: string;
  value: SelectOption | null; // <-- Changed from string[] to SelectOption | null
  onChange: (value: SelectOption | null) => void; // Pass back the selected object or null
  options: SelectOption[];
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export const CustomerCombobox: React.FC<ComboboxProps> = ({
  name,
  label,
  value, // Now receives SelectOption | null
  onChange,
  options,
  query,
  setQuery,
  onLoadMore,
  hasMore,
  isLoading,
  placeholder = "Search or select customer...",
  disabled = false,
}) => {
  // Internal state to manage the selected option object for the Combobox component
  // Initialize directly from the prop 'value'
  const [selectedOption, setSelectedOption] = useState<SelectOption | null>(
    value
  );

  // Sync internal selection with external value if it changes
  useEffect(() => {
    // Only update if the prop value is different from the internal state
    if (
      value?.id !== selectedOption?.id ||
      value?.name !== selectedOption?.name
    ) {
      setSelectedOption(value);
    }
  }, [value, selectedOption]); // Depend on prop 'value'

  const handleSelectionChange = (option: SelectOption | null) => {
    setSelectedOption(option); // Update internal state
    onChange(option); // Pass the full selected option object back
    // setQuery(option ? option.name : ''); // Optional: update parent query state on selection
  };

  const filteredOptions =
    query === ""
      ? options
      : options.filter(
          (option) =>
            option.name.toLowerCase().includes(query.toLowerCase()) ||
            option.id.toLowerCase().includes(query.toLowerCase())
        );

  return (
    <div className="space-y-2">
      <label
        htmlFor={`${name}-input`}
        className="block text-sm font-medium text-default-700"
      >
        {label}
      </label>
      {/* The Combobox 'value' prop now correctly matches 'selectedOption' type */}
      <Combobox
        value={selectedOption}
        onChange={handleSelectionChange}
        disabled={disabled}
        name={name}
      >
        <div className="relative">
          <div
            className={clsx(
              "relative w-full cursor-default overflow-hidden rounded-lg border border-default-300 bg-white text-left shadow-sm",
              "focus-within:ring-1 focus-within:ring-sky-500 focus-within:border-sky-500",
              disabled ? "bg-gray-50" : ""
            )}
          >
            <ComboboxInput
              as="input"
              id={`${name}-input`}
              className={clsx(
                "w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0",
                disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""
              )}
              // Display value based on the internal selectedOption state
              displayValue={(option: SelectOption | null) =>
                option ? `${option.name} (${option.id})` : ""
              }
              onChange={(event) => setQuery(event.target.value)} // Update parent query state on input change
              placeholder={placeholder}
              disabled={disabled}
            />
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                size={20}
                className="text-gray-400"
                aria-hidden="true"
              />
            </ComboboxButton>
          </div>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => {
              // Clear query only if the input text doesn't match the selected name
              // This prevents clearing the query when clicking away after selecting
              // if (query !== (selectedOption?.name ?? '')) {
              //     setQuery('');
              // }
            }}
          >
            <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
              {isLoading && query !== "" && (
                <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                  Loading...
                </div>
              )}
              {!isLoading && filteredOptions.length === 0 && query !== "" ? (
                <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                  Nothing found.
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <ComboboxOption
                    key={option.id}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-3 pr-10 ${
                        active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                      }`
                    }
                    value={option} // Pass the whole option object
                  >
                    {({ selected, active }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          {option.name}{" "}
                          <span className="text-gray-500">({option.id})</span>
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
              {/* Load More Button - Prettier Version */}
              {!isLoading && hasMore && (
                <div className="border-t border-gray-200 p-2">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="w-full text-center py-1.5 px-4 text-sm font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100 transition-colors duration-200 disabled:opacity-50 flex items-center justify-center"
                    disabled={isLoading}
                  >
                    <IconArrowDown size={16} className="mr-1.5" />
                    <span>Load More Customers</span>
                  </button>
                </div>
              )}
            </ComboboxOptions>
          </Transition>
        </div>
      </Combobox>
    </div>
  );
};
