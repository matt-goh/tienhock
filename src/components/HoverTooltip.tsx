// src/components/HoverTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface HoverTooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  position?: "top" | "bottom";
  delay?: number;
}

const HoverTooltip: React.FC<HoverTooltipProps> = ({
  children,
  content,
  position = "bottom",
  delay = 200,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      if (position === "bottom") {
        setCoords({
          top: rect.bottom + 8,
          left: rect.left + rect.width / 2,
        });
      } else {
        setCoords({
          top: rect.top - 8,
          left: rect.left + rect.width / 2,
        });
      }
    }
  }, [isVisible, position]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(false), 100);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </div>
      {isVisible &&
        content &&
        createPortal(
          <div
            className="fixed z-[9999] px-3 py-2 text-xs bg-gray-900 dark:bg-gray-700 text-white rounded-lg shadow-lg whitespace-pre-line"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: position === "bottom" ? "translateX(-50%)" : "translateX(-50%) translateY(-100%)",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {content}
            {/* Arrow */}
            <div
              className={`absolute w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45 left-1/2 -translate-x-1/2 ${
                position === "bottom" ? "-top-1" : "-bottom-1"
              }`}
            />
          </div>,
          document.body
        )}
    </>
  );
};

export default HoverTooltip;
