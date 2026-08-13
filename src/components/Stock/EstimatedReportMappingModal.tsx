// src/components/Stock/EstimatedReportMappingModal.tsx
// Maintenance surface for the Estimated Cost & Unit Cost report lines: each
// line's source members (material/kilang/account/product/product_type/line
// references) are replaced atomically via PUT /api/estimated-report/mappings/:lineId.
// Nothing is written until a line's Save is clicked.
import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Dialog,
  DialogPanel,
  DialogTitle,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import toast from "react-hot-toast";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import clsx from "clsx";
import Button from "../Button";
import LoadingSpinner from "../LoadingSpinner";
import Checkbox from "../Checkbox";
import { api } from "../../routes/utils/api";

type SourceType =
  | "material"
  | "kilang"
  | "account"
  | "product"
  | "product_type"
  | "line";

export interface MappingSourceRow {
  id: number;
  line_id: number;
  source_type: SourceType;
  sign: number | string;
  percentage: number | string;
  material_id: number | null;
  variant_id: number | null;
  stock_bucket: string | null;
  account_code: string | null;
  product_id: string | null;
  product_type: string | null;
  ref_line_id: number | null;
  material_code: string | null;
  material_name: string | null;
  variant_name: string | null;
  account_description: string | null;
  product_description: string | null;
  ref_line_key: string | null;
  ref_line_description: string | null;
}

export interface MappingLine {
  id: number;
  line_key: string;
  product_line: string;
  page: string;
  section: string;
  code: string | null;
  description: string;
  opening_code: string | null;
  opening_description: string | null;
  sort_order: number;
  source_kind: string;
  is_active: boolean;
  notes: string | null;
  sources: MappingSourceRow[];
}

interface MaterialOption {
  id: number;
  code: string;
  name: string;
  category: string;
  applies_to: string;
  variants: { id: number; variant_name: string }[];
}

interface AccountOption {
  code: string;
  description: string;
  ledger_type: string;
}

interface ProductOption {
  id: string;
  description: string;
  type: string;
}

interface ReferenceLineOption {
  id: number;
  line_key: string;
  product_line: string;
  page: string;
  section: string;
  code: string | null;
  description: string;
}

interface MappingOptions {
  materials: MaterialOption[];
  accounts: AccountOption[];
  products: ProductOption[];
  productTypes: string[];
  stockBuckets: string[];
  referenceLines: ReferenceLineOption[];
}

interface DraftSource {
  source_type: SourceType;
  sign: 1 | -1;
  percentage: string; // raw input, parsed on save
  material_id: number | null;
  variant_id: number | null;
  stock_bucket: string | null;
  account_code: string | null;
  product_id: string | null;
  product_type: string | null;
  ref_line_id: number | null;
}

interface EstimatedReportMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMappingComplete?: () => void;
}

const SOURCE_TYPE_OPTIONS: { id: SourceType; name: string }[] = [
  { id: "material", name: "Material stock" },
  { id: "kilang", name: "Kilang (finished goods) stock" },
  { id: "account", name: "Journal account" },
  { id: "product", name: "Product" },
  { id: "product_type", name: "Product type" },
  { id: "line", name: "P&L line reference" },
];

const PAGE_ORDER = ["pl", "unit_cost"];
const PAGE_LABELS: Record<string, string> = {
  pl: "Estimated Cost",
  unit_cost: "Estimated Unit Cost",
};
const SECTION_ORDER = [
  "product",
  "stock",
  "purchase",
  "production",
  "ingredient",
  "packing",
  "salary",
  "salesman",
  "habuk",
  "expenses",
  "machine_repair",
];
const SECTION_LABELS: Record<string, string> = {
  product: "Product",
  stock: "Stock",
  purchase: "Purchase",
  production: "Production",
  ingredient: "Ingredients",
  packing: "Packing",
  salary: "Salary",
  salesman: "Salesman",
  habuk: "Habuk",
  expenses: "Expenses",
  machine_repair: "Machine Repair",
};
const PRODUCT_LINE_ORDER = ["mee", "bihun", "shared"];

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const toDraftSources = (line: MappingLine): DraftSource[] =>
  line.sources.map((source) => ({
    source_type: source.source_type,
    sign: Number(source.sign) === -1 ? -1 : 1,
    percentage: String(Number(source.percentage)),
    material_id:
      source.material_id === null ? null : Number(source.material_id),
    variant_id: source.variant_id === null ? null : Number(source.variant_id),
    stock_bucket: source.stock_bucket,
    account_code: source.account_code,
    product_id: source.product_id,
    product_type: source.product_type,
    ref_line_id: source.ref_line_id === null ? null : Number(source.ref_line_id),
  }));

/** Display label for a draft member, resolving names from the options lists. */
const describeDraftSource = (
  source: DraftSource,
  options: MappingOptions,
  t: TFunction
): string => {
  switch (source.source_type) {
    case "material": {
      const material = options.materials.find(
        (item) => item.id === source.material_id
      );
      const variant =
        source.variant_id === null
          ? null
          : material?.variants.find((item) => item.id === source.variant_id)
              ?.variant_name ?? null;
      const base = material
        ? `${material.code} - ${material.name}`
        : t("Material {{id}}", { id: source.material_id });
      return `${base}${variant ? ` (${variant})` : ""} [${(
        source.stock_bucket ?? ""
      ).toUpperCase()}]`;
    }
    case "kilang":
      return t("Kilang stock [{{bucket}}]", {
        bucket: (source.stock_bucket ?? "").toUpperCase(),
      });
    case "account": {
      const account = options.accounts.find(
        (item) => item.code === source.account_code
      );
      return account
        ? `${account.code} - ${account.description}`
        : source.account_code ?? "";
    }
    case "product": {
      const product = options.products.find(
        (item) => item.id === source.product_id
      );
      return product
        ? `${product.id} - ${product.description}`
        : source.product_id ?? "";
    }
    case "product_type":
      return t("Product type: {{type}}", { type: source.product_type });
    case "line": {
      const reference = options.referenceLines.find(
        (item) => item.id === source.ref_line_id
      );
      return reference
        ? `${reference.line_key} - ${reference.description}`
        : t("Line {{id}}", { id: source.ref_line_id });
    }
    default:
      return source.source_type;
  }
};

interface ComboItem {
  id: string;
  label: string;
}

/** Generic searchable single-select picker. */
const SearchableCombobox: React.FC<{
  items: ComboItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  className?: string;
}> = ({ items, value, onChange, placeholder, className }) => {
  const { t } = useTranslation("stock");
  const [query, setQuery] = useState("");
  const selected = items.find((item) => item.id === value) ?? null;
  const filtered =
    query === ""
      ? items
      : items.filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase())
        );
  // Rendering hundreds of options (e.g. the full chart of accounts) stalls the
  // page, so cap the list - typing narrows it down.
  const MAX_VISIBLE_OPTIONS = 50;
  const visible = filtered.slice(0, MAX_VISIBLE_OPTIONS);
  const hiddenCount = filtered.length - visible.length;

  return (
    <Combobox value={value} onChange={(id: string | null) => onChange(id)}>
      <div className={clsx("relative", className)}>
        <div className="relative">
          <ComboboxInput
            className="w-full rounded border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 py-1.5 pl-2 pr-8 text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:placeholder:text-gray-500"
            displayValue={() => selected?.label ?? ""}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setQuery(event.target.value)
            }
            placeholder={placeholder}
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
          className="z-[70] mt-1 max-h-56 w-80 overflow-auto rounded-lg bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 focus:outline-none dark:ring-white/10"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-default-500 dark:text-gray-400">
              {t("No matches.")}
            </div>
          ) : (
            <>
              {visible.map((item) => (
                <ComboboxOption
                  key={item.id}
                  value={item.id}
                  className={({ focus, selected }) =>
                    `relative cursor-pointer select-none py-2 pl-9 pr-3 ${
                      focus
                        ? "bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100"
                        : "text-default-900 dark:text-gray-100"
                    } ${selected ? "bg-sky-100 dark:bg-sky-900/50" : ""}`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span
                        className={
                          selected ? "block truncate font-medium" : "block truncate"
                        }
                      >
                        {item.label}
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                          <IconCheck size={14} />
                        </span>
                      )}
                    </>
                  )}
                </ComboboxOption>
              ))}
              {hiddenCount > 0 && (
                <div className="px-3 py-2 text-xs text-default-400 dark:text-gray-500">
                  {t("{{count}} more — type to narrow down", { count: hiddenCount })}
                </div>
              )}
            </>
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
};

/** Compact dropdown for small fixed option sets. */
const MiniListbox: React.FC<{
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
  className?: string;
}> = ({ value, options, onChange, className }) => {
  const { t } = useTranslation("stock");
  return (
    <Listbox value={value} onChange={onChange}>
      <div className={clsx("relative", className)}>
        <ListboxButton className="flex w-full items-center justify-between rounded border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 px-2 py-1.5 text-left text-sm text-default-900 dark:text-gray-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
          <span className="truncate">
            {options.find((option) => option.id === value)?.name ?? t("Select")}
          </span>
        <IconChevronDown
          className="ml-1 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
      </ListboxButton>
      <ListboxOptions
        anchor="bottom start"
        className="z-[70] mt-1 max-h-56 overflow-auto rounded-lg bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 focus:outline-none dark:ring-white/10"
      >
        {options.map((option) => (
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
                    selected ? "block truncate font-medium" : "block truncate"
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
  );
};

/** Inline editor for one report line's members, active flag and notes. */
const LineEditor: React.FC<{
  line: MappingLine;
  options: MappingOptions;
  saving: boolean;
  onSave: (
    sources: DraftSource[],
    isActive: boolean,
    notes: string
  ) => Promise<void>;
  onCancel: () => void;
}> = ({ line, options, saving, onSave, onCancel }) => {
  const { t } = useTranslation("stock");

  const [sources, setSources] = useState<DraftSource[]>(() =>
    toDraftSources(line)
  );
  const [isActive, setIsActive] = useState<boolean>(line.is_active);
  const [notes, setNotes] = useState<string>(line.notes ?? "");

  const [newType, setNewType] = useState<SourceType>("account");
  const [newMaterialId, setNewMaterialId] = useState<string | null>(null);
  const [newVariantId, setNewVariantId] = useState<string>(""); // "" = all variants
  const [newBucket, setNewBucket] = useState<string>(
    line.product_line === "mee" || line.product_line === "bihun"
      ? line.product_line
      : "shared"
  );
  const [newAccountCode, setNewAccountCode] = useState<string | null>(null);
  const [newProductId, setNewProductId] = useState<string | null>(null);
  const [newProductType, setNewProductType] = useState<string>(
    options.productTypes[0] ?? ""
  );
  const [newRefLineId, setNewRefLineId] = useState<string>(
    options.referenceLines[0] ? String(options.referenceLines[0].id) : ""
  );

  const selectedMaterial = options.materials.find(
    (item) => String(item.id) === newMaterialId
  );

  const bucketOptions = options.stockBuckets.map((bucket) => ({
    id: bucket,
    name: bucket.toUpperCase(),
  }));

  const canAdd =
    newType === "material"
      ? newMaterialId !== null && newBucket !== ""
      : newType === "kilang"
      ? newBucket !== ""
      : newType === "account"
      ? newAccountCode !== null
      : newType === "product"
      ? newProductId !== null
      : newType === "product_type"
      ? newProductType !== ""
      : newRefLineId !== "";

  const resetNewPickers = (): void => {
    setNewMaterialId(null);
    setNewVariantId("");
    setNewAccountCode(null);
    setNewProductId(null);
  };

  const handleAddMember = (): void => {
    if (!canAdd) return;
    setSources((prev) => [
      ...prev,
      {
        source_type: newType,
        sign: 1,
        percentage: "100",
        material_id: newType === "material" ? Number(newMaterialId) : null,
        variant_id:
          newType === "material" && newVariantId !== ""
            ? Number(newVariantId)
            : null,
        stock_bucket:
          newType === "material" || newType === "kilang" ? newBucket : null,
        account_code: newType === "account" ? newAccountCode : null,
        product_id: newType === "product" ? newProductId : null,
        product_type: newType === "product_type" ? newProductType : null,
        ref_line_id: newType === "line" ? Number(newRefLineId) : null,
      },
    ]);
    resetNewPickers();
  };

  const handleSave = async (): Promise<void> => {
    const invalid = sources.some((source) => {
      const parsed =
        source.percentage.trim() === "" ? 100 : Number(source.percentage);
      return !Number.isFinite(parsed) || parsed < 0 || parsed > 100;
    });
    if (invalid) {
      toast.error(t("Every percentage must be between 0 and 100"));
      return;
    }
    await onSave(sources, isActive, notes);
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10 p-3">
      {/* Active + notes */}
      <div className="flex flex-wrap items-center gap-4">
        <Checkbox
          checked={isActive}
          onChange={setIsActive}
          label={t("Active")}
          disabled={saving}
        />
        <input
          type="text"
          value={notes}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setNotes(event.target.value)
          }
          placeholder={t("Notes (optional)")}
          disabled={saving}
          className="min-w-[200px] flex-1 rounded border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 px-2 py-1.5 text-sm text-default-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:placeholder:text-gray-500"
        />
      </div>

      {/* Current members */}
      <div className="space-y-1">
        {sources.length === 0 && (
          <p className="text-sm text-default-400 dark:text-gray-500">
            {t("No source members - this line will evaluate to zero.")}
          </p>
        )}
        {sources.map((source, index) => (
          <div
            key={index}
            className="flex flex-wrap items-center gap-2 rounded border border-default-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5"
          >
            <span className="inline-flex items-center rounded bg-default-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs font-medium uppercase text-default-500 dark:text-gray-300">
              {source.source_type}
            </span>
            <span className="min-w-[180px] flex-1 text-sm text-default-800 dark:text-gray-100">
              {describeDraftSource(source, options, t)}
            </span>
            <div className="flex overflow-hidden rounded border border-default-300 dark:border-gray-600">
              {([1, -1] as const).map((sign) => (
                <button
                  key={sign}
                  type="button"
                  title={sign === 1 ? t("Include") : t("Exclude")}
                  onClick={() =>
                    setSources((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, sign } : item
                      )
                    )
                  }
                  disabled={saving}
                  className={clsx(
                    "px-2 py-1 text-xs font-medium transition-colors",
                    source.sign === sign
                      ? sign === 1
                        ? "bg-sky-500 text-white"
                        : "bg-rose-500 text-white"
                      : "bg-white text-default-500 hover:bg-default-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                  )}
                >
                  {sign === 1 ? "+1" : "-1"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={source.percentage}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setSources((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, percentage: event.target.value }
                        : item
                    )
                  )
                }
                disabled={saving}
                className="w-20 rounded border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 px-2 py-1 text-right text-sm text-default-900 dark:text-gray-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <span className="text-xs text-default-500 dark:text-gray-400">
                %
              </span>
            </div>
            <button
              type="button"
              title={t("Remove member")}
              onClick={() =>
                setSources((prev) =>
                  prev.filter((_, itemIndex) => itemIndex !== index)
                )
              }
              disabled={saving}
              className="rounded p-1 text-default-400 hover:bg-rose-50 hover:text-rose-600 dark:text-gray-500 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
            >
              <IconTrash size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Add member */}
      <div className="flex flex-wrap items-center gap-2 border-t border-default-200 dark:border-gray-600 pt-2">
        <MiniListbox
          value={newType}
          options={SOURCE_TYPE_OPTIONS.map((option) => ({
            ...option,
            name: t(option.name),
          }))}
          onChange={(id) => {
            setNewType(id as SourceType);
            resetNewPickers();
          }}
          className="w-56"
        />

        {newType === "material" && (
          <>
            <SearchableCombobox
              items={options.materials.map((material) => ({
                id: String(material.id),
                label: `${material.code} - ${material.name}`,
              }))}
              value={newMaterialId}
              onChange={(id) => {
                setNewMaterialId(id);
                setNewVariantId("");
              }}
              placeholder={t("Select material")}
              className="w-72"
            />
            {selectedMaterial && selectedMaterial.variants.length > 0 && (
              <MiniListbox
                value={newVariantId}
                options={[
                  { id: "", name: t("All variants") },
                  ...selectedMaterial.variants.map((variant) => ({
                    id: String(variant.id),
                    name: variant.variant_name,
                  })),
                ]}
                onChange={setNewVariantId}
                className="w-44"
              />
            )}
            <MiniListbox
              value={newBucket}
              options={bucketOptions}
              onChange={setNewBucket}
              className="w-28"
            />
          </>
        )}

        {newType === "kilang" && (
          <MiniListbox
            value={newBucket}
            options={bucketOptions}
            onChange={setNewBucket}
            className="w-28"
          />
        )}

        {newType === "account" && (
          <SearchableCombobox
            items={options.accounts.map((account) => ({
              id: account.code,
              label: `${account.code} - ${account.description}`,
            }))}
            value={newAccountCode}
            onChange={setNewAccountCode}
            placeholder={t("Select account")}
            className="w-72"
          />
        )}

        {newType === "product" && (
          <SearchableCombobox
            items={options.products.map((product) => ({
              id: product.id,
              label: `${product.id} - ${product.description}`,
            }))}
            value={newProductId}
            onChange={setNewProductId}
            placeholder={t("Select product")}
            className="w-72"
          />
        )}

        {newType === "product_type" && (
          <MiniListbox
            value={newProductType}
            options={options.productTypes.map((type) => ({
              id: type,
              name: type,
            }))}
            onChange={setNewProductType}
            className="w-36"
          />
        )}

        {newType === "line" && (
          <MiniListbox
            value={newRefLineId}
            options={options.referenceLines.map((reference) => ({
              id: String(reference.id),
              name: `${reference.line_key} - ${reference.description}`,
            }))}
            onChange={setNewRefLineId}
            className="w-80"
          />
        )}

        <Button
          type="button"
          variant="outline"
          onClick={handleAddMember}
          disabled={!canAdd || saving}
        >
          <span className="flex items-center whitespace-nowrap">
            <IconPlus className="mr-1 h-4 w-4" />
            {t("Add")}
          </span>
        </Button>
      </div>

      {/* Editor actions */}
      <div className="flex justify-end gap-2 border-t border-default-200 dark:border-gray-600 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          {t("Cancel")}
        </Button>
        <Button
          type="button"
          color="sky"
          variant="filled"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t("Saving...") : t("Save Line")}
        </Button>
      </div>
    </div>
  );
};

const EstimatedReportMappingModal: React.FC<
  EstimatedReportMappingModalProps
> = ({ isOpen, onClose, onMappingComplete }) => {
  const { t } = useTranslation("stock");

  const [lines, setLines] = useState<MappingLine[]>([]);
  const [options, setOptions] = useState<MappingOptions | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [savingLineId, setSavingLineId] = useState<number | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const [mappingsResponse, optionsResponse] = await Promise.all([
        api.get<MappingLine[]>("/api/estimated-report/mappings"),
        api.get<MappingOptions>("/api/estimated-report/mappings/options"),
      ]);
      setLines(mappingsResponse || []);
      setOptions(optionsResponse);
    } catch (error) {
      console.error("Error loading estimated report mappings:", error);
      toast.error(t("Failed to load report mappings"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  interface LineGroup {
    key: string;
    page: string;
    section: string;
    productLine: string;
    lines: MappingLine[];
  }

  const groups = useMemo((): LineGroup[] => {
    const lowerSearch = search.trim().toLowerCase();
    const matches = (line: MappingLine): boolean =>
      lowerSearch === "" ||
      line.line_key.toLowerCase().includes(lowerSearch) ||
      (line.code ?? "").toLowerCase().includes(lowerSearch) ||
      (line.opening_code ?? "").toLowerCase().includes(lowerSearch) ||
      line.description.toLowerCase().includes(lowerSearch) ||
      (line.opening_description ?? "").toLowerCase().includes(lowerSearch);

    const grouped = new Map<string, LineGroup>();
    for (const line of lines) {
      if (!matches(line)) continue;
      const key = `${line.page}:${line.section}:${line.product_line}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          page: line.page,
          section: line.section,
          productLine: line.product_line,
          lines: [],
        });
      }
      grouped.get(key)?.lines.push(line);
    }

    return [...grouped.values()].sort((a, b) => {
      const pageDiff =
        PAGE_ORDER.indexOf(a.page) - PAGE_ORDER.indexOf(b.page);
      if (pageDiff !== 0) return pageDiff;
      const sectionDiff =
        SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
      if (sectionDiff !== 0) return sectionDiff;
      return (
        PRODUCT_LINE_ORDER.indexOf(a.productLine) -
        PRODUCT_LINE_ORDER.indexOf(b.productLine)
      );
    });
  }, [lines, search]);

  const handleToggleGroup = (key: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSaveLine = async (
    line: MappingLine,
    sources: DraftSource[],
    isActive: boolean,
    notes: string
  ): Promise<void> => {
    setSavingLineId(line.id);
    try {
      await api.put(`/api/estimated-report/mappings/${line.id}`, {
        sources: sources.map((source) => ({
          source_type: source.source_type,
          sign: source.sign,
          percentage:
            source.percentage.trim() === "" ? 100 : Number(source.percentage),
          material_id: source.material_id,
          variant_id: source.variant_id,
          stock_bucket: source.stock_bucket,
          account_code: source.account_code,
          product_id: source.product_id,
          product_type: source.product_type,
          ref_line_id: source.ref_line_id,
        })),
        isActive,
        notes: notes.trim() === "" ? null : notes.trim(),
      });
      toast.success(t("Mapping saved for {{lineKey}}", { lineKey: line.line_key }));
      setEditingLineId(null);
      await loadData();
      if (onMappingComplete) {
        onMappingComplete();
      }
    } catch (error) {
      console.error("Error saving estimated report mapping:", error);
      toast.error(getErrorMessage(error, t("Failed to save mapping")));
    } finally {
      setSavingLineId(null);
    }
  };

  const handleClose = (): void => {
    if (savingLineId !== null) return;
    setSearch("");
    setEditingLineId(null);
    onClose();
  };

  const isSearching = search.trim() !== "";

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
              <DialogPanel className="w-full max-w-5xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <div className="mb-2 flex items-center justify-between">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                  >
                    {t("Estimated Report Mappings")}
                  </DialogTitle>
                  <button
                    onClick={handleClose}
                    className="text-default-400 hover:text-default-600 dark:text-gray-400 dark:hover:text-gray-200"
                    disabled={savingLineId !== null}
                  >
                    <IconX size={20} />
                  </button>
                </div>

                <p className="mb-4 text-sm text-default-500 dark:text-gray-400">
                  {t(
                    "Each report line derives its amount from the source members listed here. Expand a line to add, remove or re-weight its members; nothing is written until that line's Save is clicked.",
                  )}
                </p>

                <div className="relative mb-3 max-w-xs">
                  <IconSearch
                    size={16}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-default-400 dark:text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder={t("Search lines...")}
                    className="w-full rounded-lg border border-default-300 dark:border-gray-500 bg-white dark:bg-gray-900/50 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 dark:text-gray-100 dark:placeholder-gray-400"
                    value={search}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setSearch(event.target.value)
                    }
                  />
                </div>

                {isLoading || !options ? (
                  <div className="flex items-center justify-center py-20">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                    {groups.length === 0 ? (
                      <p className="py-8 text-center text-sm text-default-500 dark:text-gray-400">
                        {t("No report lines found.")}
                      </p>
                    ) : (
                      groups.map((group) => {
                        const isExpanded =
                          isSearching || expandedGroups.has(group.key);
                        return (
                          <div
                            key={group.key}
                            className="overflow-hidden rounded-lg border border-default-200 dark:border-gray-600"
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleGroup(group.key)}
                              className="flex w-full items-center gap-2 bg-default-50 dark:bg-gray-700 px-3 py-2 text-left hover:bg-default-100 dark:hover:bg-gray-600"
                            >
                              {isExpanded ? (
                                <IconChevronDown
                                  size={16}
                                  className="text-default-400 dark:text-gray-400"
                                />
                              ) : (
                                <IconChevronRight
                                  size={16}
                                  className="text-default-400 dark:text-gray-400"
                                />
                              )}
                              <span className="text-sm font-semibold text-default-800 dark:text-gray-100">
                                {t(PAGE_LABELS[group.page] ?? group.page)} ·{" "}
                                {t(SECTION_LABELS[group.section] ?? group.section)}{" "}
                                · {group.productLine.toUpperCase()}
                              </span>
                              <span className="ml-auto text-xs text-default-400 dark:text-gray-400">
                                {t(
                                  group.lines.length === 1
                                    ? "{{count}} line"
                                    : "{{count}} lines",
                                  { count: group.lines.length },
                                )}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="divide-y divide-default-100 dark:divide-gray-700">
                                {group.lines.map((line) => (
                                  <div key={line.id} className="px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-3">
                                      <div className="min-w-[220px] flex-1">
                                        <div className="text-sm font-medium text-default-800 dark:text-gray-100">
                                          {line.code ?? line.line_key}
                                          {line.opening_code && (
                                            <span className="text-default-400 dark:text-gray-500">
                                              {" "}
                                              / {line.opening_code}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs text-default-500 dark:text-gray-400">
                                          {line.description}
                                          {line.opening_description &&
                                            ` / ${line.opening_description}`}
                                        </div>
                                      </div>
                                      <span className="text-xs text-default-400 dark:text-gray-500">
                                        {t(
                                          line.sources.length === 1
                                            ? "{{count}} member"
                                            : "{{count}} members",
                                          { count: line.sources.length },
                                        )}
                                      </span>
                                      {!line.is_active && (
                                        <span className="rounded bg-default-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs font-medium text-default-500 dark:text-gray-300">
                                          {t("Inactive")}
                                        </span>
                                      )}
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                          setEditingLineId(
                                            editingLineId === line.id
                                              ? null
                                              : line.id
                                          )
                                        }
                                        disabled={
                                          savingLineId !== null &&
                                          savingLineId !== line.id
                                        }
                                      >
                                        {editingLineId === line.id
                                          ? t("Close")
                                          : t("Edit")}
                                      </Button>
                                    </div>

                                    {editingLineId === line.id && (
                                      <LineEditor
                                        line={line}
                                        options={options}
                                        saving={savingLineId === line.id}
                                        onSave={(sources, isActive, notes) =>
                                          handleSaveLine(
                                            line,
                                            sources,
                                            isActive,
                                            notes
                                          )
                                        }
                                        onCancel={() => setEditingLineId(null)}
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={savingLineId !== null}
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
  );
};

export default EstimatedReportMappingModal;
