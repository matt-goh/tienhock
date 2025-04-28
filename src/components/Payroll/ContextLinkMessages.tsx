// src/components/Payroll/ContextLinkMessages.tsx
import React, { useState, useRef } from "react";
import { ContextField } from "../../configs/payrollJobConfigs";
import { createPortal } from "react-dom";
import { useJobPayCodeMappings } from "../../utils/catalogue/useJobPayCodeMappings";

interface ContextLinkMessagesProps {
  contextFields: ContextField[];
  linkedPayCodes: Record<string, ContextField>;
  children: React.ReactNode; // To wrap the label
}

const ContextLinkMessages: React.FC<ContextLinkMessagesProps> = ({
  contextFields,
  linkedPayCodes,
  children,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const labelRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { payCodes } = useJobPayCodeMappings();

  const linkedFields = contextFields.filter((field) => field.linkedPayCode);

  if (linkedFields.length === 0) return <>{children}</>;

  const handleMouseEnter = () => {
    if (labelRef.current) {
      const rect = labelRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 5,
        left: rect.left + rect.width / 2,
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

  const getPayCodeInfo = (payCodeId: string) => {
    const payCode = payCodes.find((p) => p.id === payCodeId);
    if (!payCode) return null;

    return {
      description: payCode.description,
      rateUnit: payCode.rate_unit,
      rateBiasa: payCode.rate_biasa,
      rateAhad: payCode.rate_ahad,
      rateUmum: payCode.rate_umum,
    };
  };

  return (
    <>
      <div
        ref={labelRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-help inline-flex items-center"
      >
        {children}
      </div>

      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-3 w-auto transform -translate-x-1/2 opacity-0 transition-opacity duration-200"
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
              <ul className="space-y-2 mt-1">
                {linkedFields.map((field, index) => {
                  const payCodeInfo = getPayCodeInfo(field.linkedPayCode || "");
                  return (
                    <li key={index} className="flex flex-col">
                      <div className="flex items-start">
                        <span className="mr-1">•</span>
                        <span>
                          <span className="font-medium">{field.label}</span> ➝{" "}
                          <span className="font-medium">
                            {payCodeInfo?.description || field.linkedPayCode}
                          </span>
                        </span>
                      </div>
                      {payCodeInfo && (
                        <div className="ml-4 mt-1 text-xs text-default-500">
                          <div>
                            Rate unit:{" "}
                            <span className="font-medium">
                              {payCodeInfo.rateUnit}
                            </span>
                          </div>
                          <div>
                            Biasa:{" "}
                            <span className="font-medium">
                              {payCodeInfo.rateUnit === "Percent"
                                ? `${payCodeInfo.rateBiasa.toFixed(2)}%`
                                : `RM${payCodeInfo.rateBiasa.toFixed(2)}`}
                            </span>
                          </div>
                          <div>
                            Ahad:{" "}
                            <span className="font-medium">
                              {payCodeInfo.rateUnit === "Percent"
                                ? `${payCodeInfo.rateAhad.toFixed(2)}%`
                                : `RM${payCodeInfo.rateAhad.toFixed(2)}`}
                            </span>
                          </div>
                          <div>
                            Umum:{" "}
                            <span className="font-medium">
                              {payCodeInfo.rateUnit === "Percent"
                                ? `${payCodeInfo.rateUmum.toFixed(2)}%`
                                : `RM${payCodeInfo.rateUmum.toFixed(2)}`}
                            </span>
                          </div>
                          {payCodeInfo?.rateUnit === "Percent" && (
                            <div className="text-xs italic mt-1">
                              Percent rates are multiplied by the{" "}
                              {payCodeInfo?.description || field.linkedPayCode}{" "}
                              value
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default ContextLinkMessages;
