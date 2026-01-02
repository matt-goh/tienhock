// src/components/Invoice/Pagination.tsx
import React from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsCount: number; // Items on the current page
  totalItems: number; // Total items matching filters
  pageSize: number;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  itemsCount,
  totalItems,
  pageSize,
}) => {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = startItem + itemsCount - 1;

  const renderPageNumbers = () => {
    const pageNumbers = [];
    const maxVisiblePages = 5; // Adjust as needed

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      pageNumbers.push(1);
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage > 3) {
        pageNumbers.push("...");
      }

      for (let i = start; i <= end; i++) {
        pageNumbers.push(i);
      }

      if (currentPage < totalPages - 2) {
        pageNumbers.push("...");
      }
      pageNumbers.push(totalPages);
    }

    return pageNumbers.map((num, index) =>
      typeof num === "number" ? (
        <button
          key={index}
          onClick={() => onPageChange(num)}
          className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 h-9 w-9 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 ${
            num === currentPage
              ? "border border-default-300 dark:border-gray-600 font-semibold bg-default-100 dark:bg-gray-700"
              : "font-medium"
          }`}
          disabled={num === currentPage}
        >
          {num}
        </button>
      ) : (
        <span
          key={index}
          className="flex items-center justify-center h-9 w-9 text-default-500 dark:text-gray-500"
        >
          ...
        </span>
      )
    );
  };

  return (
    <div className="flex justify-between items-center text-sm text-default-600 dark:text-gray-400 pt-3 border-t border-default-200 dark:border-gray-700">
      {/* Items Info */}
      <div>
        Showing{" "}
        <span className="font-semibold">{itemsCount > 0 ? startItem : 0}</span>-{" "}
        <span className="font-semibold">{endItem}</span> of{" "}
        <span className="font-semibold">{totalItems}</span> results
      </div>

      {/* Pagination Buttons */}
      <div className="flex items-center gap-2">
        <button
          className="px-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 disabled:opacity-50 disabled:pointer-events-none"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          <IconChevronLeft size={18} />
        </button>

        <div className="flex gap-1">{renderPageNumbers()}</div>

        <button
          className="px-2.5 py-2 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-200 hover:bg-default-100 dark:hover:bg-gray-700 active:bg-default-200 dark:active:bg-gray-600 disabled:opacity-50 disabled:pointer-events-none"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          <IconChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
