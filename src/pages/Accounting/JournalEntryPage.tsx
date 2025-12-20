// src/pages/Accounting/JournalEntryPage.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../routes/utils/api";
import {
  AccountCode,
  JournalEntry,
  JournalEntryType,
  JournalEntryTypeInfo,
  JournalEntryLineInput,
} from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import {
  FormInput,
  FormListbox,
  SelectOption,
} from "../../components/FormComponents";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import {
  IconPlus,
  IconTrash,
  IconDeviceFloppy,
  IconSend,
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

const AccountCodeCell: React.FC<AccountCodeCellProps> = ({
  value,
  options,
  onChange,
  disabled = false,
}: AccountCodeCellProps) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
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

  const selectedOption = options.find((opt: SelectOption) => opt.id === value);
  const displayValue = selectedOption?.name || "";

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
          className="w-full px-2 py-1.5 text-sm border border-default-300 rounded-l focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="px-2 border border-l-0 border-default-300 rounded-r bg-default-50 hover:bg-default-100 disabled:bg-gray-50 disabled:cursor-not-allowed"
        >
          <IconChevronDown size={16} className="text-default-500" />
        </button>
      </div>
      {isOpen && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 min-w-[400px] max-h-60 overflow-auto bg-white border border-default-200 rounded-lg shadow-lg"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-default-500">
              No accounts found
            </div>
          ) : (
            filteredOptions.map((opt: SelectOption) => (
              <div
                key={opt.id}
                onClick={() => handleSelect(opt.id.toString())}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-sky-50 flex items-center justify-between gap-2 ${
                  opt.id === value ? "bg-sky-100 text-sky-900" : ""
                }`}
              >
                <span>{opt.name}</span>
                {opt.id === value && (
                  <IconCheck size={16} className="text-sky-600 flex-shrink-0" />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const JournalEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // Form state
  const [formData, setFormData] = useState<JournalEntryFormData>({
    reference_no: "",
    entry_type: "J",
    entry_date: new Date().toISOString().split("T")[0],
    description: "",
    lines: [emptyLine(1)],
  });

  // Entry status for edit mode
  const [entryStatus, setEntryStatus] = useState<string>("draft");

  // Reference data
  const [entryTypes, setEntryTypes] = useState<JournalEntryTypeInfo[]>([]);
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);

  // Initial form data for change detection
  const initialFormDataRef = useRef<JournalEntryFormData | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

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

  // Get selected account description
  const selectedAccountDescription = useMemo(() => {
    if (selectedLineIndex === null) return null;
    const line = formData.lines[selectedLineIndex];
    if (!line?.account_code) return null;
    const account = accountCodes.find((a) => a.code === line.account_code);
    return account ? `${account.code} - ${account.description}` : null;
  }, [selectedLineIndex, formData.lines, accountCodes]);

  // Fetch reference data
  const fetchReferenceData = useCallback(async () => {
    try {
      const [typesRes, accountsRes] = await Promise.all([
        api.get("/api/journal-entries/types"),
        api.get("/api/account-codes?flat=true&is_active=true"),
      ]);

      setEntryTypes(typesRes as JournalEntryTypeInfo[]);
      setAccountCodes(accountsRes as AccountCode[]);
    } catch (err: unknown) {
      console.error("Error fetching reference data:", err);
      toast.error("Failed to load reference data");
    }
  }, []);

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

      // Ensure at least 1 line
      if (lines.length === 0) {
        lines.push(emptyLine(1));
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
      setLoading(true);
      await fetchReferenceData();

      if (isEditMode) {
        await fetchEntryData();
      } else {
        initialFormDataRef.current = JSON.parse(JSON.stringify(formData));
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, fetchReferenceData, fetchEntryData]);

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
    if (!isEditMode) {
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

    if (selectedLineIndex === index) {
      setSelectedLineIndex(null);
    } else if (selectedLineIndex !== null && selectedLineIndex > index) {
      setSelectedLineIndex(selectedLineIndex - 1);
    }
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
    if (Math.abs(totals.totalDebit - totals.totalCredit) > 0.01) {
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

  // Post entry
  const handlePost = async () => {
    if (!validateForm()) return;

    setIsSaving(true);

    try {
      // Save first if there are changes
      if (isFormChanged) {
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
        } else {
          const response = await api.post("/api/journal-entries", payload);
          const data = response as { entry: { id: number } };
          // Update id for posting
          await api.post(`/api/journal-entries/${data.entry.id}/post`);
          toast.success("Journal entry created and posted successfully");
          navigate("/accounting/journal-entries");
          return;
        }
      }

      await api.post(`/api/journal-entries/${id}/post`);
      toast.success("Journal entry posted successfully");
      navigate("/accounting/journal-entries");
    } catch (err: unknown) {
      console.error("Error posting journal entry:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error(errorMessage || "Failed to post journal entry");
    } finally {
      setIsSaving(false);
      setShowPostDialog(false);
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
      <div className="container mx-auto px-4 py-6">
        <BackButton onClick={() => navigate("/accounting/journal-entries")} />
        <div className="mt-4 p-4 border border-red-300 bg-red-50 text-red-700 rounded">
          Error: {error}
        </div>
      </div>
    );
  }

  const isReadOnly = entryStatus === "posted" || entryStatus === "cancelled";

  return (
    <div className="container mx-auto px-4 pb-4">
      <BackButton onClick={handleBackClick} className="mt-3 mb-2" />

      <div className="bg-white rounded-lg shadow-sm border border-default-200">
        {/* Header */}
        <div className="p-6 border-b border-default-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <IconFileText size={24} className="text-sky-500" />
              <div>
                <h1 className="text-xl font-semibold text-default-900">
                  {isEditMode ? "Edit Journal Entry" : "New Journal Entry"}
                </h1>
                <p className="mt-1 text-sm text-default-500">
                  {isEditMode
                    ? `Editing entry ${formData.reference_no}`
                    : "Create a new journal entry"}
                </p>
              </div>
            </div>
            {isEditMode && (
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  entryStatus === "posted"
                    ? "bg-green-100 text-green-800"
                    : entryStatus === "cancelled"
                    ? "bg-red-100 text-red-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {entryStatus.charAt(0).toUpperCase() + entryStatus.slice(1)}
              </span>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="relative">
          {isSaving && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-b-lg">
              <div className="flex items-center space-x-3 bg-white px-6 py-4 rounded-lg shadow-lg border border-default-200">
                <LoadingSpinner hideText />
                <span className="text-sm font-medium text-default-700">
                  Saving journal entry...
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Entry Header */}
            <div className="p-6 space-y-4 border-b border-default-200">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                {/* Reference Number */}
                <FormInput
                  name="reference_no"
                  label="Reference No"
                  value={formData.reference_no}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      reference_no: e.target.value,
                    }))
                  }
                  placeholder="e.g., PBE001/06"
                  required
                  disabled={isSaving || isReadOnly}
                />

                {/* Entry Type */}
                <FormListbox
                  name="entry_type"
                  label="Type"
                  value={formData.entry_type}
                  onChange={handleEntryTypeChange}
                  options={entryTypeOptions}
                  disabled={isSaving || isReadOnly}
                  required
                />

                {/* Entry Date */}
                <FormInput
                  name="entry_date"
                  label="Date"
                  type="date"
                  value={formData.entry_date}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      entry_date: e.target.value,
                    }))
                  }
                  required
                  disabled={isSaving || isReadOnly}
                />

                {/* Description */}
                <FormInput
                  name="description"
                  label="Description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Optional description"
                  disabled={isSaving || isReadOnly}
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="p-6">
              <div className="overflow-visible">
                <table className="min-w-full divide-y divide-default-200 border border-default-200 rounded-lg">
                  <thead className="bg-default-100">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 w-12">
                        #
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 w-96">
                        Account Code
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600 w-28">
                        Reference
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-default-600">
                        Description
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 w-32">
                        Debit ($)
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-default-600 w-32">
                        Credit ($)
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-default-600 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-default-200">
                    {formData.lines.map((line, index) => (
                      <tr
                        key={index}
                        className={`${
                          selectedLineIndex === index
                            ? "bg-sky-50"
                            : "hover:bg-default-50"
                        }`}
                        onClick={() => setSelectedLineIndex(index)}
                      >
                        <td className="px-3 py-2 text-sm text-default-600">
                          {String(line.line_number).padStart(2, "0")}
                        </td>
                        <td className="px-3 py-2">
                          <AccountCodeCell
                            value={line.account_code}
                            options={accountCodeOptions}
                            onChange={(value: string) =>
                              handleLineChange(index, "account_code", value)
                            }
                            disabled={isReadOnly}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.reference}
                            onChange={(e) =>
                              handleLineChange(
                                index,
                                "reference",
                                e.target.value
                              )
                            }
                            disabled={isReadOnly}
                            placeholder="Chq No"
                            className="w-full px-2 py-1.5 text-sm border border-default-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.particulars}
                            onChange={(e) =>
                              handleLineChange(
                                index,
                                "particulars",
                                e.target.value
                              )
                            }
                            disabled={isReadOnly}
                            placeholder="Description"
                            className="w-full px-2 py-1.5 text-sm border border-default-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.debit_amount}
                            onChange={(e) =>
                              handleLineChange(
                                index,
                                "debit_amount",
                                e.target.value
                              )
                            }
                            onBlur={(e) =>
                              handleLineChange(
                                index,
                                "debit_amount",
                                formatAmount(e.target.value)
                              )
                            }
                            disabled={isReadOnly}
                            placeholder="0.00"
                            className="w-full px-2 py-1.5 text-sm text-right border border-default-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.credit_amount}
                            onChange={(e) =>
                              handleLineChange(
                                index,
                                "credit_amount",
                                e.target.value
                              )
                            }
                            onBlur={(e) =>
                              handleLineChange(
                                index,
                                "credit_amount",
                                formatAmount(e.target.value)
                              )
                            }
                            disabled={isReadOnly}
                            placeholder="0.00"
                            className="w-full px-2 py-1.5 text-sm text-right border border-default-300 rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!isReadOnly && formData.lines.length > 2 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeLine(index);
                              }}
                              className="text-rose-500 hover:text-rose-700"
                              title="Remove line"
                            >
                              <IconTrash size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-default-50">
                    <tr>
                      <td colSpan={4} className="px-3 py-3">
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={addLine}
                            className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-800"
                          >
                            <IconPlus size={16} />
                            Add Line
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-default-900">
                        {totals.totalDebit.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-default-900">
                        {totals.totalCredit.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Balance Check */}
              {Math.abs(totals.totalDebit - totals.totalCredit) > 0.01 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <strong>Out of Balance:</strong> Debits (
                  {totals.totalDebit.toFixed(2)}) do not equal Credits (
                  {totals.totalCredit.toFixed(2)}). Difference:{" "}
                  {Math.abs(totals.totalDebit - totals.totalCredit).toFixed(2)}
                </div>
              )}

              {/* Account Description */}
              {selectedAccountDescription && (
                <div className="mt-4 p-3 bg-sky-50 border border-sky-200 rounded-lg text-sky-700 text-sm">
                  <strong>Selected Account:</strong>{" "}
                  {selectedAccountDescription}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="p-6 flex justify-between items-center border-t border-default-200">
              <div>
                {isEditMode && entryStatus === "draft" && (
                  <Button
                    type="button"
                    color="rose"
                    variant="outline"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isSaving}
                  >
                    Delete Entry
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!isReadOnly && (
                  <>
                    <Button
                      type="submit"
                      variant="outline"
                      color="sky"
                      icon={IconDeviceFloppy}
                      iconPosition="left"
                      disabled={isSaving || !isFormChanged}
                    >
                      Save Draft
                    </Button>
                    <Button
                      type="button"
                      variant="filled"
                      color="green"
                      icon={IconSend}
                      iconPosition="left"
                      onClick={() => setShowPostDialog(true)}
                      disabled={
                        isSaving ||
                        Math.abs(totals.totalDebit - totals.totalCredit) > 0.01
                      }
                    >
                      Save & Post
                    </Button>
                  </>
                )}
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
        isOpen={showPostDialog}
        onClose={() => setShowPostDialog(false)}
        onConfirm={handlePost}
        title="Post Journal Entry"
        message={`Are you sure you want to post entry "${formData.reference_no}"? Posted entries cannot be edited.`}
        confirmButtonText="Post"
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
