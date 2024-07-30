import React from 'react';
import { IconChevronDown } from '@tabler/icons-react';

interface TablePageRowsSelectorProps {
  itemsPerPage: number;
  onItemsPerPageChange: (value: number) => void;
  totalItems: number;
  currentPage: number;
}

const TablePageRowsSelector: React.FC<TablePageRowsSelectorProps> = ({
  itemsPerPage,
  onItemsPerPageChange,
  totalItems,
  currentPage,
}) => {
  const options = [10, 25, 50];
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex items-center space-x-2 text-sm text-gray-700">
      <span>Show</span>
      <div className="relative">
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="appearance-none bg-white border border-gray-300 rounded-md py-1 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
          <IconChevronDown size={14} />
        </div>
      </div>
      <span>per page</span>
      <span>
        {startIndex}-{endIndex} of {totalItems}
      </span>
    </div>
  );
};

export default TablePageRowsSelector;