// SidebarButton.tsx
import { IconChevronRight } from "@tabler/icons-react";
import React from "react";

interface SidebarButtonProps {
  name: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}

const SidebarButton: React.FC<SidebarButtonProps> = ({
  name,
  icon,
  isOpen,
  onClick,
  children,
}) => {
  return (
    <li className="m-2">
      <button
        onClick={onClick}
        className="relative group/button flex items-center py-2 pl-4 pr-2 hover:bg-gray-200/90 hover:text-gray-800 active:bg-gray-300/90 transition-colors duration-200 rounded-lg focus:outline-none w-full text-left"
      >
        {icon}
        <span className="font-semibold ml-3">{name}</span>
        <IconChevronRight
          width="18"
          height="18"
          stroke={2.25}
          className={`icon icon-tabler icons-tabler-outline icon-tabler-chevron-right absolute right-3 opacity-0 hover:text-gray-600 group-hover/button:opacity-100 transform transition-all duration-300 ${
            isOpen ? "rotate-90" : ""
          }`}
        />
      </button>
      {children}
    </li>
  );
};

export default SidebarButton;
