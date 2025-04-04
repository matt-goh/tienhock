// src/pages/Catalogue/CustomerAddPage.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Customer, CustomProduct } from "../../types/types"; // Removed Employee if not used
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import {
  FormInput,
  FormListbox,
  SelectOption, // Import SelectOption if not already
} from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import { validateCustomerIdentity } from "../../routes/catalogue/customerValidation";
import { refreshCustomersCache } from "../../utils/catalogue/useCustomerCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import CustomerProductsTab from "../../components/Catalogue/CustomerProductsTab";
import Tab from "../../components/Tab";
import LoadingSpinner from "../../components/LoadingSpinner"; // Import LoadingSpinner

// Keep SelectOption interface if not imported
// interface SelectOption {
//   id: string;
//   name: string;
// }

const CustomerAddPage: React.FC = () => {
  const navigate = useNavigate();
  // State for custom products specific to this new customer
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]); // Renamed for clarity
  const { salesmen: salesmenData, isLoading: salesmenLoading } =
    useSalesmanCache();

  // Helper function for ID number placeholder
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

  // Form state initialization
  const [formData, setFormData] = useState<Customer>({
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
    credit_used: 0, // Always 0 for new customers
  });

  const initialFormDataRef = useRef<Customer>({ ...formData });
  const initialCustomProductsRef = useRef<CustomProduct[]>([]); // Track initial empty state

  // UI State
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [salesmen, setSalesmen] = useState<SelectOption[]>([]);

  // --- Options --- (Same as before)
  const closenessOptions: SelectOption[] = [
    { id: "Local", name: "Local" },
    { id: "Outstation", name: "Outstation" },
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

  const idTypeOptions: SelectOption[] = [
    { id: "", name: "Select..." }, // Use empty string
    { id: "BRN", name: "BRN" },
    { id: "NRIC", name: "NRIC" },
    { id: "PASSPORT", name: "PASSPORT" },
    { id: "ARMY", name: "ARMY" },
  ];

  // --- Form Change Detection ---
  useEffect(() => {
    const customerDataChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    const productsChanged =
      JSON.stringify(customProducts) !==
      JSON.stringify(initialCustomProductsRef.current);

    setIsFormChanged(customerDataChanged || productsChanged);
  }, [formData, customProducts]);

  // --- Populate Salesmen Options ---
  useEffect(() => {
    if (salesmenData.length > 0) {
      const salesmenOptions = salesmenData.map((employee) => ({
        id: employee.id,
        name: employee.name || employee.id,
      }));
      setSalesmen(salesmenOptions);
      // Optionally set default salesman if needed
      // if (!formData.salesman && salesmenOptions.length > 0) {
      //   setFormData(prev => ({ ...prev, salesman: salesmenOptions[0].id }));
      // }
    }
  }, [salesmenData, formData.salesman]); // Removed dependency on isEditMode as it's always false here

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

  // Callback for CustomerProductsTab
  const handleProductsChange = useCallback(
    (updatedProducts: CustomProduct[]) => {
      setCustomProducts(updatedProducts);
    },
    []
  );

  // --- Form Validation ---
  const validateForm = (): boolean => {
    // Use same validation logic as CustomerFormPage
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

    // Validate custom product entries
    for (const product of customProducts) {
      if (!product.product_id) {
        toast.error("Please select a product for all custom pricing rows.");
        return false;
      }
      if (
        product.custom_price === undefined ||
        product.custom_price === null ||
        isNaN(Number(product.custom_price)) || // Check if it's a number or can be parsed
        Number(product.custom_price) < 0
      ) {
        // Allow temporary string state like "12." during input, but validate final number
        if (
          typeof product.custom_price !== "string" ||
          !String(product.custom_price).endsWith(".")
        ) {
          toast.error(
            `Invalid custom price for product ID ${product.product_id}. Price must be a non-negative number.`
          );
          return false;
        }
      }
    }

    return true;
  };

  // --- Form Submission ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      // --- Identity Validation (if fields provided) ---
      const hasValidationFields =
        (formData.id_type && formData.id_type !== "Select...") ||
        formData.id_number ||
        formData.tin_number;

      if (hasValidationFields) {
        const validationResult = await validateCustomerIdentity(formData);
        if (!validationResult.isValid) {
          setIsSaving(false);
          return; // Toast is shown within the function
        }
      }

      // --- Prepare Data ---
      const customerPayload: Omit<Customer, "credit_used"> = {
        // Exclude credit_used as it's always 0 on creation
        ...formData,
        credit_limit: Number(formData.credit_limit ?? 3000),
        // Convert empty strings back to null for DB
        tin_number: formData.tin_number || undefined,
        phone_number: formData.phone_number || undefined,
        email: formData.email || undefined,
        address: formData.address || undefined,
        id_number: formData.id_number || undefined,
        id_type: formData.id_type || "", // Use empty string instead of undefined
      };

      // --- API Calls ---
      // 1. Create the Customer
      const customerResponse = await api.post(
        "/api/customers",
        customerPayload
      );

      // Use the ID from the response if available, otherwise fallback to formData (though response should have it)
      const newCustomerId = customerResponse?.customer?.id || formData.id;

      // 2. Save Custom Products (if any were added)
      if (customProducts.length > 0 && newCustomerId) {
        try {
          const productPayload = {
            customerId: newCustomerId,
            products: customProducts.map((cp) => ({
              productId: cp.product_id,
              // Ensure final price is a number before sending
              customPrice: Number(cp.custom_price ?? 0),
              isAvailable: cp.is_available ?? true,
            })),
            // No deleted IDs when creating
          };
          await api.post("/api/customer-products/batch", productPayload);
        } catch (productError: any) {
          console.error("Failed to save custom products:", productError);
          // Notify user about partial success
          toast.error(
            `Customer created, but failed to save custom products: ${
              productError?.response?.data?.message || productError.message
            }. You may need to edit the customer to add them.`
          );
          // Continue to navigate after customer creation success
        }
      }

      // --- Post-Save Actions ---
      await refreshCustomersCache();
      toast.success("Customer created successfully!");
      navigate("/catalogue/customer");
    } catch (error: any) {
      console.error("Error creating customer:", error);
      toast.error(
        `Failed to create customer: ${
          error?.response?.data?.message || error.message
        }`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render Helpers --- (Similar to CustomerFormPage)
  const renderInput = (
    name: keyof Customer,
    label: string,
    type: string = "text",
    placeholder?: string,
    required: boolean = false
  ) => {
    const value = formData[name] ?? "";
    return (
      <FormInput
        name={name}
        label={label}
        value={value.toString()}
        onChange={handleInputChange}
        type={type}
        placeholder={placeholder}
        required={required}
        disabled={isSaving}
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
        disabled={isSaving}
      />
    );
  };

  // --- Render ---
  return (
    <div className="container mx-auto px-4 pb-10">
      {" "}
      {/* Added pb-10 */}
      <BackButton onClick={handleBackClick} className="mt-3 mb-2" />
      <div className="bg-white rounded-lg shadow-sm border border-default-200">
        <div className="p-6 border-b border-default-200">
          <h1 className="text-xl font-semibold text-default-900">
            Add New Customer
          </h1>
          <p className="mt-1 text-sm text-default-500">
            Enter the customer's information below.
          </p>
        </div>

        {/* Wrap form in a div to handle potential saving overlay */}
        <div className="relative">
          {isSaving && (
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50 rounded-b-lg">
              <LoadingSpinner hideText /> Saving...
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="p-6">
              <Tab labels={["Info", "Credit & Pricing"]}>
                {/* === First tab - Customer Info === */}
                <div className="space-y-6 mt-5">
                  {/* Re-using render helpers */}
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
                        onChange={(selectedId) =>
                          handleListboxChange("id_type", selectedId)
                        }
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
                    <h3 className="text-lg font-medium text-default-900 mb-4">
                      Credit Management
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
                          type="text"
                          name="credit_limit"
                          value={formData.credit_limit?.toString() ?? "3000"}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
                              setFormData({
                                ...formData,
                                credit_limit:
                                  value === "" ? 0 : parseFloat(value) || 0,
                              });
                            }
                          }}
                          onBlur={(e) => {
                            const numericValue = parseFloat(e.target.value);
                            if (!isNaN(numericValue)) {
                              setFormData({
                                ...formData,
                                credit_limit: Math.max(0, numericValue),
                              });
                            } else {
                              setFormData({ ...formData, credit_limit: 0 });
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

                      {/* Used Credit (Always 0 for new) */}
                      <div>
                        <label className="block text-sm font-medium text-default-700 mb-1">
                          Credit Used
                        </label>
                        <div className="px-3 py-2 border border-default-200 rounded-md bg-default-100 h-[42px] flex items-center">
                          <span className="font-medium text-default-700">
                            RM 0.00
                          </span>
                        </div>
                      </div>

                      {/* Available Credit (Equals Limit for new) */}
                      <div>
                        <label className="block text-sm font-medium text-default-700 mb-1">
                          Available Credit
                        </label>
                        <div className="px-3 py-2 border border-default-200 rounded-md bg-default-100 h-[42px] flex items-center">
                          <span className="font-medium text-default-700">
                            {formData.credit_limit === 0
                              ? "Unlimited"
                              : `RM ${Number(
                                  formData.credit_limit ?? 0
                                ).toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Credit Usage Bar (Always 0% for new) */}
                    {(formData.credit_limit ?? 0) > 0 && (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-default-600 mb-1">
                          <span>Usage</span>
                          <span>
                            0.00 /{" "}
                            {Number(formData.credit_limit ?? 0).toFixed(2)} RM
                            (0.0%)
                          </span>
                        </div>
                        <div className="w-full bg-default-200 rounded-full h-2.5">
                          <div
                            className="h-2.5 rounded-full bg-emerald-500" // Always green initially
                            style={{ width: "0%" }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* --- Custom Products Section --- */}
                  <CustomerProductsTab
                    products={customProducts} // Pass state down ** CORRECT PROP NAME **
                    onProductsChange={handleProductsChange} // Pass handler down ** CORRECT PROP NAME & SIGNATURE **
                    disabled={isSaving} // Pass disabled state
                  />
                </div>
              </Tab>
            </div>

            {/* --- Form Actions --- */}
            <div className="p-6 flex justify-end items-center space-x-3 border-t border-default-200">
              {/* No Delete button in Add mode */}
              <Button
                type="button" // Go back button
                variant="outline"
                onClick={handleBackClick}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="filled"
                color="sky"
                disabled={isSaving || !isFormChanged} // Disable if no changes or saving
                size="lg"
              >
                {isSaving ? "Saving..." : "Create Customer"}
              </Button>
            </div>
          </form>
        </div>
      </div>
      {/* --- Dialogs --- */}
      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to go back? All entered information will be lost."
        confirmButtonText="Discard"
      />
    </div>
  );
};

export default CustomerAddPage;
