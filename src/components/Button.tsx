// src/components/Button.tsx
import React from "react";
import { Icon } from "@tabler/icons-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
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
        "bg-default-100 text-default-700 hover:text-default-800 hover:bg-default-200 active:bg-default-300/75 disabled:hover:bg-default-100 disabled:hover:text-default-700",
      outline:
        "border border-default-300 text-default-700 hover:text-default-800 hover:bg-default-100 active:bg-default-200 disabled:hover:bg-transparent disabled:hover:text-default-700",
      boldOutline:
        "border-2 border-default-300 text-default-700 hover:text-default-800 hover:bg-default-100 active:bg-default-200 disabled:hover:bg-transparent disabled:hover:text-default-700",
      filled:
        "bg-default-700 text-white hover:bg-default-800 active:bg-default-900 disabled:hover:bg-default-700",
    },
    sky: {
      default:
        "bg-sky-100 text-sky-700 hover:text-sky-800 hover:bg-sky-200 active:bg-sky-300/75 disabled:hover:bg-sky-100 disabled:hover:text-sky-700",
      outline:
        "border border-sky-300 text-sky-700 hover:text-sky-800 hover:bg-sky-100 active:bg-sky-200 disabled:hover:bg-transparent disabled:hover:text-sky-700",
      boldOutline:
        "border-2 border-sky-300 text-sky-700 hover:text-sky-800 hover:bg-sky-100 active:bg-sky-200 disabled:hover:bg-transparent disabled:hover:text-sky-700",
      filled:
        "bg-sky-500 text-white hover:bg-sky-600 active:bg-sky-700 disabled:hover:bg-sky-500",
    },
    rose: {
      default:
        "bg-rose-100 text-rose-700 hover:text-rose-800 hover:bg-rose-200 active:bg-rose-300/75 disabled:hover:bg-rose-100 disabled:hover:text-rose-700",
      outline:
        "border border-rose-300 text-rose-700 hover:text-rose-800 hover:bg-rose-100 active:bg-rose-200 disabled:hover:bg-transparent disabled:hover:text-rose-700",
      boldOutline:
        "border-2 border-rose-300 text-rose-700 hover:text-rose-800 hover:bg-rose-100 active:bg-rose-200 disabled:hover:bg-transparent disabled:hover:text-rose-700",
      filled:
        "bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700 disabled:hover:bg-rose-500",
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
            className="mr-2 flex-shrink-0"
          />
        )}
        <span className="truncate">{children}</span>
        {Icon && iconPosition === "right" && (
          <Icon
            stroke={iconStroke}
            size={iconSize}
            className="ml-2 flex-shrink-0"
          />
        )}
      </span>
    </button>
  );
};

export default Button;
