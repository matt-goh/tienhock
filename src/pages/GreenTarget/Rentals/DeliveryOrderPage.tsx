// src/pages/GreenTarget/Rentals/DeliveryOrderPage.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IconPrinter, IconDownload } from "@tabler/icons-react";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { greenTargetApi } from "../../../routes/greentarget/api";
import LoadingSpinner from "../../../components/LoadingSpinner";

interface DeliveryOrderData {
  rental_id: number;
  do_number: string;
  date: string;
  customer: string;
  location: string;
  dumpster: string;
  driver: string;
  remarks: string;
}

const DeliveryOrderPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliveryOrderData, setDeliveryOrderData] =
    useState<DeliveryOrderData | null>(null);

  useEffect(() => {
    if (id) {
      fetchDeliveryOrderData(id);
    } else {
      setError("No rental ID provided");
      setLoading(false);
    }
  }, [id]);

  const fetchDeliveryOrderData = async (rentalId: string) => {
    try {
      setLoading(true);
      const data = await greenTargetApi.generateDeliveryOrder(rentalId);

      if (data && data.deliveryOrderData) {
        setDeliveryOrderData(data.deliveryOrderData);
        setError(null);
      } else {
        throw new Error("Invalid data format received");
      }
    } catch (err) {
      setError("Failed to fetch delivery order data. Please try again later.");
      console.error("Error fetching delivery order data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackClick = () => {
    navigate(`/greentarget/rentals/${id}`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // In a real implementation, this would generate and download a PDF file
    // For now, we'll just show a message
    alert(
      "This would download the delivery order as a PDF file in the real implementation."
    );
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !deliveryOrderData) {
    return (
      <div className="container mx-auto px-4">
        <BackButton onClick={handleBackClick} className="ml-5" />
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <div className="text-center py-8">
            <p className="text-default-500 dark:text-gray-400">
              {error || "No delivery order data available"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 px-6 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBackClick} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
              Delivery Order
            </h1>
          </div>
          <div className="space-x-3">
            <Button onClick={handlePrint} icon={IconPrinter} variant="outline">
              Print
            </Button>
            <Button
              onClick={handleDownload}
              icon={IconDownload}
              variant="default"
            >
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-3xl mx-auto">
        {/* Delivery Order Header */}
        <div className="mb-8 text-center border-b dark:border-gray-700 pb-4">
          <h1 className="text-2xl font-bold text-default-900 dark:text-gray-100 mb-2">DELIVERY ORDER</h1>
          <p className="text-lg font-semibold text-default-900 dark:text-gray-100">{deliveryOrderData.do_number}</p>
        </div>

        {/* Date and Rental Information */}
        <div className="flex justify-between mb-6">
          <div>
            <p className="font-medium text-default-900 dark:text-gray-100">
              Date: {formatDate(deliveryOrderData.date)}
            </p>
            <p className="font-medium text-default-900 dark:text-gray-100">
              Rental #: {deliveryOrderData.rental_id}
            </p>
          </div>
        </div>

        {/* Customer Information */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100 mb-2">Customer Information</h2>
          <div className="border dark:border-gray-700 rounded-lg p-4">
            <p className="font-medium text-default-900 dark:text-gray-100">{deliveryOrderData.customer}</p>
            <p className="text-default-900 dark:text-gray-100">
              {deliveryOrderData.location !== "N/A"
                ? deliveryOrderData.location
                : "No specific location"}
            </p>
          </div>
        </div>

        {/* Dumpster Information */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100 mb-2">Dumpster Information</h2>
          <div className="border dark:border-gray-700 rounded-lg p-4">
            <p className="text-default-900 dark:text-gray-100">
              <span className="font-medium">Dumpster ID:</span>{" "}
              {deliveryOrderData.dumpster}
            </p>
            <p className="text-default-900 dark:text-gray-100">
              <span className="font-medium">Driver:</span>{" "}
              {deliveryOrderData.driver}
            </p>
          </div>
        </div>

        {/* Remarks */}
        {deliveryOrderData.remarks && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-default-900 dark:text-gray-100 mb-2">Remarks</h2>
            <div className="border dark:border-gray-700 rounded-lg p-4">
              <p className="text-default-900 dark:text-gray-100">{deliveryOrderData.remarks}</p>
            </div>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div className="border-t dark:border-gray-700 pt-4">
            <p className="text-center text-default-900 dark:text-gray-100">Customer Signature</p>
          </div>
          <div className="border-t dark:border-gray-700 pt-4">
            <p className="text-center text-default-900 dark:text-gray-100">Driver Signature</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t dark:border-gray-700 text-center text-sm text-default-500 dark:text-gray-400">
          <p>Green Target Waste Management Company</p>
        </div>
      </div>
    </div>
  );
};

export default DeliveryOrderPage;
