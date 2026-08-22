// src/utils/customerValidation.ts
import toast from "react-hot-toast";
import i18n from "../../i18n";
import { Customer } from "../../types/types";
import { api } from "../utils/api";

interface ValidationResponse {
  isValid: boolean;
  message?: string;
  hasPhoneWarning?: boolean;
}

export async function validateCustomerIdentity(
  customer: Customer
): Promise<ValidationResponse> {
  // Check if ID type is assigned
  if (!customer.id_type || customer.id_type === "Select") {
    toast.error(i18n.t("Please select an ID type", { ns: "misc" }));
    return {
      isValid: false,
      message: "ID type is required",
    };
  }

  // Check if both TIN number and ID number are present
  if (!customer.tin_number || !customer.id_number) {
    toast.error(
      i18n.t("Both TIN number and ID number are required", { ns: "misc" })
    );
    return {
      isValid: false,
      message: "TIN number and ID number are required",
    };
  }

  // Check phone number and address - both required for validation
  if (!customer.phone_number || customer.phone_number.trim() === "") {
    toast.error(
      i18n.t("Phone number is required for e-Invoice compliance", {
        ns: "misc",
      })
    );
    return {
      isValid: false,
      message: "Phone number is required",
    };
  }

  if (!customer.address || customer.address.trim() === "") {
    toast.error(
      i18n.t("Address is required for e-Invoice compliance", { ns: "misc" })
    );
    return {
      isValid: false,
      message: "Address is required",
    };
  }

  let hasPhoneWarning = false;

  try {
    const response = await api.get(
      `/api/customer-validation/validate/${customer.tin_number}?idType=${customer.id_type}&idValue=${customer.id_number}`
    );

    if (response.success) {
      const successMessage = hasPhoneWarning
        ? i18n.t(
            "Customer e-Invoice IDs validated successfully (phone number needed)",
            { ns: "misc" }
          )
        : i18n.t("Customer e-Invoice IDs validated successfully", {
            ns: "misc",
          });

      toast.success(successMessage);
      return {
        isValid: true,
        message: "Validation successful",
        hasPhoneWarning,
      };
    }

    // If we get here, something went wrong but didn't throw an error
    toast.error(
      response.message || i18n.t("Validation failed", { ns: "misc" })
    );
    return {
      isValid: false,
      message: response.message || "Validation failed",
      hasPhoneWarning,
    };
  } catch (error: any) {
    console.error("Validation API Error:", error);

    // The error should now contain the custom message from the backend
    toast.error(
      error.message ||
        i18n.t("Failed to validate customer identity", { ns: "misc" })
    );
    return {
      isValid: false,
      message:
        error.message || "An unexpected error occurred during validation",
      hasPhoneWarning,
    };
  }
}
