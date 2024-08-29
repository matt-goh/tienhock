import React, { useEffect } from "react";
import { Table } from "@tanstack/react-table";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";

interface TablePaginationProps<T> {
  table: Table<T>;
}

const TablePagination = <T extends Record<string, unknown>>({
  table,
}: TablePaginationProps<T>) => {
  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalPages = table.getPageCount();
  const totalItems = table.getFilteredRowModel().rows.length;

  useEffect(() => {
    const storedPageSize = localStorage.getItem('tablePageSize');
    if (storedPageSize) {
      table.setPageSize(Number(storedPageSize));
    }
  }, []);
  
  const handlePageSizeChange = (newPageSize: number) => {
    table.setPageSize(newPageSize);
    localStorage.setItem('tablePageSize', newPageSize.toString());
  };

  const renderPageNumbers = () => {
    const pageNumbers = [];
    const visiblePageNumbers = [];
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(i);
    }

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
    <div className="flex justify-between items-center w-full space-x-4">
      <div className="flex items-center space-x-2 text-sm text-gray-700">
        <span>Show:</span>
        <div className="relative">
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="appearance-none bg-white border border-gray-300 rounded-full py-1 pl-3 pr-8 focus:outline-none focus:border-gray-400"
          >
            {[10, 25, 50].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
            <IconChevronDown size={14} />
          </div>
        </div>
        <span>per page</span>
        <span className="pl-2">
          {table.getState().pagination.pageIndex *
            table.getState().pagination.pageSize +
            1}
          -
          {Math.min(
            (table.getState().pagination.pageIndex + 1) *
              table.getState().pagination.pageSize,
            totalItems
          )}{" "}
          of {totalItems}
        </span>
      </div>

      <nav className="flex items-center justify-center space-x-2 text-gray-700">
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-accent hover:bg-gray-100 active:bg-gray-200 hover:text-accent-foreground h-10 w-10 py-2"
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
                onClick={() => table.setPageIndex((page as number) - 1)}
                className={`inline-flex items-center justify-center rounded-full text-sm transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 w-10 hover:bg-gray-100 active:bg-gray-200 ${
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
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-background hover:bg-gray-100 active:bg-gray-200 hover:bg-accent hover:text-accent-foreground h-10 w-10 py-2"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
};

export default TablePagination;
