import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useAccountCodesCache } from "../../utils/accounting/useAccountingCache";
import { AccountCode } from "../../types/types";

interface AccountCodeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  filter?: (account: AccountCode) => boolean;
  className?: string;
}

const ACCOUNT_LOAD_INCREMENT = 50;

const AccountCodeCombobox: React.FC<AccountCodeComboboxProps> = ({
  value,
  onChange,
  label,
  required,
  disabled = false,
  placeholder = "Search account...",
  filter,
  className,
}: AccountCodeComboboxProps) => {
  const { accountCodes: allAccountCodes } = useAccountCodesCache();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [loadedCount, setLoadedCount] = useState(ACCOUNT_LOAD_INCREMENT);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const accounts = useMemo(() => {
    const active = allAccountCodes.filter((a: AccountCode) => a.is_active);
    return filter ? active.filter(filter) : active;
  }, [allAccountCodes, filter]);

  const filteredAccounts = useMemo(() => {
    if (!query) return accounts;
    const lowerQuery = query.toLowerCase();
    return accounts.filter(
      (a: AccountCode) =>
        a.code.toLowerCase().includes(lowerQuery) ||
        a.description.toLowerCase().includes(lowerQuery)
    );
  }, [accounts, query]);

  const displayed = filteredAccounts.slice(0, loadedCount);
  const hasMore = displayed.length < filteredAccounts.length;
  const remaining = filteredAccounts.length - displayed.length;

  const selected = accounts.find((a: AccountCode) => a.code === value);
  const displayValue = selected ? `${selected.code} - ${selected.description}` : "";

  useEffect(() => {
    setLoadedCount(ACCOUNT_LOAD_INCREMENT);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (code: string): void => {
    onChange(code);
    setIsOpen(false);
    setQuery("");
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  };

  const inputClassName =
    "w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-default-900 placeholder:text-default-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400";

  return (
    <div className={className}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-default-700 dark:text-gray-200">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <div className="flex">
          <input
            ref={inputRef}
            type="text"
            value={isOpen ? query : displayValue}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setQuery(event.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => !disabled && setIsOpen(true)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={`${inputClassName} pr-8`}
          />
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className="absolute inset-y-0 right-0 flex items-center pr-2 text-default-400 hover:text-default-600 disabled:cursor-not-allowed dark:text-gray-500 dark:hover:text-gray-300"
          >
            <IconChevronDown size={16} />
          </button>
        </div>
        {isOpen && !disabled && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-default-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {displayed.length === 0 ? (
              <div className="px-3 py-2 text-sm text-default-500 dark:text-gray-400">
                No accounts found
              </div>
            ) : (
              displayed.map((account: AccountCode) => (
                <div
                  key={account.code}
                  onClick={() => handleSelect(account.code)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-sky-50 dark:hover:bg-sky-900/50 ${
                    account.code === value
                      ? "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
                      : "text-default-900 dark:text-gray-100"
                  }`}
                >
                  <span>
                    <span className="font-mono">{account.code}</span>
                    <span className="ml-2 text-default-600 dark:text-gray-400">
                      {account.description}
                    </span>
                  </span>
                  {account.code === value && (
                    <IconCheck
                      size={16}
                      className="flex-shrink-0 text-sky-600 dark:text-sky-400"
                    />
                  )}
                </div>
              ))
            )}
            {hasMore && (
              <div className="border-t border-gray-200 p-2 dark:border-gray-700">
                <button
                  type="button"
                  onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setLoadedCount((prev: number) => prev + ACCOUNT_LOAD_INCREMENT);
                  }}
                  className="flex w-full items-center justify-center rounded-md bg-sky-50 px-4 py-1.5 text-center text-sm font-medium text-sky-600 transition-colors duration-200 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50"
                >
                  <IconChevronDown size={16} className="mr-1.5" />
                  <span>Load more ({remaining} remaining)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountCodeCombobox;
