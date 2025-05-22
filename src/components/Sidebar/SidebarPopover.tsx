// SidebarPopover.tsx
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
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft =
          window.scrollX || document.documentElement.scrollLeft;

        setPosition({
          top: rect.top + scrollTop, // Align with the top of the button
          left: rect.right + scrollLeft + 16, // Keep the horizontal offset
        });
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

  const popoverContent = (
    <div
      className="absolute z-[999] w-auto bg-white text-default-700 font-medium border border-default-200 shadow-lg rounded-lg p-2"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
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
