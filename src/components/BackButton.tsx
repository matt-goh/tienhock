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
    "mb-6 flex items-center font-medium rounded-full text-gray-600/90 hover:text-gray-900 hover:font-semibold";
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
