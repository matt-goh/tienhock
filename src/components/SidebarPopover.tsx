// SidebarPopover.tsx
import React, { useEffect, useState } from "react";

interface SidebarPopoverProps {
  options: { name: string; link: string }[];
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
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        setPosition({
          top: rect.top + scrollTop - 160, // Align with the top of the button
          left: rect.right + scrollLeft + 8, // Keep the horizontal offset
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

  return (
    <div
      className="absolute w-full bg-white border border-gray-200 shadow-lg rounded-lg p-2"
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
            <a
              href={option.link}
              className="block py-2 px-4 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 rounded-lg"
            >
              {option.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SidebarPopover;