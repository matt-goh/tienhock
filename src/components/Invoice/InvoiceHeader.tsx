// src/components/Invoice/InvoiceHeader.tsx
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExtendedInvoiceData, Customer } from "../../types/types"; // Use updated types
import { FormInput } from "../FormComponents"; // Reusable components
import PillSelect, { PillSelectOption } from "../PillSelect";
import { CustomerCombobox } from "./CustomerCombobox"; // Reusable component
import TimeNavigator, { TimeRange } from "../TimeNavigator";
import {
  formatDateForAPI,
  parseDatabaseTimestamp,
} from "../../utils/invoice/dateUtils";

// Define the SelectOption interface used in the component
interface SelectOption {
  id: string;
  name: string;
}

// "I"/"C" are the invoice-number prefixes; they map to INVOICE/CASH.
type InvoiceTypeCode = "I" | "C";

// Thin vertical rule between two fields on the same line. It stretches to the
// row height so it reads as one continuous separator, and disappears below sm
// where the fields stack and a rule between them would be meaningless.
// Deliberately absent within a pair that describes one thing - Date/Time are
// two halves of one timestamp, Customer/Customer ID are two halves of one
// customer - so each pair reads as a group rather than as separate fields.
const FieldDivider: React.FC = (): React.ReactElement => (
  <div
    aria-hidden="true"
    className="hidden sm:block self-stretch w-px bg-default-200 dark:bg-gray-700"
  />
);

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
  readOnly = false,
}) => {
  const { t } = useTranslation("invoice");

  // Only the pill LABELS are translated; the "I"/"C" values stay raw.
  const invoiceTypeOptions: ReadonlyArray<PillSelectOption<InvoiceTypeCode>> =
    useMemo(
      (): ReadonlyArray<PillSelectOption<InvoiceTypeCode>> => [
        { value: "I", label: t("Invoice") },
        { value: "C", label: t("Cash") },
      ],
      [t]
    );

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

  // TimeNavigator works in Date objects; the invoice keeps a ms-timestamp
  // string, so the picked day is fed back through the same date handler that
  // preserves the existing time part.
  const invoiceDate: Date | null = useMemo(
    () => parseDatabaseTimestamp(invoice.createddate).date,
    [invoice.createddate]
  );

  const handleDatePick = (range: TimeRange) => {
    handleDateTimeChange("date", formatDateForAPI(range.start));
  };

  const salesmanOptions: ReadonlyArray<PillSelectOption<string>> = useMemo(
    (): ReadonlyArray<PillSelectOption<string>> =>
      salesmen.map(
        (salesman): PillSelectOption<string> => ({
          value: salesman.id,
          label: salesman.name || salesman.id,
        })
      ),
    [salesmen]
  );

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

  // Two wrapping rows - the document itself, then who it is for. Every control
  // is sized to the value it holds rather than to the card, because a column
  // grid on a wide screen just spreads seven short fields from edge to edge.
  // Flowing them left with one gap keeps the group compact and readable, and
  // they wrap onto further lines by themselves as the window narrows.
  return (
    <div className="space-y-4">
      {/* Invoice No, Type, Date, Time */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-4">
        <div className="w-36">
          <FormInput
            name="invoiceno"
            label={t("Invoice No")}
            value={`${invoice.paymenttype === "CASH" ? "C" : "I"}${
              invoice.id || ""
            }`}
            onChange={(e) => {
              // Extract numeric part (remove the prefix 'C' or 'I')
              const value = e.target.value;
              const numericPart = value.substring(1);
              onInputChange("id", numericPart);
            }}
            disabled={!isNewInvoice || readOnly} // Use readOnly
            placeholder={t("Enter Invoice Number")}
          />
        </div>

        <FieldDivider />

        {/* Type */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
            {t("type", { ns: "common" })}
          </label>
          <PillSelect<InvoiceTypeCode>
            value={invoice.paymenttype === "CASH" ? "C" : "I"}
            onChange={(value: InvoiceTypeCode) => {
              const newType = value === "C" ? "CASH" : "INVOICE";
              onInputChange("paymenttype", newType);
              if (invoice.id) {
                onInputChange("id", invoice.id);
              }
            }}
            options={invoiceTypeOptions}
            disabled={readOnly} // Use readOnly
            ariaLabel={t("Invoice type")}
            size="md"
          />
        </div>

        <FieldDivider />

        {/* Date */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
            {t("date", { ns: "common" })}
          </label>
          <TimeNavigator
            range={{ start: invoiceDate, end: invoiceDate }}
            onChange={handleDatePick}
            modes={["day"]}
            presets={false}
            allowFuture
            size="md"
            disabled={readOnly}
          />
        </div>

        {/* Time */}
        <div className="w-32">
          <FormInput
            name="time"
            label={t("Time")}
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
      </div>

      {/* Salesman, Customer, Customer ID */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-4">
        {/* Salesman. The picker only ever lists active staff holding the
            SALESMAN job (4 of them today) and shows their short id, so the
            whole set fits in one pill row. An empty salespersonid matches no
            pill, which is the old "Select Salesman..." placeholder state. */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-default-700 dark:text-gray-200 truncate">
            {t("Salesman")}
          </label>
          <PillSelect<string>
            value={invoice.salespersonid || ""}
            onChange={(selectedId: string) => {
              onInputChange("salespersonid", selectedId);
            }}
            options={salesmanOptions}
            disabled={readOnly} // Use readOnly
            ariaLabel={t("Salesman")}
            size="md"
          />
        </div>

        <FieldDivider />

        {/* Customer. The only field that earns real width - customer names run
            long - but it is capped so it never stretches across the card. */}
        <div className="w-full sm:w-80 lg:w-96">
          <CustomerCombobox
            name="customer"
            label={t("customer", { ns: "common" })}
            value={selectedOptionForCombobox} // Pass SelectOption | null
            onChange={handleComboboxChange} // Use updated handler
            options={customerOptionsForCombobox} // Pass mapped options
            query={customerQuery}
            setQuery={setCustomerQuery}
            onLoadMore={onLoadMoreCustomers}
            hasMore={hasMoreCustomers}
            isLoading={isFetchingCustomers}
          />
        </div>

        {/* Customer ID (Read Only) */}
        <div className="w-40">
          <FormInput
            name="customerId"
            label={t("Customer ID")}
            value={invoice.customerid || ""}
            disabled // Always disabled
          />
        </div>
      </div>
    </div>
  );
};

export default InvoiceHeader;
