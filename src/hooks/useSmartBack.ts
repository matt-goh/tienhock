// src/hooks/useSmartBack.ts
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

// True when there is an in-app history entry to return to.
//
// React Router keeps its own stack index in `window.history.state.idx`: 0 for
// the entry the app booted on, +1 on every push, unchanged on replace. That
// makes it the only reliable "can I go back inside the app?" signal here.
//
// `window.history.length` must NOT be used for this: it counts entries from
// before the app was ever loaded, so it is > 1 even in a freshly opened tab
// and would send the user out of the app entirely. The index also survives
// pages that replace their own entry on mount (e.g. RentalDetailsPage clearing
// its location state), which a `location.key === "default"` check would not.
const hasInAppHistory = (): boolean => {
  const idx = (window.history.state as { idx?: number | null } | null)?.idx;
  return typeof idx === "number" && idx > 0;
};

/**
 * Back navigation that returns the user to wherever they actually came from,
 * instead of always jumping to one hardcoded list page.
 *
 * `fallbackPath` is used only when the page was opened directly - a pasted
 * link, a refresh, or a new tab - where there is no in-app previous page. It
 * replaces the current entry so Back does not bounce between the two pages.
 */
export const useSmartBack = (fallbackPath?: string): (() => void) => {
  const navigate = useNavigate();

  return useCallback((): void => {
    if (hasInAppHistory()) {
      navigate(-1);
      return;
    }
    if (fallbackPath) navigate(fallbackPath, { replace: true });
  }, [fallbackPath, navigate]);
};
