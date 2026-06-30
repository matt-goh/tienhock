import React, { Fragment } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton as HeadlessComboboxButton,
  ComboboxOptions,
  ComboboxOption,
  Transition,
} from "@headlessui/react";
import {
  IconCheck,
  IconChevronDown,
  IconLoader2,
} from "@tabler/icons-react";
import clsx from "clsx";
import type { GeneralStockRow } from "../../types/types";

interface GeneralStockItemComboboxProps {
  name: string;
  label: string;
  selectedRow: GeneralStockRow | null;
  rows: GeneralStockRow[];
  query: string;
  onQueryChange: React.Dispatch<React.SetStateAction<string>>;
  onChange: (value: string, row: GeneralStockRow | null) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  disabled?: boolean;
  optionsPosition?: "top" | "bottom";
  className?: string;
}

const toNumber = (value: string | number | null | undefined): number => {
  const parsed: number =
    typeof value === "string" ? Number.parseFloat(value) : Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatQty = (amount: string | number | null | undefined): string => {
  return toNumber(amount).toLocaleString("en-MY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
};

const getDisplayValue = (row: GeneralStockRow | null): string => {
  if (!row) return "";
  return `${row.description} - ${row.purchase_no}`;
};

const GeneralStockItemCombobox: React.FC<GeneralStockItemComboboxProps> = ({
  name,
  label,
  selectedRow,
  rows,
  query,
  onQueryChange,
  onChange,
  onLoadMore,
  hasMore,
  loading,
  loadingMore,
  disabled = false,
  optionsPosition = "bottom",
  className = "",
}) => {
  const handleChange = (row: GeneralStockRow | null): void => {
    onChange(row ? String(row.line_id) : "", row);
    onQueryChange("");
  };

  const handleLoadMoreClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    onLoadMore();
  };

  return (
    <div className={clsx("space-y-2", className)}>
      <label
        htmlFor={`${name}-input`}
        className="block truncate text-sm font-medium text-default-700 dark:text-gray-200"
        title={label}
      >
        {label}
      </label>
      <Combobox
        value={selectedRow}
        onChange={handleChange}
        disabled={disabled}
        name={name}
      >
        <div className="relative">
          <div
            className={clsx(
              "relative w-full cursor-default overflow-hidden rounded-lg border border-default-300 bg-white text-left shadow-sm dark:border-gray-600 dark:bg-gray-800",
              "focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 dark:focus-within:ring-sky-400",
              disabled ? "bg-gray-50 dark:bg-gray-700" : ""
            )}
          >
            <ComboboxInput
              id={`${name}-input`}
              displayValue={getDisplayValue}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onQueryChange(event.target.value)
              }
              placeholder="Search stock item..."
              disabled={disabled}
              className={clsx(
                "w-full border-none bg-transparent py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:ring-0 dark:text-gray-100",
                "placeholder-gray-400 dark:placeholder-gray-500",
                disabled
                  ? "cursor-not-allowed bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  : ""
              )}
            />
            <HeadlessComboboxButton
              className="absolute inset-y-0 right-0 flex items-center pr-2"
              onClick={() => onQueryChange("")}
            >
              <IconChevronDown
                size={20}
                className="text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              />
            </HeadlessComboboxButton>
          </div>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => onQueryChange("")}
          >
            <ComboboxOptions
              className={clsx(
                "absolute z-20 max-h-72 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800 dark:ring-gray-700 sm:text-sm",
                optionsPosition === "top" ? "bottom-full mb-1" : "mt-1"
              )}
            >
              <ComboboxOption
                value={null}
                className={({ active }) =>
                  clsx(
                    "relative cursor-default select-none border-b border-default-100 py-2 pl-3 pr-10 dark:border-gray-700",
                    active
                      ? "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200"
                      : "text-gray-900 dark:text-gray-100"
                  )
                }
              >
                {({ selected }) => (
                  <>
                    <span
                      className={clsx(
                        "block truncate",
                        selected ? "font-medium" : "font-normal"
                      )}
                    >
                      New General stock item
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                        <IconCheck size={20} aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </ComboboxOption>

              {loading && rows.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-default-500 dark:text-gray-400">
                  <IconLoader2 size={16} className="animate-spin" />
                  Loading stock items...
                </div>
              ) : rows.length === 0 ? (
                <div className="px-3 py-2 text-sm text-default-500 dark:text-gray-400">
                  {query.trim()
                    ? "No matching stock items."
                    : "No stock items found."}
                </div>
              ) : (
                rows.map((row: GeneralStockRow) => (
                  <ComboboxOption
                    key={row.line_id}
                    value={row}
                    className={({ active }) =>
                      clsx(
                        "relative cursor-default select-none py-2 pl-3 pr-10",
                        active
                          ? "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200"
                          : "text-gray-900 dark:text-gray-100"
                      )
                    }
                  >
                    {({ active, selected }) => (
                      <>
                        <div className="min-w-0 pr-2">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <span
                              className={clsx(
                                "min-w-0 flex-1 truncate",
                                selected ? "font-medium" : "font-normal"
                              )}
                              title={row.description}
                            >
                              {row.description}
                            </span>
                            <span
                              className={clsx(
                                "shrink-0 font-mono text-xs tabular-nums",
                                active
                                  ? "text-sky-700 dark:text-sky-300"
                                  : "text-default-500 dark:text-gray-400"
                              )}
                            >
                              Qty {formatQty(row.current_stock)}
                            </span>
                          </div>
                          <div
                            className={clsx(
                              "mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-xs",
                              active
                                ? "text-sky-700 dark:text-sky-300"
                                : "text-default-500 dark:text-gray-400"
                            )}
                          >
                            <span className="font-mono">{row.purchase_no}</span>
                            <span>{row.purchase_date}</span>
                            <span className="truncate">
                              {row.supplier_name || "-"}
                            </span>
                          </div>
                        </div>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600 dark:text-sky-400">
                            <IconCheck size={20} aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ComboboxOption>
                ))
              )}

              {hasMore && (
                <div className="border-t border-default-100 p-1 dark:border-gray-700">
                  <button
                    type="button"
                    onMouseDown={(
                      event: React.MouseEvent<HTMLButtonElement>
                    ) => event.preventDefault()}
                    onClick={handleLoadMoreClick}
                    disabled={loadingMore}
                    className="flex w-full items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-default-400 dark:text-sky-300 dark:hover:bg-sky-900/20 dark:disabled:text-gray-500"
                  >
                    {loadingMore && (
                      <IconLoader2 size={16} className="animate-spin" />
                    )}
                    {loadingMore ? "Loading..." : "Load more..."}
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

export default GeneralStockItemCombobox;
