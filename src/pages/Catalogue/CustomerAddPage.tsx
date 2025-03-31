import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Customer, Employee, CustomProduct } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import { validateCustomerIdentity } from "../../routes/catalogue/customerValidation";
import { refreshCustomersCache } from "../../utils/catalogue/useCustomerCache";
import { useSalesmanCache } from "../../utils/catalogue/useSalesmanCache";
import CustomerProductsTab from "../../components/Catalogue/CustomerProductsTab";
import Tab from "../../components/Tab";

interface SelectOption {
  id: string;
  name: string;
}

const CustomerAddPage: React.FC = () => {
  const navigate = useNavigate();
  const [temporaryProducts, setTemporaryProducts] = useState<CustomProduct[]>(
    []
  );
  const { salesmen: salesmenData, isLoading: salesmenLoading } =
    useSalesmanCache();

  // Helper function for ID number placeholder
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

  const initialFormDataRef = useRef<Customer>({ ...formData });
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirmation, setShowBackConfirmation] = useState(false);
  const [salesmen, setSalesmen] = useState<SelectOption[]>([]);

  const closenessOptions = [
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

  const idTypeOptions = [
    { id: "Select...", name: "Select..." },
    { id: "BRN", name: "BRN" },
    { id: "NRIC", name: "NRIC" },
    { id: "PASSPORT", name: "PASSPORT" },
    { id: "ARMY", name: "ARMY" },
  ];

  useEffect(() => {
    const hasChanged =
      JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    setIsFormChanged(hasChanged);
  }, [formData]);

  useEffect(() => {
    if (salesmenData.length > 0) {
      const salesmenOptions = salesmenData.map((employee) => ({
        id: employee.id,
        name: employee.name || employee.id,
      }));
      setSalesmen(salesmenOptions);
    }
  }, [salesmenData]);

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

    // Validate form
    if (!validateForm()) {
      return;
    }

    // Check if any of the validation fields has input
    const hasIdType = formData.id_type && formData.id_type !== "Select";
    const hasIdNumber = Boolean(formData.id_number);
    const hasTinNumber = Boolean(formData.tin_number);

    // If any field has input, all fields are required
    if (hasIdType || hasIdNumber || hasTinNumber) {
      setIsSaving(true);
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

      // Validate customer identity
      const validationResult = await validateCustomerIdentity(formData);
      if (!validationResult.isValid) {
        setIsSaving(false);
        return;
      }
    }

    setIsSaving(true);
    try {
      // First, create the customer
      const response = await api.post("/api/customers", formData);

      // Get the new customer ID from the response
      const newCustomerId = response.customer?.id || formData.id;

      // Only try to save products if there are any and we have a valid customer ID
      if (temporaryProducts.length > 0 && newCustomerId) {
        try {
          await api.post("/api/customer-products/batch", {
            customerId: newCustomerId, // Use the ID from the response
            products: temporaryProducts.map((cp) => ({
              productId: cp.product_id,
              customPrice:
                typeof cp.custom_price === "number"
                  ? cp.custom_price
                  : parseFloat(cp.custom_price || "0"),
              isAvailable:
                cp.is_available !== undefined ? cp.is_available : true,
            })),
          });
        } catch (productError) {
          console.error("Failed to save products:", productError);
          toast.error("Customer created but product pricing couldn't be saved");
        }
      }

      // Refresh the customers cache
      await refreshCustomersCache();
      toast.success("Customer created successfully!");
      navigate("/catalogue/customer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renderInput = (
    name: keyof Customer,
    label: string,
    type: string = "text",
    placeholder?: string
  ) => {
    const value = (() => {
      const val = formData[name];
      if (val === null || val === undefined) return "";
      return val.toString(); // Always convert to string
    })();

    return (
      <FormInput
        name={name}
        label={label}
        value={value}
        onChange={handleInputChange}
        type={type}
        {...(placeholder ? { placeholder } : {})}
      />
    );
  };

  const renderListbox = (
    name: keyof Customer,
    label: string,
    options: SelectOption[]
  ) => {
    // Get the current ID value from formData
    const value = formData[name]?.toString() || "";
    return (
      <FormListbox
        name={name}
        label={label}
        value={value} // Pass the ID value (e.g., "12", "Local")
        onChange={(selectedId) => {
          // onChange now correctly receives the ID
          handleListboxChange(name, selectedId); // Update formData with the ID
        }}
        options={options}
      />
    );
  };

  return (
    <div className="container mx-auto px-4">
      <BackButton onClick={handleBackClick} className="ml-5" />
      <div className="bg-white rounded-lg">
        <div className="pl-6">
          <h1 className="text-xl font-semibold text-default-900">
            Add New Customer
          </h1>
          <p className="mt-1 text-sm text-default-500">
            Enter new customer information here. Click "Save" when you're done.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
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
                  <div>
                    <FormListbox
                      name="id_type"
                      label="ID Type"
                      value={formData.id_type || ""}
                      onChange={(selectedId) => {
                        // When "Select..." is chosen, set id_type to empty string
                        const newValue =
                          selectedId === "Select..." ? "" : selectedId;
                        handleListboxChange("id_type", newValue);
                      }}
                      options={idTypeOptions}
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
                    "C21636482050"
                  )}
                </div>
              </div>

              {/* Second tab - Customer Sales Details */}
              <div className="space-y-6">
                {/* Credit Management Section */}
                <div className="mb-6 mt-6 p-4 border rounded-lg bg-white">
                  <h3 className="text-lg font-medium text-default-900 mb-3">
                    Credit Management
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Credit Limit Box */}
                    <div className="border border-default-300 rounded-lg bg-white overflow-hidden h-[60px] flex flex-col focus-within:outline-none focus-within:border-default-500 transition-colors">
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
                    <div className="border border-default-300 rounded-lg bg-default-100 h-[60px] flex flex-col">
                      <div className="px-3 pt-2 text-xs text-default-500">
                        Used
                      </div>
                      <div className="px-3 pb-2 flex-grow flex items-center">
                        <span className="font-medium text-default-700">
                          RM 0.00
                        </span>
                      </div>
                    </div>

                    {/* Available Credit Box */}
                    <div className="border border-default-300 rounded-lg bg-default-100 h-[60px] flex flex-col">
                      <div className="px-3 pt-2 text-xs text-default-500">
                        Available
                      </div>
                      <div className="px-3 pb-2 flex-grow flex items-center">
                        <span className="font-medium text-default-700">
                          {formData.credit_limit === 0
                            ? "Unlimited"
                            : `RM ${parseFloat(
                                formData.credit_limit?.toString() || "3000"
                              ).toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Credit Usage Visualization - Only show when credit limit is greater than 0 */}
                  {(formData.credit_limit ?? 0) > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-default-600 mb-1">
                        <span>Credit Usage</span>
                        <span>
                          0.00 /{" "}
                          {parseFloat(
                            formData.credit_limit?.toString() || "3000"
                          ).toFixed(2)}{" "}
                          RM (0.0%)
                        </span>
                      </div>
                      <div className="w-full bg-default-200 rounded-full h-2.5">
                        <div
                          className="h-2.5 rounded-full bg-emerald-500"
                          style={{ width: "0%" }}
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

                {/* CustomerProductsTab */}
                <CustomerProductsTab
                  customerId=""
                  isNewCustomer={true}
                  temporaryProducts={temporaryProducts}
                  onTemporaryProductsChange={(products) => {
                    setTemporaryProducts(products);
                    setIsFormChanged(true);
                  }}
                />
              </div>
            </Tab>
          </div>

          <div className="mt-6 py-3 text-right">
            <Button
              type="submit"
              variant="boldOutline"
              size="lg"
              disabled={isSaving || !isFormChanged}
            >
              Save
            </Button>
          </div>
        </form>
      </div>

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

export default CustomerAddPage;
