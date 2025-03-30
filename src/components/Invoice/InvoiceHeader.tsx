// src/components/Invoice/InvoiceHeader.tsx
import React from "react";
import {
  ExtendedInvoiceData,
  Customer,
} from "../../types/types"; // Use updated types
import { FormInput, FormListbox } from "../FormComponents"; // Reusable components
import { CustomerCombobox } from "./CustomerCombobox"; // Reusable component
import {
  formatDateForInput,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils";

interface InvoiceHeaderProps {
  invoice: ExtendedInvoiceData;
  onInputChange: (field: keyof ExtendedInvoiceData, value: any) => void;
  isNewInvoice: boolean;
  customers: Customer[]; // For CustomerCombobox options
  salesmen: { id: string; name: string }[]; // For Salesman Listbox {id, name} format
  // Customer Combobox specific props
  selectedCustomerName: string;
  onCustomerChange: (customer: Customer | null) => void; // Callback when customer is selected
  customerQuery: string;
  setCustomerQuery: React.Dispatch<React.SetStateAction<string>>;
  onLoadMoreCustomers: () => void;
  hasMoreCustomers: boolean;
  isFetchingCustomers: boolean;
  // Duplicate check
  onInvoiceIdBlur?: (id: string) => Promise<boolean>; // Optional check on blur
  isCheckingDuplicate?: boolean;
  isDuplicate?: boolean;
  readOnly?: boolean;
}

const InvoiceHeader: React.FC<InvoiceHeaderProps> = ({
  invoice,
  onInputChange,
  isNewInvoice,
  customers,
  salesmen,
  selectedCustomerName,
  onCustomerChange,
  customerQuery,
  setCustomerQuery,
  onLoadMoreCustomers,
  hasMoreCustomers,
  isFetchingCustomers,
  onInvoiceIdBlur,
  isCheckingDuplicate = false,
  isDuplicate = false,
}) => {
  const handleDateTimeChange = (field: "date" | "time", value: string) => {
    const currentTimestamp = parseInt(
      invoice.createddate || Date.now().toString()
    );
    let newDate = new Date(currentTimestamp);

    if (field === "date") {
      const [year, month, day] = value.split("-").map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        // Preserve time part
        const hours = newDate.getHours();
        const minutes = newDate.getMinutes();
        const seconds = newDate.getSeconds();
        newDate = new Date(year, month - 1, day, hours, minutes, seconds);
      }
    } else {
      // time
      const [hours, minutes] = value.split(":").map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        newDate.setHours(hours, minutes);
        // Optionally set seconds to 0 if needed: newDate.setSeconds(0);
      }
    }
    onInputChange("createddate", newDate.getTime().toString());
  };

  const handleIdBlur = async () => {
    if (isNewInvoice && invoice.id && onInvoiceIdBlur) {
      await onInvoiceIdBlur(invoice.id);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      {/* Column 1 */}
      <div className="space-y-3">
        {/* Invoice No */}
        <div className="relative">
          <FormInput
            name="invoiceno"
            label="Invoice No"
            value={`${invoice.paymenttype === "CASH" ? "C" : "I"}${
              invoice.id || ""
            }`}
            onChange={(e) => {
              const rawValue = e.target.value;
              const typePrefix = rawValue.charAt(0).toUpperCase();
              const number = rawValue.slice(1);
              const newPaymentType = typePrefix === "C" ? "CASH" : "INVOICE";

              // Update ID and potentially payment type
              onInputChange("id", number);
              if (invoice.paymenttype !== newPaymentType) {
                onInputChange("paymenttype", newPaymentType);
              }
            }}
            disabled={!isNewInvoice}
            placeholder="Enter Invoice Number"
            onBlur={handleIdBlur} // Add onBlur for duplicate check
          />
          {isCheckingDuplicate && (
            <span className="absolute right-2 top-9 text-xs text-gray-500">
              Checking...
            </span>
          )}
          {isDuplicate && (
            <span className="absolute right-2 top-9 text-xs text-red-500">
              Duplicate!
            </span>
          )}
        </div>

        {/* Type */}
        <FormListbox
          name="type"
          label="Type"
          value={invoice.paymenttype === "CASH" ? "Cash" : "Invoice"}
          onChange={(value) => {
            const newType = value === "Cash" ? "CASH" : "INVOICE";
            onInputChange("paymenttype", newType);
            // Also update prefix if ID exists
            if (invoice.id) {
              onInputChange("id", invoice.id); // Trigger re-render with new prefix
            }
          }}
          options={[
            { id: "I", name: "Invoice" },
            { id: "C", name: "Cash" },
          ]}
        />

        {/* Date */}
        <FormInput
          name="date"
          label="Date"
          type="date"
          value={formatDateForInput(invoice.createddate)}
          onChange={(e) => handleDateTimeChange("date", e.target.value)}
        />

        {/* Time */}
        <FormInput
          name="time"
          label="Time"
          type="time"
          value={
            parseDatabaseTimestamp(invoice.createddate).formattedTime?.slice(
              0,
              5
            ) ?? ""
          }
          onChange={(e) => handleDateTimeChange("time", e.target.value)}
        />
      </div>

      {/* Column 2 */}
      <div className="space-y-3">
        {/* Salesman */}
        <FormListbox
          name="salesman"
          label="Salesman"
          value={
            salesmen.find((s) => s.id === invoice.salespersonid)?.name ||
            invoice.salespersonid ||
            ""
          } // Show name if found, else ID
          onChange={(selectedValue) => {
            // Find the ID corresponding to the selected name/value
            const selectedSalesman = salesmen.find(
              (s) => s.name === selectedValue || s.id === selectedValue
            );
            onInputChange("salespersonid", selectedSalesman?.id || ""); // Store the ID
          }}
          options={salesmen} // Pass array of { id, name }
        />

        {/* Customer */}
        <CustomerCombobox
          name="customer"
          label="Customer"
          value={selectedCustomerName ? [selectedCustomerName] : []} // Pass name for display
          onChange={(value: string[] | null) => {
            const name = value?.[0] || "";
            const selectedCustomer = customers.find((c) => c.name === name);
            onCustomerChange(selectedCustomer || null); // Notify parent with the full customer object or null
          }}
          options={customers.map((c) => ({
            id: c.id.toString(),
            name: c.name,
          }))} // Map to {id, name}
          query={customerQuery}
          setQuery={setCustomerQuery}
          onLoadMore={onLoadMoreCustomers}
          hasMore={hasMoreCustomers}
          isLoading={isFetchingCustomers}
        />

        {/* Customer ID (Read Only) */}
        <FormInput
          name="customerId"
          label="Customer ID"
          value={invoice.customerid || ""}
          disabled // Always disabled
        />
      </div>
    </div>
  );
};

export default InvoiceHeader;
