// src/components/BackButton.tsx
import React from "react";
import { IconChevronLeft } from "@tabler/icons-react";

interface BackButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void;
  className?: string;
  children?: React.ReactNode;
}

const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  className = "",
  children = "Back",
  ...props
}) => {
  const baseClasses =
    "flex items-center font-medium rounded-full text-default-600/90 dark:text-gray-300 hover:text-default-900 dark:hover:text-gray-100 hover:font-semibold";
  const combinedClasses = `${baseClasses} ${className}`.trim();

  return (
    <button
      onClick={onClick}
      className={combinedClasses}
      type="button"
      {...props}
    >
      <IconChevronLeft className="mr-1 hover:font-semibold" size={20} />
      {children}
    </button>
  );
};

export default BackButton;
