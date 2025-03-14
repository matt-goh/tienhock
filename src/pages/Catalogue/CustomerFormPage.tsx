import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Customer, CustomProduct, Employee } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import {
  FormInput,
  FormInputWithStatus,
  FormListbox,
} from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { validateCustomerIdentity } from "../../routes/catalogue/customerValidation";
import { refreshCustomersCache } from "../../utils/catalogue/useCustomerCache";
import CustomerProductsTab from "../../components/Catalogue/CustomerProductsTab";
import Tab from "../../components/Tab";

interface SelectOption {
  id: string;
  name: string;
}

const CustomerFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // Add this helper function at the component level
  const getIdNumberPlaceholder = (idType: string) => {
    switch (idType) {
      case "BRN":
        return "201101025173";
      case "NRIC":
        return "981223125953";
      default:
        return "";
    }
  };

  // Form state
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
    credit_used: 0,
  });

  // UI state
  const initialFormDataRef = useRef<Customer>({ ...formData });
  const [temporaryProducts, setTemporaryProducts] = useState<CustomProduct[]>(
    []
  );
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [originalProductIds, setOriginalProductIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);

  // Options
  const [salesmen, setSalesmen] = useState<SelectOption[]>([]);

  const closenessOptions = [
    { id: "Local", name: "Local" },
    { id: "Outstation", name: "Outstation" },
  ];

  const idTypeOptions = [
    { id: "Select", name: "Select" },
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

  // Form change detection
  useEffect(() => {
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanged);
  }, [formData]);

  // Initial data fetching
  useEffect(() => {
    if (isEditMode) {
      fetchCustomerDetails();
    }
    fetchSalesmen();
  }, []);

  useEffect(() => {
    // Only mark as changed if we have products
    if (temporaryProducts.length > 0) {
      setIsFormChanged(true);
    }
  }, [temporaryProducts]);

  // Data fetching functions
  const fetchCustomerDetails = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/customers/${id}`);
      const formattedData = {
        ...data,
        tin_number: data.tin_number || "",
      };
      setFormData(formattedData);
      initialFormDataRef.current = formattedData;

      // Also fetch the customer's products to track original IDs
      if (id) {
        const productsData = await api.get(`/api/customer-products/${id}`);
        setOriginalProductIds(productsData.map((p: any) => p.product_id));
      }

      setError(null);
    } catch (err) {
      setError("Failed to fetch customer details. Please try again later.");
      console.error("Error fetching customer details:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesmen = useCallback(async () => {
    try {
      const data: Employee[] = await api.get("/api/staffs?salesmenOnly=true");
      const salesmenOptions = data.map((employee) => ({
        id: employee.id,
        name: employee.name || employee.id,
      }));
      setSalesmen(salesmenOptions);
    } catch (error) {
      console.error("Error fetching salesmen:", error);
      toast.error("Failed to fetch salesmen list");
    }
  }, []);

  // Event handlers
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

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (id) {
      try {
        await api.delete(`/api/customers/${id}`);

        // Refresh the customers cache after deletion
        await refreshCustomersCache();

        setIsDeleteDialogOpen(false);
        toast.success("Customer deleted successfully");
        navigate("/catalogue/customer");
      } catch (err) {
        console.error("Error deleting customer:", err);
        toast.error("Failed to delete customer. Please try again.");
      }
    }
  };

  // Form validation and submission
  const validateForm = (): boolean => {
    if (!formData.id || !formData.name) {
      toast.error("ID and Name are required fields.");
      return false;
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error("Please enter a valid email address or leave it empty.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Check if any of the validation fields has input
    const hasIdType = formData.id_type && formData.id_type !== "Select";
    const hasIdNumber = Boolean(formData.id_number);
    const hasTinNumber = Boolean(formData.tin_number);

    setIsSaving(true);

    try {
      // If any field has input, all fields are required
      if (hasIdType || hasIdNumber || hasTinNumber) {
        if (!hasIdType) {
          toast.error(
            "ID Type is required when providing identification details"
          );
          setIsSaving(false);
          return;
        }
        if (!hasIdNumber) {
          toast.error(
            "ID Number is required when providing identification details"
          );
          setIsSaving(false);
          return;
        }
        if (!hasTinNumber) {
          toast.error(
            "TIN Number is required when providing identification details"
          );
          setIsSaving(false);
          return;
        }

        // Check if data is already verified (exists and unchanged)
        const isDataVerified =
          isEditMode &&
          isValidationDataUnchanged(formData, initialFormDataRef.current);

        // Only validate if data has changed or is new
        if (!isDataVerified) {
          const validationResult = await validateCustomerIdentity(formData);
          if (!validationResult.isValid) {
            setIsSaving(false);
            return;
          }
        }
      }

      // Proceed with saving the customer data
      if (isEditMode) {
        try {
          const isChangingId = formData.id !== id;

          // Step 1: Update the customer first
          const customerResponse = await api.put(`/api/customers/${id}`, {
            ...formData,
            newId: isChangingId ? formData.id : undefined, // Only send newId if changing
          });

          // Step 2: After customer update completes, now handle products
          // Use the NEW ID from the response for products
          const updatedCustomerId = isChangingId ? formData.id : id;

          let productsToUpdate = [...temporaryProducts];
          if (
            isChangingId &&
            originalProductIds.length > 0 &&
            temporaryProducts.length === 0
          ) {
            // If changing ID and we know there should be products but temporaryProducts is empty,
            // fetch the current products directly and use those
            try {
              const productsData = await api.get(
                `/api/customer-products/${id}`
              );
              setTemporaryProducts(productsData);
              productsToUpdate = productsData; // Use these products
            } catch (fallbackError) {
              console.error(
                "Error fetching products for ID change:",
                fallbackError
              );
              toast.error("Could not transfer products to new customer ID");
            }
          }

          // Only proceed with product updates if the customer update succeeded
          if (
            customerResponse &&
            (productsToUpdate.length > 0 || originalProductIds.length > 0)
          ) {
            try {
              // Calculate which product IDs were removed
              const currentProductIds = productsToUpdate.map(
                (p) => p.product_id
              );
              const deletedProductIds = originalProductIds.filter(
                (pid) => !currentProductIds.includes(pid)
              );

              // IMPORTANT: Use the NEW customer ID here
              const productResponse = await api.post(
                "/api/customer-products/batch",
                {
                  customerId: updatedCustomerId, // Use new ID
                  products: productsToUpdate.map((cp) => ({
                    productId: cp.product_id,
                    customPrice:
                      typeof cp.custom_price === "number"
                        ? cp.custom_price
                        : parseFloat(cp.custom_price || "0"),
                    isAvailable:
                      cp.is_available !== undefined ? cp.is_available : true,
                  })),
                  deletedProductIds: deletedProductIds,
                }
              );

              if (!productResponse.success) {
                console.error("Product update failed:", productResponse);
                toast.error("Customer updated but products failed to update");
              }
            } catch (productError) {
              console.error("Failed to save products:", productError);
              toast.error(
                "Customer updated but product pricing couldn't be saved"
              );
            }
          }

          // Refresh the customers cache
          await refreshCustomersCache();
          navigate("/catalogue/customer");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "An unexpected error occurred"
          );
        } finally {
          setIsSaving(false);
        }
      }

      // After successful save, clear temporary products
      setTemporaryProducts([]);

      toast.success(
        `Customer ${isEditMode ? "updated" : "created"} successfully!`
      );
      navigate("/catalogue/customer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const isValidationDataUnchanged = (
    currentData: Customer,
    initialData: Customer
  ): boolean => {
    return (
      currentData.id_type === initialData.id_type &&
      currentData.id_number === initialData.id_number &&
      currentData.tin_number === initialData.tin_number &&
      // Make sure all values exist
      Boolean(currentData.id_type) &&
      currentData.id_type !== "Select" &&
      Boolean(currentData.id_number) &&
      Boolean(currentData.tin_number)
    );
  };

  // Render helpers
  const renderInput = (
    name: keyof Customer,
    label: string,
    type: string = "text",
    placeholder?: string
  ) => {
    const value = (() => {
      const val = formData[name];
      if (val === null || val === undefined) return "";
      return val.toString();
    })();

    // Determine if this field should have verification capability
    const showStatus = name === "id_number" || name === "tin_number";
    const isVerified =
      isEditMode &&
      isValidationDataUnchanged(formData, initialFormDataRef.current);

    return showStatus ? (
      <FormInputWithStatus
        name={name}
        label={label}
        value={value}
        onChange={handleInputChange}
        type={type}
        placeholder={placeholder}
        showStatus={true}
        isVerified={isVerified}
      />
    ) : (
      <FormInput
        name={name}
        label={label}
        value={value}
        onChange={handleInputChange}
        type={type}
        placeholder={placeholder}
      />
    );
  };

  const renderListbox = (
    name: keyof Customer,
    label: string,
    options: SelectOption[]
  ) => {
    const value = formData[name]?.toString() || "";

    // For state field, we want to show the name but save the code
    if (name === "state") {
      const selectedState = stateOptions.find((opt) => opt.id === value);
      return (
        <FormListbox
          name={name}
          label={label}
          value={selectedState ? selectedState.name : value}
          onChange={(selectedName) => {
            const selectedOption = stateOptions.find(
              (opt) => opt.name === selectedName
            );
            handleListboxChange(
              name,
              selectedOption ? selectedOption.id : selectedName
            );
          }}
          options={options}
        />
      );
    }

    // For other fields, normal behavior
    return (
      <FormListbox
        name={name}
        label={label}
        value={value}
        onChange={(value) => handleListboxChange(name, value)}
        options={options}
      />
    );
  };

  const getProgressBarColor = (used: number, limit: number): string => {
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return "bg-rose-500"; // Red for high usage
    if (percentage >= 70) return "bg-amber-500"; // Yellow/amber for medium usage
    return "bg-emerald-500"; // Green for low usage
  };

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container mx-auto px-4">
      <BackButton onClick={handleBackClick} className="ml-5" />
      <div className="bg-white rounded-lg">
        <div className="pl-6">
          <h1 className="text-xl font-semibold text-default-900">
            {isEditMode ? "Edit Customer" : "Add New Customer"}
          </h1>
          <p className="mt-1 text-sm text-default-500">
            {isEditMode
              ? 'Edit customer information here. Click "Save" when you\'re done.'
              : 'Enter new customer information here. Click "Save" when you\'re done.'}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault(); // Prevent default form submission behavior
            handleSubmit(e);
          }}
        >
          <div className="pl-6 pt-5">
            <Tab labels={["Info", "Sales"]}>
              {/* First tab - Customer Info */}
              <div className="space-y-6 mt-5">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("id", "ID", "text", "TIENHOCK")}
                  {renderInput(
                    "name",
                    "Name",
                    "text",
                    "TIEN HOCK FOOD INDUSTRIES S/D"
                  )}
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {renderInput("phone_number", "Phone Number", "tel")}
                  {renderInput("email", "Email", "email")}
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    {renderInput("address", "Address", "text")}
                  </div>
                  {renderInput("city", "City")}
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderListbox("state", "State", stateOptions)}
                  {renderListbox("closeness", "Closeness", closenessOptions)}
                  {renderListbox("salesman", "Salesman", salesmen)}
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {renderListbox("id_type", "ID Type", idTypeOptions)}
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
                    "C21636482050"
                  )}
                </div>
              </div>

              {/* Second tab - Customer Sales Details */}
              <div className="space-y-6">
                {/* Credit Management Section */}
                <div className="mt-6 p-4 border rounded-lg bg-white">
                  <h3 className="text-lg font-medium text-default-900 mb-3">
                    Credit Management
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Credit Limit Box */}
                    <div className="border border-default-300 rounded-lg bg-white overflow-hidden h-[60px] flex flex-col">
                      <div className="px-3 pt-2 text-xs text-default-500">
                        Credit Limit (RM)
                      </div>
                      <div className="px-3 pb-2 flex-grow">
                        <input
                          type="text"
                          name="credit_limit"
                          value={formData.credit_limit?.toString() || "3000"}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
                              setFormData({
                                ...formData,
                                credit_limit:
                                  value === "" ? 0 : parseFloat(value),
                              });
                            }
                          }}
                          placeholder="3000.00"
                          className="w-full h-full bg-transparent border-0 p-0 font-medium text-default-800 focus:outline-none focus:ring-0"
                        />
                      </div>
                    </div>

                    {/* Used Credit Box */}
                    <div className="border border-default-300 rounded-lg bg-default-50 h-[60px] flex flex-col">
                      <div className="px-3 pt-2 text-xs text-default-500">
                        Used
                      </div>
                      <div className="px-3 pb-2 flex-grow flex items-center">
                        <span className="font-medium text-default-700">
                          {formData.credit_used !== undefined
                            ? `RM ${parseFloat(
                                formData.credit_used.toString()
                              ).toFixed(2)}`
                            : "RM 0.00"}
                        </span>
                      </div>
                    </div>

                    {/* Available Credit Box */}
                    <div className="border border-default-300 rounded-lg bg-default-50 h-[60px] flex flex-col">
                      <div className="px-3 pt-2 text-xs text-default-500">
                        Available
                      </div>
                      <div className="px-3 pb-2 flex-grow flex items-center">
                        <span className="font-medium text-default-700">
                          {formData.credit_limit === 0
                            ? "Unlimited"
                            : `RM ${Math.max(
                                0,
                                (formData.credit_limit || 0) -
                                  (formData.credit_used || 0)
                              ).toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Credit Usage Visualization - Only show when credit limit is greater than 0 */}
                  {(formData.credit_limit || 0) > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-default-600 mb-1">
                        <span>Credit Usage</span>
                        <span>
                          {parseFloat(
                            (formData.credit_used || 0).toString()
                          ).toFixed(2)}{" "}
                          /{" "}
                          {parseFloat(
                            (formData.credit_limit || 0).toString()
                          ).toFixed(2)}{" "}
                          RM (
                          {Math.min(
                            ((formData.credit_used || 0) /
                              (formData.credit_limit || 1)) *
                              100,
                            100
                          ).toFixed(1)}
                          %)
                        </span>
                      </div>
                      <div className="w-full bg-default-200 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full ${getProgressBarColor(
                            formData.credit_used || 0,
                            formData.credit_limit || 3000
                          )}`}
                          style={{
                            width: `${Math.min(
                              ((formData.credit_used || 0) /
                                (formData.credit_limit || 1)) *
                                100,
                              100
                            )}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Show this message when credit limit is exactly 0 (unlimited) */}
                  {formData.credit_limit === 0 && (
                    <div className="mt-4 text-center py-2 bg-sky-100 text-sky-800 rounded-md">
                      <span className="text-sm">
                        Customer has unlimited credit
                      </span>
                    </div>
                  )}
                </div>

                <CustomerProductsTab
                  customerId={id || ""}
                  isNewCustomer={!isEditMode}
                  temporaryProducts={temporaryProducts}
                  onTemporaryProductsChange={(products) => {
                    setTemporaryProducts(products);
                    setIsFormChanged(true);
                  }}
                />
              </div>
            </Tab>
          </div>

          <div className="mt-4 py-3 space-x-3 text-right">
            {isEditMode && (
              <Button
                type="button"
                color="rose"
                variant="outline"
                onClick={handleDeleteClick}
              >
                Delete
              </Button>
            )}
            <Button
              type="submit"
              variant="boldOutline"
              disabled={isSaving || !isFormChanged}
              size="lg"
            >
              Save
            </Button>
          </div>
        </form>
      </div>

      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Customer"
        message={`Are you sure you want to remove ${formData.name} from the customer list? This action cannot be undone.`}
        confirmButtonText="Delete"
      />

      <ConfirmationDialog
        isOpen={showBackConfirmation}
        onClose={() => setShowBackConfirmation(false)}
        onConfirm={handleConfirmBack}
        title="Discard Changes"
        message="Are you sure you want to go back? All unsaved changes will be lost."
        confirmButtonText="Confirm"
      />
    </div>
  );
};

export default CustomerFormPage;
