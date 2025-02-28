import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmationDialog from "../../components/ConfirmationDialog";
import { Customer, Employee, CustomProduct } from "../../types/types";
import BackButton from "../../components/BackButton";
import Button from "../../components/Button";
import { FormInput, FormListbox } from "../../components/FormComponents";
import { api } from "../../routes/utils/api";
import { validateCustomerIdentity } from "../../routes/sales/invoices/customerValidation";
import { refreshCustomersCache } from "../../utils/catalogue/useCustomerCache";
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
    { id: "Select", name: "Select" },
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
    fetchSalesmen();
  }, []);

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

    // First check if form passes basic validation
    if (!validateForm()) {
      return;
    }

    // Check if any of the validation fields has input
    const hasIdType = formData.id_type && formData.id_type !== "Select";
    const hasIdNumber = Boolean(formData.id_number);
    const hasTinNumber = Boolean(formData.tin_number);

    // If any field has input, all fields are required
    if (hasIdType || hasIdNumber || hasTinNumber) {
      if (!hasIdType) {
        toast.error(
          "ID Type is required when providing identification details"
        );
        return;
      }
      if (!hasIdNumber) {
        toast.error(
          "ID Number is required when providing identification details"
        );
        return;
      }
      if (!hasTinNumber) {
        toast.error(
          "TIN Number is required when providing identification details"
        );
        return;
      }

      // If all required fields are present, proceed with validation
      setIsSaving(true);
      try {
        const validationResult = await validateCustomerIdentity(formData);

        if (!validationResult.isValid) {
          setIsSaving(false);
          return;
        }

        // Create the customer
        const response = await api.post("/api/customers", formData);
        const newCustomerId = response.customer?.id || formData.id;

        // If we have temporary products, save them
        if (temporaryProducts.length > 0) {
          try {
            await api.post("/api/customer-products/batch", {
              customerId: newCustomerId,
              products: temporaryProducts.map((cp) => ({
                productId: cp.product_id,
                customPrice: cp.custom_price || 0,
                isAvailable:
                  cp.is_available !== undefined ? cp.is_available : true,
              })),
            });
            console.log("Successfully saved products for new customer");
          } catch (productError) {
            console.error("Failed to save products:", productError);
            toast.error(
              "Customer created but product pricing couldn't be saved"
            );
          }
        }

        // Refresh the customers cache
        await refreshCustomersCache();
        toast.success("Customer created successfully!");
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
    } else {
      // No validation fields have input, proceed with normal save
      setIsSaving(true);
      try {
        const response = await api.post("/api/customers", formData);
        const newCustomerId = response.customer?.id || formData.id;

        // If we have temporary products, save them
        if (temporaryProducts.length > 0) {
          await api.post("/api/customer-products/batch", {
            customerId: newCustomerId,
            products: temporaryProducts.map((cp) => ({
              productId: cp.product_id,
              customPrice: cp.custom_price,
              isAvailable: cp.is_available,
            })),
          });
        }

        // Refresh the customers cache
        await refreshCustomersCache();

        toast.success("Customer created successfully!");
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
            <Tab labels={["Details", "Products"]}>
              {/* First tab - Customer Details */}
              <div className="space-y-6">
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

              {/* Second tab - Customer Products */}
              <div className="space-y-6">
                <CustomerProductsTab
                  customerId=""
                  isNewCustomer={true}
                  temporaryProducts={temporaryProducts}
                  onTemporaryProductsChange={(products) => {
                    setTemporaryProducts(products);
                  }}
                />
              </div>
            </Tab>
          </div>

          <div className="mt-6 py-3 px-6 text-right">
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
