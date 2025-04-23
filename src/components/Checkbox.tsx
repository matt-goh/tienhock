import React from "react";
import { IconSquare, IconSquareCheckFilled } from "@tabler/icons-react";
import clsx from "clsx";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: number;
  checkedColor?: string;
  uncheckedColor?: string;
  disabled?: boolean;
  label?: React.ReactNode;
  labelPosition?: "left" | "right";
  className?: string;
  buttonClassName?: string;
  role?: string;
  ariaLabel?: string;
  ariaChecked?: boolean | "mixed";
}

const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  size = 20,
  checkedColor = "text-blue-600",
  uncheckedColor = "text-default-400",
  disabled = false,
  label,
  labelPosition = "right",
  className = "",
  buttonClassName = "",
  role = "checkbox",
  ariaLabel,
  ariaChecked,
}) => {
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const containerClasses = clsx(
    "inline-flex items-center",
    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
    className
  );

  const buttonClasses = clsx(
    "flex items-center justify-center focus:outline-none transition-colors duration-200",
    !disabled && "hover:bg-gray-100",
    buttonClassName
  );

  const renderCheckbox = () => (
    <div className="flex-shrink-0">
      {checked ? (
        <IconSquareCheckFilled
          width={size}
          height={size}
          className={checkedColor}
          aria-hidden="true"
        />
      ) : (
        <IconSquare
          width={size}
          height={size}
          stroke={1.5}
          className={clsx(
            uncheckedColor,
            !disabled && "hover:text-blue-500 transition-colors"
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );

  return (
    <div className={containerClasses}>
      {label && labelPosition === "left" && (
        <span className="mr-2 text-sm font-medium text-default-700">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        className={buttonClasses}
        disabled={disabled}
        role={role}
        aria-checked={ariaChecked !== undefined ? ariaChecked : checked}
        aria-label={ariaLabel}
      >
        {renderCheckbox()}
      </button>
      {label && labelPosition === "right" && (
        <span className="ml-2 text-sm font-medium text-default-700">
          {label}
        </span>
      )}
    </div>
  );
};

export default Checkbox;
