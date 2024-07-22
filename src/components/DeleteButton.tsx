import React, { useState, Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";

interface DeleteButtonProps {
  onDelete: () => Promise<void>;
  selectedCount: number;
  isAllSelected: boolean;
  style?: React.CSSProperties;
}

const DeleteButton: React.FC<DeleteButtonProps> = ({
  onDelete,
  selectedCount,
  isAllSelected,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = async () => {
    await onDelete();
    setIsOpen(false);
  };

  return (
    <>
      <div className="z-10" style={style}>
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 text-rose-500 font-medium border-2 border-rose-400 hover:border-rose-500 active:border-rose-600 bg-white hover:bg-rose-500 active:bg-rose-600 hover:text-gray-100 rounded-full transition-colors duration-200"
        >
          Delete
        </button>
      </div>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={() => setIsOpen(false)}
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Delete Confirmation
                  </DialogTitle>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      {isAllSelected
                        ? "Are you sure you want to delete all rows? "
                        : `Are you sure you want to delete ${selectedCount} selected row${
                            selectedCount !== 1 ? "s" : ""
                          }? `}
                      This action cannot be undone.
                    </p>
                  </div>

                  <div className="mt-4 flex justify-end space-x-2">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-full border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 active:bg-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                      onClick={() => setIsOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-full border border-transparent bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 active:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                      onClick={handleDelete}
                    >
                      Delete
                    </button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

export default DeleteButton;
