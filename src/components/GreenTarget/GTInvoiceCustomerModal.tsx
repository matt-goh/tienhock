import React, { useRef, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import Button from "../Button";
import { FormListbox, type SelectOption } from "../FormComponents";
import { greenTargetApi } from "../../routes/greentarget/api";
import { validateCustomerIdentity } from "../../utils/greenTarget/customerValidation";
import { idTypeOptions, stateOptions } from "../../utils/catalogue/customerOptions";

export interface GTInvoiceCustomer {
  customer_id: number;
  name: string;
  phone_number?: string | null;
  billing_address?: string | null;
  tin_number?: string | null;
  id_number?: string | null;
  debtor_account_code?: string | null;
}

interface CustomerDraft {
  name: string;
  phone_number: string;
  billing_address: string;
  id_type: string;
  id_number: string;
  tin_number: string;
  email: string;
  state: string;
}

interface GTInvoiceCustomerModalProps {
  initialName: string;
  onClose: () => void;
  onCreated: (customer: GTInvoiceCustomer) => void;
}

// Mounted only while open, so a dismissed form never leaks into the next customer.
const GTInvoiceCustomerModal: React.FC<GTInvoiceCustomerModalProps> = ({
  initialName,
  onClose,
  onCreated,
}) => {
  const { t } = useTranslation("greentarget");
  const [draft, setDraft] = useState<CustomerDraft>({
    name: initialName,
    phone_number: "",
    billing_address: "",
    id_type: "",
    id_number: "",
    tin_number: "",
    email: "",
    state: "12",
  });
  const [saving, setSaving] = useState<boolean>(false);
  const savingRef = useRef<boolean>(false);

  const close = (): void => {
    if (!savingRef.current) onClose();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    if (savingRef.current) return;
    const customer: CustomerDraft = {
      ...draft,
      name: draft.name.trim(),
      phone_number: draft.phone_number.trim(),
      billing_address: draft.billing_address.trim(),
      id_number: draft.id_number.trim(),
      tin_number: draft.tin_number.trim(),
      email: draft.email.trim(),
    };
    if (!customer.name) {
      toast.error(t("Customer name is required"));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (customer.id_type || customer.id_number || customer.tin_number) {
        if (!customer.id_type || !customer.id_number || !customer.tin_number) {
          toast.error(t("Enter ID Type, ID Number and TIN together."));
          return;
        }
        const validation: { isValid: boolean } = await validateCustomerIdentity(customer);
        if (!validation.isValid) return;
      }
      const response: { customer: GTInvoiceCustomer } = await greenTargetApi.createCustomer({
        ...customer,
        phone_number: customer.phone_number || null,
        id_type: customer.id_type || null,
      });
      onCreated(response.customer);
      toast.success(t("Customer created."));
    } catch (error: unknown) {
      console.error("Failed to create invoice customer:", error);
      toast.error(t("Failed create customer."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const input = (
    name: keyof CustomerDraft,
    label: string,
    maxLength: number,
    type: string = "text",
    required: boolean = false
  ): React.ReactElement => (
    <label className="block space-y-1 text-sm text-default-700 dark:text-gray-200">
      <span>{label}{required && <span className="ml-1 text-red-500">*</span>}</span>
      <input
        name={name}
        type={type}
        value={draft[name]}
        maxLength={maxLength}
        required={required}
        disabled={saving}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          setDraft((current: CustomerDraft): CustomerDraft => ({ ...current, [name]: event.target.value }))
        }
        className="block w-full rounded-lg border border-default-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
      />
    </label>
  );

  return (
    <Dialog open onClose={close} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <DialogTitle className="text-lg font-semibold text-default-900 dark:text-gray-100">
              {t("Create customer")}
            </DialogTitle>
            <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
              {t("The customer is saved immediately and can be used on other invoices.")}
            </p>
            <form onSubmit={submit} className="mt-4 space-y-4">
              {input("name", t("Customer Name"), 255, "text", true)}
              {input("phone_number", t("Phone Number (optional)"), 20, "tel")}
              <label className="block space-y-1 text-sm text-default-700 dark:text-gray-200">
                <span>{t("Billing address (optional)")}</span>
                <textarea
                  value={draft.billing_address}
                  disabled={saving}
                  rows={2}
                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void =>
                    setDraft((current: CustomerDraft): CustomerDraft => ({ ...current, billing_address: event.target.value }))
                  }
                  className="block w-full rounded-lg border border-default-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </label>
              <details className="rounded-lg border border-default-200 p-3 dark:border-gray-700">
                <summary className="cursor-pointer text-sm font-medium text-default-700 dark:text-gray-200">
                  {t("e-Invoice details (optional)")}
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <FormListbox
                    name="quick_customer_id_type"
                    label={t("ID Type")}
                    value={draft.id_type}
                    options={idTypeOptions.map((option: SelectOption): SelectOption => ({ ...option, name: t(option.name) }))}
                    onChange={(value: string): void => setDraft((current: CustomerDraft): CustomerDraft => ({ ...current, id_type: value }))}
                    disabled={saving}
                  />
                  {input("id_number", t("ID Number"), 50)}
                  {input("tin_number", t("TIN Number"), 20)}
                  {input("email", t("Email"), 255, "email")}
                  <FormListbox
                    name="quick_customer_state"
                    label={t("State")}
                    value={draft.state}
                    options={stateOptions.map((option: SelectOption): SelectOption => ({ ...option, name: t(option.name) }))}
                    onChange={(value: string): void => setDraft((current: CustomerDraft): CustomerDraft => ({ ...current, state: value }))}
                    disabled={saving}
                  />
                </div>
              </details>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={close} disabled={saving}>{t("Cancel")}</Button>
                <Button type="submit" disabled={saving}>{saving ? t("Saving...") : t("Create customer")}</Button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

export default GTInvoiceCustomerModal;
