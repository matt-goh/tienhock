// src/components/ConfirmationDialog.tsx
import React from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmButtonText?: string;
  variant?: "danger" | "success" | "default";
  hideCancelButton?: boolean;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = "Confirm",
  variant = "danger",
  hideCancelButton = false,
}) => {
  // Define button styles based on variant
  const buttonStyles = {
    danger: "text-white bg-rose-500 hover:bg-rose-600 active:bg-rose-700",
    success:
      "text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700",
    default: "text-white bg-sky-500 hover:bg-sky-600 active:bg-sky-700",
  };

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50 overflow-y-auto"
        onClose={onClose}
      >
        <div className="min-h-screen px-4 text-center" onClick={onClose}>
          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <DialogPanel className="fixed inset-0 bg-black opacity-30" />
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
            <DialogPanel
              className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <DialogTitle
                as="h3"
                className="text-lg font-medium leading-6 text-default-900"
              >
                {title}
              </DialogTitle>
              <div className="mt-2">
                <p className="text-sm text-default-500">{message}</p>
              </div>

              <div className="mt-4 flex justify-end space-x-2">
                {!hideCancelButton && (
                  <button
                    type="button"
                    className="inline-flex justify-center px-4 py-2 text-sm font-medium text-default-700 bg-default-100 border border-transparent rounded-full hover:bg-default-200 active:bg-default-300 focus:outline-none"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  className={`inline-flex justify-center px-4 py-2 text-sm font-medium border border-transparent rounded-full focus:outline-none ${buttonStyles[variant]}`}
                  onClick={onConfirm}
                >
                  {confirmButtonText}
                </button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ConfirmationDialog;
