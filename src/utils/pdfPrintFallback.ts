import toast from "react-hot-toast";

interface PrintPdfFrameOptions {
  fallbackWindow?: Window | null;
  focusBeforePrint?: boolean;
  logLabel?: string;
}

export interface PrintPdfFrameResult {
  opened: boolean;
  usedFallback: boolean;
}

export const printPdfFrameWithFallback = (
  printFrame: HTMLIFrameElement,
  pdfUrl: string,
  options: PrintPdfFrameOptions = {}
): PrintPdfFrameResult => {
  const {
    fallbackWindow = null,
    focusBeforePrint = false,
    logLabel = "PDF",
  } = options;

  try {
    if (focusBeforePrint) {
      printFrame.contentWindow?.focus();
    }
    printFrame.contentWindow?.print();
    return { opened: true, usedFallback: false };
  } catch (printError) {
    console.warn(
      `Direct iframe print blocked for ${logLabel}, opening in new tab:`,
      printError
    );
    const printWindow: Window | null =
      fallbackWindow && !fallbackWindow.closed
        ? fallbackWindow
        : window.open(pdfUrl, "_blank");
    if (!printWindow) {
      toast.error(
        "Couldn't open print preview. Please allow pop-ups for this site."
      );
      return { opened: false, usedFallback: true };
    }
    try {
      if (printWindow.location.href === "about:blank") {
        printWindow.location.href = pdfUrl;
      }
    } catch {
      // Some browser PDF viewers can restrict the opened window immediately.
      // In that case the URL was already passed to window.open above.
    }
    printWindow.focus();
    return { opened: true, usedFallback: true };
  }
};
