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
  // Track all options we've seen to ensure we can display selected items
  const [seenOptions, setSeenOptions] = useState<Record<string, SelectOption>>(
    {}
  );

  // Add current options to our seen options record
  useEffect(() => {
    const newSeenOptions = { ...seenOptions };
    let hasNewOptions = false;

    options.forEach((option) => {
      if (!newSeenOptions[option.id]) {
        newSeenOptions[option.id] = option;
        hasNewOptions = true;
      }
    });

    // Only update state if we have new options
    if (hasNewOptions) {
      setSeenOptions(newSeenOptions);
    }
  }, [options]);

  // Combine current options with all previously seen selected options
  const selectedOptions = value.map((id) => {
    // Find in current options first
    const option = options.find((opt) => opt.id === id);
    if (option) return option;

    // Then look in our seen options record
    if (seenOptions[id]) return seenOptions[id];

    // If we still don't have it, use a fallback
    return { id, name: id };
  });

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
        className="block text-sm font-medium text-default-700 dark:text-gray-200"
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
              "relative w-full cursor-default overflow-hidden rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-left shadow-sm",
              "focus-within:ring-1 focus-within:ring-sky-500 focus-within:border-sky-500",
              disabled ? "bg-gray-50 dark:bg-gray-800" : ""
            )}
          >
            <ComboboxInput
              id={`${name}-input`}
              className={clsx(
                "w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 dark:text-gray-100 dark:bg-transparent focus:ring-0",
                disabled ? "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed" : ""
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
                className="text-gray-400 dark:text-gray-500"
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
            <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-700 focus:outline-none sm:text-sm">
              {isLoading && query !== "" && (
                <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-300">
                  Loading...
                </div>
              )}
              {!isLoading && filteredOptions.length === 0 && query !== "" ? (
                <div className="relative cursor-default select-none py-2 px-4 text-gray-700 dark:text-gray-300">
                  Nothing found.
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <ComboboxOption
                    key={option.id}
                    value={option}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-3 pr-10 ${
                        active ? "bg-sky-100 dark:bg-sky-900 text-sky-900 dark:text-sky-100" : "text-gray-900 dark:text-gray-100"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <div className="flex items-center">
                        <div
                          className={`w-4 h-4 mr-2 border ${
                            selected
                              ? "bg-sky-500 border-sky-500"
                              : "border-gray-300 dark:border-gray-500"
                          } rounded flex items-center justify-center`}
                        >
                          {selected && (
                            <IconCheck size={12} className="text-white" />
                          )}
                        </div>
                        <span className="block truncate">{option.name}</span>
                        <span className="text-xs ml-2 text-gray-500 dark:text-gray-400">
                          ({option.id})
                        </span>
                      </div>
                    )}
                  </ComboboxOption>
                ))
              )}
              {/* Load More Button */}
              {!isLoading && hasMore && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="w-full text-center py-1.5 px-4 text-sm font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/50 rounded-md hover:bg-sky-100 dark:hover:bg-sky-900 transition-colors duration-200 disabled:opacity-50 flex items-center justify-center"
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
              className="bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300 text-xs px-2 py-1 rounded-full flex items-center"
            >
              <span className="truncate max-w-[150px]" title={option.name}>
                {option.name}
              </span>
              <button
                className="ml-1 text-sky-500 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300"
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
