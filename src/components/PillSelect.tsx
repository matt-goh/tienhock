// src/components/PillSelect.tsx
import React from "react";

export interface PillSelectOption<T extends string> {
  value: T;
  label: string;
  // Shown as a tooltip when the pill label is an abbreviation (e.g. TGA)
  title?: string;
  disabled?: boolean;
}

// "sm" is the compact filter/table pill. "md" matches the 38px-tall bordered
// form inputs it sits beside, so a pill row reads as a field of the same weight
// rather than a lighter control floating next to one.
export type PillSelectSize = "sm" | "md";

const SIZE_CLASSNAMES: Record<PillSelectSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-[7px] text-sm leading-5",
};

const ROW_CLASSNAMES: Record<PillSelectSize, string> = {
  sm: "gap-1.5",
  md: "gap-2 min-h-[38px]",
};

interface PillSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<PillSelectOption<T>>;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  size?: PillSelectSize;
}

/**
 * Single-select pill row, styled like the Journal Entries filter pills but
 * behaving as a radio group: exactly one option is selected at a time and a
 * pill can never be toggled back off.
 *
 * A `value` that matches no option renders with nothing highlighted. That is
 * the neutral state the daily-log "SET ALL" leave control relies on, where the
 * pseudo-value "mixed" means the selected workers do not share one type.
 */
const PillSelect = <T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  ariaLabel,
  className = "",
  size = "sm",
}: PillSelectProps<T>): React.ReactElement => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    className={`flex flex-wrap items-center ${ROW_CLASSNAMES[size]} ${className}`}
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
          className={`${SIZE_CLASSNAMES[size]} font-medium rounded-full border transition-colors select-none whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${
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
