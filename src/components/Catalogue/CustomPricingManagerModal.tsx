import React, { Fragment, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconCurrencyDollar,
  IconDeviceFloppy,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { CustomProduct } from "../../types/types";
import {
  EnhancedCustomerList,
  refreshCustomersCache,
  useCustomersCache,
} from "../../utils/catalogue/useCustomerCache";
import { useProductsCache } from "../../utils/invoice/useProductsCache";
import { api } from "../../routes/utils/api";
import Button from "../Button";
import Checkbox from "../Checkbox";
import ConfirmationDialog from "../ConfirmationDialog";
import { FormCombobox, SelectOption } from "../FormComponents";
import LoadingSpinner from "../LoadingSpinner";
import PillSelect, { PillSelectOption } from "../PillSelect";

interface CustomPricingManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PricingScopeMember {
  id: string;
  name: string;
  isMain: boolean;
}

interface PricingEntry {
  key: string;
  productId: string;
  cachedDescription: string;
  customPrice: number;
  isAvailable: boolean;
  isConsistent: boolean;
  sourceCustomerId: string;
}

interface PricingScope {
  key: string;
  label: string;
  representativeCustomerId: string;
  isBranchGroup: boolean;
  groupId?: number;
  members: PricingScopeMember[];
  entries: PricingEntry[];
}

interface ProductSummary {
  description: string;
  standardPrice: number;
  isActive: boolean;
}

interface PricingTableRow {
  key: string;
  scope: PricingScope;
  entry: PricingEntry;
  description: string;
  standardPrice?: number;
  isProductActive?: boolean;
}

interface PricingDraft {
  price: string;
  isAvailable: boolean;
}

type PricingScopeFilter = "all" | "shared" | "individual" | "needs_sync";

const ROWS_PER_PAGE = 40;
const PRICE_INPUT_PATTERN = /^\d*(?:\.\d{0,2})?$/;

const getNumericPrice = (product: CustomProduct): number => {
  const price: number = Number(product.custom_price);
  return Number.isFinite(price) ? price : 0;
};

const getErrorMessage = (error: unknown): string | null => {
  if (error instanceof Error && error.message) return error.message;
  return null;
};

const formatPrice = (amount: number): string => `RM ${amount.toFixed(2)}`;

const createPricingScope = (
  key: string,
  label: string,
  customers: EnhancedCustomerList[],
  isBranchGroup: boolean,
  groupId?: number
): PricingScope => {
  const sortedCustomers: EnhancedCustomerList[] = [...customers].sort(
    (first: EnhancedCustomerList, second: EnhancedCustomerList): number => {
      const firstIsMain: boolean = Boolean(first.branchInfo?.isMainBranch);
      const secondIsMain: boolean = Boolean(second.branchInfo?.isMainBranch);
      if (firstIsMain !== secondIsMain) return firstIsMain ? -1 : 1;
      return first.name.localeCompare(second.name);
    }
  );
  const representative: EnhancedCustomerList = sortedCustomers[0];
  const productIds: Set<string> = new Set<string>();

  sortedCustomers.forEach((customer: EnhancedCustomerList): void => {
    (customer.customProducts || []).forEach((product: CustomProduct): void => {
      productIds.add(product.product_id);
    });
  });

  const entries: PricingEntry[] = Array.from(productIds)
    .map((productId: string): PricingEntry | null => {
      const memberProducts: Array<CustomProduct | undefined> =
        sortedCustomers.map(
          (customer: EnhancedCustomerList): CustomProduct | undefined =>
            (customer.customProducts || []).find(
              (product: CustomProduct): boolean =>
                product.product_id === productId
            )
        );
      const representativeProduct: CustomProduct | undefined =
        memberProducts[0];
      const sourceProduct: CustomProduct | undefined =
        representativeProduct ||
        memberProducts.find(
          (product: CustomProduct | undefined): product is CustomProduct =>
            Boolean(product)
        );

      if (!sourceProduct) return null;

      const sourceIndex: number = memberProducts.findIndex(
        (product: CustomProduct | undefined): boolean =>
          product === sourceProduct
      );
      const sourceCustomerId: string =
        sortedCustomers[sourceIndex]?.id || representative.id;
      const sourcePrice: number = getNumericPrice(sourceProduct);
      const isConsistent: boolean = memberProducts.every(
        (product: CustomProduct | undefined): boolean =>
          Boolean(product) &&
          getNumericPrice(product as CustomProduct) === sourcePrice &&
          Boolean(product?.is_available) ===
            Boolean(sourceProduct.is_available)
      );

      return {
        key: `${key}:${productId}`,
        productId,
        cachedDescription: sourceProduct.description || productId,
        customPrice: sourcePrice,
        isAvailable: Boolean(sourceProduct.is_available),
        isConsistent,
        sourceCustomerId,
      };
    })
    .filter((entry: PricingEntry | null): entry is PricingEntry =>
      Boolean(entry)
    )
    .sort((first: PricingEntry, second: PricingEntry): number =>
      first.cachedDescription.localeCompare(second.cachedDescription)
    );

  return {
    key,
    label,
    representativeCustomerId: representative.id,
    isBranchGroup,
    groupId,
    members: sortedCustomers.map(
      (customer: EnhancedCustomerList): PricingScopeMember => ({
        id: customer.id,
        name: customer.name,
        isMain: Boolean(customer.branchInfo?.isMainBranch),
      })
    ),
    entries,
  };
};

const buildPricingScopes = (
  customers: EnhancedCustomerList[]
): PricingScope[] => {
  const groupedCustomers: Map<number, EnhancedCustomerList[]> = new Map<
    number,
    EnhancedCustomerList[]
  >();
  const standaloneCustomers: EnhancedCustomerList[] = [];

  customers.forEach((customer: EnhancedCustomerList): void => {
    const groupId: number | undefined = customer.branchInfo?.groupId;
    if (customer.branchInfo?.isInBranchGroup && groupId !== undefined) {
      const members: EnhancedCustomerList[] =
        groupedCustomers.get(groupId) || [];
      members.push(customer);
      groupedCustomers.set(groupId, members);
      return;
    }
    standaloneCustomers.push(customer);
  });

  const scopes: PricingScope[] = [];
  groupedCustomers.forEach(
    (members: EnhancedCustomerList[], groupId: number): void => {
      const groupName: string =
        members.find(
          (customer: EnhancedCustomerList): boolean =>
            Boolean(customer.branchInfo?.groupName)
        )?.branchInfo?.groupName || members[0].name;
      scopes.push(
        createPricingScope(
          `group:${groupId}`,
          groupName,
          members,
          true,
          groupId
        )
      );
    }
  );

  standaloneCustomers.forEach((customer: EnhancedCustomerList): void => {
    scopes.push(
      createPricingScope(
        `customer:${customer.id}`,
        customer.name,
        [customer],
        false
      )
    );
  });

  return scopes.sort((first: PricingScope, second: PricingScope): number =>
    first.label.localeCompare(second.label)
  );
};

const CustomPricingManagerModal: React.FC<
  CustomPricingManagerModalProps
> = ({ isOpen, onClose }) => {
  const { t } = useTranslation("catalogue");
  const {
    customers,
    isLoading: isLoadingCustomers,
    error: customersError,
  } = useCustomersCache();
  const {
    products,
    isLoading: isLoadingProducts,
    error: productsError,
  } = useProductsCache("all", { includeInactive: true });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [scopeFilter, setScopeFilter] =
    useState<PricingScopeFilter>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [drafts, setDrafts] = useState<Record<string, PricingDraft>>({});
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [rowToDelete, setRowToDelete] = useState<PricingTableRow | null>(null);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isSavingNew, setIsSavingNew] = useState<boolean>(false);
  const [newScopeKey, setNewScopeKey] = useState<string>("");
  const [newProductId, setNewProductId] = useState<string>("");
  const [newPrice, setNewPrice] = useState<string>("");
  const [newIsAvailable, setNewIsAvailable] = useState<boolean>(true);
  const [scopeQuery, setScopeQuery] = useState<string>("");
  const [productQuery, setProductQuery] = useState<string>("");
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] =
    useState<boolean>(false);
  const [refreshFailed, setRefreshFailed] = useState<boolean>(false);

  const pricingScopes: PricingScope[] = useMemo(
    (): PricingScope[] => buildPricingScopes(customers),
    [customers]
  );

  const scopeByKey: Map<string, PricingScope> = useMemo((): Map<
    string,
    PricingScope
  > => {
    const map: Map<string, PricingScope> = new Map<string, PricingScope>();
    pricingScopes.forEach((scope: PricingScope): void => {
      map.set(scope.key, scope);
    });
    return map;
  }, [pricingScopes]);

  const productById: Map<string, ProductSummary> = useMemo((): Map<
    string,
    ProductSummary
  > => {
    const map: Map<string, ProductSummary> = new Map<
      string,
      ProductSummary
    >();
    products.forEach(
      (product: {
        id: string;
        description: string;
        price_per_unit: number;
        is_active?: boolean;
      }): void => {
        map.set(product.id, {
          description: product.description || product.id,
          standardPrice: Number(product.price_per_unit) || 0,
          isActive: product.is_active !== false,
        });
      }
    );
    return map;
  }, [products]);

  const activeProducts: typeof products = useMemo(
    (): typeof products =>
      products.filter(
        (product: { is_active?: boolean }): boolean =>
          product.is_active !== false
      ),
    [products]
  );

  const allRows: PricingTableRow[] = useMemo((): PricingTableRow[] => {
    const rows: PricingTableRow[] = [];
    pricingScopes.forEach((scope: PricingScope): void => {
      scope.entries.forEach((entry: PricingEntry): void => {
        const product: ProductSummary | undefined = productById.get(
          entry.productId
        );
        rows.push({
          key: entry.key,
          scope,
          entry,
          description: product?.description || entry.cachedDescription,
          standardPrice: product?.standardPrice,
          isProductActive: product?.isActive,
        });
      });
    });
    return rows.sort(
      (first: PricingTableRow, second: PricingTableRow): number => {
        const scopeComparison: number = first.scope.label.localeCompare(
          second.scope.label
        );
        if (scopeComparison !== 0) return scopeComparison;
        return first.description.localeCompare(second.description);
      }
    );
  }, [pricingScopes, productById]);

  const rowByKey: Map<string, PricingTableRow> = useMemo((): Map<
    string,
    PricingTableRow
  > => {
    const map: Map<string, PricingTableRow> = new Map<
      string,
      PricingTableRow
    >();
    allRows.forEach((row: PricingTableRow): void => {
      map.set(row.key, row);
    });
    return map;
  }, [allRows]);

  const filteredRows: PricingTableRow[] = useMemo((): PricingTableRow[] => {
    const query: string = searchQuery.trim().toLowerCase();
    return allRows.filter((row: PricingTableRow): boolean => {
      if (scopeFilter === "shared" && !row.scope.isBranchGroup) return false;
      if (scopeFilter === "individual" && row.scope.isBranchGroup) return false;
      if (scopeFilter === "needs_sync" && row.entry.isConsistent) return false;
      if (!query) return true;

      const searchableValues: string[] = [
        row.scope.label,
        row.entry.productId,
        row.description,
        row.entry.customPrice.toFixed(2),
        ...row.scope.members.flatMap(
          (member: PricingScopeMember): string[] => [member.id, member.name]
        ),
      ];
      return searchableValues.some((value: string): boolean =>
        value.toLowerCase().includes(query)
      );
    });
  }, [allRows, scopeFilter, searchQuery]);

  const totalPages: number = Math.max(
    1,
    Math.ceil(filteredRows.length / ROWS_PER_PAGE)
  );
  const paginatedRows: PricingTableRow[] = useMemo((): PricingTableRow[] => {
    const startIndex: number = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [currentPage, filteredRows]);

  const filterOptions: ReadonlyArray<
    PillSelectOption<PricingScopeFilter>
  > = useMemo(
    (): ReadonlyArray<PillSelectOption<PricingScopeFilter>> => [
      { value: "all", label: t("All prices") },
      { value: "shared", label: t("Shared branch pricing") },
      { value: "individual", label: t("Individual customer pricing") },
      { value: "needs_sync", label: t("Needs sync") },
    ],
    [t]
  );

  const scopeOptions: SelectOption[] = useMemo(
    (): SelectOption[] =>
      pricingScopes.map((scope: PricingScope): SelectOption => {
        const representativeMember: PricingScopeMember =
          scope.members.find(
            (member: PricingScopeMember): boolean =>
              member.id === scope.representativeCustomerId
          ) || scope.members[0];
        const memberSearchText: string = scope.members
          .map(
            (member: PricingScopeMember): string =>
              `${member.name} ${member.id}`
          )
          .join(" ");
        const sharedScopeLabel: string =
          scope.members.length === 1
            ? t("{{group}} - shared by 1 branch", {
                group: scope.label,
              })
            : t("{{group}} - shared by {{total}} branches", {
                group: scope.label,
                total: scope.members.length,
              });
        const name: string = scope.isBranchGroup
          ? `${sharedScopeLabel} | ${representativeMember.name} (${representativeMember.id})`
          : `${scope.label} (${scope.representativeCustomerId})`;

        return {
          id: scope.key,
          name,
          searchText: `${name} ${memberSearchText}`,
        };
      }),
    [pricingScopes, t]
  );

  const selectedNewScope: PricingScope | undefined =
    scopeByKey.get(newScopeKey);
  const selectedScopeProductIds: Set<string> = useMemo((): Set<string> => {
    return new Set<string>(
      selectedNewScope?.entries.map(
        (entry: PricingEntry): string => entry.productId
      ) || []
    );
  }, [selectedNewScope]);
  const availableProductOptions: SelectOption[] = useMemo(
    (): SelectOption[] =>
      activeProducts
        .filter(
          (product: { id: string }): boolean =>
            !selectedScopeProductIds.has(product.id)
        )
        .map(
          (product: { id: string; description: string }): SelectOption => ({
            id: product.id,
            name: `${product.description || product.id} (${product.id})`,
          })
        ),
    [activeProducts, selectedScopeProductIds]
  );

  const inconsistentRowCount: number = allRows.filter(
    (row: PricingTableRow): boolean => !row.entry.isConsistent
  ).length;
  const pricedScopeCount: number = pricingScopes.filter(
    (scope: PricingScope): boolean => scope.entries.length > 0
  ).length;
  const hasRowDraftChanges: boolean = Object.entries(drafts).some(
    ([rowKey, draft]: [string, PricingDraft]): boolean => {
      const row: PricingTableRow | undefined = rowByKey.get(rowKey);
      if (!row) return true;
      const draftPrice: number =
        draft.price.trim() === "" ? 0 : Number(draft.price);
      if (
        !PRICE_INPUT_PATTERN.test(draft.price) ||
        !Number.isFinite(draftPrice)
      ) {
        return true;
      }
      return (
        draftPrice !== row.entry.customPrice ||
        draft.isAvailable !== row.entry.isAvailable
      );
    }
  );
  const hasNewPriceDraft: boolean = Boolean(
    newScopeKey || newProductId || newPrice.trim()
  );
  const newPriceValue: number =
    newPrice.trim() === "" ? 0 : Number(newPrice);
  const isNewPriceValid: boolean =
    PRICE_INPUT_PATTERN.test(newPrice) &&
    Number.isFinite(newPriceValue) &&
    newPriceValue >= 0;

  useEffect((): void => {
    if (!isOpen) return;
    setSearchQuery("");
    setScopeFilter("all");
    setCurrentPage(1);
    setDrafts({});
    setSavingRowKey(null);
    setRowToDelete(null);
    setIsAdding(false);
    setIsSavingNew(false);
    setNewScopeKey("");
    setNewProductId("");
    setNewPrice("");
    setNewIsAvailable(true);
    setScopeQuery("");
    setProductQuery("");
    setIsDiscardDialogOpen(false);
    setRefreshFailed(false);
  }, [isOpen]);

  useEffect((): void => {
    setCurrentPage(1);
  }, [searchQuery, scopeFilter]);

  useEffect((): void => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const getDraft = (row: PricingTableRow): PricingDraft =>
    drafts[row.key] || {
      price: row.entry.customPrice.toString(),
      isAvailable: row.entry.isAvailable,
    };

  const updateDraft = (
    row: PricingTableRow,
    update: Partial<PricingDraft>
  ): void => {
    setDrafts(
      (previous: Record<string, PricingDraft>): Record<string, PricingDraft> => {
        const currentDraft: PricingDraft = previous[row.key] || {
          price: row.entry.customPrice.toString(),
          isAvailable: row.entry.isAvailable,
        };
        return {
          ...previous,
          [row.key]: { ...currentDraft, ...update },
        };
      }
    );
  };

  const clearDraft = (rowKey: string): void => {
    setDrafts(
      (previous: Record<string, PricingDraft>): Record<string, PricingDraft> => {
        const next: Record<string, PricingDraft> = { ...previous };
        delete next[rowKey];
        return next;
      }
    );
  };

  const isDraftDirty = (
    row: PricingTableRow,
    draft: PricingDraft
  ): boolean => {
    const numericPrice: number =
      draft.price.trim() === "" ? 0 : Number(draft.price);
    if (
      !PRICE_INPUT_PATTERN.test(draft.price) ||
      !Number.isFinite(numericPrice)
    ) {
      return true;
    }
    return (
      numericPrice !== row.entry.customPrice ||
      draft.isAvailable !== row.entry.isAvailable
    );
  };

  const isDraftValid = (draft: PricingDraft): boolean => {
    const numericPrice: number =
      draft.price.trim() === "" ? 0 : Number(draft.price);
    return (
      PRICE_INPUT_PATTERN.test(draft.price) &&
      Number.isFinite(numericPrice) &&
      numericPrice >= 0
    );
  };

  const handlePriceChange = (
    row: PricingTableRow,
    value: string
  ): void => {
    if (value !== "" && !PRICE_INPUT_PATTERN.test(value)) return;
    updateDraft(row, { price: value });
  };

  const handleSaveRow = async (row: PricingTableRow): Promise<void> => {
    if (refreshFailed) return;
    const draft: PricingDraft = getDraft(row);
    if (!isDraftValid(draft)) {
      toast.error(t("Enter a valid non-negative price with up to 2 decimals."));
      return;
    }

    const numericPrice: number =
      draft.price.trim() === "" ? 0 : Number(draft.price);
    setSavingRowKey(row.key);
    let wasSaved: boolean = false;
    try {
      await api.post("/api/customer-products/batch", {
        customerId: row.scope.representativeCustomerId,
        products: [
          {
            productId: row.entry.productId,
            customPrice: numericPrice,
            isAvailable: draft.isAvailable,
          },
        ],
        deletedProductIds: [],
      });
      wasSaved = true;
      await refreshCustomersCache(true);
      clearDraft(row.key);
      toast.success(
        row.scope.isBranchGroup
          ? row.scope.members.length === 1
            ? t("Custom price updated for the linked branch")
            : t("Shared custom price updated for all {{total}} branches", {
                total: row.scope.members.length,
              })
          : t("Custom price updated successfully")
      );
    } catch (error: unknown) {
      console.error("Error updating custom price:", error);
      if (wasSaved) {
        clearDraft(row.key);
        setRefreshFailed(true);
      }
      toast.error(
        wasSaved
          ? t(
              "The change was saved, but the pricing list could not be refreshed. Close this manager and try again."
            )
          : getErrorMessage(error) || t("Failed to update custom price")
      );
    } finally {
      setSavingRowKey(null);
    }
  };

  const handleDeleteRow = async (): Promise<void> => {
    if (!rowToDelete || refreshFailed) return;
    const row: PricingTableRow = rowToDelete;
    setSavingRowKey(row.key);
    let wasSaved: boolean = false;
    try {
      await api.post("/api/customer-products/batch", {
        customerId: row.scope.representativeCustomerId,
        products: [],
        deletedProductIds: [row.entry.productId],
      });
      wasSaved = true;
      await refreshCustomersCache(true);
      clearDraft(row.key);
      setRowToDelete(null);
      toast.success(t("Product custom price removed"));
    } catch (error: unknown) {
      console.error("Error deleting custom price:", error);
      if (wasSaved) {
        clearDraft(row.key);
        setRowToDelete(null);
        setRefreshFailed(true);
      }
      toast.error(
        wasSaved
          ? t(
              "The change was saved, but the pricing list could not be refreshed. Close this manager and try again."
            )
          : getErrorMessage(error) || t("Failed to remove custom price")
      );
    } finally {
      setSavingRowKey(null);
    }
  };

  const resetNewPrice = (): void => {
    setIsAdding(false);
    setNewScopeKey("");
    setNewProductId("");
    setNewPrice("");
    setNewIsAvailable(true);
    setScopeQuery("");
    setProductQuery("");
  };

  const handleNewScopeChange = (
    value: string | string[] | null
  ): void => {
    const scopeKey: string = typeof value === "string" ? value : "";
    setNewScopeKey(scopeKey);
    setNewProductId("");
    setNewPrice("");
    setScopeQuery("");
    setProductQuery("");
  };

  const handleNewProductChange = (
    value: string | string[] | null
  ): void => {
    const productId: string = typeof value === "string" ? value : "";
    setNewProductId(productId);
    setProductQuery("");
    const product: ProductSummary | undefined = productById.get(productId);
    setNewPrice(product ? product.standardPrice.toString() : "");
  };

  const handleAddPrice = async (): Promise<void> => {
    if (savingRowKey || refreshFailed) return;
    const scope: PricingScope | undefined = scopeByKey.get(newScopeKey);
    if (!scope || !newProductId) {
      toast.error(t("Select a customer or branch group and a product."));
      return;
    }

    const numericPrice: number =
      newPrice.trim() === "" ? 0 : Number(newPrice);
    if (
      !PRICE_INPUT_PATTERN.test(newPrice) ||
      !Number.isFinite(numericPrice) ||
      numericPrice < 0
    ) {
      toast.error(t("Enter a valid non-negative price with up to 2 decimals."));
      return;
    }

    if (
      scope.entries.some(
        (entry: PricingEntry): boolean => entry.productId === newProductId
      )
    ) {
      toast.error(t("This product already has a custom price in that scope."));
      return;
    }

    setIsSavingNew(true);
    let wasSaved: boolean = false;
    try {
      await api.post("/api/customer-products/batch", {
        customerId: scope.representativeCustomerId,
        products: [
          {
            productId: newProductId,
            customPrice: numericPrice,
            isAvailable: newIsAvailable,
          },
        ],
        deletedProductIds: [],
      });
      wasSaved = true;
      await refreshCustomersCache(true);
      resetNewPrice();
      toast.success(
        scope.isBranchGroup
          ? scope.members.length === 1
            ? t("Custom price added for the linked branch")
            : t("Custom price added for all {{total}} branches", {
                total: scope.members.length,
              })
          : t("Custom price added successfully")
      );
    } catch (error: unknown) {
      console.error("Error adding custom price:", error);
      if (wasSaved) {
        resetNewPrice();
        setRefreshFailed(true);
      }
      toast.error(
        wasSaved
          ? t(
              "The change was saved, but the pricing list could not be refreshed. Close this manager and try again."
            )
          : getErrorMessage(error) || t("Failed to add custom price")
      );
    } finally {
      setIsSavingNew(false);
    }
  };

  const closeImmediately = (): void => {
    setDrafts({});
    resetNewPrice();
    setIsDiscardDialogOpen(false);
    onClose();
  };

  const requestClose = (): void => {
    if (savingRowKey || isSavingNew) return;
    if (hasRowDraftChanges || hasNewPriceDraft) {
      setIsDiscardDialogOpen(true);
      return;
    }
    closeImmediately();
  };

  const firstVisibleRow: number =
    filteredRows.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const lastVisibleRow: number = Math.min(
    currentPage * ROWS_PER_PAGE,
    filteredRows.length
  );
  const isLoading: boolean = isLoadingCustomers || isLoadingProducts;
  const isMutationBlocked: boolean =
    Boolean(savingRowKey) || isSavingNew || refreshFailed;

  return (
    <>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={requestClose}>
          <TransitionChild
            as={Fragment}
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
                <DialogPanel className="flex w-full max-w-7xl max-h-[92vh] flex-col transform rounded-2xl bg-white text-left align-middle shadow-xl transition-all dark:bg-gray-800">
                  <div className="flex-shrink-0 border-b border-default-200 px-6 pb-4 pt-6 dark:border-gray-700">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <DialogTitle
                          as="h3"
                          className="flex items-center gap-2 text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                        >
                          <IconCurrencyDollar size={21} stroke={1.7} />
                          {t("Custom Pricing Manager")}
                        </DialogTitle>
                        <p className="mt-1.5 max-w-4xl text-sm text-gray-500 dark:text-gray-400">
                          {t(
                            "Branch groups appear once as a shared pricing profile. Changes to a shared price apply to every linked branch."
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        icon={IconPlus}
                        color="sky"
                        onClick={(): void => setIsAdding(true)}
                        disabled={
                          isAdding ||
                          isLoading ||
                          isMutationBlocked ||
                          Boolean(productsError && products.length === 0)
                        }
                        title={
                          productsError
                            ? t(
                                "Products could not be loaded. Close this manager and try again."
                              )
                            : undefined
                        }
                      >
                        {t("Add Custom Price")}
                      </Button>
                    </div>

                    {!isLoading && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-500 dark:text-gray-400">
                        <span>
                          {t("{{prices}} custom prices across {{profiles}} pricing profiles", {
                            prices: allRows.length,
                            profiles: pricedScopeCount,
                          })}
                        </span>
                        {inconsistentRowCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                            <IconAlertTriangle size={14} />
                            {inconsistentRowCount === 1
                              ? t("1 shared price needs synchronization")
                              : t(
                                  "{{total}} shared prices need synchronization",
                                  {
                                    total: inconsistentRowCount,
                                  }
                                )}
                          </span>
                        )}
                        {productsError && (
                          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                            <IconAlertTriangle size={14} />
                            {t(
                              "Products could not be loaded. Close this manager and try again."
                            )}
                          </span>
                        )}
                        {refreshFailed && (
                          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                            <IconAlertTriangle size={14} />
                            {t(
                              "The change was saved, but the pricing list could not be refreshed. Close this manager and try again."
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    {isAdding && (
                      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-800 dark:bg-sky-950/20">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h4 className="font-medium text-default-800 dark:text-gray-100">
                              {t("Add Custom Price")}
                            </h4>
                            <p className="mt-0.5 text-xs text-default-500 dark:text-gray-400">
                              {t(
                                "Selecting a branch group creates the same price for every branch in that group."
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={resetNewPrice}
                            disabled={isMutationBlocked}
                            className="rounded-full p-1 text-default-400 hover:bg-default-100 hover:text-default-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                            aria-label={t("Cancel adding custom price")}
                          >
                            <IconX size={19} />
                          </button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 md:items-end xl:grid-cols-[minmax(220px,1.4fr)_minmax(220px,1.4fr)_160px_auto]">
                          <FormCombobox
                            name="custom-pricing-scope"
                            label={t("Customer or Branch Group")}
                            value={newScopeKey}
                            onChange={handleNewScopeChange}
                            options={scopeOptions}
                            query={scopeQuery}
                            setQuery={setScopeQuery}
                            mode="single"
                            maxVisibleOptions={50}
                            placeholder={t("Search customers or branch groups")}
                            disabled={isMutationBlocked}
                          />
                          <FormCombobox
                            name="custom-pricing-product"
                            label={t("Product")}
                            value={newProductId}
                            onChange={handleNewProductChange}
                            options={availableProductOptions}
                            query={productQuery}
                            setQuery={setProductQuery}
                            mode="single"
                            maxVisibleOptions={50}
                            placeholder={
                              newScopeKey
                                ? t("Search products")
                                : t("Select a customer or branch group first")
                            }
                            disabled={
                              !newScopeKey ||
                              isMutationBlocked
                            }
                          />
                          <div className="space-y-2">
                            <label
                              htmlFor="new-custom-price"
                              className="block text-sm font-medium text-default-700 dark:text-gray-200"
                            >
                              {t("Custom Price (RM)")}
                            </label>
                            <input
                              id="new-custom-price"
                              type="text"
                              inputMode="decimal"
                              value={newPrice}
                              onChange={(
                                event: React.ChangeEvent<HTMLInputElement>
                              ): void => {
                                const value: string = event.target.value;
                                if (
                                  value === "" ||
                                  PRICE_INPUT_PATTERN.test(value)
                                ) {
                                  setNewPrice(value);
                                }
                              }}
                              placeholder="0.00"
                              aria-invalid={!isNewPriceValid}
                              aria-describedby={
                                !isNewPriceValid
                                  ? "new-custom-price-error"
                                  : undefined
                              }
                              disabled={
                                !newProductId ||
                                isMutationBlocked
                              }
                              className="block w-full rounded-lg border border-default-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
                            />
                            {!isNewPriceValid && (
                              <p
                                id="new-custom-price-error"
                                className="text-xs text-rose-600 dark:text-rose-300"
                              >
                                {t(
                                  "Enter a valid non-negative price with up to 2 decimals."
                                )}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 md:col-span-2 md:pb-0.5 xl:col-span-1">
                            <Checkbox
                              checked={newIsAvailable}
                              onChange={setNewIsAvailable}
                              disabled={isMutationBlocked}
                              label={t("Available")}
                              role="switch"
                              ariaLabel={t("Product availability")}
                              buttonClassName="rounded-full p-1"
                            />
                            <Button
                              type="button"
                              color="sky"
                              icon={IconPlus}
                              onClick={handleAddPrice}
                              disabled={
                                !newScopeKey ||
                                !newProductId ||
                                !isNewPriceValid ||
                                isMutationBlocked
                              }
                            >
                              {isSavingNew ? t("Adding...") : t("Add")}
                            </Button>
                          </div>
                        </div>
                        {newScopeKey &&
                          activeProducts.length > 0 &&
                          availableProductOptions.length === 0 && (
                          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                            {t(
                              "Every active product already has a custom price in this pricing profile."
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <div className="relative min-w-[240px] flex-1 md:max-w-xl">
                        <IconSearch
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400"
                          size={17}
                        />
                        <input
                          type="text"
                          autoFocus
                          aria-label={t(
                            "Search customers, branches, groups or products"
                          )}
                          value={searchQuery}
                          onChange={(
                            event: React.ChangeEvent<HTMLInputElement>
                          ): void => setSearchQuery(event.target.value)}
                          placeholder={t(
                            "Search customers, branches, groups or products"
                          )}
                          className="w-full rounded-full border border-default-300 bg-white py-2 pl-10 pr-9 text-sm text-default-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={(): void => setSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-default-400 hover:text-default-700 dark:hover:text-gray-200"
                            aria-label={t("Clear search")}
                          >
                            <IconX size={16} />
                          </button>
                        )}
                      </div>
                      <PillSelect<PricingScopeFilter>
                        value={scopeFilter}
                        onChange={setScopeFilter}
                        options={filterOptions}
                        ariaLabel={t("Pricing scope")}
                      />
                    </div>

                    {isLoading ? (
                      <div className="flex justify-center py-16">
                        <LoadingSpinner />
                      </div>
                    ) : customersError ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
                        {t("Error: {{message}}", {
                          message: customersError.message,
                        })}
                      </div>
                    ) : filteredRows.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-default-300 bg-default-50 py-12 text-center dark:border-gray-700 dark:bg-gray-900/40">
                        <IconCurrencyDollar
                          size={30}
                          className="mx-auto mb-2 text-default-400"
                        />
                        <p className="font-medium text-default-700 dark:text-gray-200">
                          {allRows.length === 0
                            ? t("No custom prices have been added yet.")
                            : searchQuery.trim()
                              ? t("No custom prices match your search.")
                              : t("No custom prices match this filter.")}
                        </p>
                        <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                          {allRows.length === 0
                            ? t(
                                "Add a price here without opening an individual customer page."
                              )
                            : searchQuery.trim()
                              ? t(
                                  "Try a customer name, branch ID, group name or product."
                                )
                              : t("Choose another pricing filter.")}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-default-200 dark:border-gray-700">
                        <div className="max-h-[55vh] overflow-auto">
                          <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                            <thead className="sticky top-0 z-10 bg-default-100 dark:bg-gray-800">
                              <tr>
                                <th
                                  scope="col"
                                  className="min-w-[250px] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400"
                                >
                                  {t("Customer / Branch Group")}
                                </th>
                                <th
                                  scope="col"
                                  className="min-w-[230px] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400"
                                >
                                  {t("Product")}
                                </th>
                                <th
                                  scope="col"
                                  className="whitespace-nowrap px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400"
                                >
                                  {t("Standard Price")}
                                </th>
                                <th
                                  scope="col"
                                  className="min-w-[185px] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400"
                                >
                                  {t("Custom Price (RM)")}
                                </th>
                                <th
                                  scope="col"
                                  className="whitespace-nowrap px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400"
                                >
                                  {t("Available")}
                                </th>
                                <th
                                  scope="col"
                                  className="whitespace-nowrap px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-500 dark:text-gray-400"
                                >
                                  {t("Action")}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-default-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                              {paginatedRows.map(
                                (row: PricingTableRow): React.ReactElement => {
                                  const draft: PricingDraft = getDraft(row);
                                  const isDirty: boolean = isDraftDirty(
                                    row,
                                    draft
                                  );
                                  const isValid: boolean =
                                    isDraftValid(draft);
                                  const isSaving: boolean =
                                    savingRowKey === row.key;
                                  const branchList: string = row.scope.members
                                    .map(
                                      (member: PricingScopeMember): string =>
                                        `${member.name} (${member.id})`
                                    )
                                    .join("\n");
                                  const priceErrorId: string =
                                    `custom-price-error-${encodeURIComponent(
                                      row.key
                                    )}`;

                                  return (
                                    <tr
                                      key={row.key}
                                      className={
                                        isDirty
                                          ? "bg-sky-50/60 dark:bg-sky-950/20"
                                          : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                                      }
                                    >
                                      <td className="px-4 py-3 align-top">
                                        <div className="font-medium text-default-800 dark:text-gray-100">
                                          {row.scope.label}
                                        </div>
                                        {row.scope.isBranchGroup ? (
                                          <div className="mt-1 space-y-1">
                                            <details className="group">
                                              <summary
                                                className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-sky-900/40 dark:text-sky-300 [&::-webkit-details-marker]:hidden"
                                                title={branchList}
                                              >
                                                {row.scope.members.length === 1
                                                  ? t("Shared by 1 branch")
                                                  : t(
                                                      "Shared by {{total}} branches",
                                                      {
                                                        total:
                                                          row.scope.members
                                                            .length,
                                                      }
                                                    )}
                                                <IconChevronDown
                                                  size={12}
                                                  className="transition-transform group-open:rotate-180"
                                                />
                                              </summary>
                                              <div className="mt-1.5 max-w-xs space-y-1 rounded-md border border-default-200 bg-default-50 p-2 text-xs text-default-600 dark:border-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
                                                {row.scope.members.map(
                                                  (
                                                    member: PricingScopeMember
                                                  ): React.ReactElement => (
                                                    <div
                                                      key={member.id}
                                                      className="flex items-center justify-between gap-2"
                                                    >
                                                      <span>
                                                        {member.name} ({member.id})
                                                      </span>
                                                      {member.isMain && (
                                                        <span className="whitespace-nowrap font-medium text-sky-700 dark:text-sky-300">
                                                          {t("Main Branch")}
                                                        </span>
                                                      )}
                                                    </div>
                                                  )
                                                )}
                                              </div>
                                            </details>
                                            <div className="text-xs text-default-500 dark:text-gray-400">
                                              {row.scope.members[0].isMain
                                                ? t(
                                                    "Main: {{name}} ({{id}})",
                                                    {
                                                      name:
                                                        row.scope.members[0]
                                                          .name,
                                                      id: row.scope.members[0]
                                                        .id,
                                                    }
                                                  )
                                                : t(
                                                    "Pricing source: {{name}} ({{id}})",
                                                    {
                                                      name:
                                                        row.scope.members[0]
                                                          .name,
                                                      id: row.scope.members[0]
                                                        .id,
                                                    }
                                                  )}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="mt-1 text-xs text-default-500 dark:text-gray-400">
                                            {row.scope.representativeCustomerId}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 align-top">
                                        <div className="font-medium text-default-800 dark:text-gray-100">
                                          {row.description}
                                        </div>
                                        <div className="mt-1 text-xs text-default-500 dark:text-gray-400">
                                          {row.entry.productId}
                                        </div>
                                        {row.isProductActive === false && (
                                          <span className="mt-1.5 inline-flex rounded-full bg-default-200 px-2 py-0.5 text-xs font-medium text-default-600 dark:bg-gray-700 dark:text-gray-300">
                                            {t("Inactive")}
                                          </span>
                                        )}
                                        {!row.entry.isConsistent && (
                                          <span
                                            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                            title={t(
                                              "This product differs across branches. Save the displayed value to synchronize every branch."
                                            )}
                                          >
                                            <IconAlertTriangle size={12} />
                                            {t("Needs sync")}
                                          </span>
                                        )}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-3 text-right align-top text-sm text-default-600 dark:text-gray-300">
                                        {row.standardPrice === undefined
                                          ? "-"
                                          : formatPrice(row.standardPrice)}
                                      </td>
                                      <td className="px-4 py-3 align-top">
                                        <div className="relative">
                                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-default-500 dark:text-gray-400">
                                            RM
                                          </span>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={draft.price}
                                            onChange={(
                                              event: React.ChangeEvent<HTMLInputElement>
                                            ): void =>
                                              handlePriceChange(
                                                row,
                                                event.target.value
                                              )
                                            }
                                            disabled={isMutationBlocked}
                                            aria-invalid={!isValid}
                                            aria-describedby={
                                              !isValid
                                                ? priceErrorId
                                                : undefined
                                            }
                                            aria-label={t(
                                              "Custom price for {{product}} in {{scope}}",
                                              {
                                                product: row.description,
                                                scope: row.scope.label,
                                              }
                                            )}
                                            className={`w-full rounded-md border bg-white py-1.5 pl-9 pr-2 text-sm text-default-900 shadow-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-default-100 dark:bg-gray-700 dark:text-gray-100 dark:disabled:bg-gray-900 ${
                                              isValid
                                                ? "border-default-300 focus:border-sky-500 focus:ring-sky-500 dark:border-gray-600"
                                                : "border-rose-400 focus:border-rose-500 focus:ring-rose-500"
                                            }`}
                                          />
                                        </div>
                                        {!isValid && (
                                          <div
                                            id={priceErrorId}
                                            className="mt-1 text-[11px] text-rose-600 dark:text-rose-300"
                                          >
                                            {t(
                                              "Enter a valid non-negative price with up to 2 decimals."
                                            )}
                                          </div>
                                        )}
                                        {!row.entry.isConsistent && (
                                          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                                            {t("Shown from {{customer}}", {
                                              customer:
                                                row.entry.sourceCustomerId,
                                            })}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-center align-top">
                                        <Checkbox
                                          checked={draft.isAvailable}
                                          onChange={(checked: boolean): void =>
                                            updateDraft(row, {
                                              isAvailable: checked,
                                            })
                                          }
                                          disabled={isMutationBlocked}
                                          label={
                                            draft.isAvailable
                                              ? t("Available")
                                              : t("Unavailable")
                                          }
                                          className="whitespace-nowrap"
                                          buttonClassName="rounded-full p-1"
                                          role="switch"
                                          ariaLabel={t(
                                            "Toggle availability for {{product}} in {{scope}}",
                                            {
                                              product: row.description,
                                              scope: row.scope.label,
                                            }
                                          )}
                                        />
                                      </td>
                                      <td className="px-4 py-3 align-top">
                                        <div className="flex justify-end gap-1.5">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            color="sky"
                                            icon={IconDeviceFloppy}
                                            onClick={(): Promise<void> =>
                                              handleSaveRow(row)
                                            }
                                            disabled={
                                              isMutationBlocked ||
                                              !isValid ||
                                              (!isDirty &&
                                                row.entry.isConsistent)
                                            }
                                            title={
                                              row.entry.isConsistent
                                                ? t("Save custom price")
                                                : t(
                                                    "Synchronize this price across all branches"
                                                  )
                                            }
                                          >
                                            {isSaving
                                              ? t("Saving...")
                                              : !row.entry.isConsistent &&
                                                  !isDirty
                                                ? t("Sync")
                                                : t("save", {
                                                    ns: "common",
                                                  })}
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            color="rose"
                                            icon={IconTrash}
                                            onClick={(): void =>
                                              setRowToDelete(row)
                                            }
                                            disabled={isMutationBlocked}
                                            aria-label={t(
                                              "Remove {{product}} custom price",
                                              {
                                                product: row.description,
                                              }
                                            )}
                                          />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                }
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {!isLoading && filteredRows.length > 0 && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-default-600 dark:text-gray-300">
                        <span>
                          {t("Showing {{first}}-{{last}} of {{total}} prices", {
                            first: firstVisibleRow,
                            last: lastVisibleRow,
                            total: filteredRows.length,
                          })}
                        </span>
                        {totalPages > 1 && (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(): void =>
                                setCurrentPage(
                                  (page: number): number => page - 1
                                )
                              }
                              disabled={currentPage === 1}
                            >
                              {t("Previous")}
                            </Button>
                            <span>
                              {t("Page {{page}} of {{total}}", {
                                page: currentPage,
                                total: totalPages,
                              })}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(): void =>
                                setCurrentPage(
                                  (page: number): number => page + 1
                                )
                              }
                              disabled={currentPage === totalPages}
                            >
                              {t("Next")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-default-200 px-6 py-4 dark:border-gray-700">
                    <span className="text-xs text-default-500 dark:text-gray-400">
                      {hasRowDraftChanges
                        ? t("Unsaved price changes")
                        : t("Prices save one row at a time")}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={requestClose}
                      disabled={Boolean(savingRowKey) || isSavingNew}
                    >
                      {t("Close")}
                    </Button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      <ConfirmationDialog
        isOpen={Boolean(rowToDelete)}
        onClose={(): void => setRowToDelete(null)}
        onConfirm={handleDeleteRow}
        title={t("Remove Custom Price")}
        message={
          rowToDelete?.scope.isBranchGroup
            ? rowToDelete.scope.members.length === 1
              ? t(
                  "Remove the custom price for {{product}} from {{group}}? It will be removed from the linked branch.",
                  {
                    product: rowToDelete.description,
                    group: rowToDelete.scope.label,
                  }
                )
              : t(
                  "Remove the custom price for {{product}} from {{group}}? It will be removed from all {{total}} linked branches.",
                  {
                    product: rowToDelete.description,
                    group: rowToDelete.scope.label,
                    total: rowToDelete.scope.members.length,
                  }
                )
            : t(
                "Remove the custom price for {{product}} from {{customer}}?",
                {
                  product: rowToDelete?.description,
                  customer: rowToDelete?.scope.label,
                }
              )
        }
        confirmButtonText={t("delete", { ns: "common" })}
        isConfirming={Boolean(savingRowKey)}
      />

      <ConfirmationDialog
        isOpen={isDiscardDialogOpen}
        onClose={(): void => setIsDiscardDialogOpen(false)}
        onConfirm={closeImmediately}
        title={t("Discard unsaved pricing changes?")}
        message={t(
          "Your unsaved price edits or unfinished new custom price will be lost."
        )}
        confirmButtonText={t("Discard Changes")}
      />
    </>
  );
};

export default CustomPricingManagerModal;
