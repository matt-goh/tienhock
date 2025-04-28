// src/components/Payroll/ContextLinkMessages.tsx
import React, { useState, useRef } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { ContextField } from "../../configs/payrollJobConfigs";
import { createPortal } from "react-dom";

interface ContextLinkMessagesProps {
  contextFields: ContextField[];
  linkedPayCodes: Record<string, ContextField>;
}

const ContextLinkMessages: React.FC<ContextLinkMessagesProps> = ({
  contextFields,
  linkedPayCodes,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const linkedFields = contextFields.filter((field) => field.linkedPayCode);

  if (linkedFields.length === 0) return null;

  const handleMouseEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top,
        left: rect.right + 5,
      });
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 100);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  return (
    <>
      <div
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex cursor-help text-sky-500 ml-1"
      >
        <IconInfoCircle size={16} />
      </div>

      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-3 w-auto transform -translate-x-1/2 -translate-y-full opacity-0 transition-opacity duration-200"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              opacity: isVisible ? 1 : 0,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="text-sm font-medium text-default-700 mb-1">
              Linked Pay Codes
            </div>
            <div className="text-sm text-default-600">
              <ul className="space-y-1 mt-1">
                {linkedFields.map((field, index) => (
                  <li key={index} className="flex items-start">
                    <span className="mr-1">•</span>
                    <span>
                      <span className="font-medium">{field.label}</span> ➝{" "}
                      <span className="font-medium">{field.linkedPayCode}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default ContextLinkMessages;
