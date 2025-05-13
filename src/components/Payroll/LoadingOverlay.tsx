// src/components/Payroll/LoadingOverlay.tsx
import React, { useState, useEffect } from "react";
import LoadingSpinner from "../LoadingSpinner";

interface LoadingOverlayProps {
  message: string;
  processingMessage?: string;
  error?: string | null;
  onClose: () => void;
  timeout?: number;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  message,
  processingMessage,
  error = null,
  onClose,
  timeout = 20000,
}) => {
  const [isGenerating, setIsGenerating] = useState(true);

  // Auto-transition to processing state after a delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsGenerating(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Auto-close after timeout if needed
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, timeout);

    return () => clearTimeout(timer);
  }, [onClose, timeout]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 min-w-[300px] transform scale-110">
        <div className="flex flex-col items-center gap-3">
          <LoadingSpinner size="sm" hideText />
          <p className="text-base font-medium text-default-900">
            {isGenerating ? message : processingMessage || message}
          </p>
          <p className="text-sm text-default-500">Please wait a moment</p>
          {error && (
            <p className="text-sm text-rose-600 mt-2 text-center">{error}</p>
          )}
          <button
            onClick={onClose}
            className="mt-2 text-sm text-center text-sky-600 hover:underline"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
