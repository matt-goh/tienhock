// src/pages/Accounting/Purchases/MaterialPurchaseFormPage.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { IconPlus, IconTrash, IconChevronDown, IconCheck } from "@tabler/icons-react";
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions, Transition } from "@headlessui/react";
import { api } from "../../../routes/utils/api";
import {
  PurchaseInvoiceWithLines,
  PurchaseInvoiceLineInput,
  SupplierDropdown,
  MaterialDropdown,
} from "../../../types/types";
import BackButton from "../../../components/BackButton";
import Button from "../../../components/Button";
import { FormInput } from "../../../components/FormComponents";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

interface PurchaseLine {
  id?: number;
  line_number: number;
  material_id: string;
  material_name: string;
  material_category: string;
  quantity: string;
  unit_cost: string;
  amount: string;
  notes: string;
}

interface PurchaseFormData {
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  notes: string;
}

// Helper to format category for display
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

// Material Combobox Component
interface MaterialComboboxProps {
  value: string;
  materials: MaterialDropdown[];
  onChange: (materialId: string) => void;
  disabled?: boolean;
}

const MaterialCombobox: React.FC<MaterialComboboxProps> = ({
  value,
  materials,
  onChange,
  disabled = false,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  // Get selected material for display
  const selectedMaterial = materials.find((m) => String(m.id) === value);

  // Group materials by category
  const groupedMaterials = useMemo(() => {
    const groups: { category: string; items: MaterialDropdown[] }[] = [];
    const categoryOrder = ["ingredient", "raw_material", "packing_material"];

    categoryOrder.forEach((cat) => {
      const items = materials.filter((m) => m.category === cat);
      if (items.length > 0) {
        groups.push({ category: cat, items });
      }
    });

    return groups;
  }, [materials]);

  // Filter materials based on query
  const filteredGroups = useMemo(() => {
    if (!query) return groupedMaterials;

    const lowerQuery = query.toLowerCase();
    return groupedMaterials
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (m) =>
            m.code.toLowerCase().includes(lowerQuery) ||
            m.name.toLowerCase().includes(lowerQuery)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedMaterials, query]);

  const handleAddNewMaterial = () => {
    navigate("/materials/new");
  };

  return (
    <Combobox
      value={value}
      onChange={onChange}
      disabled={disabled}
    >
      <div className="relative">
        <div className="relative">
          <ComboboxInput
            className="w-full text-sm border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded pl-2 pr-8 py-1.5 bg-transparent focus:bg-white dark:focus:bg-gray-700 text-default-900 dark:text-gray-100 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-gray-400 dark:placeholder:text-gray-500"
            displayValue={() =>
              selectedMaterial
                ? `${selectedMaterial.code} - ${selectedMaterial.name}`
                : ""
            }
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search materials..."
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-1">
            <IconChevronDown
              className="h-4 w-4 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
          </ComboboxButton>
        </div>

        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          afterLeave={() => setQuery("")}
        >
          <ComboboxOptions className="absolute z-50 mt-1 max-h-60 min-w-full w-max overflow-auto rounded-lg bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none">
            {/* Add New Material Option */}
            <div
              onClick={handleAddNewMaterial}
              className="relative cursor-pointer select-none px-3 py-2 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 border-b border-gray-200 dark:border-gray-600 flex items-center gap-2"
            >
              <IconPlus size={16} />
              <span className="font-medium">Add New Material</span>
            </div>

            {filteredGroups.length === 0 && query !== "" ? (
              <div className="relative cursor-default select-none px-3 py-2 text-default-500 dark:text-gray-400">
                No materials found.
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.category}>
                  {/* Category Header */}
                  <div className="sticky top-0 bg-gray-100 dark:bg-gray-600 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wide">
                    {formatCategory(group.category)}
                  </div>
                  {/* Materials in Category */}
                  {group.items.map((material) => (
                    <ComboboxOption
                      key={material.id}
                      value={String(material.id)}
                      className={({ active, selected }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                          active
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
                            <span className="text-default-500 dark:text-gray-400 font-mono">
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
        </Transition>
      </div>
    </Combobox>
  );
};

// Supplier Combobox Component
interface SupplierComboboxProps {
  value: string;
  suppliers: SupplierDropdown[];
  onChange: (supplierId: string | null) => void;
  disabled?: boolean;
  required?: boolean;
}

const SupplierCombobox: React.FC<SupplierComboboxProps> = ({
  value,
  suppliers,
  onChange,
  disabled = false,
  required = false,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  // Get selected supplier for display
  const selectedSupplier = suppliers.find((s) => String(s.id) === value);

  // Filter suppliers based on query
  const filteredSuppliers = useMemo(() => {
    if (!query) return suppliers;

    const lowerQuery = query.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.code.toLowerCase().includes(lowerQuery) ||
        s.name.toLowerCase().includes(lowerQuery)
    );
  }, [suppliers, query]);

  const handleAddNewSupplier = () => {
    navigate("/accounting/suppliers/new");
  };

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-default-700 dark:text-gray-300">
        Supplier{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <Combobox
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        <div className="relative">
          <div className="relative">
            <ComboboxInput
              className="w-full text-sm border border-default-300 dark:border-gray-600 rounded-lg pl-3 pr-10 py-2 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              displayValue={() =>
                selectedSupplier
                  ? `${selectedSupplier.code} - ${selectedSupplier.name}`
                  : ""
              }
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search suppliers..."
            />
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown
                className="h-5 w-5 text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              />
            </ComboboxButton>
          </div>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => setQuery("")}
          >
            <ComboboxOptions className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none">
              {/* Add New Supplier Option */}
              <div
                onClick={handleAddNewSupplier}
                className="relative cursor-pointer select-none px-3 py-2 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 border-b border-gray-200 dark:border-gray-600 flex items-center gap-2"
              >
                <IconPlus size={16} />
                <span className="font-medium">Add New Supplier</span>
              </div>

              {filteredSuppliers.length === 0 && query !== "" ? (
                <div className="relative cursor-default select-none px-3 py-2 text-default-500 dark:text-gray-400">
                  No suppliers found.
                </div>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <ComboboxOption
                    key={supplier.id}
                    value={String(supplier.id)}
                    className={({ active, selected }) =>
                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                        active
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
                          <span className="text-default-500 dark:text-gray-400 font-mono">
                            {supplier.code}
                          </span>
                          <span className="mx-1.5">-</span>
                          {supplier.name}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-600 dark:text-sky-400">
                            <IconCheck size={16} aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ComboboxOption>
                ))
              )}
            </ComboboxOptions>
          </Transition>
        </div>
      </Combobox>
    </div>
  );
};

const MaterialPurchaseFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id && id !== "new";

  // Reference data
  const [materials, setMaterials] = useState<MaterialDropdown[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<SupplierDropdown[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);

  // Form state
  const [formData, setFormData] = useState<PurchaseFormData>({
    supplier_id: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [lines, setLines] = useState<PurchaseLine[]>([
    {
      line_number: 1,
      material_id: "",
      material_name: "",
      material_category: "",
      quantity: "",
      unit_cost: "",
      amount: "",
      notes: "",
    },
  ]);

  // Edit mode state
  const [existingInvoice, setExistingInvoice] =
    useState<PurchaseInvoiceWithLines | null>(null);

  // Initial state refs for change detection
  const initialFormDataRef = useRef<PurchaseFormData | null>(null);
  const initialLinesRef = useRef<PurchaseLine[] | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch materials
  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        const response = await api.get("/api/purchase-invoices/materials");
        setMaterials(response || []);
      } catch (err) {
        console.error("Error fetching materials:", err);
      } finally {
        setMaterialsLoading(false);
      }
    };
    fetchMaterials();
  }, []);

  // Fetch suppliers
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const response = await api.get("/api/suppliers/dropdown");
        setSuppliers(response || []);
      } catch (err) {
        console.error("Error fetching suppliers:", err);
      } finally {
        setSuppliersLoading(false);
      }
    };
    fetchSuppliers();
  }, []);

  // Fetch invoice data for editing
  const fetchInvoiceData = useCallback(async () => {
    if (!id || id === "new") return;

    setLoading(true);
    setError(null);

    try {
      const response = (await api.get(
        `/api/purchase-invoices/${id}`
      )) as PurchaseInvoiceWithLines;

      setExistingInvoice(response);

      const fetchedFormData: PurchaseFormData = {
        supplier_id: String(response.supplier_id),
        invoice_number: response.invoice_number,
        invoice_date: response.invoice_date.split("T")[0],
        notes: response.notes || "",
      };

      const fetchedLines: PurchaseLine[] = response.lines.map((line) => ({
        id: line.id,
        line_number: line.line_number,
        material_id: String(line.material_id),
        material_name: line.material_name || "",
        material_category: line.material_category || "",
        quantity: line.quantity ? String(line.quantity) : "",
        unit_cost: line.unit_cost ? String(line.unit_cost) : "",
        amount: String(line.amount),
        notes: line.notes || "",
      }));

      setFormData(fetchedFormData);
      setLines(
        fetchedLines.length > 0
          ? fetchedLines
          : [
              {
                line_number: 1,
                material_id: "",
                material_name: "",
                material_category: "",
                quantity: "",
                unit_cost: "",
                amount: "",
                notes: "",
              },
            ]
      );

      initialFormDataRef.current = { ...fetchedFormData };
      initialLinesRef.current = JSON.parse(JSON.stringify(fetchedLines));
    } catch (err: unknown) {
      console.error("Error fetching invoice data:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load purchase: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      if (isEditMode) {
        await fetchInvoiceData();
      } else {
        initialFormDataRef.current = { ...formData };
        initialLinesRef.current = JSON.parse(JSON.stringify(lines));
        setLoading(false);
      }
    };

    // Wait for reference data to load
    if (!materialsLoading && !suppliersLoading) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, fetchInvoiceData, materialsLoading, suppliersLoading]);

  // Form change detection
  useEffect(() => {
    if (!initialFormDataRef.current || !initialLinesRef.current) return;

    const formChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    const linesChanged =
      JSON.stringify(lines) !== JSON.stringify(initialLinesRef.current);

    setIsFormChanged(formChanged || linesChanged);
  }, [formData, lines]);

  // Handlers
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSupplierChange = (value: string | null) => {
    if (!value) return;
    setFormData((prev) => ({ ...prev, supplier_id: value }));
  };

  const handleMaterialChange = (index: number, materialId: string | null) => {
    // Skip if null or header options
    if (!materialId || materialId.startsWith("header-")) return;

    const material = materials.find((m) => String(m.id) === materialId);
    setLines((prev) => {
      const newLines = [...prev];
      newLines[index] = {
        ...newLines[index],
        material_id: materialId,
        material_name: material?.name || "",
        material_category: material?.category || "",
        unit_cost: material?.default_unit_cost
          ? String(material.default_unit_cost)
          : "",
      };
      return newLines;
    });
  };

  const handleLineChange = (
    index: number,
    field: keyof PurchaseLine,
    value: string
  ) => {
    setLines((prev) => {
      const newLines = [...prev];
      newLines[index] = { ...newLines[index], [field]: value };

      // Auto-calculate amount if quantity and unit_cost are provided
      if (field === "quantity" || field === "unit_cost") {
        const qty = parseFloat(newLines[index].quantity) || 0;
        const cost = parseFloat(newLines[index].unit_cost) || 0;
        if (qty > 0 && cost > 0) {
          newLines[index].amount = (qty * cost).toFixed(2);
        }
      }

      return newLines;
    });
  };

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        line_number: prev.length + 1,
        material_id: "",
        material_name: "",
        material_category: "",
        quantity: "",
        unit_cost: "",
        amount: "",
        notes: "",
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) {
      toast.error("At least one line is required");
      return;
    }
    setLines((prev) => {
      const newLines = prev.filter((_, i) => i !== index);
      // Renumber lines
      return newLines.map((line, i) => ({ ...line, line_number: i + 1 }));
    });
  };

  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/stock/material-purchases");
    }
  };

  const handleConfirmBack = () => {
    navigate("/stock/material-purchases");
  };

  // Calculate total
  const total = useMemo(() => {
    return lines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);
  }, [lines]);

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(amount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.supplier_id) {
      toast.error("Please select a supplier");
      return;
    }
    if (!formData.invoice_number.trim()) {
      toast.error("Invoice number is required");
      return;
    }
    if (!formData.invoice_date) {
      toast.error("Invoice date is required");
      return;
    }

    // Validate lines
    const validLines = lines.filter(
      (line) => line.material_id && parseFloat(line.amount) > 0
    );
    if (validLines.length === 0) {
      toast.error("At least one line with material and amount is required");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        supplier_id: parseInt(formData.supplier_id),
        invoice_number: formData.invoice_number.trim(),
        invoice_date: formData.invoice_date,
        notes: formData.notes.trim() || null,
        lines: validLines.map(
          (line): PurchaseInvoiceLineInput => ({
            line_number: line.line_number,
            material_id: parseInt(line.material_id),
            quantity: line.quantity ? parseFloat(line.quantity) : null,
            unit_cost: line.unit_cost ? parseFloat(line.unit_cost) : null,
            amount: parseFloat(line.amount),
            notes: line.notes.trim() || null,
          })
        ),
      };

      if (isEditMode) {
        await api.put(`/api/purchase-invoices/${id}`, payload);
        toast.success("Material purchase updated successfully");
      } else {
        await api.post("/api/purchase-invoices", payload);
        toast.success("Material purchase created successfully");
      }

      navigate("/stock/material-purchases");
    } catch (err: unknown) {
      console.error("Error saving material purchase:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to save material purchase";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/purchase-invoices/${id}`);
      toast.success("Material purchase deleted successfully");
      navigate("/stock/material-purchases");
    } catch (err: unknown) {
      console.error("Error deleting material purchase:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to delete material purchase";
      toast.error(errorMessage);
    }
    setShowDeleteDialog(false);
  };

  // Loading state
  const pageLoading = loading || materialsLoading || suppliersLoading;

  if (pageLoading) {
    return (
      <div className="flex justify-center my-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <BackButton onClick={handleBackClick} />
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  const canEdit = !isEditMode || existingInvoice?.payment_status !== "paid";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <BackButton onClick={handleBackClick} />
          <span className="text-default-300 dark:text-gray-600">|</span>
          <div>
            <h1 className="text-xl font-semibold text-default-800 dark:text-gray-100">
              {isEditMode ? "Edit Material Purchase" : "New Material Purchase"}
            </h1>
            {isEditMode && existingInvoice && (
              <p className="text-sm text-default-500 dark:text-gray-400">
                {existingInvoice.supplier_name} - {existingInvoice.invoice_number}
              </p>
            )}
          </div>
        </div>
        {isEditMode && existingInvoice?.payment_status === "unpaid" && (
          <Button
            onClick={() => setShowDeleteDialog(true)}
            color="red"
            variant="outline"
            size="sm"
          >
            Delete
          </Button>
        )}
      </div>

      {/* Status Warning */}
      {isEditMode && existingInvoice?.payment_status === "paid" && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p className="text-amber-700 dark:text-amber-300 text-sm">
            This purchase is fully paid and cannot be edited.
          </p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Header Fields */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Supplier */}
            <div className="md:col-span-2">
              <SupplierCombobox
                value={formData.supplier_id}
                suppliers={suppliers}
                onChange={handleSupplierChange}
                required
                disabled={isEditMode}
              />
            </div>

            {/* Invoice Number */}
            <FormInput
              label="Invoice Number"
              name="invoice_number"
              value={formData.invoice_number}
              onChange={handleInputChange}
              placeholder="e.g., INV-001"
              required
              disabled={!canEdit}
            />

            {/* Invoice Date */}
            <FormInput
              label="Invoice Date"
              name="invoice_date"
              type="date"
              value={formData.invoice_date}
              onChange={handleInputChange}
              required
              disabled={!canEdit}
            />
          </div>
        </div>

        {/* Lines Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 overflow-visible">
          {/* Section Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-default-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-default-800 dark:text-gray-100">
              Materials
            </h2>
          </div>

          {/* Lines Table */}
          <div className="overflow-visible rounded-b-lg">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-12">
                    #
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider">
                    Material
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-24">
                    Qty
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-28">
                    Unit Cost
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-32">
                    Amount
                  </th>
                  <th className="px-3 py-2.5 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-800">
                {lines.map((line, index) => (
                  <tr
                    key={index}
                    className="group hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    {/* Line Number */}
                    <td className="px-3 py-1 text-sm text-default-500 dark:text-gray-400 font-mono">
                      {String(line.line_number).padStart(2, "0")}
                    </td>

                    {/* Material */}
                    <td className="px-1 py-1">
                      <MaterialCombobox
                        value={line.material_id}
                        materials={materials}
                        onChange={(materialId) =>
                          handleMaterialChange(index, materialId)
                        }
                        disabled={!canEdit}
                      />
                    </td>

                    {/* Quantity */}
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(e) =>
                          handleLineChange(index, "quantity", e.target.value)
                        }
                        disabled={!canEdit}
                        placeholder="0"
                        step="1"
                        min="0"
                        className="w-full px-2 py-1.5 text-sm text-right bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:bg-white dark:focus:bg-gray-700 rounded text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Unit Cost */}
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={line.unit_cost}
                        onChange={(e) =>
                          handleLineChange(index, "unit_cost", e.target.value)
                        }
                        disabled={!canEdit}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full px-2 py-1.5 text-sm text-right bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:bg-white dark:focus:bg-gray-700 rounded font-mono text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Amount */}
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={line.amount}
                        onChange={(e) =>
                          handleLineChange(index, "amount", e.target.value)
                        }
                        disabled={!canEdit}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full px-2 py-1.5 text-sm text-right bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:bg-white dark:focus:bg-gray-700 rounded font-mono text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Delete Button */}
                    <td className="px-1 py-1 text-center">
                      {canEdit && lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(index)}
                          className="opacity-0 group-hover:opacity-100 text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-opacity p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20"
                          title="Remove line"
                        >
                          <IconTrash size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <td colSpan={2} className="px-3 py-2.5">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={handleAddLine}
                        className="flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                      >
                        <IconPlus size={16} />
                        Add Line
                      </button>
                    )}
                  </td>
                  <td colSpan={2} className="px-3 py-2.5 text-right text-sm font-medium text-default-700 dark:text-gray-300">
                    Total:
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-sm font-semibold text-default-900 dark:text-gray-100 font-mono">
                      {formatCurrency(total)}
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-default-200 dark:border-gray-700 p-6">
          <label className="block text-sm font-medium text-default-700 dark:text-gray-200 mb-1">
            Notes
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            placeholder="Additional notes..."
            rows={2}
            disabled={!canEdit}
            className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 py-2 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
          />
        </div>

        {/* Journal Entry Info */}
        {isEditMode && existingInvoice?.journal_entry_id && (
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4">
            <p className="text-sky-700 dark:text-sky-300 text-sm">
              Journal Entry:{" "}
              <a
                href={`/accounting/journal-entries/${existingInvoice.journal_entry_id}`}
                className="font-mono underline hover:no-underline"
              >
                {existingInvoice.journal_reference}
              </a>
              {" - "}
              DR Purchase accounts, CR Trade Payables (TP) {formatCurrency(total)}
            </p>
          </div>
        )}

        {/* Actions */}
        {canEdit && (
          <div className="flex items-center justify-end space-x-3">
            <Button
              type="button"
              onClick={handleBackClick}
              color="default"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              color="sky"
              variant="filled"
              disabled={!isFormChanged || isSaving}
            >
              {isSaving
                ? "Saving..."
                : isEditMode
                ? "Update Purchase"
                : "Create Purchase"}
            </Button>
          </div>
        )}
      </form>

      {/* Back Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave this page?"
        variant="danger"
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete Material Purchase"
        message={`Are you sure you want to delete purchase "${formData.invoice_number}"? The associated journal entry will be cancelled.`}
        variant="danger"
      />
    </div>
  );
};

export default MaterialPurchaseFormPage;
