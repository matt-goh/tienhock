// src/components/Payroll/CP8DRecordFormModal.tsx
// Edit modal for one CP8D yearly record, and "add employee" dialog when no
// record is passed (the new row is then snapshotted server-side).
import React, { Fragment, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { IconDeviceFloppy, IconX } from "@tabler/icons-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import Button from "../Button";
import { FormCombobox, FormInput, FormListbox } from "../FormComponents";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { api } from "../../routes/utils/api";

export interface CP8DRecord {
  id: number;
  year: number;
  employee_id: string;
  employee_name: string;
  tin: string | null;
  identification_no: string;
  employee_category: number;
  employee_status: number;
  retirement_date: string | null;
  tax_borne_by_employer: number;
  children_count: number;
  child_relief: number;
  gross_remuneration: number;
  benefits_in_kind: number;
  living_accommodation: number;
  esos_benefit: number;
  tax_exempt_benefits: number;
  tp1_relief: number;
  tp1_zakat: number;
  epf_contribution: number;
  zakat_salary_deduction: number;
  mtd: number;
  cp38: number;
  medical_insurance: number;
  socso_contribution: number;
  derived_at: string | null;
  notes: string | null;
}

interface CP8DRecordFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  year: number;
  /** null = add mode (pick a staff member; values are snapshotted server-side) */
  record: CP8DRecord | null;
  /** Employee ids already on the CP8D year (excluded from the add picker) */
  existingEmployeeIds?: string[];
}

const MONEY_KEYS = [
  "child_relief",
  "gross_remuneration",
  "benefits_in_kind",
  "living_accommodation",
  "esos_benefit",
  "tax_exempt_benefits",
  "tp1_relief",
  "tp1_zakat",
  "epf_contribution",
  "zakat_salary_deduction",
  "mtd",
  "cp38",
  "medical_insurance",
  "socso_contribution",
] as const;

type MoneyKey = (typeof MONEY_KEYS)[number];

interface FormState {
  employee_name: string;
  tin: string;
  identification_no: string;
  employee_category: string;
  employee_status: string;
  retirement_date: string;
  tax_borne_by_employer: string;
  children_count: string;
  notes: string;
  [key: string]: string;
}

const EMPTY_FORM: FormState = {
  employee_name: "",
  tin: "",
  identification_no: "",
  employee_category: "1",
  employee_status: "2",
  retirement_date: "",
  tax_borne_by_employer: "2",
  children_count: "0",
  notes: "",
  ...Object.fromEntries(MONEY_KEYS.map((k) => [k, "0"])),
};

const CP8DRecordFormModal: React.FC<CP8DRecordFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  year,
  record,
  existingEmployeeIds = [],
}) => {
  const { t } = useTranslation("payroll");
  const { staffs } = useStaffsCache();
  const isAddMode = record === null;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffQuery, setStaffQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedStaffId(null);
    setStaffQuery("");
    if (record) {
      const next: FormState = {
        ...EMPTY_FORM,
        employee_name: record.employee_name,
        tin: record.tin ?? "",
        identification_no: record.identification_no,
        employee_category: String(record.employee_category),
        employee_status: String(record.employee_status),
        retirement_date: record.retirement_date
          ? format(new Date(record.retirement_date), "yyyy-MM-dd")
          : "",
        tax_borne_by_employer: String(record.tax_borne_by_employer),
        children_count: String(record.children_count),
        notes: record.notes ?? "",
      };
      for (const key of MONEY_KEYS) {
        next[key] = String(record[key as MoneyKey] ?? 0);
      }
      setForm(next);
    } else {
      setForm(EMPTY_FORM);
    }
  }, [isOpen, record]);

  const staffOptions = useMemo(
    () =>
      staffs
        .filter((staff) => !existingEmployeeIds.includes(staff.id))
        .map((staff) => ({ id: staff.id, name: `${staff.name} (${staff.id})` })),
    [staffs, existingEmployeeIds]
  );

  const setField = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isAddMode) {
        if (!selectedStaffId) {
          toast.error(t("Please select a staff member"));
          setIsSaving(false);
          return;
        }
        await api.post(`/api/cp8d/${year}/records`, {
          employee_id: selectedStaffId,
        });
        toast.success(t("CP8D record added"));
      } else {
        await api.put(`/api/cp8d/records/${record.id}`, {
          employee_name: form.employee_name,
          tin: form.tin || null,
          identification_no: form.identification_no,
          employee_category: form.employee_category,
          employee_status: form.employee_status,
          retirement_date: form.retirement_date || null,
          tax_borne_by_employer: form.tax_borne_by_employer,
          children_count: form.children_count,
          notes: form.notes,
          ...Object.fromEntries(MONEY_KEYS.map((k) => [k, form[k] || "0"])),
        });
        toast.success(t("CP8D record saved"));
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error saving CP8D record:", error);
      toast.error(error?.data?.message || t("Failed to save CP8D record"));
    } finally {
      setIsSaving(false);
    }
  };

  const categoryOptions = [
    { id: "1", name: t("1 - Single") },
    { id: "2", name: t("2 - Married (Spouse Not Working)") },
    {
      id: "3",
      name: t("3 - Married (Spouse Working) / Divorced / Widowed"),
    },
  ];
  const statusOptions = [
    { id: "1", name: t("1 - Management") },
    { id: "2", name: t("2 - Permanent") },
    { id: "3", name: t("3 - Contract") },
    { id: "4", name: t("4 - Part Time") },
    { id: "5", name: t("5 - Intern") },
    { id: "6", name: t("6 - Others") },
  ];
  const taxBorneOptions = [
    { id: "1", name: t("1 - Yes") },
    { id: "2", name: t("2 - No") },
  ];

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <h4 className="col-span-full text-sm font-semibold text-default-800 dark:text-gray-100 border-b border-default-200 dark:border-gray-600 pb-1 mt-2">
      {title}
    </h4>
  );

  const MoneyInput: React.FC<{ field: MoneyKey; label: string }> = ({
    field,
    label,
  }) => (
    <FormInput
      name={field}
      label={label}
      type="number"
      step="0.01"
      min={0}
      value={form[field]}
      onChange={setField(field)}
    />
  );

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
        </TransitionChild>

        <div className="fixed inset-0">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-3xl transform rounded-2xl bg-white dark:bg-gray-800 text-left shadow-xl transition-all">
                <div className="px-6 py-4 border-b border-default-200 dark:border-gray-600">
                  <DialogTitle
                    as="h3"
                    className="text-xl font-semibold text-default-800 dark:text-gray-100"
                  >
                    {isAddMode
                      ? t("Add Employee to CP8D {{year}}", { year })
                      : t("Edit CP8D Record")}
                  </DialogTitle>
                  {!isAddMode && (
                    <p className="text-sm text-default-600 dark:text-gray-400 mt-1">
                      {record.employee_name} ({record.employee_id}) — {year}
                    </p>
                  )}
                </div>

                <div
                  className={`px-6 py-4 ${
                    // Add mode is a single combobox: no scroll container, so
                    // the dropdown is never clipped (PinjamFormModal pattern).
                    isAddMode ? "" : "max-h-[65vh] overflow-y-auto"
                  }`}
                >
                  {isAddMode ? (
                    <FormCombobox
                      name="employee"
                      label={t("Staff")}
                      value={selectedStaffId ?? undefined}
                      onChange={(value) =>
                        setSelectedStaffId(value ? String(value) : null)
                      }
                      options={staffOptions}
                      query={staffQuery}
                      setQuery={setStaffQuery}
                      placeholder={t("Select Staff...")}
                      mode="single"
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <SectionHeader title={t("Particulars")} />
                      <FormInput
                        name="employee_name"
                        label={t("Employee Name (as per IC)")}
                        value={form.employee_name}
                        onChange={setField("employee_name")}
                        required
                      />
                      <FormInput
                        name="tin"
                        label={t("Tax Identification No. (TIN)")}
                        value={form.tin}
                        onChange={setField("tin")}
                      />
                      <FormInput
                        name="identification_no"
                        label={t("Identification / Passport No.")}
                        value={form.identification_no}
                        onChange={setField("identification_no")}
                        required
                      />
                      <FormInput
                        name="retirement_date"
                        label={t("Retirement / End of Contract Date")}
                        type="date"
                        value={form.retirement_date}
                        onChange={setField("retirement_date")}
                      />

                      <SectionHeader title={t("Category & Status")} />
                      <FormListbox
                        name="employee_category"
                        label={t("Category of Employee")}
                        value={form.employee_category}
                        onChange={(value) =>
                          setForm((prev) => ({
                            ...prev,
                            employee_category: value,
                          }))
                        }
                        options={categoryOptions}
                      />
                      <FormListbox
                        name="employee_status"
                        label={t("Employee Status")}
                        value={form.employee_status}
                        onChange={(value) =>
                          setForm((prev) => ({
                            ...prev,
                            employee_status: value,
                          }))
                        }
                        options={statusOptions}
                      />
                      <FormListbox
                        name="tax_borne_by_employer"
                        label={t("Tax Borne by Employer")}
                        value={form.tax_borne_by_employer}
                        onChange={(value) =>
                          setForm((prev) => ({
                            ...prev,
                            tax_borne_by_employer: value,
                          }))
                        }
                        options={taxBorneOptions}
                      />
                      <FormInput
                        name="children_count"
                        label={t("Children Qualified for Tax Relief")}
                        type="number"
                        min={0}
                        step="1"
                        value={form.children_count}
                        onChange={setField("children_count")}
                      />
                      <MoneyInput
                        field="child_relief"
                        label={t("Total Qualifying Child Relief")}
                      />

                      <SectionHeader title={t("Remuneration & Contributions")} />
                      <MoneyInput
                        field="gross_remuneration"
                        label={t("Total Gross Remuneration")}
                      />
                      <MoneyInput
                        field="epf_contribution"
                        label={t("EPF Contribution (Employee)")}
                      />
                      <MoneyInput
                        field="socso_contribution"
                        label={t("SOCSO Contribution (Employee)")}
                      />
                      <MoneyInput field="mtd" label={t("MTD / PCB")} />
                      <MoneyInput field="cp38" label={t("CP38")} />

                      <SectionHeader title={t("Benefits")} />
                      <MoneyInput
                        field="benefits_in_kind"
                        label={t("Benefits in Kind")}
                      />
                      <MoneyInput
                        field="living_accommodation"
                        label={t("Value of Living Accommodation")}
                      />
                      <MoneyInput
                        field="esos_benefit"
                        label={t("ESOS Benefit")}
                      />
                      <MoneyInput
                        field="tax_exempt_benefits"
                        label={t("Tax Exempt Allowances / Benefits")}
                      />
                      <MoneyInput
                        field="medical_insurance"
                        label={t("Medical Insurance")}
                      />

                      <SectionHeader title={t("TP1 & Zakat")} />
                      <MoneyInput
                        field="tp1_relief"
                        label={t("TP1 Relief Claim")}
                      />
                      <MoneyInput
                        field="tp1_zakat"
                        label={t("TP1 Zakat Claim")}
                      />
                      <MoneyInput
                        field="zakat_salary_deduction"
                        label={t("Zakat Paid via Salary Deduction")}
                      />

                      <SectionHeader title={t("Others")} />
                      <div className="col-span-full">
                        <FormInput
                          name="notes"
                          label={t("Notes")}
                          value={form.notes}
                          onChange={setField("notes")}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-default-200 dark:border-gray-600 flex justify-end gap-3">
                  <Button variant="outline" onClick={onClose} icon={IconX}>
                    {t("Cancel")}
                  </Button>
                  <Button
                    color="sky"
                    onClick={handleSave}
                    icon={IconDeviceFloppy}
                    disabled={isSaving}
                  >
                    {isSaving ? t("Saving...") : t("Save")}
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default CP8DRecordFormModal;
