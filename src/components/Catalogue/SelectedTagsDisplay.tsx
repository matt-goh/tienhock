// src/components/SelectedTagsDisplay.tsx
import React from "react";

interface SelectedTagsDisplayProps {
  selectedItems: string[];
  label: string;
  className?: string;
}

const SelectedTagsDisplay: React.FC<SelectedTagsDisplayProps> = ({
  selectedItems,
  label,
  className = "",
}) => {
  if (!selectedItems || selectedItems.length === 0) {
    return null;
  }

  return (
    <div className={`mt-2 ${className}`}>
      <div className="text-xs text-default-500 mb-1">Selected {label}:</div>
      <div className="flex flex-wrap gap-1.5">
        {selectedItems.map((item, index) => (
          <span
            key={index}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

export default SelectedTagsDisplay;
