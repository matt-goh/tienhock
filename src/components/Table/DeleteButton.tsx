import React, { useState } from "react";
import DeleteDialog from "../ConfirmationDialog";

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

  const message = isAllSelected
    ? "Are you sure you want to delete all rows? "
    : `Are you sure you want to delete ${selectedCount} selected row${
        selectedCount !== 1 ? "s" : ""
      }? `;

  return (
    <>
      <div className="absolute top-[-58px] right-[38px]" style={style}>
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 text-rose-500 dark:text-rose-400 font-medium border-2 border-rose-400 dark:border-rose-500 hover:border-rose-500 dark:hover:border-rose-400 active:border-rose-600 bg-white dark:bg-gray-800 hover:bg-rose-500 dark:hover:bg-rose-600 active:bg-rose-600 dark:active:bg-rose-700 hover:text-default-100 dark:hover:text-white active:text-default-200 rounded-full transition-colors duration-200"
        >
          Delete
        </button>
      </div>
      <DeleteDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleDelete}
        title="Delete Confirmation"
        message={`${message}This action cannot be undone.`}
      />
    </>
  );
};

export default DeleteButton;
