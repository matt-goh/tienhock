import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  TransitionChild,
  Transition,
} from "@headlessui/react";
import { IconX } from "@tabler/icons-react";
import toast from "react-hot-toast";
import Button from "../Button";
import { FormInput, FormListbox } from "../FormComponents";
import Checkbox from "../Checkbox";

interface Product {
  id: string;
  description: string;
  price_per_unit: number;
  type: string;
  tax: string;
  is_active: boolean;
}

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
  product?: Product | null;
  mode: "create" | "edit";
}

const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  onSave,
  product,
  mode,
}) => {
  const [formData, setFormData] = useState<Product>({
    id: "",
    description: "",
    price_per_unit: 0,
    type: "",
    tax: "None",
    is_active: true,
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (product && mode === "edit") {
      // Ensure is_active defaults to true if undefined (for backwards compatibility)
      setFormData({
        ...product,
        is_active: product.is_active ?? true,
      });
    } else {
      setFormData({
        id: "",
        description: "",
        price_per_unit: 0,
        type: "",
        tax: "None",
        is_active: true,
      });
    }
  }, [product, mode, isOpen]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.id.trim()) {
      toast.error("Product ID is required");
      return;
    }

    if (!formData.description.trim()) {
      toast.error("Description is required");
      return;
    }

    if (formData.price_per_unit < 0) {
      toast.error("Price must be greater than or equal to 0");
      return;
    }

    if (!formData.type.trim()) {
      toast.error("Type is required");
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave(formData);
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsSubmitting(false);
    }
  };

  const taxOptions = [
    { id: "None", name: "None" },
    { id: "SR", name: "SR" },
    { id: "ZRL", name: "ZRL" },
  ];

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" onClose={onClose}>
        <div className="min-h-screen px-4 text-center">
          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
          </TransitionChild>

          <span
            className="inline-block h-screen align-middle"
            aria-hidden="true"
          >
            &#8203;
          </span>

          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="inline-block w-full max-w-md p-6 my-8 text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  {mode === "create" ? "Create Product" : "Edit Product"}
                </DialogTitle>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-default-400 dark:text-gray-400 hover:text-default-600 dark:hover:text-gray-200"
                >
                  <IconX size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <FormInput
                  name="id"
                  label="Product ID"
                  value={formData.id}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, id: e.target.value })
                  }
                  required
                />

                <FormInput
                  name="description"
                  label="Description"
                  value={formData.description}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                />

                <FormInput
                  name="price_per_unit"
                  label="Price per Unit"
                  type="number"
                  min={0}
                  step="0.05"
                  value={formData.price_per_unit}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({
                      ...formData,
                      price_per_unit: parseFloat(e.target.value) || 0,
                    })
                  }
                  required
                />

                <FormInput
                  name="type"
                  label="Type"
                  value={formData.type}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  required
                />

                <FormListbox
                  name="tax"
                  label="Tax"
                  value={formData.tax}
                  onChange={(value: string) =>
                    setFormData({ ...formData, tax: value })
                  }
                  options={taxOptions}
                  required
                />

                <div className="pt-2">
                  <Checkbox
                    checked={formData.is_active}
                    onChange={(checked: boolean) =>
                      setFormData({ ...formData, is_active: checked })
                    }
                    label="Active"
                    labelPosition="right"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    type="button"
                    onClick={onClose}
                    variant="outline"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" color="sky" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Saving..."
                      : mode === "create"
                      ? "Create"
                      : "Update"}
                  </Button>
                </div>
              </form>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ProductModal;
