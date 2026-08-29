// src/components/PillSelect.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import { IconTargetArrow } from "@tabler/icons-react";

export interface PillSelectOption<T extends string> {
  value: T;
  label: string;
  secondaryLabel?: string;
  // Shown as a tooltip when the pill label is an abbreviation (e.g. TGA)
  title?: string;
  disabled?: boolean;
  activeClassName?: string;
}

export interface PillSelectEmptyOption {
  label: string;
  title?: string;
}

// "sm" is the compact filter/table pill. "md" matches the 38px-tall bordered
// form inputs it sits beside, so a pill row reads as a field of the same weight
// rather than a lighter control floating next to one.
export type PillSelectSize = "sm" | "md";
export type PillSelectRounded = "full" | "lg";

const SIZE_CLASSNAMES: Record<PillSelectSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-[7px] text-sm leading-5",
};

const ROW_CLASSNAMES: Record<PillSelectSize, string> = {
  sm: "gap-1.5",
  md: "gap-2 min-h-[38px]",
};

const ROUNDED_CLASSNAMES: Record<PillSelectRounded, string> = {
  full: "rounded-full",
  lg: "rounded-lg",
};

const SELECT_ONLY_CLASSNAMES: Record<PillSelectSize, string> = {
  sm: "p-1",
  md: "p-[7px]",
};

const SELECT_ONLY_ICON_SIZES: Record<PillSelectSize, number> = {
  sm: 14,
  md: 16,
};

interface PillSelectBaseProps<T extends string> {
  options: ReadonlyArray<PillSelectOption<T>>;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  size?: PillSelectSize;
  rounded?: PillSelectRounded;
}

interface SinglePillSelectProps<T extends string>
  extends PillSelectBaseProps<T> {
  selectionMode?: "single";
  value: T;
  onChange: (value: T) => void;
}

interface MultiplePillSelectProps<T extends string>
  extends PillSelectBaseProps<T> {
  selectionMode: "multiple";
  value: ReadonlyArray<T>;
  onChange: (value: T[]) => void;
  showSelectOnly?: boolean;
  emptyOption?: PillSelectEmptyOption;
}

type PillSelectProps<T extends string> =
  | SinglePillSelectProps<T>
  | MultiplePillSelectProps<T>;

/**
 * Pill row that defaults to a single-select radio group. In multiple mode,
 * each pill toggles independently and can optionally include a compact
 * "Select only" action that clears the other selections.
 *
 * In single mode, a `value` that matches no option renders with nothing
 * highlighted. That is the neutral state the daily-log "SET ALL" leave
 * control relies on, where the pseudo-value "mixed" means the selected
 * workers do not share one type.
 */
const PillSelect = <T extends string,>(
  props: PillSelectProps<T>
): React.ReactElement => {
  const { t } = useTranslation("common");
  const {
    options,
    disabled = false,
    ariaLabel,
    className = "",
    size = "sm",
    rounded = "full",
  } = props;
  const isMultiple: boolean = props.selectionMode === "multiple";
  const roundedClassName: string = ROUNDED_CLASSNAMES[rounded];

  const handleToggle = (
    option: PillSelectOption<T>,
    active: boolean
  ): void => {
    if (disabled || option.disabled === true) return;

    if (props.selectionMode === "multiple") {
      const nextValue: T[] = active
        ? props.value.filter((value: T): boolean => value !== option.value)
        : [...props.value, option.value];
      props.onChange(nextValue);
      return;
    }

    if (!active) props.onChange(option.value);
  };

  return (
    <div
      role={isMultiple ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center ${ROW_CLASSNAMES[size]} ${className}`}
    >
      {props.selectionMode === "multiple" && props.emptyOption ? (
        <button
          type="button"
          aria-pressed={props.value.length === 0}
          aria-label={props.emptyOption.label}
          title={props.emptyOption.title}
          disabled={disabled}
          onClick={(): void => {
            if (props.value.length > 0) props.onChange([]);
          }}
          className={`${SIZE_CLASSNAMES[size]} ${roundedClassName} border font-medium transition-colors select-none whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${
            props.value.length === 0
              ? "border-sky-500 bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
              : "border-default-300 text-default-700 hover:bg-default-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          {props.emptyOption.label}
        </button>
      ) : null}

      {options.map((option: PillSelectOption<T>): React.ReactNode => {
        const active: boolean =
          props.selectionMode === "multiple"
            ? props.value.includes(option.value)
            : option.value === props.value;
        const isDisabled: boolean = disabled || option.disabled === true;
        const activeClassName: string =
          option.activeClassName ??
          "border-sky-500 bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
        const inactiveClassName: string =
          "border-default-300 text-default-700 hover:bg-default-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700";
        const stateClassName: string = active
          ? activeClassName
          : inactiveClassName;
        const displayLabel: React.ReactNode = option.secondaryLabel ? (
          <>
            <span className="font-semibold">{option.label}</span>
            <span className="ml-1 font-normal opacity-75">
              {option.secondaryLabel}
            </span>
          </>
        ) : (
          option.label
        );

        if (
          props.selectionMode === "multiple" &&
          props.showSelectOnly === true
        ) {
          const isOnlySelected: boolean =
            active && props.value.length === 1;
          const optionName: string = option.secondaryLabel
            ? `${option.label} ${option.secondaryLabel}`
            : option.label;
          const selectOnlyTitle: string = t("Show only {{option}}", {
            option: optionName,
          });

          return (
            <span
              key={option.value}
              className={`inline-flex overflow-hidden ${roundedClassName} border transition-colors select-none whitespace-nowrap ${stateClassName} ${
                isDisabled ? "opacity-60" : ""
              }`}
            >
              <button
                type="button"
                aria-pressed={active}
                title={option.title}
                disabled={isDisabled}
                onClick={(): void => handleToggle(option, active)}
                className={`${SIZE_CLASSNAMES[size]} font-medium disabled:cursor-not-allowed`}
              >
                {displayLabel}
              </button>
              <button
                type="button"
                aria-label={selectOnlyTitle}
                title={selectOnlyTitle}
                disabled={isDisabled || isOnlySelected}
                onClick={(): void => props.onChange([option.value])}
                className={`${SELECT_ONLY_CLASSNAMES[size]} border-l border-current/20 hover:bg-black/5 disabled:cursor-default disabled:opacity-40 dark:hover:bg-white/10`}
              >
                <IconTargetArrow
                  size={SELECT_ONLY_ICON_SIZES[size]}
                  stroke={1.8}
                  aria-hidden="true"
                />
              </button>
            </span>
          );
        }

        return (
          <button
            key={option.value}
            type="button"
            role={isMultiple ? undefined : "radio"}
            aria-checked={isMultiple ? undefined : active}
            aria-pressed={isMultiple ? active : undefined}
            title={option.title}
            disabled={isDisabled}
            onClick={(): void => handleToggle(option, active)}
            className={`${SIZE_CLASSNAMES[size]} ${roundedClassName} border font-medium transition-colors select-none whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${stateClassName}`}
          >
            {displayLabel}
          </button>
        );
      })}
    </div>
  );
};

export default PillSelect;
