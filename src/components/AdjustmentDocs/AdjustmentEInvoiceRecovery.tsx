import React, { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import Button from "../Button";
import { api } from "../../routes/utils/api";

interface Props {
  apiBase: string;
  documentId: string;
  currentUuid: string | null;
  disabled: boolean;
  onRecovered: () => Promise<void>;
}

const AdjustmentEInvoiceRecovery: React.FC<Props> = ({
  apiBase, documentId, currentUuid, disabled, onRecovered,
}: Props) => {
  const { t } = useTranslation("adjustments");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [uuid, setUuid] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleLink = async (): Promise<void> => {
    if (isSaving || !uuid.trim()) return;
    setIsSaving(true);
    try {
      await api.put(`${apiBase}/${documentId}/uuid`, { uuid: uuid.trim() });
      toast.success(t("Valid e-Invoice linked successfully"));
      setIsOpen(false);
      await onRecovered();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("Failed to link e-Invoice"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="md"
        disabled={disabled || isSaving}
        onClick={(): void => { setUuid(currentUuid || ""); setIsOpen(true); }}
      >
        {t("Enter UUID")}
      </Button>
      <Dialog open={isOpen} onClose={(): void => { if (!isSaving) setIsOpen(false); }} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800">
            <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t("Link existing e-Invoice")}
            </DialogTitle>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {t("Enter the UUID of this adjustment's valid MyInvois document. Its number, type, supplier and total will be checked before restoring the link.")}
            </p>
            <label className="mt-4 block text-sm text-gray-700 dark:text-gray-200" htmlFor="adjustment-recovery-uuid">
              {t("UUID")}
            </label>
            <input
              id="adjustment-recovery-uuid"
              type="text"
              value={uuid}
              maxLength={64}
              disabled={isSaving}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setUuid(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" disabled={isSaving} onClick={(): void => setIsOpen(false)}>
                {t("cancel", { ns: "common" })}
              </Button>
              <Button disabled={isSaving || !uuid.trim()} onClick={handleLink}>
                {isSaving ? t("Verifying...") : t("Verify and link")}
              </Button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
};

export default AdjustmentEInvoiceRecovery;
