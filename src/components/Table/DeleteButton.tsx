import React, { useState } from "react";
import DeleteDialog from "../DeleteDialog";

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
      <div className="absolute top-[-58px] right-0 " style={style}>
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 text-rose-500 font-medium border-2 border-rose-400 hover:border-rose-500 active:border-rose-600 bg-white hover:bg-rose-500 active:bg-rose-600 hover:text-gray-100 active:text-gray-200 rounded-full transition-colors duration-200"
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
