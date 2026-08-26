import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconAlertTriangle,
  IconCheck,
  IconEdit,
  IconLink,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUnlink,
  IconX,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { api } from "../../routes/utils/api";
import { PayCode } from "../../types/types";
import { invalidateJPJobPayCodeMappingsCache } from "../../utils/JellyPolly/useJPJobPayCodeMappings";
import { invalidateJobPayCodeMappingsCache } from "../../utils/catalogue/useJobPayCodeMappings";
import { invalidateSalesmanIkutPayCodesCache } from "../../utils/catalogue/useSalesmanIkutPayCodes";
import Button from "../Button";
import LoadingSpinner from "../LoadingSpinner";
import PayCodeModal from "./PayCodeModal";

type PayCodeScope = "tienhock" | "jellypolly";
type ProductPayCodeRole = "packing" | "salesman" | "ikut";

interface ProductSummary {
  id: string;
  description: string;
  type: string;
}

interface PayCodeUsage {
  product_links: number;
  job_links: number;
  employee_links: number;
  rate_schedules: number;
  historical_records: number;
}

interface ProductPayCode extends PayCode {
  scope: PayCodeScope;
  roles: ProductPayCodeRole[];
  job_ids: string[];
  usage: PayCodeUsage;
}

interface ProductPayCodeResponse {
  product: ProductSummary;
  pay_codes: ProductPayCode[];
}

interface ProductPayCodeCatalogueResponse {
  scope: PayCodeScope;
  pay_codes: ProductPayCode[];
}

interface ProductPayCodeManagerProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductSummary;
  onChanged?: () => void;
}

interface EditorState {
  mode: "create" | "edit";
  scope: PayCodeScope;
  role?: ProductPayCodeRole;
  payCode?: ProductPayCode;
}

const ROLE_ORDER: ProductPayCodeRole[] = ["packing", "salesman", "ikut"];
const PRODUCTION_UNITS: ReadonlySet<string> = new Set<string>([
  "Bag",
  "Ctn",
  "Bundle",
  "PKT",
  "PCS",
  "Kg",
  "Karung",
]);
const canAddRoleForProduct = (
  productType: string,
  role: ProductPayCodeRole
): boolean => {
  if (role === "packing") return true;
  if (role === "salesman") {
    return ["MEE", "BH", "RAMEN", "JP"].includes(productType);
  }
  return ["MEE", "BH", "RAMEN"].includes(productType);
};

const roleLabelKey = (role: ProductPayCodeRole): string => {
  if (role === "packing") return "Packing / production";
  if (role === "salesman") return "Salesman commission";
  return "Ikut Lori";
};

const scopeLabelKey = (scope: PayCodeScope): string =>
  scope === "tienhock" ? "Tien Hock" : "Jelly Polly";

const getErrorMessage = (error: unknown): string | null => {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error !== "object" || error === null) return null;

  const errorRecord = error as Record<string, unknown>;
  const data = errorRecord.data;
  if (typeof data === "object" && data !== null) {
    const dataRecord = data as Record<string, unknown>;
    if (typeof dataRecord.message === "string") return dataRecord.message;
    if (typeof dataRecord.error === "string") return dataRecord.error;
  }
  return typeof errorRecord.message === "string" ? errorRecord.message : null;
};

const encodePathPart = (value: string): string => encodeURIComponent(value);

const ProductPayCodeManager: React.FC<ProductPayCodeManagerProps> = ({
  isOpen,
  onClose,
  product,
  onChanged,
}) => {
  const { t } = useTranslation("catalogue");
  const [payCodes, setPayCodes] = useState<ProductPayCode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const [confirmUnlinkKey, setConfirmUnlinkKey] = useState<string | null>(null);
  const [confirmEditKey, setConfirmEditKey] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] =
    useState<ProductPayCodeRole>("packing");
  const [selectedScope, setSelectedScope] =
    useState<PayCodeScope>("tienhock");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null
  );
  const [isAddPanelOpen, setIsAddPanelOpen] = useState<boolean>(false);
  const [candidatePayCodes, setCandidatePayCodes] = useState<
    Partial<Record<PayCodeScope, ProductPayCode[]>>
  >({});
  const [candidateLoadingScope, setCandidateLoadingScope] =
    useState<PayCodeScope | null>(null);
  const [candidateErrors, setCandidateErrors] = useState<
    Partial<Record<PayCodeScope, string>>
  >({});
  const [editor, setEditor] = useState<EditorState | null>(null);

  const productPath = `/api/products/${encodePathPart(product.id)}/paycode-links`;
  const isMutating = mutationKey !== null;

  const loadPayCodes = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await api.get<ProductPayCodeResponse>(
        `/api/products/${encodePathPart(product.id)}/paycode-links`
      );
      setPayCodes(Array.isArray(response.pay_codes) ? response.pay_codes : []);
    } catch (error: unknown) {
      setLoadError(
        getErrorMessage(error) || t("Failed to load product pay codes")
      );
    } finally {
      setIsLoading(false);
    }
  }, [product.id, t]);

  const loadCandidatePayCodes = useCallback(
    async (scope: PayCodeScope): Promise<void> => {
      setCandidateLoadingScope(scope);
      setCandidateErrors((currentErrors) => ({
        ...currentErrors,
        [scope]: undefined,
      }));
      try {
        const response = await api.get<ProductPayCodeCatalogueResponse>(
          `/api/products/${encodePathPart(
            product.id
          )}/paycode-candidates?scope=${encodePathPart(scope)}`
        );
        setCandidatePayCodes((currentPayCodes) => ({
          ...currentPayCodes,
          [scope]: Array.isArray(response.pay_codes)
            ? response.pay_codes
            : [],
        }));
      } catch (error: unknown) {
        setCandidateErrors((currentErrors) => ({
          ...currentErrors,
          [scope]:
            getErrorMessage(error) ||
            t("Failed to load available pay codes"),
        }));
      } finally {
        setCandidateLoadingScope((currentScope) =>
          currentScope === scope ? null : currentScope
        );
      }
    },
    [product.id, t]
  );

  useEffect((): void => {
    if (!isOpen) return;
    setSelectedRole("packing");
    setSelectedScope(product.type === "JP" ? "jellypolly" : "tienhock");
    setSearchQuery("");
    setSelectedCandidateId(null);
    setConfirmUnlinkKey(null);
    setConfirmEditKey(null);
    setIsAddPanelOpen(false);
    setCandidatePayCodes({});
    setCandidateLoadingScope(null);
    setCandidateErrors({});
    setEditor(null);
    void loadPayCodes();
  }, [isOpen, product.id, product.type, loadPayCodes]);

  useEffect((): void => {
    if (
      !isOpen ||
      !isAddPanelOpen ||
      candidatePayCodes[selectedScope] !== undefined ||
      candidateErrors[selectedScope] !== undefined ||
      candidateLoadingScope === selectedScope
    ) {
      return;
    }
    void loadCandidatePayCodes(selectedScope);
  }, [
    candidateLoadingScope,
    candidateErrors,
    candidatePayCodes,
    isAddPanelOpen,
    isOpen,
    loadCandidatePayCodes,
    selectedScope,
  ]);

  useEffect((): void => {
    if (selectedRole === "ikut" && selectedScope !== "tienhock") {
      setSelectedScope("tienhock");
    }
    setSelectedCandidateId(null);
  }, [selectedRole, selectedScope]);

  const clearPayCodeCaches = (): void => {
    invalidateJobPayCodeMappingsCache();
    invalidateJPJobPayCodeMappingsCache();
    invalidateSalesmanIkutPayCodesCache();
  };

  const finishMutation = async (): Promise<void> => {
    clearPayCodeCaches();
    if (isAddPanelOpen) {
      // Prevent the lazy-load effect from starting a duplicate request while
      // the linked rows are being refreshed first.
      setCandidateLoadingScope(selectedScope);
    }
    setCandidatePayCodes({});
    await loadPayCodes();
    if (isAddPanelOpen) {
      await loadCandidatePayCodes(selectedScope);
    }
    onChanged?.();
  };

  const closeManager = (): void => {
    if (!isMutating) onClose();
  };

  const linkedByRole = useMemo(
    (): Record<ProductPayCodeRole, ProductPayCode[]> => ({
      packing: payCodes.filter((payCode): boolean =>
        payCode.roles.includes("packing")
      ),
      salesman: payCodes.filter((payCode): boolean =>
        payCode.roles.includes("salesman")
      ),
      ikut: payCodes.filter((payCode): boolean => payCode.roles.includes("ikut")),
    }),
    [payCodes]
  );

  const isValidNewCandidate = useCallback(
    (payCode: ProductPayCode): boolean => {
      if (payCode.scope !== selectedScope) return false;
      if (!canAddRoleForProduct(product.type, selectedRole)) return false;
      if (
        linkedByRole[selectedRole].some(
          (linkedPayCode): boolean =>
            linkedPayCode.scope === payCode.scope &&
            linkedPayCode.id === payCode.id
        )
      ) {
        return false;
      }
      if (!PRODUCTION_UNITS.has(payCode.rate_unit)) return false;

      if (selectedRole === "packing") {
        return product.type === "RAMEN"
          ? payCode.rate_unit === "PKT"
          : payCode.rate_unit !== "PKT";
      }
      if (selectedRole === "salesman") return payCode.id === product.id;
      return selectedScope === "tienhock";
    },
    [linkedByRole, product.id, product.type, selectedRole, selectedScope]
  );

  const candidates = useMemo((): ProductPayCode[] => {
    const query = searchQuery.trim().toLowerCase();
    return (candidatePayCodes[selectedScope] || [])
      .filter(isValidNewCandidate)
      .filter(
        (payCode): boolean =>
          query === "" ||
          payCode.id.toLowerCase().includes(query) ||
          payCode.description.toLowerCase().includes(query)
      )
      .sort((left, right): number => left.id.localeCompare(right.id));
  }, [candidatePayCodes, isValidNewCandidate, searchQuery, selectedScope]);

  const selectedCandidate = useMemo(
    (): ProductPayCode | null =>
      candidates.find(
        (candidate): boolean => candidate.id === selectedCandidateId
      ) || null,
    [candidates, selectedCandidateId]
  );

  const missingCanonicalJobs = (
    payCode: ProductPayCode,
    role: ProductPayCodeRole
  ): string[] => {
    let requiredJobs: string[] = [];
    if (role === "salesman" && payCode.scope === "tienhock") {
      requiredJobs = ["SALESMAN"];
    } else if (role === "salesman" && payCode.scope === "jellypolly") {
      requiredJobs = ["JP_SALESMAN", "JP_SALESMAN_IKUT"];
    } else if (role === "ikut" && payCode.scope === "tienhock") {
      requiredJobs = ["SALESMAN_IKUT"];
    }
    return requiredJobs.filter(
      (jobId): boolean => !payCode.job_ids.includes(jobId)
    );
  };

  const isRoleCompatible = (
    payCode: ProductPayCode,
    role: ProductPayCodeRole
  ): boolean => {
    if (!PRODUCTION_UNITS.has(payCode.rate_unit)) return false;
    if (role === "packing") {
      return product.type === "RAMEN"
        ? payCode.rate_unit === "PKT"
        : payCode.rate_unit !== "PKT";
    }
    if (role === "salesman") return payCode.id === product.id;
    return payCode.scope === "tienhock";
  };

  const linkPayCode = async (
    scope: PayCodeScope,
    role: ProductPayCodeRole,
    payCodeId: string,
    payCode?: PayCode
  ): Promise<void> => {
    const key = `link:${scope}:${role}:${payCodeId}`;
    setMutationKey(key);
    setLoadError(null);
    try {
      await api.post(productPath, {
        scope,
        role,
        pay_code_id: payCodeId,
        ...(payCode ? { pay_code: payCode } : {}),
      });
      await finishMutation();
      setSelectedCandidateId(null);
      setSearchQuery("");
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error) || t("Failed to link pay code"));
      throw error;
    } finally {
      setMutationKey(null);
    }
  };

  const unlinkPayCode = async (
    payCode: ProductPayCode,
    role: ProductPayCodeRole
  ): Promise<void> => {
    const key = `unlink:${payCode.scope}:${role}:${payCode.id}`;
    setMutationKey(key);
    setLoadError(null);
    try {
      await api.delete(
        `${productPath}/${encodePathPart(payCode.scope)}/${encodePathPart(
          role
        )}/${encodePathPart(payCode.id)}`
      );
      await finishMutation();
      setConfirmUnlinkKey(null);
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error) || t("Failed to unlink pay code"));
    } finally {
      setMutationKey(null);
    }
  };

  const repairPayCode = async (
    payCode: ProductPayCode,
    role: ProductPayCodeRole
  ): Promise<void> => {
    try {
      await linkPayCode(payCode.scope, role, payCode.id);
    } catch (_error: unknown) {
      // linkPayCode already exposes the actionable API error in the manager.
    }
  };

  const saveEditorPayCode = async (payCode: PayCode): Promise<void> => {
    if (!editor) return;
    const key = `${editor.mode}:${editor.scope}:${payCode.id}`;
    setMutationKey(key);
    setLoadError(null);
    try {
      if (editor.mode === "create") {
        if (!editor.role) return;
        await api.post(productPath, {
          scope: editor.scope,
          role: editor.role,
          pay_code_id: payCode.id,
          pay_code: payCode,
        });
      } else {
        const originalPayCodeId = editor.payCode?.id || payCode.id;
        await api.put(
          `${productPath}/${encodePathPart(editor.scope)}/${encodePathPart(
            originalPayCodeId
          )}`,
          payCode
        );
      }
      await finishMutation();
      setEditor(null);
    } catch (error: unknown) {
      setLoadError(
        getErrorMessage(error) ||
          (editor.mode === "create"
            ? t("Failed to create and link pay code")
            : t("Failed to update pay code"))
      );
      throw error;
    } finally {
      setMutationKey(null);
    }
  };

  const editorPayCodes = useMemo(
    (): PayCode[] => {
      if (!editor) return [];
      const payCodesById = new Map<string, PayCode>();
      [
        ...payCodes.filter(
          (payCode): boolean => payCode.scope === editor.scope
        ),
        ...(candidatePayCodes[editor.scope] || []),
      ].forEach((payCode): void => {
        payCodesById.set(payCode.id, payCode);
      });
      return Array.from(payCodesById.values());
    },
    [candidatePayCodes, editor, payCodes]
  );

  const renderPayCodeCard = (
    payCode: ProductPayCode,
    role: ProductPayCodeRole
  ): React.ReactNode => {
    const unlinkKey = `${payCode.scope}:${role}:${payCode.id}`;
    const pendingUnlink = confirmUnlinkKey === unlinkKey;
    const editKey = `${payCode.scope}:${payCode.id}`;
    const pendingEdit = confirmEditKey === editKey;
    const missingJobs = missingCanonicalJobs(payCode, role);
    const isCompatible = isRoleCompatible(payCode, role);
    const usageTotal =
      payCode.usage.product_links +
      payCode.usage.job_links +
      payCode.usage.employee_links +
      payCode.usage.rate_schedules +
      payCode.usage.historical_records;

    return (
      <article
        key={`${payCode.scope}:${role}:${payCode.id}`}
        className="rounded-xl border border-default-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-default-800 dark:text-gray-100">
                {payCode.id}
              </span>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                {t(scopeLabelKey(payCode.scope))}
              </span>
              <span className="rounded-full bg-default-100 px-2 py-0.5 text-xs text-default-600 dark:bg-gray-700 dark:text-gray-300">
                {payCode.rate_unit}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                  payCode.is_active
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                }`}
              >
                {payCode.is_active ? (
                  <IconCheck size={12} aria-hidden="true" />
                ) : (
                  <IconAlertTriangle size={12} aria-hidden="true" />
                )}
                {payCode.is_active ? t("Active") : t("Inactive")}
              </span>
              {!isCompatible && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                  <IconAlertTriangle size={12} aria-hidden="true" />
                  {t("Incompatible saved link")}
                </span>
              )}
            </div>
            <p className="mt-1 break-words text-sm text-default-600 dark:text-gray-300">
              {payCode.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-default-500 dark:text-gray-400">
              <span>{t("Normal: RM {{rate}}", { rate: payCode.rate_biasa.toFixed(2) })}</span>
              <span>{t("Sunday: RM {{rate}}", { rate: payCode.rate_ahad.toFixed(2) })}</span>
              <span>{t("Holiday: RM {{rate}}", { rate: payCode.rate_umum.toFixed(2) })}</span>
              <span>{t("{{count}} usage records", { count: usageTotal })}</span>
            </div>
            {missingJobs.length > 0 && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {t("Incomplete job links: {{jobs}}", {
                    jobs: missingJobs.join(", "),
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  color="amber"
                  icon={IconRefresh}
                  disabled={isMutating}
                  onClick={() => void repairPayCode(payCode, role)}
                >
                  {t("Repair")}
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 sm:flex-shrink-0 sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              color="sky"
              icon={IconEdit}
              disabled={isMutating}
              onClick={() => setConfirmEditKey(editKey)}
            >
              {t("Edit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              color="rose"
              icon={IconUnlink}
              disabled={isMutating}
              onClick={() => setConfirmUnlinkKey(unlinkKey)}
            >
              {t("Unlink")}
            </Button>
          </div>
        </div>

        {pendingUnlink && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/60 dark:bg-rose-900/20">
            <p className="text-sm text-rose-800 dark:text-rose-200">
              {t(
                "Unlink this role from the product? The pay code and all payroll history will be kept."
              )}
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isMutating}
                onClick={() => setConfirmUnlinkKey(null)}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="filled"
                color="rose"
                disabled={isMutating}
                onClick={() => void unlinkPayCode(payCode, role)}
              >
                {mutationKey === `unlink:${unlinkKey}`
                  ? t("Unlinking...")
                  : t("Confirm unlink")}
              </Button>
            </div>
          </div>
        )}

        {pendingEdit && !pendingUnlink && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-900/20">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {t(
                "Editing this pay code changes its description, status, unit, and rates globally everywhere the same catalogue pay code is used."
              )}
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isMutating}
                onClick={() => setConfirmEditKey(null)}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="filled"
                color="amber"
                disabled={isMutating}
                onClick={() => {
                  setConfirmEditKey(null);
                  setEditor({ mode: "edit", scope: payCode.scope, payCode });
                }}
              >
                {t("Continue to edit")}
              </Button>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <>
      <Transition
        appear
        show={isOpen && editor === null}
        as={Fragment}
      >
        <Dialog
          as="div"
          className="relative z-50"
          onClose={closeManager}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div
              className="fixed inset-0 bg-black/50 dark:bg-black/70"
              aria-hidden="true"
            />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto p-2 sm:p-4">
            <div className="flex min-h-full items-center justify-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white text-left shadow-xl dark:bg-gray-900 sm:max-h-[92vh]">
                  <header className="flex items-start justify-between gap-3 border-b border-default-200 p-4 dark:border-gray-700 sm:p-5">
                    <div className="min-w-0">
                      <DialogTitle className="break-words text-lg font-semibold text-default-800 dark:text-gray-100">
                        {t("Product pay codes: {{product}} — {{description}}", {
                          product: product.id,
                          description: product.description,
                        })}
                      </DialogTitle>
                      <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                        {t(
                          "Authoritative view of every pay code linked to this product in Tien Hock and Jelly Polly, including links created elsewhere."
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-default-500 hover:bg-default-100 hover:text-default-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      onClick={closeManager}
                      disabled={isMutating}
                      aria-label={t("Close")}
                    >
                      <IconX size={22} aria-hidden="true" />
                    </button>
                  </header>

                  <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                    {loadError && (
                      <div
                        role="alert"
                        className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-200"
                      >
                        {loadError}
                      </div>
                    )}

                    {isLoading && payCodes.length === 0 ? (
                      <div className="flex min-h-48 items-center justify-center">
                        <LoadingSpinner />
                        <span className="sr-only">{t("Loading pay codes...")}</span>
                      </div>
                    ) : (
                      <div className="space-y-7">
                        <section aria-labelledby="linked-pay-codes-heading">
                          <div className="mb-3">
                            <h3
                              id="linked-pay-codes-heading"
                              className="font-semibold text-default-800 dark:text-gray-100"
                            >
                              {t("Linked pay codes")}
                            </h3>
                            <p className="text-xs text-default-500 dark:text-gray-400">
                              {t(
                                "Saved links stay visible here even when they are inactive, incompatible, or incomplete."
                              )}
                            </p>
                          </div>

                          {ROLE_ORDER.every(
                            (role): boolean => linkedByRole[role].length === 0
                          ) ? (
                            <div className="rounded-xl border border-dashed border-default-300 p-6 text-center text-sm text-default-500 dark:border-gray-700 dark:text-gray-400">
                              {t("No pay codes are linked to this product yet.")}
                            </div>
                          ) : (
                            <div className="space-y-5">
                              {ROLE_ORDER.map((role) => {
                                const linkedCodes = linkedByRole[role];
                                if (linkedCodes.length === 0) return null;
                                return (
                                  <section
                                    key={role}
                                    aria-labelledby={`product-pay-code-role-${role}`}
                                  >
                                    <h4
                                      id={`product-pay-code-role-${role}`}
                                      className="mb-2 text-sm font-semibold text-default-700 dark:text-gray-200"
                                    >
                                      {t("{{role}} ({{count}})", {
                                        role: t(roleLabelKey(role)),
                                        count: linkedCodes.length,
                                      })}
                                    </h4>
                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                      {linkedCodes
                                        .slice()
                                        .sort((left, right): number =>
                                          `${left.scope}:${left.id}`.localeCompare(
                                            `${right.scope}:${right.id}`
                                          )
                                        )
                                        .map((payCode) =>
                                          renderPayCodeCard(payCode, role)
                                        )}
                                    </div>
                                  </section>
                                );
                              })}
                            </div>
                          )}
                        </section>

                        {!isAddPanelOpen ? (
                          <section className="flex flex-col gap-3 rounded-xl border border-dashed border-sky-300 bg-sky-50/50 p-4 dark:border-sky-800 dark:bg-sky-950/20 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h3 className="font-semibold text-default-800 dark:text-gray-100">
                                {t("Add or link a pay code")}
                              </h3>
                              <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                                {t(
                                  "Open the add options to link an existing pay code or create a new one."
                                )}
                              </p>
                            </div>
                            <Button
                              type="button"
                              color="sky"
                              variant="outline"
                              icon={IconPlus}
                              disabled={isMutating}
                              onClick={() => setIsAddPanelOpen(true)}
                            >
                              {t("Open add options")}
                            </Button>
                          </section>
                        ) : (
                          <section
                            aria-labelledby="add-pay-code-heading"
                            className="border-t border-default-200 pt-6 dark:border-gray-700"
                          >
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h3
                                  id="add-pay-code-heading"
                                  className="font-semibold text-default-800 dark:text-gray-100"
                                >
                                  {t("Add or create a link")}
                                </h3>
                                <p className="text-xs text-default-500 dark:text-gray-400">
                                  {t(
                                    "Choose the role and catalogue explicitly. Only compatible new choices are offered; saved links above are never hidden."
                                  )}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={isMutating}
                                onClick={() => setIsAddPanelOpen(false)}
                              >
                                {t("Hide add options")}
                              </Button>
                            </div>

                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="space-y-4">
                              <fieldset>
                                <legend className="mb-2 text-sm font-medium text-default-700 dark:text-gray-200">
                                  {t("Role")}
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                  {ROLE_ORDER.map((role) => {
                                    const roleAvailable: boolean =
                                      canAddRoleForProduct(product.type, role);
                                    return (
                                      <button
                                        key={role}
                                        type="button"
                                        className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                                          selectedRole === role
                                            ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                                            : "border-default-300 text-default-600 hover:bg-default-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                                        }`}
                                        aria-pressed={selectedRole === role}
                                        disabled={!roleAvailable}
                                        onClick={() => setSelectedRole(role)}
                                      >
                                        {t(roleLabelKey(role))}
                                      </button>
                                    );
                                  })}
                                </div>
                              </fieldset>

                              <fieldset>
                                <legend className="mb-2 text-sm font-medium text-default-700 dark:text-gray-200">
                                  {t("Pay code catalogue")}
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                  {(["tienhock", "jellypolly"] as PayCodeScope[]).map(
                                    (scope) => {
                                      const disabled =
                                        selectedRole === "ikut" &&
                                        scope === "jellypolly";
                                      return (
                                        <button
                                          key={scope}
                                          type="button"
                                          className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                                            selectedScope === scope
                                              ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                                              : "border-default-300 text-default-600 hover:bg-default-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                                          }`}
                                          aria-pressed={selectedScope === scope}
                                          disabled={disabled}
                                          onClick={() => setSelectedScope(scope)}
                                        >
                                          {t(scopeLabelKey(scope))}
                                        </button>
                                      );
                                    }
                                  )}
                                </div>
                                {selectedRole === "ikut" && (
                                  <p className="mt-2 text-xs text-default-500 dark:text-gray-400">
                                    {t("Ikut Lori links are available in Tien Hock only.")}
                                  </p>
                                )}
                                {selectedRole === "salesman" && (
                                  <p className="mt-2 text-xs text-default-500 dark:text-gray-400">
                                    {t(
                                      "Salesman commission requires a pay code whose ID exactly matches product ID {{product}}.",
                                      { product: product.id }
                                    )}
                                  </p>
                                )}
                              </fieldset>

                              <div>
                                <label
                                  htmlFor="product-pay-code-search"
                                  className="mb-2 block text-sm font-medium text-default-700 dark:text-gray-200"
                                >
                                  {t("Search existing pay codes")}
                                </label>
                                <div className="relative">
                                  <IconSearch
                                    size={18}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-default-400"
                                    aria-hidden="true"
                                  />
                                  <input
                                    id="product-pay-code-search"
                                    type="search"
                                    value={searchQuery}
                                    onChange={(
                                      event: React.ChangeEvent<HTMLInputElement>
                                    ) => setSearchQuery(event.target.value)}
                                    placeholder={t("Search by ID or description...")}
                                    disabled={
                                      candidateLoadingScope === selectedScope ||
                                      candidatePayCodes[selectedScope] === undefined
                                    }
                                    className="min-h-11 w-full rounded-lg border border-default-300 bg-white py-2 pl-10 pr-3 text-sm text-default-800 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex min-h-56 flex-col rounded-xl border border-default-200 dark:border-gray-700">
                              <div className="border-b border-default-200 px-3 py-2 text-sm font-medium text-default-700 dark:border-gray-700 dark:text-gray-200">
                                {t("Available pay codes ({{count}})", {
                                  count: candidates.length,
                                })}
                              </div>
                              <div className="max-h-64 flex-1 overflow-y-auto p-2">
                                {candidateLoadingScope === selectedScope ||
                                (candidatePayCodes[selectedScope] === undefined &&
                                  !candidateErrors[selectedScope]) ? (
                                  <div className="flex h-full min-h-36 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-default-500 dark:text-gray-400">
                                    <LoadingSpinner />
                                    <span>{t("Loading available pay codes...")}</span>
                                  </div>
                                ) : candidateErrors[selectedScope] ? (
                                  <div
                                    role="alert"
                                    className="flex h-full min-h-36 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-rose-700 dark:text-rose-300"
                                  >
                                    <span>{candidateErrors[selectedScope]}</span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      icon={IconRefresh}
                                      onClick={() =>
                                        void loadCandidatePayCodes(selectedScope)
                                      }
                                    >
                                      {t("Try again")}
                                    </Button>
                                  </div>
                                ) : candidates.length === 0 ? (
                                  <div className="flex h-full min-h-36 items-center justify-center px-4 text-center text-sm text-default-500 dark:text-gray-400">
                                    {selectedRole === "salesman"
                                      ? t(
                                          "No compatible unlinked code matches this product ID. Create and link one below."
                                        )
                                      : t("No compatible unlinked pay codes found.")}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {candidates.map((candidate) => (
                                      <button
                                        key={`${candidate.scope}:${candidate.id}`}
                                        type="button"
                                        className={`w-full rounded-lg border p-3 text-left focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                                          selectedCandidateId === candidate.id
                                            ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                                            : "border-default-200 hover:bg-default-50 dark:border-gray-700 dark:hover:bg-gray-800"
                                        }`}
                                        aria-pressed={
                                          selectedCandidateId === candidate.id
                                        }
                                        onClick={() =>
                                          setSelectedCandidateId(candidate.id)
                                        }
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-medium text-default-800 dark:text-gray-100">
                                            {candidate.id}
                                          </span>
                                          <span className="rounded-full bg-default-100 px-2 py-0.5 text-xs text-default-600 dark:bg-gray-700 dark:text-gray-300">
                                            {candidate.rate_unit}
                                          </span>
                                          {!candidate.is_active && (
                                            <span className="text-xs text-amber-700 dark:text-amber-300">
                                              {t("Inactive")}
                                            </span>
                                          )}
                                        </div>
                                        <p className="mt-1 text-xs text-default-500 dark:text-gray-400">
                                          {candidate.description}
                                        </p>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col gap-2 border-t border-default-200 p-3 dark:border-gray-700 sm:flex-row sm:justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  icon={IconPlus}
                                  disabled={
                                    isMutating ||
                                    candidateLoadingScope === selectedScope ||
                                    candidatePayCodes[selectedScope] === undefined ||
                                    !canAddRoleForProduct(
                                      product.type,
                                      selectedRole
                                    )
                                  }
                                  onClick={() =>
                                    setEditor({
                                      mode: "create",
                                      scope: selectedScope,
                                      role: selectedRole,
                                    })
                                  }
                                >
                                  {t("Create and link")}
                                </Button>
                                <Button
                                  type="button"
                                  color="sky"
                                  variant="filled"
                                  icon={IconLink}
                                  disabled={
                                    !selectedCandidate ||
                                    isMutating ||
                                    candidateLoadingScope === selectedScope
                                  }
                                  onClick={() => {
                                    if (!selectedCandidate) return;
                                    void linkPayCode(
                                      selectedScope,
                                      selectedRole,
                                      selectedCandidate.id
                                    ).catch((): void => undefined);
                                  }}
                                >
                                  {isMutating ? t("Saving...") : t("Link selected")}
                                </Button>
                              </div>
                            </div>
                          </div>
                          </section>
                        )}
                      </div>
                    )}
                  </div>

                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-default-200 bg-default-50 p-4 dark:border-gray-700 dark:bg-gray-900 sm:px-5">
                    <span className="text-xs text-default-500 dark:text-gray-400">
                      {isMutating
                        ? t("Saving pay code changes...")
                        : t("Every saved link is shown above.")}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isMutating}
                      onClick={closeManager}
                    >
                      {t("Close")}
                    </Button>
                  </footer>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      <PayCodeModal
        isOpen={isOpen && editor !== null}
        onClose={() => {
          if (!isMutating) setEditor(null);
        }}
        onSave={saveEditorPayCode}
        initialData={editor?.mode === "edit" ? editor.payCode || null : null}
        existingPayCodes={editorPayCodes}
        apiBase={
          editor?.scope === "jellypolly" ? "/jellypolly/api" : "/api"
        }
      />

    </>
  );
};

export default ProductPayCodeManager;
