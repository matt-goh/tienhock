// src/components/Catalogue/CustomersUsingProductTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { IconInfoCircle, IconUser } from "@tabler/icons-react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

interface CustomerProductInfo {
  customer_id: string;
  customer_name: string;
  custom_price: number;
  is_available: boolean;
}

interface CustomersUsingProductTooltipProps {
  productId: string;
  customersMap: Record<string, CustomerProductInfo[]>; // productId -> customer info[]
  className?: string;
  disableNavigation?: boolean;
}

const CustomersUsingProductTooltip: React.FC<
  CustomersUsingProductTooltipProps
> = ({
  productId,
  customersMap,
  className = "",
  disableNavigation = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Get customers using this product
  const customersUsingProduct = customersMap[productId] || [];
  const totalCount = customersUsingProduct.length;

  useEffect(() => {
    if (isVisible && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 5,
      });
    }
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 0);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  // Hide tooltip completely if no customers use this product
  if (totalCount === 0) return null;

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`text-default-400 hover:text-default-600 cursor-help inline-flex items-center ${className}`}
      >
        <IconInfoCircle size={16} />
        {totalCount > 0 && (
          <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-100 text-sky-700 text-xs">
            {totalCount}
          </span>
        )}
      </span>

      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-4 w-96 transform opacity-0 transition-opacity duration-200 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              maxHeight: "400px",
              opacity: isVisible ? 1 : 0,
              transform: `translate(0%, -50%)`,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Fixed Header */}
            <div className="flex-shrink-0">
              <div className="text-sm font-medium text-default-700 mb-2 flex justify-between items-center">
                <span
                  className="truncate"
                  title={`Custom Product Prices: ${productId}`}
                >
                  Custom Product Prices: {productId}
                </span>
                <span
                  className="text-xs text-default-500 truncate"
                  title={`Total: ${totalCount} customers`}
                >
                  ({totalCount} customers)
                </span>
              </div>
              <div className="border-t border-default-200"></div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-grow overflow-y-auto pt-2 space-y-2 min-h-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {/* Customers Section */}
              {customersUsingProduct.length > 0 && (
                <div>
                  <div className="flex items-center mb-2">
                    <IconUser size={16} className="text-sky-600 mr-2" />
                    <span className="text-sm font-medium text-default-700">
                      Customers ({customersUsingProduct.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {customersUsingProduct.map((customerInfo) => (
                      <div
                        key={customerInfo.customer_id}
                        className={`py-2 px-2 bg-sky-50 rounded border border-sky-200 ${
                          !disableNavigation
                            ? "cursor-pointer hover:bg-sky-100"
                            : ""
                        } transition-colors duration-200`}
                        title={`View customer details: ${customerInfo.customer_name}`}
                        onClick={() => {
                          if (!disableNavigation) {
                            navigate(
                              `/catalogue/customer/${customerInfo.customer_id}`
                            );
                          }
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {customerInfo.customer_name}
                            </div>
                            <div className="text-xs text-default-500">
                              ID: {customerInfo.customer_id}
                            </div>
                          </div>
                          <div className="text-right ml-2 flex-shrink-0">
                            <div className="font-medium text-sm text-sky-700">
                              {formatCurrency(customerInfo.custom_price)}
                            </div>
                            <div className="text-xs">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                  customerInfo.is_available
                                    ? "bg-green-100 text-green-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {customerInfo.is_available
                                  ? "Available"
                                  : "Unavailable"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {totalCount === 0 && (
                <div className="text-center text-sm text-default-500 py-2">
                  Not used by any customers
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default CustomersUsingProductTooltip;
