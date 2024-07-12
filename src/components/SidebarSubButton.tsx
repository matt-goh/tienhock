import React from 'react';
import { IconChevronRight } from "@tabler/icons-react";

interface SidebarSubButtonProps {
  name: string;
  icon?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

const SidebarSubButton: React.FC<SidebarSubButtonProps> = ({
  name,
  icon,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <li className="relative">
      <button
        onClick={onToggle}
        className="flex group items-center block py-2 pl-7 pr-2 hover:bg-gray-100 active:bg-gray-200 hover:text-gray-600 transition-colors duration-200 rounded-lg w-full text-left focus:outline-none"
      >
        <span className="flex items-center">
          {icon}
          {name}
        </span>
        <IconChevronRight
          width="20"
          height="20"
          stroke={2}
          className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right absolute right-2 opacity-0 hover:text-gray-600 group-hover:opacity-100 transform transition-all duration-300 ${
            isOpen ? "rotate-90" : ""
          }`}
        />
      </button>
      {isOpen && <ul className="mt-1 space-y-1">{children}</ul>}
    </li>
  );
};
export default SidebarSubButton;
