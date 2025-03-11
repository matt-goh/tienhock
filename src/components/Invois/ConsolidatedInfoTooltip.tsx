// src/components/Invois/ConsolidatedInfoTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { IconInfoCircle } from "@tabler/icons-react";

interface ConsolidatedInfoTooltipProps {
  invoices: number[] | string[];
}

const ConsolidatedInfoTooltip: React.FC<ConsolidatedInfoTooltipProps> = ({ invoices }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isVisible && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 10, // Position above the icon
        left: rect.left + rect.width / 2,
      });
    }
  }, [isVisible]);

  if (!invoices || invoices.length === 0) return null;

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="text-default-400 hover:text-default-600 cursor-help ml-2"
      >
        <IconInfoCircle size={16} />
      </span>
      
      {isVisible && createPortal(
        <div 
          className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-3 w-64 transform -translate-x-1/2 -translate-y-full"
          style={{ 
            top: `${position.top}px`, 
            left: `${position.left}px`,
          }}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
        >
          <div className="text-xs font-medium text-default-600 mb-1.5">Consolidated Invoices:</div>
          <div className="text-xs text-default-700 max-h-32 overflow-y-auto">
            {invoices.map((invoice, index) => (
              <span key={index} className="inline-block mr-2 mb-1 px-2 py-1 bg-default-100 rounded-md">
                {invoice}
              </span>
            ))}
          </div>
          <div className="absolute h-2 w-2 bg-white border-b border-r border-default-200 transform rotate-45 left-1/2 bottom-[-5px] -ml-1"></div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ConsolidatedInfoTooltip;