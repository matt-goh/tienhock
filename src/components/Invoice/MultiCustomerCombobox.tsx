// src/components/Invoice/MultiCustomerCombobox.tsx
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
  Transition,
} from "@headlessui/react";
import { IconChevronDown, IconCheck, IconArrowDown } from "@tabler/icons-react";
import { Fragment } from "react";
import clsx from "clsx";

interface SelectOption {
  id: string;
  name: string;
}

interface ComboboxProps {
  name: string;
  label: string;
  value: string[]; // Array of IDs for multiple selection
  onChange: (value: string[]) => void;
  options: SelectOption[];
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export const MultiCustomerCombobox: React.FC<ComboboxProps> = ({
  name,
  label,
  value,
  onChange,
  options,
  query,
  setQuery,
  onLoadMore,
  hasMore,
  isLoading,
  placeholder = "Search or select customers...",
  disabled = false,
}) => {
  // Find selected options based on IDs
  const selectedOptions = options.filter((option) => value.includes(option.id));

  const filteredOptions =
    query === ""
      ? options
      : options.filter(
          (option) =>
            option.name.toLowerCase().includes(query.toLowerCase()) ||
            option.id.toLowerCase().includes(query.toLowerCase())
        );

  // Handle removing an option from the selected pills
  const removeOption = (optionId: string) => {
    onChange(value.filter((id) => id !== optionId));
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={`${name}-input`}
        className="block text-sm font-medium text-default-700"
      >
        {label}
      </label>
      <div className="relative">
        <Combobox
          value={selectedOptions}
          onChange={(newSelectedOptions: SelectOption[]) => {
            // Extract IDs from the selected options array
            onChange(newSelectedOptions.map((option) => option.id));
          }}
          multiple
        >
          <div
            className={clsx(
              "relative w-full cursor-default overflow-hidden rounded-lg border border-default-300 bg-white text-left shadow-sm",
              "focus-within:ring-1 focus-within:ring-sky-500 focus-within:border-sky-500",
              disabled ? "bg-gray-50" : ""
            )}
          >
            <ComboboxInput
              id={`${name}-input`}
              className={clsx(
                "w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0",
                disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""
              )}
              onChange={(event) => setQuery(event.target.value)}
              displayValue={() =>
                selectedOptions.length > 0
                  ? `${selectedOptions.length} selected`
                  : ""
              }
              placeholder={
                selectedOptions.length > 0
                  ? `${selectedOptions.length} selected`
                  : placeholder
              }
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
            afterLeave={() => setQuery("")}
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
                    value={option}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-3 pr-10 ${
                        active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <div className="flex items-center">
                        <div
                          className={`w-4 h-4 mr-2 border ${
                            selected
                              ? "bg-sky-500 border-sky-500"
                              : "border-gray-300"
                          } rounded flex items-center justify-center`}
                        >
                          {selected && (
                            <IconCheck size={12} className="text-white" />
                          )}
                        </div>
                        <span className="block truncate">{option.name}</span>
                        <span className="text-xs ml-2 text-gray-500">
                          ({option.id})
                        </span>
                      </div>
                    )}
                  </ComboboxOption>
                ))
              )}
              {/* Load More Button */}
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
        </Combobox>
      </div>
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedOptions.map((option) => (
            <div
              key={option.id}
              className="bg-sky-100 text-sky-800 text-xs px-2 py-1 rounded-full flex items-center"
            >
              <span className="truncate max-w-[150px]" title={option.name}>
                {option.name}
              </span>
              <button
                className="ml-1 text-sky-500 hover:text-sky-700"
                onClick={() => removeOption(option.id)}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
