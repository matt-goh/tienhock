import React, { useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../Button";

interface RefreshPayCodeCacheButtonProps {
  onRefresh: () => Promise<void>;
  loading?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const RefreshPayCodeCacheButton: React.FC<RefreshPayCodeCacheButtonProps> = ({
  onRefresh,
  loading: externalLoading,
  size = "sm",
  className = "",
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading || internalLoading;

  const handleRefresh = async () => {
    if (isLoading) return;

    setInternalLoading(true);
    try {
      await onRefresh();
      toast.success("Pay code cache refreshed");
    } catch (error) {
      toast.error("Failed to refresh pay code cache");
      console.error("Error refreshing pay code cache:", error);
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleRefresh}
      variant="outline"
      size={size}
      disabled={isLoading}
      className={`${className} ${isLoading ? "[&_svg]:animate-spin" : ""}`}
      title="Refresh pay code cache"
      icon={IconRefresh}
      iconSize={size === "sm" ? 16 : 18}
    >
      Refresh
    </Button>
  );
};

export default RefreshPayCodeCacheButton;
