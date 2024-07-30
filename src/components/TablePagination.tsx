import React from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const pageNumbers: number[] = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  const renderPageNumbers = () => {
    const visiblePageNumbers = [];
    if (totalPages <= 5) {
      return pageNumbers;
    }
    if (currentPage <= 3) {
      visiblePageNumbers.push(...pageNumbers.slice(0, 3), "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      visiblePageNumbers.push(1, "...", ...pageNumbers.slice(-3));
    } else {
      visiblePageNumbers.push(
        1,
        "...",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "...",
        totalPages
      );
    }
    return visiblePageNumbers;
  };

  return (
    <nav className="flex items-center justify-center space-x-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-accent hover:bg-gray-100 active:bg-gray-200 hover:text-accent-foreground h-10 px-4 py-2"
      >
        <IconChevronLeft className="h-4 w-4" />
      </button>
      {renderPageNumbers().map((page, index) => (
        <React.Fragment key={index}>
          {page === "..." ? (
            <span className="flex h-10 w-10 items-center justify-center pointer-events-none">
              ...
            </span>
          ) : (
            <button
              onClick={() => onPageChange(page as number)}
              className={`inline-flex items-center justify-center rounded-md text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-gray-100 active:bg-gray-200 ${
                currentPage === page
                  ? "border border-gray-200 font-semibold"
                  : "font-medium"
              }`}
            >
              {page}
            </button>
          )}
        </React.Fragment>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-gray-100 active:bg-gray-200 hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
      >
        <IconChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
};

export default TablePagination;
