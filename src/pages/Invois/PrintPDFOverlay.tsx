import React, { useEffect, useState, useRef } from 'react';
import { pdf, Document } from '@react-pdf/renderer';
import InvoisPDF from './InvoisPDF';
import { InvoiceData } from '../../types/types';
import toast from 'react-hot-toast';

declare global {
  interface Window {
    electron?: {
      print: (options: any) => Promise<void>;
      getPrinters: () => Promise<any[]>;
    };
  }
}

const PrintPDFOverlay = ({ 
  invoices, 
  onComplete 
}: { 
  invoices: InvoiceData[],
  onComplete: () => void
}) => {
  const [isPrinting, setIsPrinting] = useState(true);
  const [isGenerating, setIsGenerating] = useState(true);
  const hasPrintedRef = useRef(false);

  useEffect(() => {
    const generateAndPrint = async () => {
      if (hasPrintedRef.current) return;

      try {
        const pdfComponent = (
          <Document>
            <InvoisPDF invoices={invoices} />
          </Document>
        );

        const pdfBlob = await pdf(pdfComponent).toBlob();
        setIsGenerating(false);

        if (window.electron?.print) {
          const pdfArrayBuffer = await pdfBlob.arrayBuffer();
          await window.electron.print({
            data: Buffer.from(pdfArrayBuffer),
            silent: false,
            printBackground: true,
            deviceName: null,
          });
          cleanup();
        } else {
          const pdfUrl = URL.createObjectURL(pdfBlob);
          const printFrame = document.createElement('iframe');
          printFrame.style.display = 'none';
          document.body.appendChild(printFrame);

          printFrame.onload = () => {
            if (!hasPrintedRef.current && printFrame?.contentWindow) {
              hasPrintedRef.current = true;
              printFrame.contentWindow.onafterprint = () => {
                document.body.removeChild(printFrame);
                URL.revokeObjectURL(pdfUrl);
                cleanup();
              };
              printFrame.contentWindow.print();
            }
          };

          printFrame.src = pdfUrl;
        }
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Error preparing document for print. Please try again.');
        cleanup();
      }
    };

    const cleanup = () => {
      setIsPrinting(false);
      setIsGenerating(false);
      onComplete();
    };

    if (isPrinting) {
      generateAndPrint();
    }

    return () => {
      setIsPrinting(false);
      setIsGenerating(false);
    };
  }, [invoices, isPrinting, onComplete]);

  return isPrinting ? (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 min-w-[300px] transform scale-110">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-default-200 border-t-default-600 rounded-full animate-spin" />
          <p className="text-base font-medium text-default-900">
            {isGenerating ? 'Preparing document for printing...' : 'Opening print dialog...'}
          </p>
          <p className="text-sm text-default-500">Please wait a moment</p>
        </div>
      </div>
    </div>
  ) : null;
};

export default PrintPDFOverlay;