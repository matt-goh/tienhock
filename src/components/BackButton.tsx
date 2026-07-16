// src/components/BackButton.tsx
import React from "react";
import { IconChevronLeft } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

interface BackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  fallbackPath?: string;
}

const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  fallbackPath,
  className = "",
  children = "Back",
  ...props
}) => {
  const navigate = useNavigate();
  const baseClasses =
    "flex items-center font-medium rounded-full text-default-600/90 dark:text-gray-300 hover:text-default-900 dark:hover:text-gray-100 hover:font-semibold";
  const combinedClasses = `${baseClasses} ${className}`.trim();

  const handleClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    if (onClick) {
      onClick(event);
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    if (fallbackPath) navigate(fallbackPath);
  };

  return (
    <button
      onClick={handleClick}
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
