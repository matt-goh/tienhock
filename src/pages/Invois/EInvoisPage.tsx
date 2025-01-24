import React, { useState, useEffect, useRef } from "react";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import Button from "../../components/Button";
import { IconRefresh } from "@tabler/icons-react";

interface EInvoice {
  uuid: string;
  submission_uid: string;
  long_id: string;
  internal_id: string;
  type_name: string;
  receiver_id: string;
  receiver_name: string;
  datetime_validated: string;
  total_payable_amount: number;
  total_excluding_tax: number;
  total_net_amount: number;
}

const EInvoisPage: React.FC = () => {
  const [einvoices, setEInvoices] = useState<EInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const tableBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkForScrollbar = () => {
      if (tableBodyRef.current) {
        const hasVerticalScrollbar =
          tableBodyRef.current.scrollHeight > tableBodyRef.current.clientHeight;
        setHasScrollbar(hasVerticalScrollbar);
      }
    };

    checkForScrollbar();
    const resizeObserver = new ResizeObserver(checkForScrollbar);
    if (tableBodyRef.current) {
      resizeObserver.observe(tableBodyRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [einvoices]);

  const fetchEInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/api/einvoice/list");
      setEInvoices(response);
    } catch (error: any) {
      console.error("Failed to fetch e-invoices:", error);
      setError("Failed to fetch e-invoices. Please try refreshing.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEInvoices();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString("en-MY", {
      style: "currency",
      currency: "MYR",
    });
  };

  return (
    <div className="flex flex-col px-6 py-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-semibold text-default-900">
          e-Invoices History
        </h1>
        <Button
          onClick={fetchEInvoices}
          disabled={loading}
          variant="outline"
          icon={IconRefresh}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-rose-50 text-rose-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="relative">
          <div
            className={`bg-default-100 border-b ${
              hasScrollbar ? "pr-[17px]" : ""
            }`}
          >
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[10%]" /> {/* Invoice No */}
                <col className="w-[10%]" /> {/* Type */}
                <col className="w-[20%]" /> {/* Customer */}
                <col className="w-[17%]" /> {/* Validated At */}
                <col className="w-[9%]" /> {/* Amount */}
                <col className="w-[22%]" /> {/* Submission ID */}
                <col className="w-[12%]" /> {/* Actions */}
              </colgroup>
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-default-700 truncate">
                    Invoice No
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Validated At
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-default-700">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Submission ID
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-default-700">
                    Actions
                  </th>
                </tr>
              </thead>
            </table>
          </div>

          <div
            ref={tableBodyRef}
            className="max-h-[calc(100vh-180px)] overflow-y-auto"
          >
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[20%]" />
                <col className="w-[17%]" />
                <col className="w-[9%]" />
                <col className="w-[22%]" />
                <col className="w-[12%]" />
              </colgroup>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center">
                      <LoadingSpinner />
                    </td>
                  </tr>
                ) : einvoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-3 text-center text-default-500"
                    >
                      No e-invoices found
                    </td>
                  </tr>
                ) : (
                  einvoices.map((einvoice) => (
                    <tr key={einvoice.uuid} className="border-b last:border-0">
                      <td className="px-4 py-3 text-default-700">
                        {einvoice.internal_id}
                      </td>
                      <td className="px-4 py-3 text-default-700">
                        {einvoice.type_name}
                      </td>
                      <td className="px-4 py-3 text-default-700 truncate">
                        {einvoice.receiver_name}
                      </td>
                      <td className="px-4 py-3 text-default-700 truncate">
                        {formatDate(einvoice.datetime_validated)}
                      </td>
                      <td className="px-4 py-3 text-default-700 text-right">
                        {formatAmount(einvoice.total_payable_amount)}
                      </td>
                      <td className="px-4 py-3 text-default-700 truncate">
                        {einvoice.submission_uid}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          onClick={() => {}}
                          disabled={false}
                          variant="outline"
                          size="sm"
                        >
                          Download
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EInvoisPage;
