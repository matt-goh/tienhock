import React from "react";
import { IconPlug } from "@tabler/icons-react";

// Compact status indicator that shows next to title
export const ApiStatusIndicator: React.FC<{ success: boolean }> = ({
  success,
}) => (
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
    <span>{success ? "Connected" : "Disconnected"}</span>
  </div>
);
