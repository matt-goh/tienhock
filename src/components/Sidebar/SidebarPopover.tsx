// src/components/Sidebar/SidebarPopover.tsx
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

interface SidebarPopoverProps {
  options: { name: string; path: string }[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  buttonRef: React.RefObject<HTMLElement>;
}

const SidebarPopover: React.FC<SidebarPopoverProps> = ({
  options,
  onMouseEnter,
  onMouseLeave,
  buttonRef,
}) => {
  const navigate = useNavigate();
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null); // Changed to null initially
  const [isPositioned, setIsPositioned] = useState(false); // Track if positioned

  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft =
          window.scrollX || document.documentElement.scrollLeft;

        setPosition({
          top: rect.top + scrollTop,
          left: rect.right + scrollLeft + 16,
        });
        setIsPositioned(true); // Mark as positioned
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [buttonRef]);

  // Don't render until position is calculated
  if (!position || !isPositioned) {
    return null;
  }

  const popoverContent = (
    <div
      className="absolute z-[999] w-auto bg-white text-default-700 font-medium border border-default-200 shadow-lg rounded-lg p-1 transition-opacity duration-75"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        opacity: isPositioned ? 1 : 0, // Additional safety with opacity
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ul>
        {options.map((option, index) => (
          <li key={index}>
            <div
              onClick={() => navigate(option.path)}
              className="block py-2 px-4 hover:bg-default-200/90 active:bg-default-300/90 transition-colors duration-200 rounded-lg cursor-pointer"
            >
              {option.name}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  return createPortal(popoverContent, document.body);
};

export default SidebarPopover;
