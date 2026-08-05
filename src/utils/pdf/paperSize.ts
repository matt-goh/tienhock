// src/utils/pdf/paperSize.ts
// Shared paper-size preference for all PDF generators. "a4" (default) or
// "computerForm" (9.5in x 11in fanfold for the LQ-2190 dot-matrix printer).
// The preference is stored per-machine in localStorage and read at PDF
// generation time; browsers cannot detect the selected printer, so the user
// picks the size (navbar user menu, or the print overlays' one-off override).
import { useCallback, useEffect, useState } from "react";

export type PdfPaperSize = "a4" | "computerForm";

const STORAGE_KEY = "pdf-paper-size";
const CHANGE_EVENT = "pdf-paper-size-changed";

// 9.5in x 11in in PDF points (1in = 72pt)
export const COMPUTER_FORM_WIDTH = 684;
export const COMPUTER_FORM_HEIGHT = 792;

export const getPaperSizePreference = (): PdfPaperSize => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "computerForm"
      ? "computerForm"
      : "a4";
  } catch {
    return "a4";
  }
};

export const setPaperSizePreference = (size: PdfPaperSize): void => {
  try {
    localStorage.setItem(STORAGE_KEY, size);
    window.dispatchEvent(new CustomEvent<PdfPaperSize>(CHANGE_EVENT, { detail: size }));
  } catch {
    // localStorage unavailable (private mode etc.) - preference just won't persist
  }
};

export const usePaperSizePreference = (): [
  PdfPaperSize,
  (size: PdfPaperSize) => void,
] => {
  const [paperSize, setPaperSize] = useState<PdfPaperSize>(
    getPaperSizePreference
  );

  useEffect(() => {
    const handler = () => setPaperSize(getPaperSizePreference());
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);

  const set = useCallback((size: PdfPaperSize) => {
    setPaperSizePreference(size);
    setPaperSize(size);
  }, []);

  return [paperSize, set];
};

// @react-pdf/renderer <Page size={...}>. "A4" keeps using the named size with
// the Page's own orientation prop; an explicit [width, height] array ignores
// orientation, so landscape callers get the pre-swapped dimensions.
export const getReactPdfPageSize = (
  size: PdfPaperSize,
  landscape: boolean = false
): "A4" | [number, number] => {
  if (size === "computerForm") {
    return landscape
      ? [COMPUTER_FORM_HEIGHT, COMPUTER_FORM_WIDTH]
      : [COMPUTER_FORM_WIDTH, COMPUTER_FORM_HEIGHT];
  }
  return "A4";
};

// pdfmake pageSize. pdfmake applies pageOrientation on top of custom sizes,
// so existing pageOrientation settings keep working unchanged.
export const getPdfMakePageSize = (
  size: PdfPaperSize
): "A4" | { width: number; height: number } => {
  return size === "computerForm"
    ? { width: COMPUTER_FORM_WIDTH, height: COMPUTER_FORM_HEIGHT }
    : "A4";
};
