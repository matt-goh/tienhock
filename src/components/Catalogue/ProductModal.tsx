import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  TransitionChild,
  Transition,
} from "@headlessui/react";
import { IconX } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../Button";
import { FormInput, FormListbox } from "../FormComponents";
import Checkbox from "../Checkbox";
import PillSelect from "../PillSelect";
import { useTranslation } from "react-i18next";

export type PaycodeSetupRole = "packing" | "salesman" | "ikut";

export interface PaycodeSetupOption {
  role: PaycodeSetupRole;
  id: string;
  description: string;
  rate_unit: string;
  rate_biasa: string;
  rate_ahad: string;
  rate_umum: string;
}

// The API payload built on submit: the draft keeps rate inputs as strings so
// they can be typed/edited, but the request must carry numeric rates.
export interface PaycodeSetupPayload {
  role: PaycodeSetupRole;
  id: string;
  description: string;
  pay_type: string;
  rate_unit: string;
  rate_biasa: number;
  rate_ahad: number;
  rate_umum: number;
}

const PACKING_UNIT_BY_TYPE: Record<string, string> = {
  MEE: "Bag",
  BH: "Bag",
  RAMEN: "PKT",
  BUNDLE: "Bundle",
  JP: "Ctn",
};

const SALESMAN_UNIT_BY_TYPE: Record<string, string> = {
  MEE: "Bag",
  BH: "Bag",
  RAMEN: "PKT",
  JP: "Ctn",
};

const IKUT_UNIT_BY_TYPE: Record<string, string> = {
  MEE: "Bag",
  BH: "Bag",
  RAMEN: "PKT",
};

// Production units offered when creating a pay code here. PKT stays in the
// list for salesman/Ikut codes; it is filtered out for non-RAMEN packing codes
// because product_pay_codes reserves PKT for RAMEN.
const SETUP_UNIT_OPTIONS: Array<{ id: string; labelKey: string }> = [
  { id: "Bag", labelKey: "Bag" },
  { id: "Ctn", labelKey: "Ctn (Carton)" },
  { id: "PKT", labelKey: "PKT (Packet)" },
  { id: "PCS", labelKey: "PCS (Pieces)" },
  { id: "Kg", labelKey: "Kilogram" },
  { id: "Karung", labelKey: "Karung" },
  { id: "Bundle", labelKey: "Bundle" },
];

const unitsForRole = (type: string, role: PaycodeSetupRole): string[] => {
  if (role === "packing" && type === "RAMEN") return ["PKT"];
  if (role === "packing") {
    return SETUP_UNIT_OPTIONS.filter((unit) => unit.id !== "PKT").map(
      (unit) => unit.id
    );
  }
  return SETUP_UNIT_OPTIONS.map((unit) => unit.id);
};

const SETUP_ROLE_LABELS: Record<PaycodeSetupRole, string> = {
  packing: "Packing pay code",
  salesman: "Salesman commission pay code",
  ikut: "Salesman Ikut Lori pay code",
};

const SETUP_ROLE_DESCRIPTIONS: Record<PaycodeSetupRole, string> = {
  packing: "Pays packers for production",
  salesman: "Auto-fills salesman commission",
  ikut: "Auto-fills Ikut Lori commission",
};

const PRODUCTION_TYPES = ["MEE", "BH", "RAMEN", "BUNDLE", "JP"];

// Applicable pay-code roles for a product type. Everything is offered (and by
// default checked) for production types; OTH/empty get none.
const rolesForType = (type: string): PaycodeSetupRole[] => {
  if (!PRODUCTION_TYPES.includes(type)) return [];
  const roles: PaycodeSetupRole[] = ["packing"];
  if (["MEE", "BH", "RAMEN", "JP"].includes(type)) {
    roles.push("salesman");
  }
  if (["MEE", "BH", "RAMEN"].includes(type)) {
    roles.push("ikut");
  }
  return roles;
};

// Builds the default (all applicable roles checked) pay-code drafts for a
// product type, with suggested IDs and the fixed per-type rate units.
const createDefaultSetup = (
  type: string,
  productId: string,
  description: string
): PaycodeSetupOption[] => {
  const trimmedId = productId.trim();
  return rolesForType(type).map((role) => {
    const unit =
      role === "packing"
        ? PACKING_UNIT_BY_TYPE[type] || ""
        : role === "salesman"
        ? SALESMAN_UNIT_BY_TYPE[type] || ""
        : IKUT_UNIT_BY_TYPE[type] || "";
    const id =
      role === "salesman"
        ? trimmedId
        : role === "packing"
        ? type === "JP"
          ? `PIP_${trimmedId}`
          : `PM_${trimmedId}`
        : `DME_${trimmedId}`;
    return {
      role,
      id,
      description,
      rate_unit: unit,
      rate_biasa: "",
      rate_ahad: "",
      rate_umum: "",
    };
  });
};

interface Product {
  id: string;
  description: string;
  price_per_unit: number;
  type: string;
  tax: string;
  is_active: boolean;
}

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    product: Product,
    paycodeSetup?: PaycodeSetupPayload[]
  ) => Promise<void>;
  product?: Product | null;
  mode: "create" | "edit";
}

const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  onSave,
  product,
  mode,
}) => {
  const { t } = useTranslation("catalogue");
  const [formData, setFormData] = useState<Product>({
    id: "",
    description: "",
    price_per_unit: 0,
    type: "",
    tax: "None",
    is_active: true,
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [paycodeSetup, setPaycodeSetup] = useState<PaycodeSetupOption[]>([]);

  useEffect(() => {
    if (product && mode === "edit") {
      // Ensure is_active defaults to true if undefined (for backwards compatibility)
      setFormData({
        ...product,
        is_active: product.is_active ?? true,
      });
      // The auto-setup section is create-only; never carry a partial selection
      // into an edit session.
      setPaycodeSetup([]);
    } else {
      setFormData({
        id: "",
        description: "",
        price_per_unit: 0,
        type: "",
        tax: "None",
        is_active: true,
      });
      setPaycodeSetup([]);
    }
  }, [product, mode, isOpen]);

  // The auto-setup section is only for new production products. Production
  // types that carry pay codes: MEE, BH, RAMEN, BUNDLE and JP.
  const canAutoSetup =
    mode === "create" && PRODUCTION_TYPES.includes(formData.type);

  const setupUnitFor = (role: PaycodeSetupRole): string => {
    if (role === "packing") return PACKING_UNIT_BY_TYPE[formData.type] || "";
    if (role === "salesman")
      return SALESMAN_UNIT_BY_TYPE[formData.type] || "";
    return IKUT_UNIT_BY_TYPE[formData.type] || "";
  };

  const setupDefaultId = (role: PaycodeSetupRole): string => {
    const productId = formData.id.trim();
    if (role === "salesman") return productId;
    if (role === "packing") {
      return formData.type === "JP" ? `PIP_${productId}` : `PM_${productId}`;
    }
    return `DME_${productId}`;
  };

  const isRoleSelected = (role: PaycodeSetupRole): boolean =>
    paycodeSetup.some((option) => option.role === role);

  const availableSetupRoles: PaycodeSetupRole[] = canAutoSetup
    ? rolesForType(formData.type)
    : [];

  const toggleSetupRole = (role: PaycodeSetupRole): void => {
    setPaycodeSetup((prev) => {
      if (prev.some((option) => option.role === role)) {
        return prev.filter((option) => option.role !== role);
      }
      return [
        ...prev,
        {
          role,
          id: setupDefaultId(role),
          description: formData.description,
          rate_unit: setupUnitFor(role),
          rate_biasa: "",
          rate_ahad: "",
          rate_umum: "",
        },
      ];
    });
  };

  const updateSetupRole = (
    role: PaycodeSetupRole,
    patch: Partial<PaycodeSetupOption>
  ): void => {
    setPaycodeSetup((prev) =>
      prev.map((option) =>
        option.role === role ? { ...option, ...patch } : option
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.id.trim()) {
      toast.error(t("Product ID is required"));
      return;
    }

    if (!formData.description.trim()) {
      toast.error(t("Description is required"));
      return;
    }

    if (formData.price_per_unit < 0) {
      toast.error(t("Price must be greater than or equal to 0"));
      return;
    }

    if (!formData.type.trim()) {
      toast.error(t("Type is required"));
      return;
    }

    const setupPayload: PaycodeSetupPayload[] = [];
    for (const option of paycodeSetup) {
      const roleLabel = t(SETUP_ROLE_LABELS[option.role]);
      const normalRate = option.rate_biasa.trim();
      if (!/^\d*\.?\d*$/.test(normalRate) || normalRate === "") {
        toast.error(
          t("Normal rate is required for {{role}}", { role: roleLabel })
        );
        return;
      }
      // The salesman commission pay code always mirrors the product ID (the
      // input is disabled and bound to formData.id), so validate the live
      // product ID rather than the stale snapshot stored at toggle time.
      const payCodeId =
        option.role === "salesman" ? formData.id.trim() : option.id.trim();
      if (payCodeId === "") {
        toast.error(
          t("Pay code ID is required for {{role}}", { role: roleLabel })
        );
        return;
      }
      const rateBiasa = parseFloat(normalRate) || 0;
      const parsedAhad = parseFloat(option.rate_ahad) || 0;
      const parsedUmum = parseFloat(option.rate_umum) || 0;
      setupPayload.push({
        role: option.role,
        // The salesman commission pay code always mirrors the product ID (the
        // daily-log same-id matching convention).
        id: option.role === "salesman" ? formData.id.trim() : payCodeId,
        description: option.description.trim() || formData.description.trim(),
        // The auto-setup creates base production/salesman rates; the server
        // requires a pay_type on every pay code.
        pay_type: "Base",
        rate_unit: option.rate_unit,
        rate_biasa: rateBiasa,
        rate_ahad: parsedAhad === 0 && rateBiasa > 0 ? rateBiasa : parsedAhad,
        rate_umum: parsedUmum === 0 && rateBiasa > 0 ? rateBiasa : parsedUmum,
      });
    }

    try {
      setIsSubmitting(true);
      await onSave(formData, setupPayload.length > 0 ? setupPayload : undefined);
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeOptions = [
    { id: "MEE", name: t("Mee") },
    { id: "BH", name: t("Bihun") },
    { id: "RAMEN", name: t("Ramen") },
    { id: "BUNDLE", name: t("Bundle") },
    { id: "JP", name: t("Jelly Polly") },
    { id: "OTH", name: t("Others") },
  ];

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-black/50 dark:bg-black/70"
            aria-hidden="true"
          />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-[min(96vw,90rem)] max-h-[90vh] overflow-y-auto transform rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-default-200 dark:border-gray-700">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  {mode === "create"
                    ? t("Create Product")
                    : t("Edit Product")}
                </DialogTitle>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-default-400 dark:text-gray-400 hover:text-default-600 dark:hover:text-gray-200"
                  aria-label={t("Close")}
                >
                  <IconX size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <section className="space-y-3">
                  <div className="flex items-center gap-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-default-500 dark:text-gray-400">
                      {t("Product Details")}
                    </h4>
                    <div className="flex-1 border-t border-default-200 dark:border-gray-700" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <FormInput
                    name="id"
                    label={t("Product ID")}
                    value={formData.id}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const nextId = e.target.value;
                      const previousId = formData.id.trim();
                      const nextTrimmedId = nextId.trim();
                      setFormData({ ...formData, id: nextId });
                      // Keep the suggested packing/ikut pay-code IDs in sync
                      // with the product ID until the user customizes them.
                      // The salesman commission pay code is disabled and
                      // mirrors the product ID, so keep its stored id in sync
                      // too (it is snapshotted when the box is ticked, which
                      // can happen before the product ID is typed).
                      setPaycodeSetup((prev) =>
                        prev.map((option) => {
                          if (option.role === "salesman")
                            return { ...option, id: nextTrimmedId };
                          const oldSuggestion =
                            option.role === "packing"
                              ? formData.type === "JP"
                                ? `PIP_${previousId}`
                                : `PM_${previousId}`
                              : `DME_${previousId}`;
                          if (option.id !== oldSuggestion) return option;
                          const nextSuggestion =
                            option.role === "packing"
                              ? formData.type === "JP"
                                ? `PIP_${nextTrimmedId}`
                                : `PM_${nextTrimmedId}`
                              : `DME_${nextTrimmedId}`;
                          return { ...option, id: nextSuggestion };
                        })
                      );
                    }}
                    required
                  />

                  <FormInput
                    name="description"
                    label={t("Description")}
                    value={formData.description}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    required
                  />

                  <FormInput
                    name="price_per_unit"
                    label={t("Price per Unit")}
                    type="number"
                    min={0}
                    step="0.05"
                    value={formData.price_per_unit}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({
                        ...formData,
                        price_per_unit: parseFloat(e.target.value) || 0,
                      })
                    }
                    required
                  />

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-default-700 dark:text-gray-200">
                      {t("Type")} <span className="text-red-500">*</span>
                    </label>
                    <PillSelect
                      value={formData.type}
                      onChange={(value: string) => {
                        setFormData({ ...formData, type: value });
                        // All applicable pay-code roles default to checked;
                        // units and suggested IDs depend on the type, so the
                        // drafts are rebuilt whenever the type changes.
                        setPaycodeSetup(
                          createDefaultSetup(
                            value,
                            formData.id,
                            formData.description
                          )
                        );
                      }}
                      options={typeOptions.map((option) => ({
                        value: option.id,
                        label: option.name,
                      }))}
                      size="md"
                      ariaLabel={t("Type")}
                      className="w-full"
                    />
                  </div>
                </div>

                  <div className="flex items-center pt-1">
                    <Checkbox
                      checked={formData.is_active}
                      onChange={(checked: boolean) =>
                        setFormData({ ...formData, is_active: checked })
                      }
                      label={t("Active")}
                      labelPosition="right"
                    />
                  </div>
                </section>

                {canAutoSetup && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-default-500 dark:text-gray-400">
                        {t("Pay Codes & Mappings")}
                      </h4>
                      <div className="flex-1 border-t border-default-200 dark:border-gray-700" />
                    </div>

                    <p className="text-xs text-default-500 dark:text-gray-400">
                      {t(
                        "Creates each pay code and maps it to this product and the salesman jobs in one step. The normal rate is required for every pay code; blank Sunday and holiday rates copy the normal rate."
                      )}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {availableSetupRoles.map((role) => {
                        const option = paycodeSetup.find(
                          (setup) => setup.role === role
                        );
                        return (
                          <div
                            key={role}
                            className="rounded-xl border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
                          >
                            <div className="px-3 py-2.5 bg-default-50 dark:bg-gray-800/60 border-b border-default-200 dark:border-gray-700">
                              <Checkbox
                                checked={isRoleSelected(role)}
                                onChange={() => toggleSetupRole(role)}
                                size={16}
                                checkedColor="text-sky-600"
                                label={t(SETUP_ROLE_LABELS[role])}
                              />
                              <p className="text-xs text-default-500 dark:text-gray-400 mt-0.5">
                                {t(SETUP_ROLE_DESCRIPTIONS[role])}
                              </p>
                            </div>

                            {option && (
                              <div className="p-3 space-y-3">
                                <FormListbox
                                  name={`setup-unit-${role}`}
                                  label={t("Unit")}
                                  value={option.rate_unit}
                                  onChange={(value: string) =>
                                    updateSetupRole(role, {
                                      rate_unit: value,
                                    })
                                  }
                                  options={unitsForRole(
                                    formData.type,
                                    role
                                  ).map((unit) => ({
                                    id: unit,
                                    name: t(
                                      SETUP_UNIT_OPTIONS.find(
                                        (unitOption) =>
                                          unitOption.id === unit
                                      )?.labelKey || unit
                                    ),
                                  }))}
                                  required
                                />
                                {role === "salesman" ? (
                                  <>
                                    <FormInput
                                      name={`setup-id-${role}`}
                                      label={t("Pay Code ID")}
                                      value={formData.id}
                                      disabled
                                    />
                                    <p className="text-xs text-default-500 dark:text-gray-400 -mt-2">
                                      {t(
                                        "Must match the product ID so salesman sales auto-fill"
                                      )}
                                    </p>
                                  </>
                                ) : (
                                  <FormInput
                                    name={`setup-id-${role}`}
                                    label={t("Pay Code ID")}
                                    value={option.id}
                                    onChange={(
                                      e: React.ChangeEvent<HTMLInputElement>
                                    ) =>
                                      updateSetupRole(role, {
                                        id: e.target.value,
                                      })
                                    }
                                    required
                                    placeholder={
                                      role === "ikut"
                                        ? "e.g. DME-RA2"
                                        : "e.g. PM_1-PR2"
                                    }
                                  />
                                )}

                                <FormInput
                                  name={`setup-desc-${role}`}
                                  label={t("Description")}
                                  value={option.description}
                                  onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>
                                  ) =>
                                    updateSetupRole(role, {
                                      description: e.target.value,
                                    })
                                  }
                                />

                                <div className="grid grid-cols-3 gap-2">
                                  <FormInput
                                    name={`setup-biasa-${role}`}
                                    label={t("Normal Rate")}
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={option.rate_biasa}
                                    onChange={(
                                      e: React.ChangeEvent<HTMLInputElement>
                                    ) =>
                                      updateSetupRole(role, {
                                        rate_biasa: e.target.value,
                                      })
                                    }
                                    required
                                  />
                                  <FormInput
                                    name={`setup-ahad-${role}`}
                                    label={t("Sunday Rate")}
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={option.rate_ahad}
                                    onChange={(
                                      e: React.ChangeEvent<HTMLInputElement>
                                    ) =>
                                      updateSetupRole(role, {
                                        rate_ahad: e.target.value,
                                      })
                                    }
                                  />
                                  <FormInput
                                    name={`setup-umum-${role}`}
                                    label={t("Holiday Rate")}
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={option.rate_umum}
                                    onChange={(
                                      e: React.ChangeEvent<HTMLInputElement>
                                    ) =>
                                      updateSetupRole(role, {
                                        rate_umum: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-default-200 dark:border-gray-700">
                  <Button
                    type="button"
                    onClick={onClose}
                    variant="outline"
                    disabled={isSubmitting}
                  >
                    {t("Cancel")}
                  </Button>
                  <Button type="submit" color="sky" disabled={isSubmitting}>
                    {isSubmitting
                      ? t("Saving...")
                      : mode === "create"
                      ? t("Create")
                      : t("Update")}
                  </Button>
                </div>
              </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ProductModal;
