// src/hooks/useUnsavedChanges.ts
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface UseUnsavedChangesProps {
  hasUnsavedChanges: boolean;
  message?: string;
}

export const useUnsavedChanges = ({
  hasUnsavedChanges,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: UseUnsavedChangesProps) => {
  const navigate = useNavigate();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null
  );
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(
    null
  );

  // Custom navigate function that checks for unsaved changes
  const safeNavigate = (to: string | number, callback?: () => void) => {
    if (hasUnsavedChanges) {
      if (typeof to === "string") {
        setPendingNavigation(to);
      }
      if (callback) {
        setPendingCallback(() => callback);
      }
      setShowConfirmDialog(true);
    } else {
      if (typeof to === "string") {
        navigate(to);
      } else {
        navigate(to);
      }
      if (callback) {
        callback();
      }
    }
  };

  const handleConfirmNavigation = () => {
    setShowConfirmDialog(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
      setPendingNavigation(null);
    }
    if (pendingCallback) {
      pendingCallback();
      setPendingCallback(null);
    }
  };

  const handleCancelNavigation = () => {
    setShowConfirmDialog(false);
    setPendingNavigation(null);
    setPendingCallback(null);
  };

  return {
    safeNavigate,
    showConfirmDialog,
    handleConfirmNavigation,
    handleCancelNavigation,
    confirmationMessage: message,
  };
};
