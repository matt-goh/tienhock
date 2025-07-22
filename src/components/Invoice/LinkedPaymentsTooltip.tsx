// src/components/Invoice/LinkedPaymentsTooltip.tsx
import React, { useState, useRef, useEffect } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../LoadingSpinner";

interface LinkedPaymentInfo {
  payment_id: number;
  invoice_id: string;
  customer_name: string;
  amount_paid: number;
}

interface LinkedPaymentsTooltipProps {
  paymentReference: string;
  currentInvoiceId: string;
}

const LinkedPaymentsTooltip: React.FC<LinkedPaymentsTooltipProps> = ({
  paymentReference,
  currentInvoiceId,
}) => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [linkedPayments, setLinkedPayments] = useState<LinkedPaymentInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasFetched, setHasFetched] = useState<boolean>(false);
  const iconRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  const otherLinkedPayments = linkedPayments.filter(
    (p) => p.invoice_id !== currentInvoiceId
  );
  const totalCount = otherLinkedPayments.length;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const fetchLinkedPayments = async (): Promise<void> => {
    if (hasFetched || isLoading) return;
    setIsLoading(true);
    try {
      const response: LinkedPaymentInfo[] = await api.get(
        `/api/payments/by-reference/${paymentReference}`
      );
      setLinkedPayments(response || []);
    } catch (error) {
      console.error("Error fetching linked payments:", error);
      setLinkedPayments([]);
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  };

  const handleMouseEnter = (): void => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!hasFetched) {
      fetchLinkedPayments();
    }
    timeoutRef.current = setTimeout(() => {
      if (iconRef.current) {
        const rect = iconRef.current.getBoundingClientRect();
        setPosition({
          top: rect.top + rect.height / 2,
          left: rect.right + 5,
        });
      }
      setIsVisible(true);
    }, 100);
  };

  const handleMouseLeave = (): void => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 200);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="text-default-400 hover:text-default-600 cursor-help inline-flex items-center ml-2"
      >
        <IconInfoCircle size={14} />
      </span>

      {isVisible &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-default-200 shadow-lg rounded-lg p-4 w-96 transform opacity-0 transition-opacity duration-200 flex flex-col"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              maxHeight: "300px",
              opacity: isVisible ? 1 : 0,
              transform: `translate(0%, -50%)`,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="flex-shrink-0">
              <div className="text-sm font-medium text-default-700 mb-2 flex justify-between items-center">
                <span
                  className="truncate"
                  title={`Linked Payments: ${paymentReference}`}
                >
                  Linked Payments
                </span>
                <span
                  className="text-xs text-default-500 truncate"
                  title={`Total: ${totalCount} other invoices`}
                >
                  ({totalCount} other invoices)
                </span>
              </div>
              <div className="border-t border-default-200"></div>
            </div>

            <div className="flex-grow overflow-y-auto pt-2 space-y-2 min-h-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {isLoading ? (
                <div className="flex justify-center items-center h-24">
                  <LoadingSpinner />
                </div>
              ) : totalCount > 0 ? (
                <div className="space-y-1">
                  {otherLinkedPayments.map((paymentInfo) => (
                    <div
                      key={paymentInfo.payment_id}
                      className="py-2 px-2 bg-sky-50 rounded border border-sky-200 cursor-pointer hover:bg-sky-100 transition-colors duration-200"
                      title={`View invoice ${paymentInfo.invoice_id}`}
                      onClick={() =>
                        navigate(`/sales/invoice/${paymentInfo.invoice_id}`)
                      }
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            Invoice: {paymentInfo.invoice_id}
                          </div>
                          <div className="text-xs text-default-500 truncate">
                            {paymentInfo.customer_name}
                          </div>
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          <div className="font-medium text-sm text-sky-700">
                            {formatCurrency(paymentInfo.amount_paid)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-default-500 text-sm py-4">
                  No linked invoices found for this payment reference.
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default LinkedPaymentsTooltip;
