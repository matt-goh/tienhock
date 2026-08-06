// src/pages/Catalogue/CustomerDetailsPage.tsx
// Read-only "at a glance" view of a single customer. Identity, contact and
// e-Invoice details are shown as plain text; the only interactive parts are the
// Credit & Pricing section (saved on its own) and the Transaction History
// section. An "Edit" button opens the full editable form at
// /catalogue/customer/:id/edit.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  IconPencil,
  IconBuildingSkyscraper,
  IconBuildingStore,
} from "@tabler/icons-react";
import { CustomProduct } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import { api } from "../../routes/utils/api";
import {
  EnhancedCustomerList,
  refreshCustomersCache,
  useCustomersCache,
} from "../../utils/catalogue/useCustomerCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import { getStateName } from "../../utils/catalogue/customerOptions";
import CustomerCreditSection from "../../components/Catalogue/CustomerCreditSection";
import CustomerProductsTab from "../../components/Catalogue/CustomerProductsTab";
import CustomerTransactionsTab, {
  TxnCache,
  getDefaultTransactionsRange,
} from "../../components/Catalogue/CustomerTransactionsTab";
import { TimeRange } from "../../components/TimeNavigator";

// A single read-only label + value pair.
const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({
  label,
  value,
}) => {
  const isEmpty = value === undefined || value === null || value === "";
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-default-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm text-default-900 dark:text-gray-100 break-words">
        {isEmpty ? (
          <span className="text-default-400 dark:text-gray-500">—</span>
        ) : (
          value
        )}
      </p>
    </div>
  );
};

const Section: React.FC<{
  title: string;
  action?: React.ReactNode;
  sectionRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}> = ({ title, action, sectionRef, children }) => (
  <div
    ref={sectionRef}
    className="border-t border-default-200 dark:border-gray-700 pt-6 mt-6 first:border-t-0 first:pt-0 first:mt-0 scroll-mt-4"
  >
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="text-base font-medium text-default-800 dark:text-gray-100">
        {title}
      </h3>
      {action}
    </div>
    {children}
  </div>
);

const CustomerDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("catalogue");
  const { id } = useParams<{ id: string }>();
  const { customers, isLoading } = useCustomersCache();
  const { salesmen } = useSalesmanCache();

  // Deep-link from the customer card / invoice pages: ?tab=transactions jumps
  // straight to the Transaction History section at the bottom of the page.
  const [searchParams] = useSearchParams();
  const wantsTransactions = searchParams.get("tab") === "transactions";
  const transactionsRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);

  const [customer, setCustomer] = useState<EnhancedCustomerList | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Editable state (Credit & Pricing only) ---
  const [creditLimit, setCreditLimit] = useState(0);
  const [creditUsed, setCreditUsed] = useState(0);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const initialCreditRef = useRef<{ limit: number; used: number } | null>(null);
  const initialProductsRef = useRef<CustomProduct[] | null>(null);
  const originalProductIdsRef = useRef<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // --- Transaction History state (kept here so it survives re-renders) ---
  const [txnRange, setTxnRange] = useState<TimeRange>(
    getDefaultTransactionsRange
  );
  const [txnCache, setTxnCache] = useState<TxnCache | null>(null);

  // --- Load from the customers cache ---
  useEffect(() => {
    if (!id || isLoading) return;

    const cached = customers.find((c) => c.id === id);
    if (!cached) {
      setCustomer(null);
      setError(
        t(
          "Customer with ID {{id}} not found in cache, please refresh the customers at Customer page.",
          { id }
        )
      );
      return;
    }

    setCustomer(cached);
    setError(null);

    const limit = Number(cached.credit_limit ?? 3000) || 0;
    const used = Number(cached.credit_used ?? 0) || 0;
    setCreditLimit(limit);
    setCreditUsed(used);
    initialCreditRef.current = { limit, used };

    const products: CustomProduct[] = cached.customProducts
      ? JSON.parse(JSON.stringify(cached.customProducts))
      : [];
    setCustomProducts(products);
    initialProductsRef.current = JSON.parse(JSON.stringify(products));
    originalProductIdsRef.current = new Set(products.map((p) => p.product_id));
  }, [id, customers, isLoading, t]);

  // Scroll to Transaction History once, and only after its rows have arrived -
  // until then the section is a loading spinner and the page is far shorter
  // than it ends up being, so an earlier scroll lands mid-page.
  useEffect(() => {
    if (!customer || hasScrolledRef.current || !wantsTransactions) return;
    if (!txnCache) return;
    const target = transactionsRef.current;
    if (!target) return;
    hasScrolledRef.current = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [customer, wantsTransactions, txnCache]);

  const isCreditChanged = useMemo(() => {
    const initialCredit = initialCreditRef.current;
    const creditChanged =
      !!initialCredit &&
      (initialCredit.limit !== creditLimit || initialCredit.used !== creditUsed);
    const productsChanged =
      !!initialProductsRef.current &&
      JSON.stringify(customProducts) !==
        JSON.stringify(initialProductsRef.current);
    return creditChanged || productsChanged;
  }, [creditLimit, creditUsed, customProducts]);

  const handleProductsChange = useCallback((updated: CustomProduct[]) => {
    setCustomProducts(updated);
  }, []);

  const handleSaveCredit = async () => {
    if (!customer || !id) return;

    // Same guard the form page applies to custom pricing rows.
    for (const product of customProducts) {
      if (!product.product_id) {
        toast.error(
          t("Please select a product for all custom pricing rows.")
        );
        return;
      }
      const priceValue =
        typeof product.custom_price === "string"
          ? parseFloat(product.custom_price)
          : product.custom_price;
      if (
        priceValue === undefined ||
        priceValue === null ||
        isNaN(priceValue) ||
        priceValue < 0
      ) {
        toast.error(
          t(
            "Invalid custom price for product ID {{id}}. Price must be a non-negative number.",
            { id: product.product_id }
          )
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      // The customers PUT is a full-record update, so the untouched identity
      // fields are sent back exactly as they came from the cache.
      await api.put(`/api/customers/${id}`, {
        ...customer,
        credit_limit: Number(creditLimit),
        credit_used: Number(creditUsed),
      });

      const currentProductIds = new Set(customProducts.map((p) => p.product_id));
      const deletedProductIds = Array.from(originalProductIdsRef.current).filter(
        (pid) => !currentProductIds.has(pid)
      );

      if (customProducts.length > 0 || deletedProductIds.length > 0) {
        await api.post("/api/customer-products/batch", {
          customerId: id,
          products: customProducts.map((cp) => ({
            productId: cp.product_id,
            customPrice: Number(cp.custom_price ?? 0),
            isAvailable: cp.is_available ?? true,
          })),
          deletedProductIds,
        });
      }

      await refreshCustomersCache();
      toast.success(t("Credit & pricing updated successfully"));
    } catch (err: any) {
      console.error("Error saving credit & pricing:", err);
      toast.error(
        t("Failed to save credit & pricing: {{message}}", {
          message: err?.response?.data?.message || err.message,
        })
      );
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render ---
  if (isLoading || (!customer && !error)) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="container mx-auto px-4 py-6">
        <BackButton fallbackPath="/catalogue/customer" />
        <div className="mt-4 p-4 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded">
          {error || t("Customer not found.")}
        </div>
      </div>
    );
  }

  const branchInfo = customer.branchInfo;
  const salesmanName =
    salesmen.find((s) => s.id === customer.salesman)?.name || customer.salesman;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-3 border-b border-default-200 dark:border-gray-700 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <BackButton fallbackPath="/catalogue/customer" />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                  {customer.name}
                </h1>
                <span className="px-2.5 py-0.5 text-sm font-mono font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded-full">
                  {customer.id}
                </span>
                {branchInfo?.isInBranchGroup && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-sm font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full">
                    {branchInfo.isMainBranch ? (
                      <IconBuildingSkyscraper size={14} />
                    ) : (
                      <IconBuildingStore size={14} />
                    )}
                    {branchInfo.groupName}
                    {branchInfo.isMainBranch ? t(" (Main)") : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button
            type="button"
            color="sky"
            icon={IconPencil}
            onClick={() => navigate(`/catalogue/customer/${customer.id}/edit`)}
          >
            {t("Edit")}
          </Button>
        </div>

        <div className="px-6 py-5">
          {/* --- Read-only: Customer --- */}
          <Section title={t("Customer")}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5">
              <Field label={t("Customer ID")} value={customer.id} />
              <Field label={t("Customer Name")} value={customer.name} />
              <Field label={t("Phone Number")} value={customer.phone_number} />
              <Field label={t("Email")} value={customer.email} />
              <Field label={t("Address")} value={customer.address} />
              <Field label={t("City")} value={customer.city} />
              <Field label={t("State")} value={getStateName(customer.state)} />
              <Field label={t("Closeness")} value={customer.closeness} />
              <Field label={t("Salesman")} value={salesmanName} />
            </div>
          </Section>

          {/* --- Read-only: e-Invoice --- */}
          <Section title={t("e-Invoice")}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
              <Field label={t("ID Type")} value={customer.id_type} />
              <Field label={t("ID Number")} value={customer.id_number} />
              <Field label={t("TIN Number")} value={customer.tin_number} />
            </div>
          </Section>

          {/* --- Branch group note --- */}
          {branchInfo?.isInBranchGroup && (
            <div className="mt-6 p-4 border border-indigo-100 dark:border-indigo-900/50 rounded-lg bg-indigo-50/30 dark:bg-indigo-900/20">
              <div className="flex items-center mb-3">
                {branchInfo.isMainBranch ? (
                  <IconBuildingSkyscraper
                    size={20}
                    className="text-indigo-600 dark:text-indigo-400 mr-2"
                  />
                ) : (
                  <IconBuildingStore
                    size={20}
                    className="text-indigo-500 dark:text-indigo-400 mr-2"
                  />
                )}
                <h3 className="text-base font-medium text-indigo-700 dark:text-indigo-300">
                  {t(
                    branchInfo.isMainBranch
                      ? "Main Branch"
                      : "Branch Location"
                  )}{" "}
                  - {branchInfo.groupName}
                </h3>
              </div>
              <p className="text-sm text-indigo-600 dark:text-indigo-300 mb-2">
                {branchInfo.isMainBranch
                  ? t(
                      "This is the main branch. Changes to pricing, phone number, and e-Invoice information will affect all branches."
                    )
                  : t(
                      "This is a branch location. Pricing, phone number, and e-Invoice information are synchronized with the main branch."
                    )}
              </p>
              {(branchInfo.branches?.length ?? 0) > 1 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-indigo-500 dark:text-indigo-400 mb-1">
                    {t("Connected branches:")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {branchInfo.branches
                      ?.filter((b) => b.id !== customer.id)
                      .map((branch) => (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() =>
                            navigate(`/catalogue/customer/${branch.id}`)
                          }
                          className="inline-flex items-center text-xs bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors"
                        >
                          {branch.isMain && (
                            <IconBuildingSkyscraper size={12} className="mr-1" />
                          )}
                          {branch.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- Editable: Credit & Pricing --- */}
          <Section
            title={t("Credit & Pricing")}
            action={
              <Button
                type="button"
                color="sky"
                variant="filled"
                size="sm"
                onClick={handleSaveCredit}
                disabled={isSaving || !isCreditChanged}
              >
                {isSaving ? t("Saving...") : t("save", { ns: "common" })}
              </Button>
            }
          >
            <div className="space-y-8">
              <CustomerCreditSection
                creditLimit={creditLimit}
                creditUsed={creditUsed}
                onCreditLimitChange={setCreditLimit}
                onCreditUsedChange={setCreditUsed}
                disabled={isSaving}
              />
              <CustomerProductsTab
                products={customProducts}
                onProductsChange={handleProductsChange}
                disabled={isSaving}
              />
            </div>
          </Section>

          {/* --- Transaction History --- */}
          <Section
            title={t("Transaction History")}
            sectionRef={transactionsRef}
          >
            <CustomerTransactionsTab
              customerId={customer.id}
              customerName={customer.name}
              range={txnRange}
              onRangeChange={setTxnRange}
              cache={txnCache}
              onCacheChange={setTxnCache}
            />
          </Section>
        </div>
      </div>
    </div>
  );
};

export default CustomerDetailsPage;
