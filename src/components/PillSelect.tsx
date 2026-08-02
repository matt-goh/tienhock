// src/components/PillSelect.tsx
import React from "react";

export interface PillSelectOption<T extends string> {
  value: T;
  label: string;
  // Shown as a tooltip when the pill label is an abbreviation (e.g. TGA)
  title?: string;
  disabled?: boolean;
}

interface PillSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<PillSelectOption<T>>;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * Single-select pill row, styled like the Journal Entries filter pills but
 * behaving as a radio group: exactly one option is selected at a time and a
 * pill can never be toggled back off.
 */
const PillSelect = <T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  ariaLabel,
  className = "",
}: PillSelectProps<T>): React.ReactElement => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    className={`flex flex-wrap items-center gap-1.5 ${className}`}
  >
    {options.map((option: PillSelectOption<T>): React.ReactNode => {
      const active: boolean = option.value === value;
      const isDisabled: boolean = disabled || option.disabled === true;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={active}
          title={option.title}
          disabled={isDisabled}
          onClick={(): void => {
            if (!active) onChange(option.value);
          }}
          className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors select-none whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${
            active
              ? "border-sky-500 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
              : "border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700"
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export default PillSelect;
