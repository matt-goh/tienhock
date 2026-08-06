import toast from "react-hot-toast";

interface PrintPdfFrameOptions {
  fallbackWindow?: Window | null;
  focusBeforePrint?: boolean;
  logLabel?: string;
  // Temporarily replaces the page title while the print dialog is open.
  // Chrome/Windows name the saved PDF from the top-level page title when
  // printing an iframe, so this is what makes "Save as PDF" use a good name
  // (PDF metadata titles alone don't reach the filename).
  documentTitle?: string;
}

export interface PrintPdfFrameResult {
  opened: boolean;
  usedFallback: boolean;
}

// Convenience wrapper: prints a PDF Blob via a hidden iframe using
// printPdfFrameWithFallback, then cleans up the iframe and object URL when the
// window regains focus (i.e. after the print dialog / fallback tab closes).
export const printPdfBlob = (
  pdfBlob: Blob,
  documentTitle: string = "PDF"
): void => {
  const url = URL.createObjectURL(pdfBlob);
  const printFrame = document.createElement("iframe");
  printFrame.style.display = "none";
  document.body.appendChild(printFrame);

  printFrame.onload = () => {
    if (printFrame.contentWindow) {
      printPdfFrameWithFallback(printFrame, url, {
        logLabel: documentTitle,
        documentTitle,
      });
      const cleanup = () => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
        URL.revokeObjectURL(url);
        window.removeEventListener("focus", cleanup);
      };
      window.addEventListener("focus", cleanup, { once: true });
    }
  };
  printFrame.src = url;
};

export const printPdfFrameWithFallback = (
  printFrame: HTMLIFrameElement,
  pdfUrl: string,
  options: PrintPdfFrameOptions = {}
): PrintPdfFrameResult => {
  const {
    fallbackWindow = null,
    focusBeforePrint = false,
    logLabel = "PDF",
    documentTitle,
  } = options;

  const originalDocumentTitle: string = document.title;
  let documentTitleRestored: boolean = false;
  const restoreDocumentTitle = (): void => {
    if (documentTitleRestored) return;
    documentTitleRestored = true;
    document.title = originalDocumentTitle;
  };
  if (documentTitle) {
    document.title = documentTitle;
    window.addEventListener("focus", restoreDocumentTitle, { once: true });
    // Safety net: some browsers never fire the focus event after a modal
    // print dialog, so don't leave the tab title swapped indefinitely.
    setTimeout(restoreDocumentTitle, 120000);
  }

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
