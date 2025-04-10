// src/pages/Catalogue/CustomerFormPage.tsx
import React, { useState, useEffect, useRef, useCallback } from "react"; // Added useCallback
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Customer, CustomProduct } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import {
  FormInput,
  FormInputWithStatus,
  FormListbox,
  SelectOption, // Import SelectOption
} from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { validateCustomerIdentity } from "../../routes/catalogue/customerValidation";
import { refreshCustomersCache } from "../../utils/catalogue/useCustomerCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import CustomerProductsTab from "../../components/Catalogue/CustomerProductsTab";
import Tab from "../../components/Tab";

const CustomerFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // Add this helper function at the component level
  const getIdNumberPlaceholder = (idType: string) => {
    switch (idType) {
      case "BRN":
        return "Company Business Registration Number";
      case "NRIC":
        return "Customer IC Number";
      default:
        return "";
    }
  };

  // --- State ---
  const [formData, setFormData] = useState<Customer>({
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

  // Options
  const [salesmen, setSalesmen] = useState<SelectOption[]>([]);

  const closenessOptions: SelectOption[] = [
    { id: "Local", name: "Local" },
    { id: "Outstation", name: "Outstation" },
  ];

  const idTypeOptions: SelectOption[] = [
    { id: "", name: "Select..." }, // Use empty string for value
    { id: "BRN", name: "BRN" },
    { id: "NRIC", name: "NRIC" },
    { id: "PASSPORT", name: "PASSPORT" },
    { id: "ARMY", name: "ARMY" },
  ];

  const stateOptions: SelectOption[] = [
    { id: "01", name: "JOHOR" },
    { id: "02", name: "KEDAH" },
    { id: "03", name: "KELANTAN" },
    { id: "04", name: "MELAKA" },
    { id: "05", name: "NEGERI SEMBILAN" },
    { id: "06", name: "PAHANG" },
    { id: "07", name: "PULAU PINANG" },
    { id: "08", name: "PERAK" },
    { id: "09", name: "PERLIS" },
    { id: "10", name: "SELANGOR" },
    { id: "11", name: "TERENGGANU" },
    { id: "12", name: "SABAH" },
    { id: "13", name: "SARAWAK" },
    { id: "14", name: "WILAYAH PERSEKUTUAN KUALA LUMPUR" },
    { id: "15", name: "WILAYAH PERSEKUTUAN LABUAN" },
    { id: "16", name: "WILAYAH PERSEKUTUAN PUTRAJAYA" },
    { id: "17", name: "NOT APPLICABLE" },
  ];

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
  const fetchCustomerDetailsAndProducts = useCallback(async () => {
    if (!id) return; // Should not happen in edit mode, but safeguard

    setLoading(true);
    setError(null);
    try {
      // SINGLE API CALL to the new endpoint
      const response = await api.get(`/api/customers/${id}/details`);
      const { customer, customProducts: fetchedProducts } = response;

      // Ensure all necessary fields have defaults if null/undefined from API
      const formattedCustomer = {
        ...customer,
        closeness: customer.closeness || "Local",
        salesman: customer.salesman || "",
        tin_number: customer.tin_number || "",
        phone_number: customer.phone_number || "",
        email: customer.email || "",
        address: customer.address || "",
        city: customer.city || "KOTA KINABALU",
        state: customer.state || "12",
        id_number: customer.id_number || "",
        id_type: customer.id_type || "",
        credit_limit: customer.credit_limit ?? 3000,
        credit_used: customer.credit_used ?? 0,
      };

      setFormData(formattedCustomer);
      initialFormDataRef.current = { ...formattedCustomer }; // Store deep copy

      // Add UID to fetched products for stable keys in the list
      const productsWithUid = fetchedProducts.map((p: CustomProduct) => ({
        ...p,
        uid: crypto.randomUUID(),
      }));

      setCustomProducts(productsWithUid);
      initialCustomProductsRef.current = JSON.parse(
        JSON.stringify(productsWithUid)
      ); // Store deep copy
      setOriginalProductIds(
        new Set(productsWithUid.map((p: { product_id: any }) => p.product_id))
      );
    } catch (err: any) {
      setError(
        `Failed to fetch customer details: ${
          err?.response?.data?.message || err.message
        }. Please try again later.`
      );
      console.error("Error fetching customer details:", err);
      // Reset refs on error? Depends on desired behavior.
      initialFormDataRef.current = null;
      initialCustomProductsRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [id]); // Dependency is only id

  useEffect(() => {
    if (isEditMode) {
      fetchCustomerDetailsAndProducts();
    } else {
      // For new customer, ensure initial refs are set for change detection
      initialFormDataRef.current = { ...formData };
      initialCustomProductsRef.current = [...customProducts];
      setLoading(false); // Not loading if creating new
    }
  }, [isEditMode, fetchCustomerDetailsAndProducts]); // Run only when mode changes or fetch function updates

  // --- Populate Salesmen Options ---
  useEffect(() => {
    if (salesmenData.length > 0) {
      const salesmenOptions = salesmenData.map((employee) => ({
        id: employee.id,
        name: employee.name || employee.id,
      }));
      setSalesmen(salesmenOptions);
      // Set default salesman if creating new and options are loaded
      if (!isEditMode && !formData.salesman && salesmenOptions.length > 0) {
        // Optional: set a default salesman if desired
        // setFormData(prev => ({ ...prev, salesman: salesmenOptions[0].id }));
      }
    }
  }, [salesmenData, isEditMode, formData.salesman]);

  // --- Event Handlers ---
  const handleBackClick = () => {
    if (isFormChanged) {
      setShowBackConfirmation(true);
    } else {
      navigate("/catalogue/customer");
    }
  };

  const handleConfirmBack = () => {
    setShowBackConfirmation(false);
    navigate("/catalogue/customer");
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
      await refreshCustomersCache(); // Refresh cache
      setIsDeleteDialogOpen(false);
      toast.success("Customer deleted successfully");
      navigate("/catalogue/customer");
    } catch (err: any) {
      console.error("Error deleting customer:", err);
      toast.error(
        `Failed to delete customer: ${
          err?.response?.data?.message || err.message
        }.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // --- Form Validation and Submission ---
  const validateForm = (): boolean => {
    if (!formData.id || !formData.name) {
      toast.error("Customer ID and Name are required fields.");
      return false;
    }
    if (formData.id.includes(" ")) {
      toast.error("Customer ID cannot contain spaces.");
      return false;
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error("Please enter a valid email address or leave it empty.");
      return false;
    }

    // Validate ID/TIN fields if any are provided
    const hasIdType = formData.id_type && formData.id_type !== "Select...";
    const hasIdNumber = Boolean(formData.id_number);
    const hasTinNumber = Boolean(formData.tin_number);

    if (hasIdType || hasIdNumber || hasTinNumber) {
      if (!hasIdType) {
        toast.error(
          "ID Type is required when providing identification details."
        );
        return false;
      }
      if (!hasIdNumber) {
        toast.error(
          "ID Number is required when providing identification details."
        );
        return false;
      }
      if (!hasTinNumber) {
        toast.error(
          "TIN Number is required when providing identification details."
        );
        return false;
      }
    }

    // Validate custom product entries (ensure product is selected and price is valid)
    for (const product of customProducts) {
      if (!product.product_id) {
        toast.error("Please select a product for all custom pricing rows.");
        return false;
      }
      if (
        product.custom_price === undefined ||
        product.custom_price === null ||
        isNaN(Number(product.custom_price)) ||
        Number(product.custom_price) < 0
      ) {
        toast.error(
          `Invalid custom price for product ID ${product.product_id}. Price must be a non-negative number.`
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
        // city: formData.city || undefined, // Keep defaults
        // state: formData.state || undefined,
        id_number: formData.id_number || undefined,
        id_type: formData.id_type || undefined,
      };

      let customerApiUrl = "/api/customers";
      let customerApiMethod: "post" | "put" = "post";
      let successMessage = "Customer created successfully!";

      if (isEditMode && id) {
        customerApiUrl = `/api/customers/${id}`;
        customerApiMethod = "put";
        successMessage = "Customer updated successfully!";
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
          // Optional: Check productResponse.success
        } catch (productError: any) {
          console.error("Failed to save custom products:", productError);
          // Customer was saved, but products failed. Inform the user.
          toast.error(
            `Customer saved, but failed to update custom products: ${
              productError?.response?.data?.message || productError.message
            }. Please check the custom products settings.`
          );
          // Don't navigate away, let user fix product issues maybe? Or navigate but warn?
          // For now, we'll still proceed to refresh cache and navigate, but the error is logged.
        }
      }

      // --- Post-Save Actions ---
      await refreshCustomersCache(); // Refresh cache regardless of product save outcome
      toast.success(successMessage);
      navigate("/catalogue/customer");
    } catch (error: any) {
      console.error(
        `Error ${isEditMode ? "updating" : "creating"} customer:`,
        error
      );
      toast.error(
        `Failed to ${isEditMode ? "update" : "create"} customer: ${
          error?.response?.data?.message || error.message
        }`
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
        disabled={isSaving} // Disable when saving
      />
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

  const getProgressBarColor = (used: number, limit: number): string => {
    if (limit <= 0) return "bg-gray-400"; // Indicate unlimited or zero limit
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return "bg-rose-500";
    if (percentage >= 70) return "bg-amber-500";
    return "bg-emerald-500";
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
        <BackButton onClick={() => navigate("/catalogue/customer")} />
        <div className="mt-4 p-4 border border-red-300 bg-red-50 text-red-700 rounded">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pb-10">
      {" "}
      {/* Added pb-10 */}
      <BackButton onClick={handleBackClick} className="mt-3 mb-2" />
      <div className="bg-white rounded-lg shadow-sm border border-default-200">
        <div className="p-6 border-b border-default-200">
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode ? "Edit Customer" : "Add New Customer"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? `Editing details for ${formData.name || "customer"}.`
              : "Enter new customer information."}
          </p>
        </div>

        {/* Wrap form in a div to handle potential saving overlay */}
        <div className="relative">
          {isSaving && (
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50 rounded-b-lg">
              <LoadingSpinner hideText /> Saving...
            </div>
          )}

          <form
            onSubmit={handleSubmit} // No need for preventDefault here if button type is submit
            noValidate // Prevent browser default validation
          >
            <div className="p-6">
              <Tab labels={["Info", "Credit & Pricing"]}>
                {/* === First tab - Customer Info === */}
                <div className="space-y-6 mt-5">
                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
                    {renderInput("id", "Customer ID", "text", "CUST001", true)}
                    {renderInput(
                      "name",
                      "Customer Name",
                      "text",
                      "Example Company Sdn Bhd",
                      true
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
                    {renderInput("phone_number", "Phone Number", "tel")}
                    {renderInput("email", "Email", "email")}
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      {renderInput("address", "Address", "text")}
                    </div>
                    {renderInput("city", "City", "text", "KOTA KINABALU")}
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-3">
                    {renderListbox("state", "State", stateOptions)}
                    {renderListbox("closeness", "Closeness", closenessOptions)}
                    {renderListbox("salesman", "Salesman", salesmen, true)}
                  </div>
                  <hr className="my-4 border-t border-default-200" />
                  <h3 className="text-base font-medium text-default-700 mb-3">
                    e-Invoice Information (Optional, requires all 3 if provided)
                  </h3>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-3">
                    <div>
                      <FormListbox
                        name="id_type"
                        label="ID Type"
                        value={formData.id_type || ""}
                        onChange={(selectedId) => {
                          handleListboxChange("id_type", selectedId);
                        }}
                        options={idTypeOptions}
                        disabled={isSaving}
                      />
                    </div>
                    {renderInput(
                      "id_number",
                      "ID Number",
                      "text",
                      getIdNumberPlaceholder(formData.id_type)
                    )}
                    {renderInput(
                      "tin_number",
                      "TIN Number",
                      "text",
                      "Company TIN"
                    )}
                  </div>
                </div>

                {/* === Second tab - Credit & Pricing === */}
                <div className="space-y-8 mt-5">
                  {" "}
                  {/* Increased spacing */}
                  {/* --- Credit Management Section --- */}
                  <div className="p-4 border border-default-200 rounded-lg bg-gray-50/50">
                    {" "}
                    {/* Subtle background */}
                    <h3 className="text-lg font-medium text-default-900 mb-4">
                      {" "}
                      {/* Increased bottom margin */}
                      Credit Management
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      {" "}
                      {/* Align items end */}
                      {/* Credit Limit Input */}
                      <div>
                        <label
                          htmlFor="credit_limit"
                          className="block text-sm font-medium text-default-700 mb-1"
                        >
                          Credit Limit (RM)
                        </label>
                        <input
                          id="credit_limit"
                          type="text" // Use text to allow easier input, parse on change/blur
                          name="credit_limit"
                          value={formData.credit_limit?.toString() ?? "3000"} // Handle potential null/undefined
                          onChange={(e) => {
                            const value = e.target.value;
                            // Allow empty string, numbers, and one decimal point
                            if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
                              setFormData({
                                ...formData,
                                // Store as number, default to 0 if empty becomes NaN
                                credit_limit:
                                  value === "" ? 0 : parseFloat(value) || 0,
                              });
                            }
                          }}
                          onBlur={(e) => {
                            // Optional: Format or re-validate on blur
                            const numericValue = parseFloat(e.target.value);
                            if (!isNaN(numericValue)) {
                              setFormData({
                                ...formData,
                                credit_limit: Math.max(0, numericValue),
                              }); // Ensure non-negative
                            } else {
                              setFormData({ ...formData, credit_limit: 0 }); // Default to 0 if invalid
                            }
                          }}
                          placeholder="0.00"
                          className="w-full px-3 py-2 border border-default-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 disabled:bg-default-100"
                          disabled={isSaving}
                        />
                        {formData.credit_limit === 0 && (
                          <p className="text-xs text-blue-600 mt-1">
                            Unlimited credit
                          </p>
                        )}
                      </div>
                      {/* Used Credit Display */}
                      <div>
                        <label className="block text-sm font-medium text-default-700 mb-1">
                          Credit Used
                        </label>
                        <div className="px-3 py-2 border border-default-200 rounded-md bg-default-100 h-[42px] flex items-center">
                          {" "}
                          {/* Match height */}
                          <span className="font-medium text-default-700">
                            RM {Number(formData.credit_used ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {/* Available Credit Display */}
                      <div>
                        <label className="block text-sm font-medium text-default-700 mb-1">
                          Available Credit
                        </label>
                        <div className="px-3 py-2 border border-default-200 rounded-md bg-default-100 h-[42px] flex items-center">
                          {" "}
                          {/* Match height */}
                          <span className="font-medium text-default-700">
                            {formData.credit_limit === 0
                              ? "Unlimited"
                              : `RM ${Math.max(
                                  0,
                                  (formData.credit_limit ?? 0) -
                                    (formData.credit_used ?? 0)
                                ).toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Credit Usage Bar (only if limit > 0) */}
                    {(formData.credit_limit ?? 0) > 0 && (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-default-600 mb-1">
                          <span>Usage</span>
                          <span>
                            {Number(formData.credit_used ?? 0).toFixed(2)} /{" "}
                            {Number(formData.credit_limit ?? 0).toFixed(2)} RM (
                            {Math.min(
                              100,
                              ((formData.credit_used ?? 0) /
                                (formData.credit_limit || 1)) *
                                100
                            ).toFixed(1)}
                            %)
                          </span>
                        </div>
                        <div className="w-full bg-default-200 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full ${getProgressBarColor(
                              formData.credit_used ?? 0,
                              formData.credit_limit ?? 1 // Avoid division by zero
                            )} transition-all duration-300 ease-out`}
                            style={{
                              width: `${Math.min(
                                100,
                                ((formData.credit_used ?? 0) /
                                  (formData.credit_limit || 1)) *
                                  100
                              )}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* --- Custom Products Section --- */}
                  <CustomerProductsTab
                    products={customProducts} // Pass state down
                    onProductsChange={handleProductsChange} // Pass handler down
                    disabled={isSaving} // Pass disabled state
                  />
                </div>
              </Tab>
            </div>

            {/* --- Form Actions --- */}
            <div className="p-6 flex justify-end items-center space-x-3 border-t border-default-200">
              {isEditMode && (
                <Button
                  type="button" // Important: Not submit
                  color="rose"
                  variant="outline"
                  onClick={handleDeleteClick}
                  disabled={isSaving}
                >
                  Delete Customer
                </Button>
              )}
              <Button
                type="submit" // This triggers the form onSubmit
                variant="filled" // Use solid for primary action
                color="sky" // Use theme primary color
                disabled={isSaving || !isFormChanged}
                size="lg"
              >
                {isSaving ? "Saving..." : "Save Customer"}
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
        title="Delete Customer"
        message={`Are you sure you want to permanently delete ${
          formData.name || "this customer"
        }? All associated custom pricing will also be removed. This action cannot be undone.`}
        confirmButtonText="Delete"
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

export default CustomerFormPage;
