// src/hooks/useUnsavedChanges.ts
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface UseUnsavedChangesProps {
  hasUnsavedChanges: boolean;
  message?: string;
}

// A path, a history delta, or a function that performs the navigation itself.
// The function form lets callers hand over `useSmartBack`'s goBack, so a
// guarded page can return the user to wherever they came from rather than to a
// hardcoded path.
type NavigationTarget = string | number | (() => void);

export const useUnsavedChanges = ({
  hasUnsavedChanges,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: UseUnsavedChangesProps) => {
  const navigate = useNavigate();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // Refs, not state: these are only read inside handlers, and a function
  // target stored via setState would be mistaken for a state updater.
  const pendingNavigation = useRef<NavigationTarget | null>(null);
  const pendingCallback = useRef<(() => void) | null>(null);

  const runNavigation = (to: NavigationTarget): void => {
    if (typeof to === "function") {
      to();
      return;
    }
    if (typeof to === "number") {
      navigate(to);
      return;
    }
    navigate(to);
  };

  // Custom navigate function that checks for unsaved changes
  const safeNavigate = (to: NavigationTarget, callback?: () => void) => {
    if (hasUnsavedChanges) {
      pendingNavigation.current = to;
      pendingCallback.current = callback ?? null;
      setShowConfirmDialog(true);
    } else {
      runNavigation(to);
      if (callback) {
        callback();
      }
    }
  };

  const handleConfirmNavigation = () => {
    setShowConfirmDialog(false);
    if (pendingNavigation.current !== null) {
      runNavigation(pendingNavigation.current);
      pendingNavigation.current = null;
    }
    if (pendingCallback.current) {
      pendingCallback.current();
      pendingCallback.current = null;
    }
  };

  const handleCancelNavigation = () => {
    setShowConfirmDialog(false);
    pendingNavigation.current = null;
    pendingCallback.current = null;
  };

  return {
    safeNavigate,
    showConfirmDialog,
    handleConfirmNavigation,
    handleCancelNavigation,
    confirmationMessage: message,
  };
};
