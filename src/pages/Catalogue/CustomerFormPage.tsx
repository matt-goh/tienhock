// src/pages/Catalogue/CustomerFormPage.tsx
// Full editable customer form - one page, one save. Reached from the read-only
// CustomerDetailsPage via /catalogue/customer/:id/edit.
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Customer, CustomProduct } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import { useSmartBack } from "../../hooks/useSmartBack";
import {
  FormInput,
  FormInputWithStatus,
  FormListbox,
  SelectOption,
} from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { validateCustomerIdentity } from "../../routes/catalogue/customerValidation";
import { refreshAccountCodesCache } from "../../utils/accounting/useAccountingCache";
import {
  EnhancedCustomerList,
  refreshCustomersCache,
  useCustomersCache,
} from "../../utils/catalogue/useCustomerCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import {
  closenessOptions,
  getIdNumberPlaceholder,
  idTypeOptions,
  stateOptions,
} from "../../utils/catalogue/customerOptions";
import CustomerCreditSection from "../../components/Catalogue/CustomerCreditSection";
import CustomerProductsTab from "../../components/Catalogue/CustomerProductsTab";
import { IconBuildingSkyscraper, IconBuildingStore } from "@tabler/icons-react";

// Minimal separator between the form's three sections.
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="border-t border-default-200 dark:border-gray-700 pt-6 mt-6 first:border-t-0 first:pt-0 first:mt-0">
    <h3 className="text-base font-medium text-default-800 dark:text-gray-100 mb-4">
      {title}
    </h3>
    {children}
  </div>
);

const CustomerFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("catalogue");
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const goBack = useSmartBack(
    isEditMode ? `/catalogue/customer/${id}` : "/catalogue/customer"
  );

  // --- State ---
  const [formData, setFormData] = useState<EnhancedCustomerList>({
    // Initial empty/default state
    id: "",
    name: "",
    closeness: "Local",
    salesman: "",
    tin_number: "",
    phone_number: "",
    email: "",
    address: "",
    city: "KOTA KINABALU",
    state: "12",
    id_number: "",
    id_type: "",
    credit_limit: 3000,
    credit_used: 0,
  });
  // State to hold custom products fetched or managed
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  // Track original product IDs for calculating deletions on save
  const [originalProductIds, setOriginalProductIds] = useState<Set<string>>(
    new Set()
  );
  const initialFormDataRef = useRef<Customer | null>(null); // Store initial fetched data
  const initialCustomProductsRef = useRef<CustomProduct[] | null>(null); // Store initial products

  // UI state
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(isEditMode); // Only true initially if editing
  const [error, setError] = useState<string | null>(null);
  const { salesmen: salesmenData } = useSalesmanCache();
  const [branchInfo, setBranchInfo] = useState<{
    isInBranchGroup: boolean;
    isMainBranch: boolean;
    groupName: string;
    groupId: number;
    branches: { id: string; name: string; isMain: boolean }[];
  } | null>(null);
  const { customers, isLoading } = useCustomersCache();
  const [validationWarnings, setValidationWarnings] = useState<{
    phoneNumber?: boolean;
  }>({});
  const [salesmen, setSalesmen] = useState<SelectOption[]>([]);

  // --- Form Change Detection ---
  useEffect(() => {
    const customerDataChanged = !!(
      initialFormDataRef.current &&
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current)
    );

    const productsChanged = !!(
      initialCustomProductsRef.current &&
      JSON.stringify(customProducts) !==
        JSON.stringify(initialCustomProductsRef.current)
    );

    // Form is changed if either customer data or products list changed from initial state
    setIsFormChanged(customerDataChanged || productsChanged);
  }, [formData, customProducts]);

  // --- Initial Data Fetching ---
  const fetchFromCache = useCallback(() => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      // Find customer in the enhanced cache
      const cachedCustomer = customers.find((customer) => customer.id === id);

      if (!cachedCustomer) {
        throw new Error(
          t(
            "Customer with ID {{id}} not found in cache, please refresh the customers at Customer page.",
            { id }
          )
        );
      }

      // Create the form data object
      const fetchedFormData = {
        ...cachedCustomer,
        // Ensure values have proper defaults
        closeness: cachedCustomer.closeness || "Local",
        salesman: cachedCustomer.salesman || "",
        tin_number: cachedCustomer.tin_number || "",
        phone_number: cachedCustomer.phone_number || "",
        email: cachedCustomer.email || "",
        address: cachedCustomer.address || "",
        city: cachedCustomer.city || "KOTA KINABALU",
        state: cachedCustomer.state || "12",
        id_number: cachedCustomer.id_number || "",
        id_type: cachedCustomer.id_type || "",
        credit_limit: cachedCustomer.credit_limit ?? 3000,
        credit_used: cachedCustomer.credit_used ?? 0,
      };

      // Set customer form data
      setFormData(fetchedFormData);

      // IMPORTANT: Set initial ref to the fetched data, not current formData
      initialFormDataRef.current = { ...fetchedFormData };

      // Set custom products
      if (
        cachedCustomer.customProducts &&
        cachedCustomer.customProducts.length > 0
      ) {
        // Create a deep copy of customProducts for accurate comparison
        const fetchedProducts = JSON.parse(
          JSON.stringify(cachedCustomer.customProducts)
        );
        setCustomProducts(fetchedProducts);
        initialCustomProductsRef.current = fetchedProducts;
        setOriginalProductIds(
          new Set(cachedCustomer.customProducts.map((p) => p.product_id))
        );
      } else {
        setCustomProducts([]);
        initialCustomProductsRef.current = [];
        setOriginalProductIds(new Set());
      }

      // Set branch info (rest of the code remains the same)
      if (
        cachedCustomer.branchInfo &&
        cachedCustomer.branchInfo.isInBranchGroup !== undefined &&
        cachedCustomer.branchInfo.isMainBranch !== undefined &&
        cachedCustomer.branchInfo.groupName !== undefined &&
        cachedCustomer.branchInfo.groupId !== undefined &&
        cachedCustomer.branchInfo.branches !== undefined
      ) {
        setBranchInfo({
          isInBranchGroup: cachedCustomer.branchInfo.isInBranchGroup,
          isMainBranch: cachedCustomer.branchInfo.isMainBranch,
          groupName: cachedCustomer.branchInfo.groupName,
          groupId: cachedCustomer.branchInfo.groupId,
          branches: cachedCustomer.branchInfo.branches,
        });
      } else {
        setBranchInfo(null);
      }
    } catch (err: any) {
      setError(
        t(
          "Failed to find customer details: {{message}}. Please try again later.",
          { message: err?.message || t("Unknown error") }
        )
      );
      console.error("Error finding customer details:", err);
      initialFormDataRef.current = null;
      initialCustomProductsRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [id, customers, t]);

  useEffect(() => {
    if (isEditMode) {
      // Only proceed with fetchFromCache when the cache is loaded
      if (!isLoading) {
        fetchFromCache();
      }
    } else {
      // For new customer, ensure initial refs are set to the current empty form state
      // Use deep copies to avoid reference issues
      initialFormDataRef.current = JSON.parse(JSON.stringify(formData));
      initialCustomProductsRef.current = JSON.parse(
        JSON.stringify(customProducts)
      );
      setLoading(false);
    }
  }, [isEditMode, fetchFromCache, isLoading]);

  // --- Populate Salesmen Options ---
  useEffect(() => {
    if (salesmenData.length > 0) {
      const salesmenOptions = salesmenData.map((employee) => ({
        id: employee.id,
        name: employee.name || employee.id,
      }));
      setSalesmen(salesmenOptions);
    }
  }, [salesmenData]);

  // --- Event Handlers ---
  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      goBack();
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    goBack();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleListboxChange = (name: keyof Customer, value: string) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  // Handler for CustomerProductsTab to update state
  const handleProductsChange = useCallback(
    (updatedProducts: CustomProduct[]) => {
      setCustomProducts(updatedProducts);
    },
    []
  );

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!id) return;
    setIsSaving(true); // Show saving indicator during delete
    try {
      await api.delete(`/api/customers/${id}`);
      await Promise.all([refreshCustomersCache(), refreshAccountCodesCache()]);
      setIsDeleteDialogOpen(false);
      toast.success(t("Customer deleted successfully"));
      navigate("/catalogue/customer");
    } catch (err: any) {
      console.error("Error deleting customer:", err);
      toast.error(
        t("Failed to delete customer: {{message}}.", {
          message: err?.response?.data?.message || err.message,
        })
      );
    } finally {
      setIsSaving(false);
    }
  };

  // --- Form Validation and Submission ---
  const validateForm = (): boolean => {
    if (!formData.id || !formData.name) {
      toast.error(t("Customer ID and Name are required fields."));
      return false;
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error(
        t("Please enter a valid email address or leave it empty.")
      );
      return false;
    }

    // Validate ID/TIN fields if any are provided
    const hasIdType = formData.id_type && formData.id_type !== "Select...";
    const hasIdNumber = Boolean(formData.id_number);
    const hasTinNumber = Boolean(formData.tin_number);

    if (hasIdType || hasIdNumber || hasTinNumber) {
      if (!hasIdType) {
        toast.error(
          t("ID Type is required when providing identification details.")
        );
        return false;
      }
      if (!hasIdNumber) {
        toast.error(
          t("ID Number is required when providing identification details.")
        );
        return false;
      }
      if (!hasTinNumber) {
        toast.error(
          t("TIN Number is required when providing identification details.")
        );
        return false;
      }
      // Reset warnings
      setValidationWarnings({});

      if (!formData.phone_number || formData.phone_number.trim() === "") {
        setValidationWarnings({ phoneNumber: true });
      }
    }

    // Validate custom product entries (ensure product is selected and price is valid)
    for (const product of customProducts) {
      if (!product.product_id) {
        toast.error(
          t("Please select a product for all custom pricing rows.")
        );
        return false;
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
        return false;
      }
    }

    return true;
  };

  const isValidationDataUnchanged = (
    currentData: Customer,
    initialData: Customer | null // Can be null initially
  ): boolean => {
    if (!initialData) return false; // If no initial data, it's considered changed
    return (
      currentData.id_type === initialData.id_type &&
      currentData.id_number === initialData.id_number &&
      currentData.tin_number === initialData.tin_number &&
      // Make sure all values exist and are not the placeholder
      Boolean(currentData.id_type) &&
      currentData.id_type !== "Select..." &&
      Boolean(currentData.id_number) &&
      Boolean(currentData.tin_number)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      // --- Identity Validation (Only if changed or new) ---
      const hasValidationFields =
        (formData.id_type && formData.id_type !== "Select...") ||
        formData.id_number ||
        formData.tin_number;

      if (hasValidationFields) {
        const isDataVerified = isValidationDataUnchanged(
          formData,
          initialFormDataRef.current
        );
        if (!isDataVerified) {
          // Only validate if fields are present AND data changed OR it's a new customer
          const validationResult = await validateCustomerIdentity(formData);
          if (!validationResult.isValid) {
            // Toast is shown within validateCustomerIdentity
            setIsSaving(false);
            return;
          }
        }
      }

      // --- Prepare Data for API ---
      const customerPayload: Partial<Customer> & { newId?: string } = {
        ...formData,
        // Ensure numeric fields are numbers, default if necessary
        credit_limit: Number(formData.credit_limit ?? 3000),
        credit_used: Number(formData.credit_used ?? 0),
        // Convert empty strings to undefined for DB (not null)
        tin_number: formData.tin_number || undefined,
        phone_number: formData.phone_number || undefined,
        email: formData.email || undefined,
        address: formData.address || undefined,
        id_number: formData.id_number || undefined,
        id_type: formData.id_type || undefined,
      };

      let customerApiUrl = "/api/customers";
      let customerApiMethod: "post" | "put" = "post";
      let successMessage = t("Customer created successfully!");

      if (isEditMode && id) {
        customerApiUrl = `/api/customers/${id}`;
        customerApiMethod = "put";
        successMessage = t("Customer updated successfully!");
        const isChangingId = formData.id !== id;
        if (isChangingId) {
          customerPayload.newId = formData.id; // Signal ID change to backend
        }
      }

      // --- API Calls ---
      // 1. Save Customer Data
      const customerResponse = await api[customerApiMethod](
        customerApiUrl,
        customerPayload
      );

      // Determine the customer ID to use for product batch update
      // If creating, use the ID from the response (if available) or formData.id
      // If updating (even with ID change), use formData.id (the potentially new ID)
      const customerIdForProducts = isEditMode
        ? formData.id
        : customerResponse?.customer?.id || formData.id;

      // 2. Save Custom Products (if any changes or new customer)
      // Calculate deleted products ONLY if we are editing
      let deletedProductIds: string[] = [];
      if (isEditMode) {
        const currentProductIds = new Set(
          customProducts.map((p) => p.product_id)
        );
        deletedProductIds = Array.from(originalProductIds).filter(
          (pid) => !currentProductIds.has(pid)
        );
      }

      // Only call batch update if there are products to update/add or delete
      if (customProducts.length > 0 || deletedProductIds.length > 0) {
        try {
          const productPayload = {
            customerId: customerIdForProducts,
            products: customProducts.map((cp) => ({
              productId: cp.product_id,
              customPrice: Number(cp.custom_price ?? 0), // Ensure number
              isAvailable: cp.is_available ?? true, // Ensure boolean
            })),
            deletedProductIds: deletedProductIds,
          };
          await api.post("/api/customer-products/batch", productPayload);
        } catch (productError: any) {
          console.error("Failed to save custom products:", productError);
          // Customer was saved, but products failed. Inform the user.
          toast.error(
            t(
              "Customer saved, but failed to update custom products: {{message}}. Please check the custom products settings.",
              {
                message:
                  productError?.response?.data?.message ||
                  productError.message,
              }
            )
          );
        }
      }

      // --- Post-Save Actions ---
      await Promise.all([refreshCustomersCache(), refreshAccountCodesCache()]);
      toast.success(successMessage);
      // Show the saved customer. `replace` drops this form from history, so
      // Back returns to wherever the user started.
      navigate(`/catalogue/customer/${customerIdForProducts}`, {
        replace: true,
      });
    } catch (error: any) {
      console.error(
        `Error ${isEditMode ? "updating" : "creating"} customer:`,
        error
      );
      const errorMessage: string =
        error?.data?.code === "JP_DEBTOR_OPENING_ID_CONFLICT"
          ? t(
              "Customer ID change is blocked because Jelly Polly debtor openings already exist under the new ID"
            )
          : error?.data?.message ||
            error?.response?.data?.message ||
            error.message;
      toast.error(
        t(
          isEditMode
            ? "Failed to update customer: {{message}}"
            : "Failed to create customer: {{message}}",
          { message: errorMessage }
        )
      );
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render Helpers ---
  const renderInput = (
    name: keyof Customer,
    label: string,
    type: string = "text",
    placeholder?: string,
    required: boolean = false // Add required prop if needed for visual cues
  ) => {
    const value = formData[name] ?? ""; // Use empty string for null/undefined

    const showStatus = name === "id_number" || name === "tin_number";
    const isVerified =
      isEditMode &&
      isValidationDataUnchanged(formData, initialFormDataRef.current);

    return showStatus ? (
      <FormInputWithStatus
        name={name}
        label={label}
        value={value.toString()} // Ensure string value
        onChange={handleInputChange}
        type={type}
        placeholder={placeholder}
        required={required}
        showStatus={true}
        isVerified={isVerified}
        disabled={isSaving} // Disable when saving
      />
    ) : (
      <FormInput
        name={name}
        label={label}
        value={value.toString()} // Ensure string value
        onChange={handleInputChange}
        type={type}
        placeholder={placeholder}
        required={required}
        disabled={name === "id" ? true : isSaving} // Disable when saving
      />
    );
  };

  const renderPhoneInput = () => {
    const hasWarning = validationWarnings.phoneNumber;

    return (
      <div className="space-y-2">
        {/* Custom Label with Warning Indicator */}
        <div className="flex items-center space-x-2">
          <label
            htmlFor="phone_number"
            className="block text-sm font-medium text-default-700 dark:text-gray-200"
          >
            {t("Phone Number")}
          </label>
          {hasWarning && (
            <span className="text-amber-500 text-xs flex items-center">
              <svg
                className="h-4 w-4 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {t("Recommended for e-Invoice")}
            </span>
          )}
        </div>

        {/* Custom Input Field - Replicating FormInput styling */}
        <input
          id="phone_number"
          name="phone_number"
          type="tel"
          value={formData.phone_number || ""}
          onChange={handleInputChange}
          disabled={isSaving}
          maxLength={20}
          placeholder={t("e.g., +60123456789")}
          className={`
          block w-full rounded-md border-0 py-1.5 px-3 text-default-900 dark:text-gray-100
          bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset
          placeholder:text-default-400 dark:placeholder:text-gray-500
          focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6
          disabled:cursor-not-allowed disabled:bg-default-50 dark:disabled:bg-gray-800 disabled:text-default-500 dark:disabled:text-gray-400
          ${
            hasWarning
              ? "ring-amber-300 dark:ring-amber-600 focus:ring-amber-500 dark:focus:ring-amber-400"
              : "ring-default-300 dark:ring-gray-600 focus:ring-blue-600 dark:focus:ring-blue-500"
          }
          ${isSaving ? "opacity-50" : ""}
        `.trim()}
        />
      </div>
    );
  };

  const renderListbox = (
    name: keyof Customer,
    label: string,
    options: SelectOption[],
    required: boolean = false
  ) => {
    const value = formData[name]?.toString() || "";

    return (
      <FormListbox
        name={name}
        label={label}
        value={value}
        onChange={(selectedId) => handleListboxChange(name, selectedId)}
        options={options}
        required={required}
        disabled={isSaving} // Disable when saving
      />
    );
  };

  // --- Render ---
  if (loading && isEditMode) {
    // Only show full page spinner when fetching initial edit data
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <BackButton fallbackPath="/catalogue/customer" />
        <div className="mt-4 p-4 border border-red-300 bg-red-50 text-red-700 rounded">
          {t("Error: {{message}}", { message: error })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-default-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-default-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <BackButton onClick={handleBackClick} />
            <div className="h-6 w-px bg-default-300 dark:bg-gray-600"></div>
            <div>
              <h1 className="text-xl font-semibold text-default-900 dark:text-gray-100">
                {t(isEditMode ? "Edit Customer" : "Add New Customer")}
              </h1>
              <p className="mt-1 text-sm text-default-500 dark:text-gray-400">
                {isEditMode
                  ? t("Editing details for {{name}}.", {
                      name: formData.name || t("customer", { ns: "common" }),
                    })
                  : t("Enter new customer information.")}
              </p>
            </div>
          </div>
        </div>

        {/* Wrap form in a div to handle potential saving overlay */}
        <div className="relative">
          {isSaving && (
            <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-b-lg">
              <div className="flex items-center space-x-3 bg-white dark:bg-gray-700 px-6 py-4 rounded-lg shadow-lg border border-default-200 dark:border-gray-600">
                <LoadingSpinner hideText />
                <span className="text-sm font-medium text-default-700 dark:text-gray-200">
                  {t("Saving customer...")}
                </span>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            noValidate // Prevent browser default validation
          >
            <div className="px-6 py-5">
              {/* === Customer === */}
              <Section title={t("Customer")}>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
                    {renderInput("id", t("Customer ID"), "text", "CUST001", true)}
                    {renderInput(
                      "name",
                      t("Customer Name"),
                      "text",
                      "Example Company Sdn Bhd",
                      true
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
                    {renderPhoneInput()}
                    {renderInput("email", t("Email"), "email")}
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      {renderInput("address", t("Address"), "text")}
                    </div>
                    {renderInput("city", t("City"), "text", "KOTA KINABALU")}
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-3">
                    {renderListbox("state", t("State"), stateOptions)}
                    {renderListbox("closeness", t("Closeness"), closenessOptions)}
                    {renderListbox("salesman", t("Salesman"), salesmen, true)}
                  </div>

                  {isEditMode && branchInfo && (
                    <div className="p-4 border border-indigo-100 dark:border-indigo-900/50 rounded-lg bg-indigo-50/30 dark:bg-indigo-900/20">
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

                      {branchInfo.branches.length > 1 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-indigo-500 dark:text-indigo-400 mb-1">
                            {t("Connected branches:")}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {branchInfo.branches
                              .filter((b) => b.id !== id) // Don't show current branch
                              .map((branch) => (
                                <span
                                  key={branch.id}
                                  className="inline-flex items-center text-xs bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full"
                                >
                                  {branch.isMain && (
                                    <IconBuildingSkyscraper
                                      size={12}
                                      className="mr-1"
                                    />
                                  )}
                                  {branch.name}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Section>

              {/* === e-Invoice === */}
              <Section title={t("e-Invoice")}>
                <p className="-mt-2 mb-4 text-sm text-default-500 dark:text-gray-400">
                  {t("Optional — all three fields are required together.")}
                </p>
                <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-3">
                  <FormListbox
                    name="id_type"
                    label={t("ID Type")}
                    value={formData.id_type || ""}
                    onChange={(selectedId) =>
                      handleListboxChange("id_type", selectedId)
                    }
                    options={idTypeOptions}
                    disabled={isSaving}
                  />
                  {renderInput(
                    "id_number",
                    t("ID Number"),
                    "text",
                    t(getIdNumberPlaceholder(formData.id_type))
                  )}
                  {renderInput(
                    "tin_number",
                    t("TIN Number"),
                    "text",
                    t("Company or Individual TIN")
                  )}
                </div>
              </Section>

              {/* === Credit & Pricing === */}
              <Section title={t("Credit & Pricing")}>
                <div className="space-y-8">
                  <CustomerCreditSection
                    creditLimit={formData.credit_limit ?? 0}
                    creditUsed={formData.credit_used ?? 0}
                    onCreditLimitChange={(value) =>
                      setFormData((prev) => ({ ...prev, credit_limit: value }))
                    }
                    onCreditUsedChange={(value) =>
                      setFormData((prev) => ({ ...prev, credit_used: value }))
                    }
                    disabled={isSaving}
                  />
                  <CustomerProductsTab
                    products={customProducts}
                    onProductsChange={handleProductsChange}
                    disabled={isSaving}
                  />
                </div>
              </Section>
            </div>

            {/* --- Form Actions --- */}
            <div className="px-6 py-4 flex justify-end items-center space-x-3 border-t border-default-200 dark:border-gray-700">
              {isEditMode && (
                <Button
                  type="button" // Important: Not submit
                  color="rose"
                  variant="outline"
                  onClick={handleDeleteClick}
                  disabled={isSaving}
                >
                  {t("Delete Customer")}
                </Button>
              )}
              <Button
                type="submit" // This triggers the form onSubmit
                variant="filled" // Use solid for primary action
                color="sky" // Use theme primary color
                disabled={isSaving || !isFormChanged}
                size="lg"
              >
                {isSaving ? t("Saving...") : t("Save Customer")}
              </Button>
            </div>
          </form>
        </div>
      </div>
      {/* --- Dialogs --- */}
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title={t("Delete Customer")}
        message={t(
          "Are you sure you want to permanently delete {{name}}? Associated custom pricing and Jelly Polly debtor openings will also be removed. This action cannot be undone.",
          { name: formData.name || t("this customer") }
        )}
        confirmButtonText={t("delete", { ns: "common" })}
      />
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title={t("Discard Changes")}
        message={t(
          "You might have unsaved changes. Are you sure you want to go back? All changes will be lost."
        )}
        confirmButtonText={t("Discard")}
      />
    </div>
  );
};

export default CustomerFormPage;
