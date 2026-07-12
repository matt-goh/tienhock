// src/components/Stock/MaterialAccountMappingModal.tsx
// Maps journal account codes (PUR/PM children like PU_BBER, PM_BPMS) to
// material stock records so purchases keyed in the journal system feed the
// Material Stock page's Purchases column.
import React, { useState, useEffect, Fragment, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import toast from "react-hot-toast";
import {
  IconX,
  IconCheck,
  IconChevronDown,
  IconSearch,
} from "@tabler/icons-react";
import Button from "../Button";
import LoadingSpinner from "../LoadingSpinner";
import { api } from "../../routes/utils/api";
import { MaterialDropdown, StockBucket, MaterialAppliesTo } from "../../types/types";

interface AccountMappingApiRow {
  code: string;
  description: string;
  mapping_id: number | null;
  material_id: number | null;
  variant_id: number | null;
  product_line: StockBucket | null;
  is_active: boolean | null;
  material_code: string | null;
  material_name: string | null;
  applies_to: MaterialAppliesTo | null;
  variant_name: string | null;
  total_amount: string | number;
  line_count: string | number;
  last_entry_date: string | null;
}

interface MappingRow {
  code: string;
  description: string;
  material_option_id: string; // "" | "<materialId>" | "<materialId>-<variantId>"
  product_line: StockBucket | "";
  total_amount: number;
  line_count: number;
  last_entry_date: string | null;
}

interface MaterialAccountMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMappingComplete?: () => void;
}

const stockBucketOptions: { id: StockBucket; name: string }[] = [
  { id: "mee", name: "Mee" },
  { id: "bihun", name: "Bihun" },
  { id: "shared", name: "Shared" },
];

const getBucketOptions = (
  appliesTo: MaterialAppliesTo | undefined
): { id: StockBucket; name: string }[] => {
  if (!appliesTo) return [];
  return stockBucketOptions.filter((option) =>
    option.id === "shared" ? appliesTo === "both" : appliesTo === option.id || appliesTo === "both"
  );
};

const rowSignature = (row: MappingRow): string =>
  `${row.material_option_id}|${row.product_line}`;

const MaterialAccountMappingModal: React.FC<MaterialAccountMappingModalProps> = ({
  isOpen,
  onClose,
  onMappingComplete,
}) => {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [originalRows, setOriginalRows] = useState<Map<string, string>>(new Map());
  const [materials, setMaterials] = useState<MaterialDropdown[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [mappingsResponse, materialsResponse] = await Promise.all([
        api.get("/api/materials/account-mappings") as Promise<AccountMappingApiRow[]>,
        // Same dropdown source the purchase form used (materials + variants).
        api.get("/api/purchase-invoices/materials") as Promise<MaterialDropdown[]>,
      ]);

      const fetchedRows: MappingRow[] = (mappingsResponse || []).map((row) => ({
        code: row.code,
        description: row.description || "",
        material_option_id:
          row.material_id && row.is_active !== false
            ? row.variant_id
              ? `${row.material_id}-${row.variant_id}`
              : String(row.material_id)
            : "",
        product_line: row.material_id && row.is_active !== false ? row.product_line || "" : "",
        total_amount: parseFloat(String(row.total_amount)) || 0,
        line_count: parseInt(String(row.line_count)) || 0,
        last_entry_date: row.last_entry_date,
      }));

      setRows(fetchedRows);
      setOriginalRows(new Map(fetchedRows.map((row) => [row.code, rowSignature(row)])));
      setMaterials(materialsResponse || []);
    } catch (error) {
      console.error("Error loading account mappings:", error);
      toast.error("Failed to load account mappings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleMaterialChange = (code: string, materialOptionId: string): void => {
    const material = materials.find((m) => String(m.id) === materialOptionId);
    setRows((prev) =>
      prev.map((row) => {
        if (row.code !== code) return row;
        if (!materialOptionId) {
          return { ...row, material_option_id: "", product_line: "" };
        }
        const bucketOptions = getBucketOptions(material?.applies_to);
        const keepBucket = bucketOptions.some((option) => option.id === row.product_line);
        return {
          ...row,
          material_option_id: materialOptionId,
          product_line: keepBucket
            ? row.product_line
            : bucketOptions.length === 1
            ? bucketOptions[0].id
            : "",
        };
      })
    );
  };

  const handleBucketChange = (code: string, bucket: StockBucket | ""): void => {
    setRows((prev) =>
      prev.map((row) => (row.code === code ? { ...row, product_line: bucket } : row))
    );
  };

  const changedRows = useMemo(
    () => rows.filter((row) => originalRows.get(row.code) !== rowSignature(row)),
    [rows, originalRows]
  );

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const lowerSearch = search.toLowerCase();
    return rows.filter(
      (row) =>
        row.code.toLowerCase().includes(lowerSearch) ||
        row.description.toLowerCase().includes(lowerSearch)
    );
  }, [rows, search]);

  const formatAmount = (amount: number): string =>
    new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      amount
    );

  const handleSave = async (): Promise<void> => {
    const incomplete = changedRows.find(
      (row) => row.material_option_id && !row.product_line
    );
    if (incomplete) {
      toast.error(`Select a stock bucket for ${incomplete.code}`);
      return;
    }

    setIsSaving(true);
    try {
      const mappings = changedRows.map((row) => {
        if (!row.material_option_id) {
          return { account_code: row.code, material_id: null };
        }
        const material = materials.find((m) => String(m.id) === row.material_option_id);
        return {
          account_code: row.code,
          material_id: material?.is_variant ? material.material_id : parseInt(row.material_option_id),
          variant_id: material?.is_variant ? material.variant_id : null,
          product_line: row.product_line,
        };
      });

      await api.post("/api/materials/account-mappings/batch", { mappings });
      toast.success("Account mappings saved");
      setOriginalRows(new Map(rows.map((row) => [row.code, rowSignature(row)])));
      if (onMappingComplete) {
        onMappingComplete();
      }
    } catch (error: unknown) {
      console.error("Error saving account mappings:", error);
      const message = error instanceof Error ? error.message : "Failed to save account mappings";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = (): void => {
    if (isSaving) return;
    setSearch("");
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" aria-hidden="true" />
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
              <DialogPanel className="w-full max-w-5xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-2">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                  >
                    Purchase Account Mappings
                  </DialogTitle>
                  <button
                    onClick={handleClose}
                    className="text-default-400 hover:text-default-600 dark:text-gray-400 dark:hover:text-gray-200"
                    disabled={isSaving}
                  >
                    <IconX size={20} />
                  </button>
                </div>

                <p className="text-sm text-default-500 dark:text-gray-400 mb-4">
                  Link purchase account codes from the journal system to material stock
                  records. Posted journal amounts on a mapped account appear as Purchases
                  on the Material Stock page (value only — quantities are keyed via the
                  adjustment column).
                </p>

                <div className="relative mb-3 max-w-xs">
                  <IconSearch
                    size={16}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Search accounts..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-default-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white dark:bg-gray-900/50 dark:text-gray-100 dark:placeholder-gray-400"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {isLoading ? (
                  <div className="flex justify-center items-center py-20">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="border border-default-200 dark:border-gray-600 rounded-lg overflow-hidden">
                    <div className="max-h-[420px] overflow-y-auto">
                      <table className="min-w-full">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-default-50 dark:bg-gray-700">
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-default-600 dark:text-gray-300">
                              Account
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-default-600 dark:text-gray-300 w-36">
                              Journal Total (RM)
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-default-600 dark:text-gray-300 w-72">
                              Material
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-default-600 dark:text-gray-300 w-32">
                              Stock
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-default-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                          {filteredRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-3 py-8 text-center text-sm text-default-500 dark:text-gray-400"
                              >
                                No purchase accounts found
                              </td>
                            </tr>
                          ) : (
                            filteredRows.map((row) => {
                              const selectedMaterial = materials.find(
                                (m) => String(m.id) === row.material_option_id
                              );
                              const bucketOptions = getBucketOptions(
                                selectedMaterial?.applies_to
                              );
                              const isChanged =
                                originalRows.get(row.code) !== rowSignature(row);

                              return (
                                <tr
                                  key={row.code}
                                  className={
                                    isChanged
                                      ? "bg-sky-50/60 dark:bg-sky-900/10"
                                      : undefined
                                  }
                                >
                                  <td className="px-3 py-1.5">
                                    <div className="text-sm font-medium text-default-800 dark:text-gray-100">
                                      {row.code}
                                    </div>
                                    <div className="text-xs text-default-500 dark:text-gray-400 truncate max-w-[220px]">
                                      {row.description}
                                    </div>
                                  </td>
                                  <td className="px-3 py-1.5 text-right align-top">
                                    <div className="text-sm text-default-700 dark:text-gray-200">
                                      {row.line_count > 0 ? formatAmount(row.total_amount) : "-"}
                                    </div>
                                    {row.last_entry_date && (
                                      <div className="text-xs text-default-400 dark:text-gray-500">
                                        last {row.last_entry_date.split("T")[0]}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-1 py-1.5">
                                    <MaterialCombobox
                                      value={row.material_option_id}
                                      materials={materials}
                                      onChange={(materialId) =>
                                        handleMaterialChange(row.code, materialId)
                                      }
                                    />
                                  </td>
                                  <td className="px-1 py-1.5">
                                    <Listbox
                                      value={row.product_line}
                                      onChange={(value: StockBucket | "") =>
                                        handleBucketChange(row.code, value)
                                      }
                                      disabled={bucketOptions.length === 0}
                                    >
                                      <div className="relative">
                                        <ListboxButton className="flex w-full items-center justify-between rounded border border-transparent bg-transparent px-2 py-1.5 text-left text-sm text-default-900 hover:border-gray-300 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100 dark:hover:border-gray-600">
                                          <span
                                            className={
                                              row.product_line
                                                ? "truncate"
                                                : "truncate text-gray-400 dark:text-gray-500"
                                            }
                                          >
                                            {stockBucketOptions.find(
                                              (option) => option.id === row.product_line
                                            )?.name ||
                                              (bucketOptions.length === 0
                                                ? "-"
                                                : "Select")}
                                          </span>
                                          <IconChevronDown
                                            className="ml-1 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
                                            aria-hidden="true"
                                          />
                                        </ListboxButton>
                                        <ListboxOptions
                                          anchor="bottom start"
                                          className="z-[60] mt-1 max-h-56 w-32 overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-black/5 focus:outline-none dark:bg-gray-800 dark:ring-white/10"
                                        >
                                          {bucketOptions.map((option) => (
                                            <ListboxOption
                                              key={option.id}
                                              value={option.id}
                                              className={({ focus, selected }) =>
                                                `relative cursor-pointer select-none py-2 pl-8 pr-3 ${
                                                  focus
                                                    ? "bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100"
                                                    : "text-default-900 dark:text-gray-100"
                                                } ${selected ? "bg-sky-100 dark:bg-sky-900/50" : ""}`
                                              }
                                            >
                                              {({ selected }) => (
                                                <>
                                                  {selected && (
                                                    <span className="absolute inset-y-0 left-2 flex items-center text-sky-600 dark:text-sky-300">
                                                      <IconCheck size={14} />
                                                    </span>
                                                  )}
                                                  <span
                                                    className={
                                                      selected
                                                        ? "block truncate font-medium"
                                                        : "block truncate"
                                                    }
                                                  >
                                                    {option.name}
                                                  </span>
                                                </>
                                              )}
                                            </ListboxOption>
                                          ))}
                                        </ListboxOptions>
                                      </div>
                                    </Listbox>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-4 flex justify-between items-center">
                  <div className="text-sm">
                    {changedRows.length > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {changedRows.length} unsaved change
                        {changedRows.length > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-default-400 dark:text-gray-500">
                        Unmapped accounts are ignored by Material Stock
                      </span>
                    )}
                  </div>
                  <div className="flex space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={isSaving}
                    >
                      Close
                    </Button>
                    <Button
                      type="button"
                      color="sky"
                      variant="filled"
                      onClick={handleSave}
                      disabled={isSaving || changedRows.length === 0}
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

// Searchable material picker (materials + variants, grouped by category),
// trimmed down from the removed MaterialPurchaseFormPage combobox.
interface MaterialComboboxProps {
  value: string;
  materials: MaterialDropdown[];
  onChange: (materialId: string) => void;
}

const formatCategory = (category: string): string => {
  switch (category) {
    case "ingredient":
      return "Ingredient";
    case "raw_material":
      return "Raw Material";
    case "packing_material":
      return "Packing Material";
    default:
      return category;
  }
};

const MaterialCombobox: React.FC<MaterialComboboxProps> = ({
  value,
  materials,
  onChange,
}) => {
  const [query, setQuery] = useState("");

  const selectedMaterial = materials.find((m) => String(m.id) === value);

  const filteredGroups = useMemo(() => {
    const categoryOrder = ["ingredient", "raw_material", "packing_material"];
    const lowerQuery = query.toLowerCase();

    return categoryOrder
      .map((category) => ({
        category,
        items: materials.filter(
          (m) =>
            m.category === category &&
            (!query ||
              m.code.toLowerCase().includes(lowerQuery) ||
              m.name.toLowerCase().includes(lowerQuery))
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [materials, query]);

  return (
    <Combobox
      value={value}
      onChange={(materialId: string | null) => onChange(materialId ?? "")}
    >
      <div className="relative">
        <div className="relative">
          <ComboboxInput
            className="w-full text-sm border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded pl-2 pr-8 py-1.5 bg-transparent focus:bg-white dark:focus:bg-gray-700 text-default-900 dark:text-gray-100 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            displayValue={() =>
              selectedMaterial
                ? `${selectedMaterial.code} - ${selectedMaterial.name}`
                : ""
            }
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Not mapped"
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-1">
            <IconChevronDown
              className="h-4 w-4 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
          </ComboboxButton>
        </div>

        <ComboboxOptions
          anchor="bottom start"
          className="z-[60] mt-1 max-h-60 w-80 overflow-auto rounded-lg bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none"
        >
          {value && (
            <ComboboxOption
              value=""
              className={({ focus }) =>
                `relative cursor-pointer select-none px-3 py-2 border-b border-gray-200 dark:border-gray-600 ${
                  focus
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                    : "text-rose-600 dark:text-rose-400"
                }`
              }
            >
              Clear mapping
            </ComboboxOption>
          )}
          {filteredGroups.length === 0 ? (
            <div className="relative cursor-default select-none px-3 py-2 text-default-500 dark:text-gray-400">
              No materials found.
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.category}>
                <div className="bg-gray-100 dark:bg-gray-600 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wide">
                  {formatCategory(group.category)}
                </div>
                {group.items.map((material) => (
                  <ComboboxOption
                    key={material.id}
                    value={String(material.id)}
                    className={({ focus, selected }) =>
                      `relative cursor-pointer select-none py-2 pl-9 pr-4 ${
                        focus
                          ? "bg-sky-50 dark:bg-sky-900/30 text-sky-900 dark:text-sky-100"
                          : "text-default-900 dark:text-gray-100"
                      } ${selected ? "bg-sky-100 dark:bg-sky-900/50" : ""}`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`block truncate ${
                            selected ? "font-medium" : "font-normal"
                          }`}
                        >
                          <span className="text-default-500 dark:text-gray-400">
                            {material.code}
                          </span>
                          <span className="mx-1.5">-</span>
                          {material.name}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                            <IconCheck size={16} aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ComboboxOption>
                ))}
              </div>
            ))
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
};

export default MaterialAccountMappingModal;
