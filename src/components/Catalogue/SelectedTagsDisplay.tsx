// src/components/Catalogue/SelectedTagsDisplay.tsx
import React from "react";
import { Link } from "react-router-dom";

interface SelectedTagsDisplayProps {
  selectedItems: string[];
  label: string;
  className?: string;
  navigable?: boolean; // New prop to control navigation behavior
}

const SelectedTagsDisplay: React.FC<SelectedTagsDisplayProps> = ({
  selectedItems,
  label,
  className = "",
  navigable = false, // Default to non-navigable for backward compatibility
}) => {
  if (!selectedItems || selectedItems.length === 0) {
    return null;
  }

  return (
    <div className={`mt-2 ${className}`}>
      <div className="text-xs text-default-500 dark:text-gray-400 mb-1">Selected {label}:</div>
      <div className="flex flex-wrap gap-1.5">
        {selectedItems.map((item, index) =>
          navigable ? (
            <Link
              key={index}
              to={`/catalogue/job?id=${item}`}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300"
            >
              {item}
            </Link>
          ) : (
            <span
              key={index}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300"
            >
              {item}
            </span>
          )
        )}
      </div>
    </div>
  );
};

export default SelectedTagsDisplay;
