// src/components/BackButton.tsx
import React from "react";
import { IconChevronLeft } from "@tabler/icons-react";
import { useSmartBack } from "../hooks/useSmartBack";

interface BackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Where to go when the page was opened directly (pasted link, refresh, new
   * tab) and there is no in-app page to return to. Pass the page's own list
   * page. When history is available the button returns to the actual previous
   * page instead, so this is only a last resort.
   */
  fallbackPath?: string;
}

const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  fallbackPath,
  className = "",
  children = "Back",
  ...props
}) => {
  const goBack = useSmartBack(fallbackPath);
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

    goBack();
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
