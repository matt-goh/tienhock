import React, { useState, useRef, useEffect } from 'react';
import { IconFilter, IconSquareCheckFilled, IconSquare } from "@tabler/icons-react";

export type FilterOptions = {
  showResigned?: boolean | undefined;
};

type StaffFilterMenuProps = {
  onFilterChange: (filters: FilterOptions) => void;
  currentFilters: FilterOptions;
};

const StaffFilterMenu: React.FC<StaffFilterMenuProps> = ({ onFilterChange, currentFilters }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleFilterChange = (key: keyof FilterOptions, value: boolean) => {
    onFilterChange({ ...currentFilters, [key]: value });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative inline-block text-left mr-2" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center px-4 py-2 font-medium text-gray-700 border rounded-full hover:bg-gray-100 hover:text-gray-800 active:text-gray-900 active:bg-gray-200 transition-colors duration-200"
      >
        <IconFilter stroke={1.5} size={18} className="mr-2" />
        Filter
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
          <div className="px-1 py-1">
            <button
              className="group flex w-full items-center rounded-md px-2 py-2 text-sm hover:bg-gray-100 text-gray-700"
              onClick={() => handleFilterChange('showResigned', !currentFilters.showResigned)}
            >
              {currentFilters.showResigned ? (
                <IconSquareCheckFilled width={18} height={18} className="text-blue-600 mr-2" />
              ) : (
                <IconSquare width={18} height={18} stroke={2} className="text-gray-400 mr-2" />
              )}
              Show resigned staff
            </button>
          </div>
          <div className="px-1 py-1">
            <span className="block px-2 py-2 text-sm text-gray-400">
              More filters coming soon
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffFilterMenu;