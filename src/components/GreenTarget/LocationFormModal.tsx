// src/components/GreenTarget/LocationFormModal.tsx
import React, { useState, useEffect, useRef } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { IconMapPin, IconPhone } from "@tabler/icons-react";
import Button from "../Button";

interface LocationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (locationData: {
    address: string;
    phone_number: string;
    customer_id?: number;
    customer_name?: string;
  }) => void;
  title?: string;
  initialData?: {
    address?: string;
    phone_number?: string;
    location_id?: number;
  };
  customerPhoneNumber?: string;
  isCreatingCustomer?: boolean;
  customerName?: string;
  customerId?: number;
}

const LocationFormModal: React.FC<LocationFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  initialData = { address: "", phone_number: "" },
  customerPhoneNumber = "",
  isCreatingCustomer = false,
  customerName = "",
  customerId,
}) => {
  const [formData, setFormData] = useState({
    address: initialData.address || "",
    phone_number: initialData.phone_number || "",
    customer_name: customerName || "",
  });
  const [errors, setErrors] = useState<{ address?: string }>({});

  // Add ref for modal content
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle click outside modal
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        isOpen &&
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    // Add event listener when modal is open
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }

    // Clean up event listener
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen, onClose]);

  // Only reset form when the modal opens or initial data/customer significantly changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        address: initialData.address || "",
        phone_number: initialData.phone_number || "",
        customer_name: customerName || "",
      });
      setErrors({});
    }
  }, [isOpen]); // Only depend on isOpen to prevent resets during typing

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear validation error when user types
    if (name === "address" && errors.address) {
      setErrors({});
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!formData.address.trim()) {
      setErrors({ address: "Address is required" });
      return;
    }

    // Prepare data for submission based on context
    const submitData = {
      address: formData.address.trim(),
      phone_number: formData.phone_number.trim(),
      ...(customerId && { customer_id: customerId }),
      ...(isCreatingCustomer && {
        customer_name: formData.customer_name.trim(),
      }),
    };

    onSubmit(submitData);
  };

  // Determine the appropriate modal title based on context
  const modalTitle =
    title ||
    (isCreatingCustomer
      ? "Add New Customer & Location"
      : initialData.location_id
      ? "Edit Location"
      : "Add New Location");

  // If not open, don't render anything
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-30">
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <div
          ref={modalRef}
          className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all"
        >
          <h3 className="text-lg font-medium leading-6 text-default-900">
            {modalTitle}
          </h3>

          <form onSubmit={handleSubmit} className="mt-4">
            {/* Only show customer name field when creating a new customer */}
            {isCreatingCustomer && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-default-700 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  name="customer_name"
                  value={formData.customer_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                  placeholder="Enter customer name"
                  required
                />
              </div>
            )}

            {/* Location Address Field */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-default-700 mb-1">
                Location Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-default-400">
                  <IconMapPin size={18} />
                </span>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 border ${
                    errors.address
                      ? "border-rose-300 focus:border-rose-500"
                      : "border-default-300 focus:border-default-500"
                  } rounded-lg focus:outline-none`}
                  placeholder="Enter location address"
                />
              </div>
              {errors.address && (
                <p className="mt-1 text-sm text-rose-600">{errors.address}</p>
              )}
            </div>

            {/* Phone Number Field */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-default-700 mb-1">
                Phone Number
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-default-400">
                  <IconPhone size={18} />
                </span>
                <input
                  type="tel"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleChange}
                  className="w-full pl-10 pr-3 py-2 border border-default-300 rounded-lg focus:outline-none focus:border-default-500"
                  placeholder={`Custom phone number (optional, default: ${
                    customerPhoneNumber || "none"
                  })`}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex justify-end space-x-3">
              <Button type="button" onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button type="submit" variant="boldOutline" color="sky">
                {initialData.location_id ? "Update" : "Save"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LocationFormModal;
