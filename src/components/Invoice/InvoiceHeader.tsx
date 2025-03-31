// src/components/Invoice/InvoiceHeader.tsx
import React from "react";
import { ExtendedInvoiceData, Customer } from "../../types/types"; // Use updated types
import { FormInput, FormListbox } from "../FormComponents"; // Reusable components
import { CustomerCombobox } from "./CustomerCombobox"; // Reusable component
import {
  formatDateForInput,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils";

// Define the SelectOption interface used in the component
interface SelectOption {
  id: string;
  name: string;
}

interface InvoiceHeaderProps {
  invoice: ExtendedInvoiceData;
  onInputChange: (field: keyof ExtendedInvoiceData, value: any) => void;
  isNewInvoice: boolean;
  customers: Customer[]; // For CustomerCombobox options
  salesmen: { id: string; name: string }[]; // For Salesman Listbox {id, name} format

  // Customer Combobox specific props
  selectedCustomer: Customer | null;
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
  selectedCustomer,
  onCustomerChange,
  customerQuery,
  setCustomerQuery,
  onLoadMoreCustomers,
  hasMoreCustomers,
  isFetchingCustomers,
  onInvoiceIdBlur,
  isCheckingDuplicate = false,
  isDuplicate = false,
  readOnly = false,
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

  // --- Prepare props for CustomerCombobox ---
  // Map full customer list to SelectOption format
  const customerOptionsForCombobox: SelectOption[] = customers.map((c) => ({
    id: c.id.toString(), // Ensure ID is string
    name: c.name,
  }));

  // Map the currently selected Customer object to SelectOption for the value prop
  const selectedOptionForCombobox: SelectOption | null = selectedCustomer
    ? { id: selectedCustomer.id.toString(), name: selectedCustomer.name }
    : null;

  // Handle the change event from CustomerCombobox (receives SelectOption | null)
  const handleComboboxChange = (option: SelectOption | null) => {
    if (option) {
      // Find the full Customer object matching the selected option's ID
      // Important: Compare IDs correctly (string vs string/number)
      const fullCustomer = customers.find(
        (c) => c.id.toString() === option.id.toString()
      );
      onCustomerChange(fullCustomer || null); // Pass full Customer or null up to parent
    } else {
      onCustomerChange(null); // Pass null up if selection is cleared
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      {/* Column 1 (Invoice No, Type, Date, Time) */}
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
              /* ... */
            }}
            disabled={!isNewInvoice || readOnly} // Use readOnly
            placeholder="Enter Invoice Number"
            onBlur={handleIdBlur}
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
          // Find the name corresponding to the current paymenttype ID
          value={invoice.paymenttype === "CASH" ? "C" : "I"} // Pass the ID value
          onChange={(value) => {
            const newType = value === "C" ? "CASH" : "INVOICE";
            onInputChange("paymenttype", newType);
            if (invoice.id) {
              onInputChange("id", invoice.id);
            }
          }}
          options={[
            // Ensure options have id/name matching FormListbox expectations
            { id: "I", name: "Invoice" },
            { id: "C", name: "Cash" },
          ]}
          disabled={readOnly} // Use readOnly
        />

        {/* Date */}
        <FormInput
          name="date"
          label="Date"
          type="date"
          value={formatDateForInput(invoice.createddate)}
          onChange={(e) => handleDateTimeChange("date", e.target.value)}
          disabled={readOnly} // Use readOnly
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
          disabled={readOnly} // Use readOnly
        />
      </div>

      {/* Column 2 */}
      <div className="space-y-3">
        {/* Salesman */}
        <FormListbox
          name="salesman"
          label="Salesman"
          value={invoice.salespersonid || ""} // Pass the ID value
          onChange={(selectedId) => {
            // The FormListbox onChange now correctly passes the ID back
            onInputChange("salespersonid", selectedId || ""); // Store the ID
          }}
          options={salesmen} // Pass array of { id, name }
          disabled={readOnly} // Use readOnly
          placeholder="Select Salesman..."
        />

        {/* Customer */}
        <CustomerCombobox
          name="customer"
          label="Customer"
          value={selectedOptionForCombobox} // Pass SelectOption | null
          onChange={handleComboboxChange} // Use updated handler
          options={customerOptionsForCombobox} // Pass mapped options
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
