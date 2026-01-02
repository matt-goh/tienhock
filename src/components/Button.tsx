// src/components/Button.tsx
import React from "react";
import { Icon } from "@tabler/icons-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  icon?: Icon;
  iconPosition?: "left" | "right";
  iconSize?: number;
  iconStroke?: number;
  variant?: "default" | "outline" | "boldOutline" | "filled";
  size?: "sm" | "md" | "lg";
  color?: string;
  additionalClasses?: string;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  icon: Icon,
  iconPosition = "left",
  iconSize = 18,
  iconStroke = 1.5,
  variant = "default",
  size = "md",
  color = "default",
  className = "",
  additionalClasses = "",
  disabled = false,
  ...props
}) => {
  const baseClasses =
    "font-medium rounded-full transition-colors duration-200 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  const colorClasses = {
    default: {
      default:
        "bg-default-100 dark:bg-gray-700 text-default-700 dark:text-gray-200 hover:text-default-800 dark:hover:text-gray-100 hover:bg-default-200 dark:hover:bg-gray-600 active:bg-default-300/75 dark:active:bg-gray-500 disabled:hover:bg-default-100 dark:disabled:hover:bg-gray-700 disabled:hover:text-default-700 dark:disabled:hover:text-gray-200",
      outline:
        "border border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:text-default-800 dark:hover:text-gray-100 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 disabled:hover:bg-transparent disabled:hover:text-default-700 dark:disabled:hover:text-gray-200",
      boldOutline:
        "border-2 border-default-300 dark:border-gray-600 text-default-700 dark:text-gray-200 hover:text-default-800 dark:hover:text-gray-100 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 disabled:hover:bg-transparent disabled:hover:text-default-700 dark:disabled:hover:text-gray-200",
      filled:
        "bg-default-700 dark:bg-gray-600 text-white hover:bg-default-800 dark:hover:bg-gray-500 active:bg-default-900 dark:active:bg-gray-400 disabled:hover:bg-default-700 dark:disabled:hover:bg-gray-600",
    },
    sky: {
      default:
        "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200 hover:bg-sky-200 dark:hover:bg-sky-800/50 active:bg-sky-300/75 dark:active:bg-sky-700/50 disabled:hover:bg-sky-100 dark:disabled:hover:bg-sky-900/40 disabled:hover:text-sky-700 dark:disabled:hover:text-sky-300",
      outline:
        "border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/40 active:bg-sky-200 dark:active:bg-sky-800/50 disabled:hover:bg-transparent disabled:hover:text-sky-700 dark:disabled:hover:text-sky-300",
      boldOutline:
        "border-2 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/40 active:bg-sky-200 dark:active:bg-sky-800/50 disabled:hover:bg-transparent disabled:hover:text-sky-700 dark:disabled:hover:text-sky-300",
      filled:
        "bg-sky-500 dark:bg-sky-600 text-white hover:bg-sky-600 dark:hover:bg-sky-500 active:bg-sky-700 dark:active:bg-sky-400 disabled:hover:bg-sky-500 dark:disabled:hover:bg-sky-600",
    },
    rose: {
      default:
        "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-800/50 active:bg-rose-300/75 dark:active:bg-rose-700/50 disabled:hover:bg-rose-100 dark:disabled:hover:bg-rose-900/40 disabled:hover:text-rose-700 dark:disabled:hover:text-rose-300",
      outline:
        "border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/40 active:bg-rose-200 dark:active:bg-rose-800/50 disabled:hover:bg-transparent disabled:hover:text-rose-700 dark:disabled:hover:text-rose-300",
      boldOutline:
        "border-2 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/40 active:bg-rose-200 dark:active:bg-rose-800/50 disabled:hover:bg-transparent disabled:hover:text-rose-700 dark:disabled:hover:text-rose-300",
      filled:
        "bg-rose-500 dark:bg-rose-600 text-white hover:bg-rose-600 dark:hover:bg-rose-500 active:bg-rose-700 dark:active:bg-rose-400 disabled:hover:bg-rose-500 dark:disabled:hover:bg-rose-600",
    },
    teal: {
      default:
        "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200 hover:bg-teal-200 dark:hover:bg-teal-800/50 active:bg-teal-300/75 dark:active:bg-teal-700/50 disabled:hover:bg-teal-100 dark:disabled:hover:bg-teal-900/40 disabled:hover:text-teal-700 dark:disabled:hover:text-teal-300",
      outline:
        "border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-900/40 active:bg-teal-200 dark:active:bg-teal-800/50 disabled:hover:bg-transparent disabled:hover:text-teal-700 dark:disabled:hover:text-teal-300",
      boldOutline:
        "border-2 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-900/40 active:bg-teal-200 dark:active:bg-teal-800/50 disabled:hover:bg-transparent disabled:hover:text-teal-700 dark:disabled:hover:text-teal-300",
      filled:
        "bg-teal-500 dark:bg-teal-600 text-white hover:bg-teal-600 dark:hover:bg-teal-500 active:bg-teal-700 dark:active:bg-teal-400 disabled:hover:bg-teal-500 dark:disabled:hover:bg-teal-600",
    },
  };

  const sizeClasses = {
    sm: "px-3 py-1 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-5 py-2 text-base",
  };

  const getColorClasses = (color: string, variant: string) => {
    return (
      colorClasses[color as keyof typeof colorClasses]?.[
        variant as keyof (typeof colorClasses)[keyof typeof colorClasses]
      ] || colorClasses.default[variant as keyof typeof colorClasses.default]
    );
  };

  const classes = `${baseClasses} ${getColorClasses(color, variant)} ${
    sizeClasses[size]
  } ${className} ${additionalClasses}`;

  return (
    <button className={classes} disabled={disabled} {...props}>
      <span className="flex items-center justify-center w-full">
        {Icon && iconPosition === "left" && (
          <Icon
            stroke={iconStroke}
            size={iconSize}
            className={`${children ? "mr-2" : ""} flex-shrink-0`}
          />
        )}
        {children && <span className="truncate">{children}</span>}
        {Icon && iconPosition === "right" && (
          <Icon
            stroke={iconStroke}
            size={iconSize}
            className={`${children ? "ml-2" : ""} flex-shrink-0`}
          />
        )}
      </span>
    </button>
  );
};

export default Button;
