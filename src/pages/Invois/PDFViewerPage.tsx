import React, { useState, useEffect } from 'react';
import { InvoiceData } from '../../types/types';
import InvoisPDF from './InvoisPDF';

const PDFViewerPage: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      // Try to get the data from sessionStorage
      const storedData = sessionStorage.getItem('PDF_DATA');
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        if (Array.isArray(parsedData)) {
          setInvoices(parsedData);
          setIsLoading(false);
          return;
        }
      }
      
      // If no data in sessionStorage, show error
      setIsLoading(false);
      console.error('No invoice data found');
    } catch (error) {
      console.error('Error loading PDF data:', error);
      setIsLoading(false);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-lg">Loading PDF viewer...</div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-lg">No invoice data found</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen">
      <InvoisPDF invoices={invoices} />
    </div>
  );
};

export default PDFViewerPage;