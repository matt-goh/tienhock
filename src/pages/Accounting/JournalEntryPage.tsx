// src/pages/Accounting/JournalEntryPage.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import {
  JournalEntry,
  JournalEntryType,
  JournalEntryLineInput,
} from "../../types/types";
import {
  useAccountCodesCache,
  useJournalEntryTypesCache,
} from "../../utils/accounting/useAccountingCache";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import { FormListbox, SelectOption } from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  IconPlus,
  IconTrash,
  IconDeviceFloppy,
  IconFileText,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";

interface JournalLineFormData {
  id?: number;
  line_number: number;
  account_code: string;
  reference: string;
  particulars: string;
  debit_amount: string;
  credit_amount: string;
}

interface JournalEntryFormData {
  reference_no: string;
  entry_type: JournalEntryType;
  entry_date: string;
  description: string;
  lines: JournalLineFormData[];
}

const emptyLine = (lineNumber: number): JournalLineFormData => ({
  line_number: lineNumber,
  account_code: "",
  reference: "",
  particulars: "",
  debit_amount: "",
  credit_amount: "",
});

// Inline searchable combobox for account code selection
interface AccountCodeCellProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

const ACCOUNT_LOAD_INCREMENT = 50;

const AccountCodeCell: React.FC<AccountCodeCellProps> = ({
  value,
  options,
  onChange,
  disabled = false,
}: AccountCodeCellProps) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [loadedCount, setLoadedCount] = useState(50);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    if (!query) return options;
    const lowerQuery = query.toLowerCase();
    return options.filter(
      (opt: SelectOption) =>
        opt.id.toString().toLowerCase().includes(lowerQuery) ||
        opt.name.toLowerCase().includes(lowerQuery)
    );
  }, [query, options]);

  // Paginated options for display
  const displayedOptions = useMemo(() => {
    return filteredOptions.slice(0, loadedCount);
  }, [filteredOptions, loadedCount]);

  const hasMoreOptions = displayedOptions.length < filteredOptions.length;
  const remainingCount = filteredOptions.length - displayedOptions.length;

  const selectedOption = options.find((opt: SelectOption) => opt.id === value);
  const displayValue = selectedOption?.name || "";

  // Reset loaded count when query changes
  useEffect(() => {
    setLoadedCount(50);
  }, [query]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
    setQuery("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleFocus = () => {
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  };

  const handleLoadMore = () => {
    setLoadedCount((prev) => prev + ACCOUNT_LOAD_INCREMENT);
  };

  return (
    <div className="relative">
      <div className="flex">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? query : displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Search account..."
          className="w-full px-2 py-1.5 text-sm bg-transparent border-0 focus:ring-1 focus:ring-sky-500 focus:bg-white dark:focus:bg-gray-700 rounded placeholder:text-gray-400 dark:placeholder:text-gray-500 text-default-900 dark:text-gray-100 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="px-1 text-default-400 dark:text-gray-500 hover:text-default-600 dark:hover:text-gray-300 disabled:cursor-not-allowed"
        >
          <IconChevronDown size={16} />
        </button>
      </div>
      {isOpen && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg shadow-lg"
        >
          {displayedOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-default-500 dark:text-gray-400">
              No accounts found
            </div>
          ) : (
            displayedOptions.map((opt: SelectOption) => (
              <div
                key={opt.id}
                onClick={() => handleSelect(opt.id.toString())}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/50 flex items-center justify-between gap-2 ${
                  opt.id === value ? "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-200" : "text-default-900 dark:text-gray-100"
                }`}
              >
                <span>{opt.name}</span>
                {opt.id === value && (
                  <IconCheck size={16} className="text-sky-600 dark:text-sky-400 flex-shrink-0" />
                )}
              </div>
            ))
          )}

          {/* Load More Button */}
          {hasMoreOptions && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleLoadMore();
                }}
                className="w-full text-center py-1.5 px-4 text-sm font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 rounded-md hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors duration-200 flex items-center justify-center"
              >
                <IconChevronDown size={16} className="mr-1.5" />
                <span>
                  Load More ({remainingCount} remaining)
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const JournalEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();

  // Check if we're in edit mode (route ends with /edit) or create mode (/new)
  const isEditMode = !!id && location.pathname.includes("/edit");
  const isCreateMode = location.pathname.endsWith("/new");

  // Cached reference data
  const { entryTypes, isLoading: entryTypesLoading } = useJournalEntryTypesCache();
  const { accountCodes: allAccountCodes, isLoading: accountCodesLoading } = useAccountCodesCache();

  // Filter to only active account codes
  const accountCodes = useMemo(
    () => allAccountCodes.filter((a) => a.is_active),
    [allAccountCodes]
  );

  // Form state
  const [formData, setFormData] = useState<JournalEntryFormData>({
    reference_no: "",
    entry_type: "J",
    entry_date: new Date().toISOString().split("T")[0],
    description: "",
    lines: [emptyLine(1), emptyLine(2)],
  });

  // Entry status for edit mode
  const [entryStatus, setEntryStatus] = useState<string>("active");

  // Initial form data for change detection
  const initialFormDataRef = useRef<JournalEntryFormData | null>(null);

  // UI state
  const [pageLoading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Combined loading state (page + cache)
  const loading = pageLoading || entryTypesLoading || accountCodesLoading;

  // Calculate totals
  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of formData.lines) {
      totalDebit += parseFloat(line.debit_amount) || 0;
      totalCredit += parseFloat(line.credit_amount) || 0;
    }
    return { totalDebit, totalCredit };
  }, [formData.lines]);

  // Check if balanced
  const isBalanced = Math.abs(totals.totalDebit - totals.totalCredit) <= 0.01;
  const difference = Math.abs(totals.totalDebit - totals.totalCredit);

  // Fetch next reference number
  const fetchNextReference = useCallback(
    async (entryType: JournalEntryType) => {
      try {
        const response = await api.get(
          `/api/journal-entries/next-reference/${entryType}`
        );
        const data = response as { reference_no: string };
        setFormData((prev) => ({ ...prev, reference_no: data.reference_no }));
      } catch (err: unknown) {
        console.error("Error fetching next reference:", err);
      }
    },
    []
  );

  // Fetch entry data for editing
  const fetchEntryData = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/journal-entries/${id}`);
      const entry = response as JournalEntry;

      const lines: JournalLineFormData[] = (entry.lines || []).map((line) => ({
        id: line.id,
        line_number: line.line_number,
        account_code: line.account_code,
        reference: line.reference || "",
        particulars: line.particulars || "",
        debit_amount: line.debit_amount > 0 ? line.debit_amount.toString() : "",
        credit_amount:
          line.credit_amount > 0 ? line.credit_amount.toString() : "",
      }));

      // Ensure at least 2 lines
      while (lines.length < 2) {
        lines.push(emptyLine(lines.length + 1));
      }

      const fetchedFormData: JournalEntryFormData = {
        reference_no: entry.reference_no,
        entry_type: entry.entry_type,
        entry_date: entry.entry_date.split("T")[0],
        description: entry.description || "",
        lines,
      };

      setFormData(fetchedFormData);
      initialFormDataRef.current = JSON.parse(JSON.stringify(fetchedFormData));
      setEntryStatus(entry.status);
    } catch (err: unknown) {
      console.error("Error fetching entry data:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load journal entry: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      if (isEditMode) {
        await fetchEntryData();
      } else {
        // Create mode - fetch next reference
        if (isCreateMode) {
          await fetchNextReference(formData.entry_type);
        }
        initialFormDataRef.current = JSON.parse(JSON.stringify(formData));
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, isCreateMode, fetchEntryData]);

  // Form change detection
  useEffect(() => {
    if (!initialFormDataRef.current) return;

    const hasChanges =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanges);
  }, [formData]);

  // Handle entry type change
  const handleEntryTypeChange = async (value: string) => {
    const newType = value as JournalEntryType;
    setFormData((prev) => ({ ...prev, entry_type: newType }));

    // Only fetch new reference if creating new entry
    if (isCreateMode) {
      await fetchNextReference(newType);
    }
  };

  // Handle line changes
  const handleLineChange = (
    index: number,
    field: keyof JournalLineFormData,
    value: string
  ) => {
    setFormData((prev) => {
      const newLines = [...prev.lines];
      newLines[index] = { ...newLines[index], [field]: value };

      // Auto-clear opposite amount field
      if (field === "debit_amount" && value && parseFloat(value) > 0) {
        newLines[index].credit_amount = "";
      } else if (field === "credit_amount" && value && parseFloat(value) > 0) {
        newLines[index].debit_amount = "";
      }

      return { ...prev, lines: newLines };
    });
  };

  // Add new line
  const addLine = () => {
    setFormData((prev) => ({
      ...prev,
      lines: [...prev.lines, emptyLine(prev.lines.length + 1)],
    }));
  };

  // Remove line
  const removeLine = (index: number) => {
    if (formData.lines.length <= 2) {
      toast.error("At least 2 lines are required");
      return;
    }

    setFormData((prev) => {
      const newLines = prev.lines.filter((_, i) => i !== index);
      // Renumber lines
      return {
        ...prev,
        lines: newLines.map((line, i) => ({ ...line, line_number: i + 1 })),
      };
    });
  };

  // Navigation
  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/accounting/journal-entries");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/accounting/journal-entries");
  };

  // Validation
  const validateForm = (): boolean => {
    if (!formData.reference_no.trim()) {
      toast.error("Reference number is required");
      return false;
    }

    if (!formData.entry_date) {
      toast.error("Entry date is required");
      return false;
    }

    // Filter lines with data
    const filledLines = formData.lines.filter(
      (line) =>
        line.account_code ||
        parseFloat(line.debit_amount) > 0 ||
        parseFloat(line.credit_amount) > 0
    );

    if (filledLines.length < 2) {
      toast.error("At least 2 line items are required");
      return false;
    }

    // Validate each filled line has account code
    for (const line of filledLines) {
      if (!line.account_code) {
        toast.error("Each line item must have an account code");
        return false;
      }
      if (
        (parseFloat(line.debit_amount) || 0) === 0 &&
        (parseFloat(line.credit_amount) || 0) === 0
      ) {
        toast.error("Each line item must have either a debit or credit amount");
        return false;
      }
    }

    // Validate totals match
    if (!isBalanced) {
      toast.error(
        `Total debits (${totals.totalDebit.toFixed(
          2
        )}) must equal total credits (${totals.totalCredit.toFixed(2)})`
      );
      return false;
    }

    return true;
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      // Filter and prepare lines
      const lines: JournalEntryLineInput[] = formData.lines
        .filter(
          (line) =>
            line.account_code &&
            (parseFloat(line.debit_amount) > 0 ||
              parseFloat(line.credit_amount) > 0)
        )
        .map((line, index) => ({
          line_number: index + 1,
          account_code: line.account_code,
          debit_amount: parseFloat(line.debit_amount) || 0,
          credit_amount: parseFloat(line.credit_amount) || 0,
          reference: line.reference || undefined,
          particulars: line.particulars || undefined,
        }));

      const payload = {
        reference_no: formData.reference_no.trim(),
        entry_type: formData.entry_type,
        entry_date: formData.entry_date,
        description: formData.description.trim() || undefined,
        lines,
      };

      if (isEditMode) {
        await api.put(`/api/journal-entries/${id}`, payload);
        toast.success("Journal entry updated successfully");
      } else {
        await api.post("/api/journal-entries", payload);
        toast.success("Journal entry created successfully");
      }

      navigate("/accounting/journal-entries");
    } catch (err: unknown) {
      console.error("Error saving journal entry:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error(
        errorMessage ||
          `Failed to ${isEditMode ? "update" : "create"} journal entry`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Delete entry
  const handleConfirmDelete = async () => {
    if (!id) return;

    setIsSaving(true);
    try {
      await api.delete(`/api/journal-entries/${id}`);
      toast.success("Journal entry deleted successfully");
      setShowDeleteDialog(false);
      navigate("/accounting/journal-entries");
    } catch (err: unknown) {
      console.error("Error deleting journal entry:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error(errorMessage || "Failed to delete journal entry");
    } finally {
      setIsSaving(false);
    }
  };

  // Build options
  const entryTypeOptions: SelectOption[] = entryTypes.map((t) => ({
    id: t.code,
    name: `${t.code} - ${t.name}`,
  }));

  const accountCodeOptions: SelectOption[] = accountCodes.map((a) => ({
    id: a.code,
    name: `${a.code} - ${a.description}`,
  }));

  // Format amount for display
  const formatAmount = (value: string): string => {
    const num = parseFloat(value);
    return isNaN(num) || num === 0 ? "" : num.toFixed(2);
  };

  // Render
  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <BackButton onClick={() => navigate("/accounting/journal-entries")} />
        <div className="p-4 border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton onClick={handleBackClick} />
              <div className="h-8 w-px bg-default-300 dark:bg-gray-600"></div>
              <div className="p-2 bg-sky-50 dark:bg-sky-900/30 rounded-lg">
                <IconFileText size={24} className="text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                  {isEditMode ? "Edit Journal Entry" : "New Journal Entry"}
                </h1>
                <p className="mt-0.5 text-sm text-default-500 dark:text-gray-400">
                  {isEditMode
                    ? `Editing ${formData.reference_no}`
                    : "Create a new journal entry"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isFormChanged && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  Unsaved changes
                </span>
              )}
              {isEditMode && (
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    entryStatus === "cancelled"
                      ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                      : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                  }`}
                >
                  {entryStatus === "cancelled" ? "Cancelled" : "Active"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="relative">
          {isSaving && (
            <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-b-lg">
              <div className="flex items-center space-x-3 bg-white dark:bg-gray-800 px-6 py-4 rounded-lg shadow-lg border border-default-200 dark:border-gray-700">
                <LoadingSpinner hideText />
                <span className="text-sm font-medium text-default-700 dark:text-gray-300">
                  Saving journal entry...
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Entry Header - Horizontal Row */}
            <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700 bg-default-50/50 dark:bg-gray-900/30">
              <div className="grid grid-cols-4 gap-4">
                {/* Reference Number */}
                <div>
                  <label className="block text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Reference No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.reference_no}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        reference_no: e.target.value,
                      }))
                    }
                    placeholder="e.g., PBE001/06"
                    disabled={isSaving}
                    className="w-full px-3 py-2 text-sm border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:cursor-not-allowed font-mono"
                  />
                </div>

                {/* Entry Type */}
                <div>
                  <label className="block text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <FormListbox
                    name="entry_type"
                    value={formData.entry_type}
                    onChange={handleEntryTypeChange}
                    options={entryTypeOptions}
                    disabled={isSaving}
                  />
                </div>

                {/* Entry Date */}
                <div>
                  <label className="block text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.entry_date}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        entry_date: e.target.value,
                      }))
                    }
                    disabled={isSaving}
                    className="w-full px-3 py-2 text-sm border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-default-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Optional description"
                    disabled={isSaving}
                    className="w-full px-3 py-2 text-sm border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Spreadsheet-Style Line Items Table */}
            <div className="p-6">
              <div className="overflow-visible rounded-lg border border-default-200 dark:border-gray-700">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-default-100 dark:bg-gray-900/50">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-12">
                        #
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-80">
                        Account
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-24">
                        Reference
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-32">
                        Debit ($)
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-default-600 dark:text-gray-400 uppercase tracking-wider w-32">
                        Credit ($)
                      </th>
                      <th className="px-3 py-2.5 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default-100 dark:divide-gray-800 bg-white dark:bg-gray-800">
                    {formData.lines.map((line, index) => (
                      <tr
                        key={index}
                        className="group hover:bg-default-50/50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        {/* Line Number */}
                        <td className="px-3 py-1 text-sm text-default-500 dark:text-gray-400 font-mono">
                          {String(line.line_number).padStart(2, "0")}
                        </td>

                        {/* Account Code */}
                        <td className="px-1 py-1">
                          <AccountCodeCell
                            value={line.account_code}
                            options={accountCodeOptions}
                            onChange={(value: string) =>
                              handleLineChange(index, "account_code", value)
                            }
                            disabled={isSaving}
                          />
                        </td>

                        {/* Reference */}
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={line.reference}
                            onChange={(e) =>
                              handleLineChange(index, "reference", e.target.value)
                            }
                            onFocus={() => setFocusedCell({ row: index, col: "reference" })}
                            onBlur={() => setFocusedCell(null)}
                            disabled={isSaving}
                            placeholder="Chq No"
                            className={`w-full px-2 py-1.5 text-sm bg-transparent border-0 rounded placeholder:text-gray-400 dark:placeholder:text-gray-500 text-default-900 dark:text-gray-100 disabled:cursor-not-allowed ${
                              focusedCell?.row === index && focusedCell?.col === "reference"
                                ? "ring-1 ring-sky-500 bg-white dark:bg-gray-700"
                                : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                            }`}
                          />
                        </td>

                        {/* Particulars */}
                        <td className="px-1 py-1">
                          <input
                            type="text"
                            value={line.particulars}
                            onChange={(e) =>
                              handleLineChange(index, "particulars", e.target.value)
                            }
                            onFocus={() => setFocusedCell({ row: index, col: "particulars" })}
                            onBlur={() => setFocusedCell(null)}
                            disabled={isSaving}
                            placeholder="Description"
                            className={`w-full px-2 py-1.5 text-sm bg-transparent border-0 rounded placeholder:text-gray-400 dark:placeholder:text-gray-500 text-default-900 dark:text-gray-100 disabled:cursor-not-allowed ${
                              focusedCell?.row === index && focusedCell?.col === "particulars"
                                ? "ring-1 ring-sky-500 bg-white dark:bg-gray-700"
                                : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                            }`}
                          />
                        </td>

                        {/* Debit Amount */}
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.debit_amount}
                            onChange={(e) =>
                              handleLineChange(index, "debit_amount", e.target.value)
                            }
                            onFocus={() => setFocusedCell({ row: index, col: "debit" })}
                            onBlur={(e) => {
                              setFocusedCell(null);
                              handleLineChange(index, "debit_amount", formatAmount(e.target.value));
                            }}
                            disabled={isSaving}
                            placeholder="0.00"
                            className={`w-full px-2 py-1.5 text-sm text-right bg-transparent border-0 rounded font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500 text-default-900 dark:text-gray-100 disabled:cursor-not-allowed ${
                              focusedCell?.row === index && focusedCell?.col === "debit"
                                ? "ring-1 ring-sky-500 bg-white dark:bg-gray-700"
                                : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                            }`}
                          />
                        </td>

                        {/* Credit Amount */}
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.credit_amount}
                            onChange={(e) =>
                              handleLineChange(index, "credit_amount", e.target.value)
                            }
                            onFocus={() => setFocusedCell({ row: index, col: "credit" })}
                            onBlur={(e) => {
                              setFocusedCell(null);
                              handleLineChange(index, "credit_amount", formatAmount(e.target.value));
                            }}
                            disabled={isSaving}
                            placeholder="0.00"
                            className={`w-full px-2 py-1.5 text-sm text-right bg-transparent border-0 rounded font-mono placeholder:text-gray-400 dark:placeholder:text-gray-500 text-default-900 dark:text-gray-100 disabled:cursor-not-allowed ${
                              focusedCell?.row === index && focusedCell?.col === "credit"
                                ? "ring-1 ring-sky-500 bg-white dark:bg-gray-700"
                                : "hover:bg-default-50 dark:hover:bg-gray-700/50"
                            }`}
                          />
                        </td>

                        {/* Delete Button */}
                        <td className="px-1 py-1 text-center">
                          {formData.lines.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeLine(index)}
                              disabled={isSaving}
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
                    <tr className="bg-default-100 dark:bg-gray-900/50">
                      <td colSpan={4} className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={addLine}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <IconPlus size={16} />
                          Add Line
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-sm font-semibold text-default-900 dark:text-gray-100 font-mono">
                          {totals.totalDebit.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-sm font-semibold text-default-900 dark:text-gray-100 font-mono">
                          {totals.totalCredit.toFixed(2)}
                        </span>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Balance Indicator */}
              <div className="mt-4 flex items-center justify-end gap-4">
                <div
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                    isBalanced
                      ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                  }`}
                >
                  {isBalanced ? (
                    <>
                      <IconCheck size={18} />
                      <span>Balanced</span>
                    </>
                  ) : (
                    <>
                      <span>Out of Balance: </span>
                      <span className="font-mono font-bold">{difference.toFixed(2)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="px-6 py-4 flex justify-between items-center border-t border-default-200 dark:border-gray-700 bg-default-50/50 dark:bg-gray-900/30">
              <div>
                {isEditMode && entryStatus !== "cancelled" && (
                  <Button
                    type="button"
                    color="rose"
                    variant="outline"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isSaving}
                    icon={IconTrash}
                    iconPosition="left"
                  >
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="filled"
                  color="sky"
                  icon={IconDeviceFloppy}
                  iconPosition="left"
                  disabled={isSaving || !isFormChanged || !isBalanced}
                >
                  {isEditMode ? "Update" : "Save"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Journal Entry"
        message={`Are you sure you want to delete entry "${formData.reference_no}"? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />

      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="You have unsaved changes. Are you sure you want to go back? All changes will be lost."
        confirmButtonText="Discard"
      />
    </div>
  );
};

export default JournalEntryPage;
