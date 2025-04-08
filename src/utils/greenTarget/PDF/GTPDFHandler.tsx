// Add these imports at the top of the file
import { useState } from "react";
import GTPrintPDFOverlay from "./GTPrintPDFOverlay";
import { IconDownload } from "@tabler/icons-react"; // Add this icon import
import Button from "../../../components/Button";

// Add this component inside the file, before the GTConsolidatedInvoiceModal component
interface GTPDFHandlerProps {
  invoice: any; // Use a more specific type if available
  disabled?: boolean;
}

const GTPDFHandler: React.FC<GTPDFHandlerProps> = ({
  invoice,
  disabled = false,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = () => {
    if (disabled) return;
    setIsPrinting(true);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        color="sky"
        onClick={handlePrint}
        disabled={disabled || isPrinting}
        icon={IconDownload}
        aria-label={`Download invoice ${invoice.invoice_number}`}
        title="Download"
      >
        Download
      </Button>
      {isPrinting && (
        <GTPrintPDFOverlay
          invoices={[invoice]}
          onComplete={() => setIsPrinting(false)}
        />
      )}
    </>
  );
};

export default GTPDFHandler;
