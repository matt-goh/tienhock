// src/components/StatusIndicator.tsx
import React from "react";
import { IconPlug } from "@tabler/icons-react";

interface StatusIndicatorProps {
  success: boolean;
  type?: 'connection' | 'verification';
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  success,
  type = 'connection'
}) => {
  const getText = () => {
    switch (type) {
      case 'verification':
        return success ? "Verified" : "Unverified";
      case 'connection':
      default:
        return success ? "Connected" : "Disconnected";
    }
  };

  return (
    <div
      className={`
        flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium
        ${
          success
            ? "bg-green-50 text-green-600 border border-green-200"
            : "bg-red-50 text-red-600 border border-red-200"
        }
      `}
    >
      <IconPlug size={12} />
      <span>{getText()}</span>
    </div>
  );
};