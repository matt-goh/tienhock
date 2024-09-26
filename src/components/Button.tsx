import React from "react";
import { Icon } from "@tabler/icons-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  icon?: Icon;
  iconPosition?: "left" | "right";
  iconSize?: number;
  iconStroke?: number;
  variant?: "default" | "outline" | "boldOutline";
  size?: "sm" | "md" | "lg";
  additionalClasses?: string;
}

const Button: React.FC<ButtonProps> = ({
  children,
  icon: Icon,
  iconPosition = "left",
  iconSize = 18,
  iconStroke = 1.5,
  variant = "default",
  size = "md",
  className = "",
  additionalClasses = "",
  ...props
}) => {
  const baseClasses = "font-medium rounded-full transition-colors duration-200";

  const variantClasses = {
    default:
      "bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-800 active:bg-gray-300 active:text-gray-900",
    outline:
      "border text-gray-700 hover:bg-gray-100 hover:text-gray-800 active:bg-gray-200 active:text-gray-900",
    boldOutline:
      "border border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-800 active:bg-gray-200 active:text-gray-900",
  };

  const sizeClasses = {
    sm: "px-3 py-1 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-5 py-2",
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className} ${additionalClasses}`;

  return (
    <button className={classes} {...props}>
      <span className="flex items-center justify-center">
        {Icon && iconPosition === "left" && (
          <Icon stroke={iconStroke} size={iconSize} className="mr-2" />
        )}
        {children}
        {Icon && iconPosition === "right" && (
          <Icon stroke={iconStroke} size={iconSize} className="ml-2" />
        )}
      </span>
    </button>
  );
};

export default Button;
